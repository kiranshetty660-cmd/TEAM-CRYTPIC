import pytest
import json
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import BatchInventory, Action, Ledger
from app.schemas import Finding, FindingOption
from app.agent.specialists import (
    InvestigationAgent,
    RiskAssessmentAgent,
    SolutionEvaluationAgent,
    ReviewAgent,
    CoordinatorAgent,
)
from app.agent.claude_tool_runner import run_anthropic_tool_loop
from app.agent.tools import execute_registered_tool, ANTHROPIC_TOOLS
from app.seed.seed import run_seed

@pytest.fixture(scope="module", autouse=True)
def setup_multi_agent_db():
    run_seed(reset=True)

def test_specialist_agents_structured_outputs():
    """
    1. Tests each specialist agent returns its designated typed Pydantic output.
    2. Tests correct transfer of evidence between agents.
    """
    db = SessionLocal()
    try:
        finding = Finding(
            id="FIND-REC-TEST",
            type="recall",
            severity=90.4,
            title="Class II Recall: Augmentin 625 (B2231)",
            description="Sub-potency assay failure",
            entities={"sku": "AMOX-625", "batches": ["B2231"]},
            metrics={"stock_in_wh": 180, "dispatched_total_30d": 640, "clean_qty": 400},
            options=[
                FindingOption(id="OPT-A", name="Option A", description="Full Replacement"),
                FindingOption(id="OPT-B", name="Option B", description="Phased Priority"),
            ]
        )

        # 1. Investigation Agent
        inv_agent = InvestigationAgent(db)
        inv_out = inv_agent.investigate(finding)
        assert inv_out.batch == "B2231"
        assert inv_out.sku == "AMOX-625"
        assert inv_out.total_warehouse_stock == 180
        assert inv_out.total_dispatched_units == 640
        assert inv_out.hospital_count == 2
        assert inv_out.chemist_count == 23

        # 2. Risk Assessment Agent
        risk_agent = RiskAssessmentAgent()
        risk_out = risk_agent.evaluate(finding, inv_out)
        assert risk_out.risk_score == 90.4
        assert risk_out.severity_category == "Critical"
        assert "Tertiary Hospital" in risk_out.patient_exposure_tier
        assert "Schedule M" in risk_out.regulatory_classification
        assert "NEVER declares a medicine safe or unsafe" in risk_out.safe_unsafe_disclaimer

        # 3. Solution Evaluation Agent
        sol_agent = SolutionEvaluationAgent(db)
        sol_out = sol_agent.evaluate(finding, inv_out, risk_out)
        assert len(sol_out.evaluated_options) >= 2
        assert sol_out.recommended_option_id in ["OPT-A", "OPT-B"]
        # Check that constraints actively reject prohibited options (e.g. OPT-C discount on recall)
        opt_c = next((o for o in sol_out.evaluated_options if o.id == "OPT-C"), None)
        if opt_c:
            assert opt_c.feasible is False
            assert "Prohibition" in opt_c.rejection_reason

        # 4. Review Agent
        rev_agent = ReviewAgent()
        rev_out = rev_agent.review(finding, inv_out, risk_out, sol_out)
        assert rev_out.review_passed is True
        assert rev_out.safety_rule_compliant is True
        assert rev_out.permissions_verified is True
        assert len(rev_out.calculation_checks) >= 2

        # 5. Coordinator Agent
        coord_agent = CoordinatorAgent(db, ai_mode="DETERMINISTIC_FALLBACK")
        summary = coord_agent.run_multi_agent_cycle(finding)
        assert summary.ai_mode == "DETERMINISTIC_FALLBACK"
        assert summary.coordinator.chosen_option in ["OPT-A", "OPT-B"]
        assert summary.coordinator.required_role == "pharmacist"
        assert 0.0 <= summary.coordinator.uncertainty_score <= 1.0

    finally:
        db.close()

def test_reviewer_rejection_on_contradictory_claims():
    """
    6. Tests that Review Agent independently catches and rejects contradictory claims,
    arithmetic mismatches, or prohibited safety declarations.
    """
    db = SessionLocal()
    try:
        finding = Finding(
            id="FIND-CONTRADICTION",
            type="recall",
            severity=90.0,
            title="Contradictory Test",
            description="Testing adversarial reviewer",
            entities={"sku": "AMOX-625", "batches": ["B2231"]},
            metrics={"stock_in_wh": 180, "dispatched_total_30d": 640},
            options=[]
        )

        inv_agent = InvestigationAgent(db)
        inv_out = inv_agent.investigate(finding)
        risk_agent = RiskAssessmentAgent()
        risk_out = risk_agent.evaluate(finding, inv_out)
        sol_agent = SolutionEvaluationAgent(db)
        sol_out = sol_agent.evaluate(finding, inv_out, risk_out)

        # Deliberately corrupt the solution output with a prohibited safety claim
        sol_out.recommended_option_name = "This medicine is safe to distribute to all accounts"
        rev_agent = ReviewAgent()
        rev_out = rev_agent.review(finding, inv_out, risk_out, sol_out)

        # Reviewer MUST reject this!
        assert rev_out.review_passed is False
        assert rev_out.safety_rule_compliant is False
        assert any("Safety Violation" in obj for obj in rev_out.objections)
        assert "REJECTED" in rev_out.independent_verdict

    finally:
        db.close()

def test_registered_tools_validation_and_safety():
    """
    7. Tests registered tool schemas, argument validation, and unauthorized execution prevention.
    """
    db = SessionLocal()
    try:
        # Valid tool execution
        res = execute_registered_tool("trace_batch", {"batch": "B2231"}, db)
        assert res["batch"] == "B2231"
        assert res["total_stock_in_wh"] == 180

        # Invalid tool input rejected
        with pytest.raises(ValueError, match="Invalid batch identifier format"):
            execute_registered_tool("trace_batch", {"batch": "DROP TABLE products;--"}, db)

        # Unregistered tool rejected
        with pytest.raises(ValueError, match="Unauthorized or unregistered tool"):
            execute_registered_tool("execute_arbitrary_python", {"code": "print('hack')"}, db)

    finally:
        db.close()

def test_mocked_anthropic_tool_use_protocol():
    """
    3 & 4. Tests genuine tool-use/tool-result protocol via mocked Anthropic client.
    Verifies multi-turn tool execution without requiring live API credentials.
    """
    db = SessionLocal()
    try:
        finding_dict = {
            "id": "FIND-REC-TEST-MOCK",
            "type": "recall",
            "severity": 90.0,
            "title": "Mock Tool Recall",
            "description": "Mock Test",
            "entities": {"sku": "AMOX-625", "batches": ["B2231"]},
            "metrics": {"stock_in_wh": 180, "dispatched_total_30d": 640},
        }
        options_summary = [
            {"id": "OPT-A", "name": "Option A"},
            {"id": "OPT-B", "name": "Option B"},
        ]

        # Case 1: When no API key is set, returns DETERMINISTIC_FALLBACK
        decision, trace, mode = run_anthropic_tool_loop(db, finding_dict, options_summary)
        assert mode == "DETERMINISTIC_FALLBACK"
        assert decision is None

        # Case 2: Mock an active Anthropic client that calls trace_batch then finishes
        with patch("app.config.settings.ANTHROPIC_API_KEY", "test_mock_key_xyz"):
            with patch("anthropic.Anthropic") as mock_anthropic_cls:
                mock_client = MagicMock()
                mock_anthropic_cls.return_value = mock_client

                # Turn 1: Model requests tool_use: trace_batch
                tool_block = MagicMock()
                tool_block.type = "tool_use"
                tool_block.name = "trace_batch"
                tool_block.input = {"batch": "B2231"}
                tool_block.id = "toolu_01"

                response_turn_1 = MagicMock()
                response_turn_1.stop_reason = "tool_use"
                response_turn_1.content = [tool_block]

                # Turn 2: Model finishes reasoning with final text JSON
                text_block = MagicMock()
                text_block.type = "text"
                text_block.text = json.dumps({
                    "action_type": "SEND_NOTICES",
                    "chosen_option": "OPT-B",
                    "required_role": "pharmacist",
                    "rationale": "Tool confirmed 180 in warehouse and 640 dispatched. Priority hospital coverage selected.",
                    "uncertainty_score": 0.10,
                    "assumptions": ["Hospital ICU demand is prioritized."],
                    "coordination_summary": "Native tool-use executed."
                })

                response_turn_2 = MagicMock()
                response_turn_2.stop_reason = "end_turn"
                response_turn_2.content = [text_block]

                mock_client.messages.create.side_effect = [response_turn_1, response_turn_2]

                live_decision, live_trace, live_mode = run_anthropic_tool_loop(
                    db, finding_dict, options_summary
                )

                assert live_mode == "LIVE_LLM"
                assert live_decision is not None
                assert live_decision["chosen_option"] == "OPT-B"
                assert live_decision["action_type"] == "SEND_NOTICES"
                assert len(live_trace) == 1
                assert live_trace[0]["tool"] == "trace_batch"
                assert live_trace[0]["output"]["batch"] == "B2231"

    finally:
        db.close()

def test_pre_execution_revalidation_and_ledger_purity():
    """
    8, 9, 10. Tests:
    - Pre-execution revalidation of inventory.
    - No action executes before human approval.
    - Zero patient PII in ledger.
    - Ledger chain integrity preserved before and after approved execution.
    """
    client = TestClient(app)

    # 1. Trigger recall replay to generate pending action
    rep = client.post("/api/recalls/replay-b2231")
    assert rep.status_code == 200

    # 2. Get the created action
    act_resp = client.get("/api/actions?status=pending_approval")
    assert act_resp.status_code == 200
    actions = act_resp.json()
    target_action = next((a for a in actions if a["type"] in ["QUARANTINE_FOR_QA", "BLOCK_BATCH", "SEND_NOTICES"]), actions[0])
    action_id = target_action["id"]

    # Verify action is in pending_approval (NEVER executed prematurely)
    assert target_action["status"] == "pending_approval"

    # 3. Check ledger before approval
    v_before = client.get("/api/ledger/verify")
    assert v_before.json()["ok"] is True

    # 4. Attempt unauthorized approval (role violation)
    unauth = client.post(f"/api/actions/{action_id}/approve", json={
        "role": "warehouse",
        "user_name": "Warehouse Worker",
        "reason": "Unauthorized attempt"
    })
    assert unauth.status_code == 403

    # 5. Authorize with legitimate pharmacist role
    auth = client.post(f"/api/actions/{action_id}/approve", json={
        "role": "pharmacist",
        "user_name": "Dr. Sneha Rao",
        "reason": "Approved regulatory quarantine order"
    })
    assert auth.status_code == 200
    res_data = auth.json()
    assert res_data["new_status"] == "executed"
    assert res_data["execution"]["pre_execution_validated"] is True

    # 6. Check ledger after approval
    v_after = client.get("/api/ledger/verify")
    assert v_after.json()["ok"] is True

    # 7. Check latest ledger entry payload for PII purity
    db = SessionLocal()
    try:
        latest_entry = db.query(Ledger).order_by(Ledger.seq.desc()).first()
        payload = json.loads(latest_entry.payload)
        payload_str = json.dumps(payload).lower()
        # Ensure no street addresses or patient names
        assert "patient" not in payload_str
        assert "street" not in payload_str
        assert payload["approved_by"] == "Dr. Sneha Rao"
        assert payload["role"] == "pharmacist"
    finally:
        db.close()
