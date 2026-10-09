import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.seed.seed import run_seed
from app.db import SessionLocal
from app.models import BatchInventory, Action, Ledger

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def init_db():
    run_seed(reset=True)

def test_board_and_scan_endpoints():
    response = client.get("/api/board")
    assert response.status_code == 200
    data = response.json()
    assert "kpis" in data
    assert "findings" in data
    assert len(data["findings"]) > 0
    assert data["kpis"]["cold_breaches"] >= 1

    # Trigger scan
    scan_resp = client.post("/api/scan")
    assert scan_resp.status_code == 200
    scan_data = scan_resp.json()
    assert len(scan_data["findings"]) > 0

def test_batch_b2231_trace():
    """
    Checks Batch B2231 trace reproduction:
    WH-1 stock: 180
    dispatched: 640
    customers: 25 (2 hospitals + 23 chemists)
    """
    response = client.get("/api/batch/B2231/trace")
    assert response.status_code == 200
    data = response.json()
    assert data["batch"] == "B2231"
    assert data["total_stock_in_wh"] == 180
    assert data["total_dispatched"] == 640
    assert data["hospitals_count"] == 2
    assert data["chemists_count"] == 23
    assert data["customers_count"] == 25

def test_replay_b2231_recall_and_finding_detail():
    """
    Replay B2231 recall endpoint works and generates finding with drafted action.
    """
    resp = client.post("/api/recalls/replay-b2231")
    assert resp.status_code == 200
    recall_data = resp.json()
    assert recall_data["sku"] == "AMOX-625"
    assert "B2231" in recall_data["batches"]

    # Verify board has the recall finding
    board_resp = client.get("/api/board")
    findings = board_resp.json()["findings"]
    rec_finding = next((f for f in findings if f["type"] == "recall"), None)
    assert rec_finding is not None
    assert rec_finding["entities"]["sku"] == "AMOX-625"
    assert rec_finding["action_id"] is not None

    # Verify detail endpoint
    det_resp = client.get(f"/api/findings/{rec_finding['id']}")
    assert det_resp.status_code == 200
    detail = det_resp.json()
    assert detail["agent_trace"] is not None
    assert len(detail["agent_trace"]) >= 5

def test_approvals_role_gating_and_execution():
    """
    Role gate: role must match required permissions.
    Executing updates DB status and ledger.
    """
    # Get pending actions
    act_resp = client.get("/api/actions?status=pending_approval")
    assert act_resp.status_code == 200
    actions = act_resp.json()
    assert len(actions) > 0

    target_action = actions[0]
    action_id = target_action["id"]
    req_role = target_action["required_role"]

    # Attempt approval with unauthorized role
    wrong_role = "warehouse" if req_role not in ["warehouse"] else "pharmacist"
    unauth_resp = client.post(f"/api/actions/{action_id}/approve", json={
        "role": wrong_role,
        "user_name": "Unauthorized Staff",
        "reason": "Trying to approve without license",
    })
    assert unauth_resp.status_code == 403

    # Authorised approval with matching required role
    auth_resp = client.post(f"/api/actions/{action_id}/approve", json={
        "role": req_role,
        "user_name": f"Authorized Lead ({req_role})",
        "reason": "Authorized compliance order",
    })
    assert auth_resp.status_code == 200
    auth_data = auth_resp.json()
    assert auth_data["new_status"] == "executed"

def test_ledger_clean_verification_and_tamper_demo():
    """
    Ledger verify passes on clean data; flipping one byte or modifying payload
    makes verification fail at that exact seq.
    """
    # 1. Clean verify
    v_clean = client.get("/api/ledger/verify")
    assert v_clean.status_code == 200
    clean_data = v_clean.json()
    assert clean_data["ok"] is True
    assert clean_data["first_bad_seq"] is None

    # 2. Tamper entry at seq=5
    t_resp = client.post("/api/dev/tamper?seq=5")
    assert t_resp.status_code == 200
    t_data = t_resp.json()
    assert t_data["tampered_seq"] == 5

    # 3. Verify must now fail at exactly seq 5!
    v_tampered = client.get("/api/ledger/verify")
    assert v_tampered.status_code == 200
    tampered_data = v_tampered.json()
    assert tampered_data["ok"] is False
    assert tampered_data["first_bad_seq"] == 5

    # Reset DB back to clean state for remaining tests
    client.post("/api/dev/reset-db")
    v_restored = client.get("/api/ledger/verify")
    assert v_restored.json()["ok"] is True

def test_runtime_recall_for_different_sku():
    """
    Recall for a DIFFERENT SKU created at runtime works end-to-end.
    """
    resp = client.post("/api/recalls", json={
        "sku": "PARACET-650",
        "batches": ["DECOY-999"],
        "reason": "Packaging seal integrity defect reported by hospital QA",
        "recall_class": "II",
    })
    assert resp.status_code == 200

    board = client.get("/api/board").json()
    para_finding = next((f for f in board["findings"] if f["type"] == "recall" and f["entities"]["sku"] == "PARACET-650"), None)
    assert para_finding is not None
    assert para_finding["action_id"] is not None

def test_csv_upload_modifies_near_expiry_finding():
    """
    Section 12 requirement:
    Editing an expiry date via CSV upload changes the near-expiry finding.
    """
    # Check current near-expiry findings
    board_before = client.get("/api/board").json()
    exp_before = next((f for f in board_before["findings"] if f["type"] == "expiry" and f["entities"].get("batch") == "NE-881"), None)
    assert exp_before is not None
    assert exp_before["metrics"]["days_to_expiry"] == 70

    # Upload CSV extending NE-881 expiry to 300 days into future (removing the near-expiry risk)
    csv_content = "sku,batch,warehouse,qty,mfg_date,expiry_date,status\nOMEP-20,NE-881,WH-1,900,2026-01-01,2027-08-05,active\n"
    files = {"file": ("inventory_update.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    upload_resp = client.post("/api/data/upload", data={"table": "batch_inventory", "mode": "upsert"}, files=files)
    assert upload_resp.status_code == 200

    # Rescan board
    board_after = client.get("/api/board").json()
    exp_after = next((f for f in board_after["findings"] if f["type"] == "expiry" and f["entities"].get("batch") == "NE-881"), None)
    # Since expiry is now > 120 days away, it must no longer be flagged as near-expiry!
    assert exp_after is None

def test_agent_fallback_and_mismatched_validation():
    """
    Agent output validation rejects invalid chosen options and falls back to deterministic template.
    """
    from app.agent.orchestrator import validate_llm_decision
    from app.schemas import Finding, FindingOption

    dummy_finding = Finding(
        id="TEST-1",
        type="recall",
        severity=90.0,
        title="Test",
        description="Test",
        options=[FindingOption(id="OPT-A", name="Option A", description="Desc")]
    )

    # Invalid option not in options list
    bad_llm_json = {"chosen_option": "OPT-HALLUCINATED", "rationale": "Made up", "confidence": 0.5}
    assert validate_llm_decision(bad_llm_json, dummy_finding) is False

    # Prohibited safety declaration
    forbidden_llm_json = {"chosen_option": "OPT-A", "rationale": "The medicine is safe to consume", "confidence": 0.9}
    assert validate_llm_decision(forbidden_llm_json, dummy_finding) is False

    # Valid decision
    valid_llm_json = {"chosen_option": "OPT-A", "rationale": "Quarantine pending QA review", "confidence": 0.95}
    assert validate_llm_decision(valid_llm_json, dummy_finding) is True
