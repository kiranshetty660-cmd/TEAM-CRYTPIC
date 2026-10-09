import json
import pytest
import httpx
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.db import SessionLocal
from app.config import settings
from app.models import BatchInventory
from app.schemas import Finding
from app.agent.tools import NVIDIA_NIM_TOOLS, ANTHROPIC_TOOLS, execute_registered_tool
from app.agent.nvidia_tool_runner import run_nvidia_tool_loop
from app.agent.orchestrator import run_agent_loop_on_finding

client = TestClient(app)

def test_nvidia_nim_model_and_endpoint_configuration():
    """
    Verifies that the exact model ID and endpoint for NVIDIA NIM are configured:
    Model: z-ai/glm-5.3
    Base URL: https://integrate.api.nvidia.com/v1
    Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
    """
    assert settings.NVIDIA_MODEL == "z-ai/glm-5.3"
    assert "https://integrate.api.nvidia.com" in settings.NVIDIA_BASE_URL
    assert settings.NVIDIA_BASE_URL.rstrip("/").endswith("/v1")


def test_nvidia_nim_tool_schemas():
    """
    Verifies all 7 registered tools are exported in standard OpenAI / NVIDIA NIM format:
    type='function', function.name, function.description, function.parameters.
    """
    assert len(NVIDIA_NIM_TOOLS) == 7
    tool_names = [t["function"]["name"] for t in NVIDIA_NIM_TOOLS]

    expected_tools = [
        "trace_batch",
        "coverage_check",
        "get_supplier_terms",
        "compare_options",
        "allocate_stock",
        "investigate_root_cause",
        "forecast_demand",
    ]
    for expected in expected_tools:
        assert expected in tool_names

    for t in NVIDIA_NIM_TOOLS:
        assert t["type"] == "function"
        fn = t["function"]
        assert "name" in fn
        assert "description" in fn
        assert "parameters" in fn
        assert fn["parameters"].get("type") == "object"
        assert "properties" in fn["parameters"]


def test_nvidia_nim_missing_key_fallback():
    """
    When NVIDIA_API_KEY is not configured, the runner must cleanly fall back
    to deterministic mode without crashing or hanging.
    """
    db = SessionLocal()
    try:
        finding_dict = {
            "id": "FIND-REC-TEST",
            "type": "recall",
            "severity": 90.0,
            "title": "Augmentin Recall",
            "description": "Test recall",
            "entities": {"sku": "AMOX-625", "batch": "B2231"},
            "metrics": {},
        }
        with patch("app.config.settings.NVIDIA_API_KEY", None):
            decision, trace, mode = run_nvidia_tool_loop(
                db=db,
                finding_dict=finding_dict,
                options_summary=[],
                api_key_override=None,
            )
            assert decision is None
            assert trace == []
            assert mode == "DETERMINISTIC_FALLBACK"
    finally:
        db.close()


def test_nvidia_nim_tool_calling_round_trip():
    """
    Simulates a complete multi-turn tool-calling loop using NVIDIA NIM (GLM-5.3):
    1. Turn 1: Model requests tool_calls: trace_batch(batch='B2231').
    2. Runner executes trace_batch against database, collects pallet counts.
    3. Runner sends tool result back with role='tool' and matching tool_call_id.
    4. Turn 2: Model finishes reasoning and returns structured CoordinatorDecision JSON.
    5. Verifies Pydantic parsing and LIVE_LLM output.
    """
    db = SessionLocal()
    try:
        finding_dict = {
            "id": "FIND-REC-B2231",
            "type": "recall",
            "severity": 90.4,
            "title": "Class II Recall: Augmentin 625 (B2231)",
            "description": "Recall issued by CDSCO",
            "entities": {"sku": "AMOX-625", "batch": "B2231"},
            "metrics": {"warehouse_stock_units": 180, "field_units_at_risk": 640},
        }
        options_summary = [
            {"id": "OPT-QUARANTINE-QA", "name": "Quarantine for QA Inspection"},
            {"id": "OPT-RMA", "name": "Immediate Supplier Return"},
        ]

        # Prepare mock responses from NVIDIA NIM
        turn_1_response = {
            "id": "chatcmpl-turn-1",
            "object": "chat.completion",
            "created": 1728470400,
            "model": "z-ai/glm-5.3",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_trace_001",
                                "type": "function",
                                "function": {
                                    "name": "trace_batch",
                                    "arguments": json.dumps({"batch": "B2231"}),
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
        }

        turn_2_response = {
            "id": "chatcmpl-turn-2",
            "object": "chat.completion",
            "created": 1728470405,
            "model": "z-ai/glm-5.3",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": json.dumps({
                            "action_type": "BLOCK_BATCH",
                            "chosen_option": "OPT-QUARANTINE-QA",
                            "required_role": "pharmacist",
                            "rationale": "Tool trace confirmed 180 units in WH-1 and 640 units in field. Quarantine is mandatory under Schedule M.",
                            "uncertainty_score": 0.05,
                            "assumptions": ["Manufacturer assay failure confirmed via CDSCO"],
                            "coordination_summary": "Factual trace confirmed via trace_batch; segregated 180 units.",
                        }),
                    },
                    "finish_reason": "stop",
                }
            ],
        }

        # Mock httpx client post
        mock_client = MagicMock()
        resp1 = MagicMock()
        resp1.status_code = 200
        resp1.json.return_value = turn_1_response

        resp2 = MagicMock()
        resp2.status_code = 200
        resp2.json.return_value = turn_2_response

        mock_client.post.side_effect = [resp1, resp2]

        decision, trace, mode = run_nvidia_tool_loop(
            db=db,
            finding_dict=finding_dict,
            options_summary=options_summary,
            http_client=mock_client,
            api_key_override="nvapi-mock-test-key",
            model_override="z-ai/glm-5.3",
        )

        assert mode == "LIVE_LLM"
        assert decision is not None
        assert decision["action_type"] == "BLOCK_BATCH"
        assert decision["chosen_option"] == "OPT-QUARANTINE-QA"
        assert decision["required_role"] == "pharmacist"
        assert "180 units" in decision["rationale"]

        # Verify tool trace recorded the round trip
        assert len(trace) == 1
        assert trace[0]["tool"] == "trace_batch"
        assert trace[0]["input"] == {"batch": "B2231"}
        assert trace[0]["output"]["batch"] == "B2231"
        assert trace[0]["output"]["total_stock_in_wh"] == 180
        assert trace[0]["is_error"] is False
    finally:
        db.close()


def test_nvidia_nim_malformed_arguments_handling():
    """
    When the model returns malformed JSON arguments, the runner must handle
    the error safely without crashing, log the error into the trace, and continue.
    """
    db = SessionLocal()
    try:
        finding_dict = {"id": "FIND-TEST", "type": "recall", "entities": {}, "metrics": {}}

        malformed_turn = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call_bad_args",
                                "type": "function",
                                "function": {
                                    "name": "coverage_check",
                                    "arguments": "{unquoted_key: invalid_json}",
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ]
        }

        final_turn = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps({
                            "action_type": "QUARANTINE_FOR_QA",
                            "chosen_option": "OPT-A",
                            "required_role": "compliance",
                            "rationale": "Recovered from argument error and quarantined pending QA.",
                            "uncertainty_score": 0.4,
                            "assumptions": [],
                            "coordination_summary": "Recovered safely",
                        }),
                    },
                    "finish_reason": "stop",
                }
            ]
        }

        mock_client = MagicMock()
        r1 = MagicMock(status_code=200)
        r1.json.return_value = malformed_turn
        r2 = MagicMock(status_code=200)
        r2.json.return_value = final_turn
        mock_client.post.side_effect = [r1, r2]

        decision, trace, mode = run_nvidia_tool_loop(
            db=db,
            finding_dict=finding_dict,
            options_summary=[],
            http_client=mock_client,
            api_key_override="nvapi-mock-test-key",
        )

        assert mode == "LIVE_LLM"
        assert decision is not None
        assert len(trace) == 1
        assert trace[0]["is_error"] is True
        assert "Malformed arguments" in trace[0]["output"]["error"]
    finally:
        db.close()


def test_nvidia_nim_timeout_handling():
    """
    Verifies that network timeouts trigger graceful fallback to deterministic mode.
    """
    db = SessionLocal()
    try:
        finding_dict = {"id": "FIND-TEST", "type": "expiry", "entities": {}, "metrics": {}}

        mock_client = MagicMock()
        mock_client.post.side_effect = httpx.TimeoutException("NVIDIA NIM connection timed out")

        decision, trace, mode = run_nvidia_tool_loop(
            db=db,
            finding_dict=finding_dict,
            options_summary=[],
            http_client=mock_client,
            api_key_override="nvapi-mock-test-key",
            timeout_seconds=2.0,
        )

        assert decision is None
        assert mode == "DETERMINISTIC_FALLBACK"
        assert len(trace) == 1
        assert trace[0]["status"] == "TIMEOUT"
    finally:
        db.close()


def test_nvidia_nim_rate_limit_429_handling():
    """
    Verifies that HTTP 429 rate limit errors trigger graceful fallback
    to deterministic mode without raising unhandled exceptions.
    """
    db = SessionLocal()
    try:
        finding_dict = {"id": "FIND-TEST", "type": "coldchain", "entities": {}, "metrics": {}}

        mock_client = MagicMock()
        r429 = MagicMock(status_code=429, text="Rate limit exceeded. Please try again later.")
        mock_client.post.return_value = r429

        decision, trace, mode = run_nvidia_tool_loop(
            db=db,
            finding_dict=finding_dict,
            options_summary=[],
            http_client=mock_client,
            api_key_override="nvapi-mock-test-key",
        )

        assert decision is None
        assert mode == "DETERMINISTIC_FALLBACK"
        assert len(trace) == 1
        assert trace[0]["status"] == "RATE_LIMITED"
    finally:
        db.close()


def test_nvidia_nim_safety_rule_rejection():
    """
    Clinical Safety Policy: The agent must NEVER claim a medicine or batch is safe.
    If the LLM makes a safety claim in rationale, the runner rejects the output
    and falls back to deterministic mode.
    """
    db = SessionLocal()
    try:
        finding_dict = {"id": "FIND-TEST", "type": "coldchain", "entities": {}, "metrics": {}}

        unsafe_response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps({
                            "action_type": "BLOCK_BATCH",
                            "chosen_option": "OPT-A",
                            "required_role": "pharmacist",
                            "rationale": "I checked the telemetry and the medicine is safe to administer to patients.",
                            "uncertainty_score": 0.0,
                            "assumptions": [],
                            "coordination_summary": "Unsafe claim",
                        }),
                    },
                    "finish_reason": "stop",
                }
            ]
        }

        mock_client = MagicMock()
        r = MagicMock(status_code=200)
        r.json.return_value = unsafe_response
        mock_client.post.return_value = r

        decision, trace, mode = run_nvidia_tool_loop(
            db=db,
            finding_dict=finding_dict,
            options_summary=[],
            http_client=mock_client,
            api_key_override="nvapi-mock-test-key",
        )

        # Output must be rejected
        assert decision is None
        assert mode == "DETERMINISTIC_FALLBACK"
        assert len(trace) == 1
        assert "Safety policy violation" in trace[0]["warning"]
    finally:
        db.close()


def test_orchestrator_integration_with_nvidia_nim():
    """
    Tests orchestrator executing finding through run_agent_loop_on_finding
    when NVIDIA_API_KEY is active.
    """
    db = SessionLocal()
    try:
        finding = Finding(
            id="FIND-REC-ORCH-TEST",
            type="recall",
            severity=90.4,
            title="Class II Recall: Augmentin 625 (B2231)",
            description="Recall issued by CDSCO",
            entities={"sku": "AMOX-625", "batch": "B2231"},
            metrics={"warehouse_stock_units": 180, "field_units_at_risk": 640},
            options=[
                {
                    "id": "OPT-QUARANTINE-QA",
                    "name": "Quarantine for QA Inspection",
                    "description": "Lock WH-1 stock immediately",
                    "metrics": {},
                    "projected_outcome": "Immediate safety containment",
                }
            ],
        )

        with patch("app.config.settings.NVIDIA_API_KEY", "nvapi-mock-test-key"):
            with patch("app.agent.orchestrator.run_nvidia_tool_loop") as mock_nim_loop:
                mock_nim_loop.return_value = (
                    {
                        "action_type": "BLOCK_BATCH",
                        "chosen_option": "OPT-QUARANTINE-QA",
                        "required_role": "pharmacist",
                        "rationale": "NVIDIA NIM GLM-5.3 confirmed 180 units in WH-1 needing quarantine.",
                        "uncertainty_score": 0.05,
                        "assumptions": ["Recall valid"],
                        "coordination_summary": "NVIDIA NIM GLM-5.3 tool loop complete",
                    },
                    [{"iteration": 1, "tool": "trace_batch", "output": {"stock": 180}}],
                    "LIVE_LLM",
                )

                enriched = run_agent_loop_on_finding(db, finding)
                assert enriched.ai_mode == "LIVE_LLM"
                assert enriched.multi_agent_summary is not None
                mas = enriched.multi_agent_summary if isinstance(enriched.multi_agent_summary, dict) else enriched.multi_agent_summary.model_dump()
                assert mas["ai_mode"] == "LIVE_LLM"
                assert mas["coordinator"]["action_type"] == "BLOCK_BATCH"
                assert mas["coordinator"]["chosen_option"] == "OPT-QUARANTINE-QA"
                assert "NVIDIA NIM (z-ai/glm-5.3)" in mas["coordinator"]["coordination_summary"]
    finally:
        db.close()
