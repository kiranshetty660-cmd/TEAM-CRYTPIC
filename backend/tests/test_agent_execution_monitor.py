import pytest
import json
import httpx
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import AgentRun, AgentTraceEvent, Action, BatchInventory
from app.schemas import Finding, FindingOption
from app.agent.tracer import ExecutionTracer, sanitize_payload
from app.agent.orchestrator import run_agent_loop_on_finding
from app.agent.nvidia_tool_runner import run_nvidia_tool_loop

client = TestClient(app)

def test_privacy_sanitizer_strips_sensitive_data():
    """Verify that credentials, tokens, and patient PII are strictly redacted."""
    raw_payload = {
        "api_key": "nvapi-secret123456",
        "authorization": "Bearer token998877",
        "patient_name": "John Doe",
        "phone": "+91 9876543210",
        "email": "patient@hospital.org",
        "warehouse": "WH-1",
        "qty": 500,
        "nested": {
            "token": "secret_abc",
            "batch": "B2231",
        }
    }
    sanitized = sanitize_payload(raw_payload)
    assert sanitized["api_key"] == "[REDACTED]"
    assert sanitized["authorization"] == "[REDACTED]"
    assert sanitized["patient_name"] == "[REDACTED]"
    assert sanitized["phone"] == "[REDACTED]"
    assert sanitized["email"] == "[REDACTED]"
    assert sanitized["warehouse"] == "WH-1"
    assert sanitized["qty"] == 500
    assert sanitized["nested"]["token"] == "[REDACTED]"
    assert sanitized["nested"]["batch"] == "B2231"

def test_execution_tracer_lifecycle_events():
    """Verify sequential event recording and run completion."""
    db = SessionLocal()
    try:
        tracer = ExecutionTracer(db)
        run = tracer.start_run(
            finding_id="FINDING-TEST-001",
            batch="B2231",
            sku="AMOX-625",
            provider="deterministic",
            ai_mode="DETERMINISTIC_FALLBACK",
        )
        assert run.run_id.startswith("RUN-")
        assert run.status == "running"
        assert run.human_approval_status == "pending_approval"

        # Emit AGENT_STARTED
        ev1 = tracer.record_event(
            run_id=run.run_id,
            event_type="AGENT_STARTED",
            agent_name="Investigation Agent",
            invocation_reason="Gather telemetry",
            input_summary={"batch": "B2231"},
        )
        assert ev1.event_seq == 1
        assert ev1.event_type == "AGENT_STARTED"

        # Emit TOOL_REQUESTED
        ev2 = tracer.record_event(
            run_id=run.run_id,
            event_type="TOOL_REQUESTED",
            agent_name="Investigation Agent",
            tool_name="trace_batch",
            tool_arguments={"batch": "B2231"},
        )
        assert ev2.event_seq == 2
        assert ev2.tool_name == "trace_batch"

        # Emit TOOL_COMPLETED
        ev3 = tracer.record_event(
            run_id=run.run_id,
            event_type="TOOL_COMPLETED",
            agent_name="Investigation Agent",
            tool_name="trace_batch",
            tool_result={"total_dispatched": 1600},
            latency_ms=12.5,
        )
        assert ev3.event_seq == 3
        assert ev3.latency_ms == 12.5

        # Complete run
        completed_run = tracer.complete_run(
            run_id=run.run_id,
            chosen_option="OPT-B",
            recommended_action="SEND_NOTICES",
            required_role="pharmacist",
            uncertainty_score=0.15,
            review_passed=True,
            action_id="ACT-TEST-01",
            total_latency_ms=45.0,
        )
        assert completed_run.status == "completed" or completed_run.status == "fallback"
        assert completed_run.action_id == "ACT-TEST-01"

        # Verify RUN_COMPLETED event seq was logged
        last_event = db.query(AgentTraceEvent).filter(AgentTraceEvent.run_id == run.run_id).order_by(AgentTraceEvent.event_seq.desc()).first()
        assert last_event.event_type == "RUN_COMPLETED"
    finally:
        db.close()

def test_orchestrator_end_to_end_trace_generation():
    """Verify that run_agent_loop_on_finding records all specialist agents into the trace database."""
    db = SessionLocal()
    try:
        sample_finding = Finding(
            id="FINDING-TRACE-DEMO",
            type="recall",
            severity=92.0,
            title="Class II Recall Test for Batch B2231",
            description="CDSCO Notification",
            entities={"batch": "B2231", "sku": "AMOX-625"},
            metrics={"stock_in_wh": 400, "total_dispatched": 1600, "unit_cost": 120.0},
            options=[
                FindingOption(id="OPT-A", name="Replace 100%", description="Replace all units"),
                FindingOption(id="OPT-B", name="Priority Allocation", description="Hospital first"),
            ],
        )

        processed = run_agent_loop_on_finding(db, sample_finding)
        assert processed.run_id is not None
        assert processed.action_id is not None

        # Query database for AgentRun
        run = db.query(AgentRun).filter(AgentRun.run_id == processed.run_id).first()
        assert run is not None
        assert run.finding_id == "FINDING-TRACE-DEMO"
        assert run.batch == "B2231"
        assert run.sku == "AMOX-625"
        assert run.action_id == processed.action_id
        assert run.human_approval_status == "pending_approval"

        # Query database for AgentTraceEvents
        events = db.query(AgentTraceEvent).filter(AgentTraceEvent.run_id == processed.run_id).order_by(AgentTraceEvent.event_seq.asc()).all()
        assert len(events) >= 5

        agent_names = [e.agent_name for e in events]
        assert "Investigation Agent" in agent_names
        assert "Risk Assessment Agent" in agent_names
        assert "Solution Evaluation Agent" in agent_names
        assert "Review Agent" in agent_names

        event_types = [e.event_type for e in events]
        assert "AGENT_STARTED" in event_types
        assert "AGENT_COMPLETED" in event_types
        assert "RUN_COMPLETED" in event_types
    finally:
        db.close()

def test_human_approval_status_separation():
    """Verify that human approval state transitions are tracked separately from model decisions."""
    db = SessionLocal()
    try:
        sample_finding = Finding(
            id="FINDING-APPROVAL-TEST",
            type="recall",
            severity=95.0,
            title="Recall Approval Test",
            description="Testing human approval tracking",
            entities={"batch": "B2231", "sku": "AMOX-625"},
            metrics={"stock_in_wh": 400, "total_dispatched": 1600},
            options=[FindingOption(id="OPT-B", name="Priority Allocation", description="Hospital first")],
        )
        processed = run_agent_loop_on_finding(db, sample_finding)
        action_id = processed.action_id
        run_id = processed.run_id

        # Verify initial state
        run_before = db.query(AgentRun).filter(AgentRun.run_id == run_id).first()
        assert run_before.human_approval_status == "pending_approval"

        # Approve action via API endpoint as pharmacist
        resp = client.post(
            f"/api/actions/{action_id}/approve",
            json={"role": "pharmacist", "user_name": "Chief Pharmacist Priya", "reason": "Authorized pursuant to CDSCO notification"}
        )
        assert resp.status_code == 200

        # Verify AgentRun human_approval_status is now "executed"
        db.expire_all()
        run_after = db.query(AgentRun).filter(AgentRun.run_id == run_id).first()
        assert run_after.human_approval_status == "executed"
        # Model recommendation itself is preserved unchanged
        assert run_after.recommended_action == "SEND_NOTICES"
    finally:
        db.close()

def test_skipped_agent_and_fallback_tracing_on_missing_credentials():
    """Verify that when no LLM key is configured, AGENT_SKIPPED and FALLBACK_USED events are explicitly emitted."""
    db = SessionLocal()
    try:
        tracer = ExecutionTracer(db)
        run = tracer.start_run(
            finding_id="FINDING-FALLBACK-TEST",
            provider="deterministic",
            ai_mode="DETERMINISTIC_FALLBACK",
        )

        # Call run_nvidia_tool_loop with empty key
        decision, trace, mode = run_nvidia_tool_loop(
            db=db,
            finding_dict={"id": "FINDING-FALLBACK-TEST", "type": "coldchain"},
            options_summary=[],
            api_key_override="",
            tracer=tracer,
            run_id=run.run_id,
        )
        assert decision is None
        assert mode == "DETERMINISTIC_FALLBACK"

        events = db.query(AgentTraceEvent).filter(AgentTraceEvent.run_id == run.run_id).all()
        types = [e.event_type for e in events]
        assert "AGENT_SKIPPED" in types
        assert "FALLBACK_USED" in types
    finally:
        db.close()

def test_tool_failure_handling_in_trace():
    """Verify tool failures/errors are recorded in the trace without crashing the run."""
    db = SessionLocal()
    try:
        tracer = ExecutionTracer(db)
        run = tracer.start_run(finding_id="FINDING-TOOL-FAIL", provider="nvidia_nim")

        # Record a tool failure event
        tracer.record_event(
            run_id=run.run_id,
            event_type="TOOL_COMPLETED",
            agent_name="NVIDIA NIM Reasoner",
            tool_name="invalid_tool_call",
            tool_arguments={"param": "value"},
            tool_error="Tool 'invalid_tool_call' is not a registered TraceRx tool.",
            latency_ms=2.1,
        )

        ev = db.query(AgentTraceEvent).filter(AgentTraceEvent.run_id == run.run_id, AgentTraceEvent.event_type == "TOOL_COMPLETED").first()
        assert ev is not None
        assert ev.tool_error is not None
        assert "not a registered TraceRx tool" in ev.tool_error
    finally:
        db.close()

def test_agent_monitor_api_endpoints():
    """Verify /api/agent-monitor/runs, /runs/{run_id}, and /stats endpoints."""
    # 1. Test /api/agent-monitor/runs
    resp_runs = client.get("/api/agent-monitor/runs?limit=10")
    assert resp_runs.status_code == 200
    runs_data = resp_runs.json()
    assert isinstance(runs_data, list)
    assert len(runs_data) > 0

    first_run_id = runs_data[0]["run_id"]

    # 2. Test /api/agent-monitor/runs/{run_id}
    resp_detail = client.get(f"/api/agent-monitor/runs/{first_run_id}")
    assert resp_detail.status_code == 200
    detail_data = resp_detail.json()
    assert detail_data["run_id"] == first_run_id
    assert "events" in detail_data
    assert isinstance(detail_data["events"], list)
    assert len(detail_data["events"]) > 0

    # 3. Test /api/agent-monitor/stats
    resp_stats = client.get("/api/agent-monitor/stats")
    assert resp_stats.status_code == 200
    stats_data = resp_stats.json()
    assert "total_runs" in stats_data
    assert "avg_latency_ms" in stats_data
    assert "review_pass_rate_pct" in stats_data
    assert "pending_human_approvals" in stats_data
    assert stats_data["total_runs"] > 0
