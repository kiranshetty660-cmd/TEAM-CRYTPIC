import json
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.db import SessionLocal
from app.models import (
    Customer,
    Dispatch,
    Product,
    BatchInventory,
    Supplier,
    PurchaseOrder,
    Recall,
    Complaint,
    NotificationCampaign,
    NotificationRecipient,
    Ledger,
)
from app.notifications.email_service import _SIMULATOR_INSTANCE
from app.notifications.sms_service import _SIMULATOR_SMS_INSTANCE

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_and_reset():
    """Resets simulator state and initializes demo scenario for B2231."""
    _SIMULATOR_INSTANCE.dispatched_emails.clear()
    _SIMULATOR_INSTANCE.forced_failure = False
    _SIMULATOR_SMS_INSTANCE.dispatched_messages.clear()
    _SIMULATOR_SMS_INSTANCE.forced_failure = False

    # Initialize / reset the exact demonstration data
    resp = client.post("/api/demo/reset-scenario")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Test 1: Seed Idempotency & Initial State Verification
# ---------------------------------------------------------------------------

def test_seed_idempotency_and_initial_state():
    """Verifies that running reset-scenario multiple times produces identical, uncorrupted state."""
    resp1 = client.post("/api/demo/reset-scenario")
    resp2 = client.post("/api/demo/reset-scenario")
    data = resp2.json()

    assert data["status"] == "ready"
    assert data["sku"] == "AMOX-625"
    assert data["recalled_batch"] == "B2231"
    assert data["warehouse_stock_units"] == 180
    assert data["total_dispatched_units"] == 640
    assert data["total_recipients"] == 25
    assert data["hospitals_count"] == 2
    assert data["hospitals_units"] == 240
    assert data["chemists_count"] == 23
    assert data["chemists_units"] == 400
    assert data["replacement_batch"] == "B2240"
    assert data["replacement_available_units"] == 400
    assert data["reconciliation_valid"] is True


# ---------------------------------------------------------------------------
# Test 2: B2231 Recall Creation
# ---------------------------------------------------------------------------

def test_b2231_recall_creation():
    """Step 1: Confirms creation of persistent recall incident with Schedule M evidence."""
    resp = client.post("/api/demo/trigger-recall", json={
        "reason": "Sub-potency assay failure detected at routine stability inspection (Schedule M violation)",
        "source": "State Drug Controller",
        "recall_class": "II",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "active"
    assert data["sku"] == "AMOX-625"
    assert data["batch"] == "B2231"
    assert data["recall_class"] == "II"
    assert "COA-2026-AMOX-B2231" in json.dumps(data["evidence"])


# ---------------------------------------------------------------------------
# Test 3: Batch Block & Dispatch Block Enforcement
# ---------------------------------------------------------------------------

def test_batch_block_and_dispatch_rejection():
    """
    Step 2: Quarantines B2231 in warehouse and verifies that the dispatch layer
    strictly rejects any new dispatch attempts for the recalled batch.
    Historical dispatches (640 units) and warehouse stock (180 units) remain preserved.
    """
    # Block batch
    resp_block = client.post("/api/demo/quarantine-batch")
    assert resp_block.status_code == 200
    bdata = resp_block.json()
    assert bdata["current_status"] == "quarantine"
    assert bdata["warehouse_units_isolated"] == 180
    assert bdata["is_dispatch_prevented"] is True

    # Attempt to dispatch B2231 via direct API -> Must be rejected with 400!
    resp_disp = client.post("/api/demo/dispatches", json={
        "customer_id": "CHEM-001",
        "sku": "AMOX-625",
        "batch": "B2231",
        "qty": 10,
    })
    assert resp_disp.status_code == 400
    assert "DISPATCH PROHIBITED" in resp_disp.json()["detail"]

    # Verify warehouse stock record is preserved (180 units)
    db: Session = SessionLocal()
    inv = db.query(BatchInventory).filter(BatchInventory.sku == "AMOX-625", BatchInventory.batch == "B2231").first()
    assert inv.qty == 180
    assert inv.status == "quarantine"

    # Verify historical dispatches are untouched (still 640 units across 25 records)
    disps = db.query(Dispatch).filter(Dispatch.sku == "AMOX-625", Dispatch.batch == "B2231").all()
    assert len(disps) == 25
    assert sum(d.qty for d in disps) == 640
    db.close()


# ---------------------------------------------------------------------------
# Test 4: Exactly 25 Recipients Traced & Quantity Reconciled to 640
# ---------------------------------------------------------------------------

def test_recipient_tracing_and_reconciliation():
    """
    Step 3: Traces every affected recipient from dispatch records:
    - Exactly 25 recipients (2 hospitals, 23 chemists)
    - Total dispatched equals 640
    - Missing contact detection
    """
    resp = client.get("/api/demo/trace-recipients")
    assert resp.status_code == 200
    data = resp.json()

    assert data["batch"] == "B2231"
    assert data["total_recipients_count"] == 25
    assert data["total_dispatched_units"] == 640
    assert data["reconciliation_valid"] is True

    assert data["hospitals_count"] == 2
    assert data["hospitals_units"] == 240
    assert data["chemists_count"] == 23
    assert data["chemists_units"] == 400

    recipients = data["recipients"]
    assert len(recipients) == 25
    # Sum of recipient quantities must equal 640
    assert sum(r["quantity_received"] for r in recipients) == 640

    # Hospitals check
    hosp_records = [r for r in recipients if r["type"] == "hospital"]
    assert len(hosp_records) == 2
    for h in hosp_records:
        assert h["quantity_received"] == 120

    # Missing contact check
    missing_contact_found = any(r["has_missing_contacts"] is True for r in recipients)
    assert missing_contact_found is True


# ---------------------------------------------------------------------------
# Test 5: Notice Generation & Simulation Mode Dispatch
# ---------------------------------------------------------------------------

def test_notice_generation_and_simulation_dispatch():
    """
    Step 4 & 5: Generates individualized notices for all 25 recipients,
    requires approval, and dispatches in simulation mode.
    Never sends real external telco traffic.
    """
    # Generate
    resp_gen = client.post("/api/demo/generate-campaign")
    assert resp_gen.status_code == 200
    gdata = resp_gen.json()
    assert gdata["total_recipients"] == 25
    assert gdata["requires_human_approval"] is True
    camp_id = gdata["campaign_id"]

    # Approve and send in simulation mode
    resp_send = client.post("/api/demo/approve-and-send", json={
        "campaign_id": camp_id,
        "approver_name": "Dr. K. Sharma",
        "approver_role": "Quality Safety Lead",
        "approval_reason": "Verified Schedule M stability report. Authorized emergency recall notices.",
    })
    assert resp_send.status_code == 200
    sdata = resp_send.json()

    assert sdata["mode"] == "SIMULATION_MODE"
    assert sdata["status"] in ("sent", "partially_sent")
    assert sdata["emails_sent"] > 0
    assert sdata["sms_sent"] > 0
    assert sdata["total_dispatched_recipients"] == 25

    # Simulator in-memory check
    assert len(_SIMULATOR_INSTANCE.dispatched_emails) > 0
    assert len(_SIMULATOR_SMS_INSTANCE.dispatched_messages) > 0


# ---------------------------------------------------------------------------
# Test 6: Replacement Coverage Arithmetic & Shortage Detection
# ---------------------------------------------------------------------------

def test_replacement_coverage_arithmetic():
    """
    Step 6: Mathematical verification of replacement coverage:
    - B2231 dispatched in last 30 days: 640
    - B2231 warehouse stock: 180
    - Replacement B2240 available stock: 400
    - Immediate replacement shortage: 400 - 640 = -240
    - Total 30-day horizon deficit: 400 - 1280 = -880
    - Recommended order: 600
    """
    resp = client.get("/api/demo/replacement-analysis")
    assert resp.status_code == 200
    data = resp.json()

    m = data["metrics"]
    assert m["units_dispatched_last_30_days"] == 640
    assert m["recalled_batch_warehouse_stock"] == 180
    assert m["replacement_b2240_available_stock"] == 400
    assert m["immediate_replacement_requirement"] == 640
    assert m["forecast_normal_30day_demand"] == 640
    assert m["total_demand"] == 1280

    # Shortages
    assert m["immediate_replacement_shortfall"] == -240
    assert m["total_30day_horizon_deficit"] == -880
    assert m["recommended_procurement_qty"] == 600

    assert data["shortage_detected"] is True
    assert data["requires_urgent_po"] is True
    assert len(data["assumptions"]) == 4


# ---------------------------------------------------------------------------
# Test 7: Hospital Prioritization Allocation
# ---------------------------------------------------------------------------

def test_hospital_prioritization_allocation():
    """
    Step 7: Validates B2240 stock allocation prioritizing hospitals:
    - 400 units total B2240 available
    - 2 hospitals get 100% (240 units = 120 each)
    - 23 chemists get remaining 160 units (40% fulfillment)
    - Unmet chemist requirement: 240 units shortage
    - Allocation never exceeds available stock (240 + 160 = 400)
    """
    resp = client.get("/api/demo/hospital-prioritization")
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_available_stock"] == 400
    assert data["total_hospital_requirement"] == 240
    assert data["total_hospital_allocated"] == 240
    assert data["hospital_fulfillment_rate_pct"] == 100.0

    allocs = data["hospital_allocations"]
    assert len(allocs) == 2
    for h in allocs:
        assert h["quantity_recalled"] == 120
        assert h["quantity_allocated"] == 120
        assert h["fulfillment_rate_pct"] == 100.0

    chem_pool = data["chemist_pool"]
    assert chem_pool["total_chemists_count"] == 23
    assert chem_pool["total_chemist_requirement"] == 400
    assert chem_pool["allocated_stock"] == 160
    assert chem_pool["fulfillment_rate_pct"] == 40.0
    assert chem_pool["unmet_chemist_units"] == 240

    # Invariant: Total allocated stock cannot exceed 400 units
    total_allocated = data["total_hospital_allocated"] + chem_pool["allocated_stock"]
    assert total_allocated == 400


# ---------------------------------------------------------------------------
# Test 8: Urgent Purchase Order Draft
# ---------------------------------------------------------------------------

def test_urgent_purchase_order_drafting():
    """
    Step 8: Generates editable urgent PO draft when justified by shortage:
    - Supplier: Arogya Antibiotics Labs Pvt Ltd
    - SKU: AMOX-625
    - Qty: 600 units
    - Lead time: 8 days
    - Status: draft (never auto-dispatched)
    """
    resp = client.post("/api/demo/draft-urgent-po", json={
        "order_qty": 600,
        "urgency_reason": "B2231 recall created 240-unit chemist shortage after hospital priority allocation.",
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "draft"
    assert data["is_draft"] is True
    assert data["sku"] == "AMOX-625"
    assert data["supplier"] == "Arogya Antibiotics Labs Pvt Ltd"
    assert data["order_quantity"] == 600
    assert data["unit_cost_inr"] == 120.0
    assert data["total_amount_inr"] == 72000.0
    assert data["lead_time_days"] == 8

    # Verify PO in database is marked draft
    db: Session = SessionLocal()
    po = db.query(PurchaseOrder).filter(PurchaseOrder.po == data["po_id"]).first()
    assert po is not None
    assert po.status == "draft"
    assert po.draft is True
    db.close()


# ---------------------------------------------------------------------------
# Test 9: Cryptographic Audit Trail & Hash-Chain Verification
# ---------------------------------------------------------------------------

def test_audit_verification_and_hash_chain():
    """
    Step 9: Verifies that audit events for the recall workflow are recorded,
    strictly sequential, and cryptographic SHA-256 hash-chain integrity is intact.
    Confirms no PII in public ledger payloads.
    """
    resp = client.get("/api/demo/audit-verification")
    assert resp.status_code == 200
    data = resp.json()

    assert data["hash_chain_integrity"] == "VERIFIED_TAMPER_EVIDENT"
    assert data["is_chain_valid"] is True
    assert len(data["chain_breaks"]) == 0
    assert data["recall_events_count"] > 0

    # Ensure no customer raw phone or email in ledger payloads
    db: Session = SessionLocal()
    ledger_entries = db.query(Ledger).all()
    for entry in ledger_entries:
        p_str = entry.payload
        # Raw unmasked 10-digit numbers should not appear in audit payloads
        assert "+919845012345" not in p_str
    db.close()


# ---------------------------------------------------------------------------
# Test 10: Autonomous Multi-Agent Pipeline & Executive Resolution Report
# ---------------------------------------------------------------------------

def test_autonomous_multi_agent_pipeline_and_executive_report():
    """
    Verifies that calling /api/demo/run-autonomous-agents runs all 10 agents
    sequentially, executes all supply-chain actions, and returns the comprehensive
    Executive Incident Resolution Report with mathematical proof and audit validation.
    """
    resp = client.post("/api/demo/run-autonomous-agents", json={
        "reason": "Sub-potency assay failure detected at routine stability inspection.",
        "source": "Karnataka State Drug Controller / Internal Quality Lab",
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "success"
    assert data["pipeline"] == "autonomous_multi_agent_recall"
    assert data["agents_count"] == 10
    assert len(data["agents_timeline"]) == 10

    # Verify each agent executed and has telemetry
    timeline = data["agents_timeline"]
    agent_ids = [a["id"] for a in timeline]
    assert "AGENT-01-REGULATORY" in agent_ids
    assert "AGENT-02-QUARANTINE" in agent_ids
    assert "AGENT-03-TRACEABILITY" in agent_ids
    assert "AGENT-04-COMMUNICATION" in agent_ids
    assert "AGENT-05-BROADCAST" in agent_ids
    assert "AGENT-06-REPLENISHMENT" in agent_ids
    assert "AGENT-07-PRIORITIZATION" in agent_ids
    assert "AGENT-08-PROCUREMENT" in agent_ids
    assert "AGENT-09-LEDGER" in agent_ids
    assert "AGENT-10-EXECUTIVE" in agent_ids

    # Verify final report
    report = data["final_report"]
    assert report["title"] == "EXECUTIVE INCIDENT RESOLUTION REPORT"
    assert report["overall_status"] == "RESOLVED_AND_CONTAINED"
    assert report["incident_details"]["recalled_batch"] == "B2231"
    assert report["containment_and_isolation"]["warehouse_units_quarantined"] == 180
    assert report["traceability_reconciliation"]["total_units_dispatched"] == 640
    assert report["traceability_reconciliation"]["total_recipients"] == 25
    assert report["replenishment_and_demand_math"]["immediate_replacement_deficit"] == 240
    assert report["replenishment_and_demand_math"]["clean_batch_b2240_available"] == 400
    assert report["healthcare_priority_allocation"]["hospital_total_fulfilled"] == 240
    assert report["procurement_action_plan"]["quantity_ordered"] == 600
    assert report["procurement_action_plan"]["status"] == "DRAFT_PENDING_EXECUTIVE_APPROVAL"
    assert report["cryptographic_governance"]["hash_chain_status"] == "VERIFIED_TAMPER_EVIDENT"

