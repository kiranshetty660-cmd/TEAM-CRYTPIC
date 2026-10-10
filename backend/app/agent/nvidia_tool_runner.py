import json
import re
import time
import httpx
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.config import settings
from app.agent.tools import NVIDIA_NIM_TOOLS, execute_registered_tool
from app.agent.prompts import AGENT_SYSTEM_PROMPT
from app.agent.agent_schemas import CoordinatorDecision

MAX_TOOL_ITERATIONS = 5

def run_nvidia_tool_loop(
    db: Session,
    finding_dict: Dict[str, Any],
    options_summary: List[Dict[str, Any]],
    timeout_seconds: float = 15.0,
    http_client: Optional[httpx.Client] = None,
    api_key_override: Optional[str] = None,
    model_override: Optional[str] = None,
    base_url_override: Optional[str] = None,
    tracer: Optional[Any] = None,
    run_id: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]], str]:
    """
    Executes official NVIDIA NIM Tool-Use multi-turn protocol using OpenAI-compatible Chat Completions:
    1. Sends finding details to NVIDIA NIM (default model: z-ai/glm-5.3) with registered read-only tools.
    2. Model requests tool execution (e.g. trace_batch, coverage_check, forecast_demand).
    3. Tool is executed safely against local DB via execute_registered_tool and returns tool_result.
    4. Model continues multi-turn reasoning with bounded iterations (max 5) and strict timeout/rate-limit guards.
    5. Returns (parsed_decision, tool_trace_steps, ai_mode).
    
    If NVIDIA_API_KEY is missing, API encounters 429 rate limit, network times out,
    arguments are invalid, or safety policies are violated, returns (None, trace, "DETERMINISTIC_FALLBACK").
    """
    api_key = api_key_override if api_key_override is not None else settings.NVIDIA_API_KEY
    if not api_key:
        if tracer and run_id:
            tracer.record_event(
                run_id=run_id,
                event_type="AGENT_SKIPPED",
                agent_name="NVIDIA NIM Reasoner",
                invocation_reason="NVIDIA_API_KEY environment variable is not configured.",
            )
            tracer.record_event(
                run_id=run_id,
                event_type="FALLBACK_USED",
                agent_name="NVIDIA NIM Reasoner",
                invocation_reason="Switching to deterministic specialist agents due to missing live API credentials.",
            )
        return None, [], "DETERMINISTIC_FALLBACK"

    base_url = (base_url_override or settings.NVIDIA_BASE_URL).rstrip("/")
    endpoint = f"{base_url}/chat/completions"
    model = model_override or settings.NVIDIA_MODEL

    if tracer and run_id:
        tracer.record_event(
            run_id=run_id,
            event_type="AGENT_STARTED",
            agent_name=f"NVIDIA NIM Reasoner ({model})",
            invocation_reason=f"Investigate finding {finding_dict.get('id')} using function calling tools.",
            input_summary={
                "finding_id": finding_dict.get("id"),
                "finding_type": finding_dict.get("type"),
                "model": model,
                "endpoint": endpoint,
                "registered_tools_count": len(NVIDIA_NIM_TOOLS),
            },
        )

    tool_trace_steps: List[Dict[str, Any]] = []

    user_prompt = f"""You are investigating compliance finding {finding_dict.get('id')} ({finding_dict.get('type')}).
Use the provided registered tools (trace_batch, coverage_check, get_supplier_terms, compare_options, allocate_stock, investigate_root_cause, forecast_demand)
to gather factual telemetry before selecting a candidate action.

FINDING SUMMARY:
ID: {finding_dict.get('id')}
Type: {finding_dict.get('type')}
Severity: {finding_dict.get('severity')} / 100
Title: {finding_dict.get('title')}
Description: {finding_dict.get('description')}
Entities: {json.dumps(finding_dict.get('entities', {}))}
Metrics: {json.dumps(finding_dict.get('metrics', {}))}

AVAILABLE OPTIONS:
{json.dumps(options_summary, indent=2)}

You must invoke tools to verify stock, dispatches, and constraints. When finished, return your final response strictly as valid JSON:
{{
  "action_type": "<BLOCK_BATCH | SEND_NOTICES | URGENT_PO | TRANSFER | RETURN_REQUEST | DISCOUNT_OFFER | QUARANTINE_FOR_QA | PICK_INSTRUCTION>",
  "chosen_option": "<Option ID, e.g. OPT-A, OPT-B, OPT-QUARANTINE-QA, OPT-RMA-EXECUTE>",
  "required_role": "<pharmacist | compliance | purchase | warehouse>",
  "rationale": "<Reasoning backed strictly by tool figures>",
  "uncertainty_score": <float between 0.0 and 1.0>,
  "assumptions": ["<explicit assumption>"],
  "coordination_summary": "<summary of multi-agent tool execution>"
}}
Remember: NEVER declare a medicine safe or unsafe. Always recommend physical quarantine pending QA inspection.
"""

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    # Manage local or injected client
    client_context = http_client or httpx.Client(timeout=timeout_seconds)
    should_close = http_client is None

    try:
        for iteration in range(MAX_TOOL_ITERATIONS):
            payload = {
                "model": model,
                "messages": messages,
                "tools": NVIDIA_NIM_TOOLS,
                "tool_choice": "auto",
                "temperature": 0.0,
                "max_tokens": 1024,
            }

            try:
                t_req_start = time.time()
                response = client_context.post(endpoint, headers=headers, json=payload)
                t_req_latency = (time.time() - t_req_start) * 1000.0
            except httpx.TimeoutException:
                msg = f"NVIDIA NIM request timed out after {timeout_seconds}s"
                tool_trace_steps.append({
                    "iteration": iteration + 1,
                    "error": msg,
                    "status": "TIMEOUT",
                })
                if tracer and run_id:
                    tracer.record_event(
                        run_id=run_id,
                        event_type="FALLBACK_USED",
                        agent_name="NVIDIA NIM Reasoner",
                        invocation_reason="Request timed out; falling back to deterministic coordinator.",
                        tool_error=msg,
                    )
                return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"
            except Exception as net_ex:
                msg = f"Network exception communicating with NVIDIA NIM: {str(net_ex)}"
                tool_trace_steps.append({
                    "iteration": iteration + 1,
                    "error": msg,
                    "status": "NETWORK_ERROR",
                })
                if tracer and run_id:
                    tracer.record_event(
                        run_id=run_id,
                        event_type="FALLBACK_USED",
                        agent_name="NVIDIA NIM Reasoner",
                        invocation_reason="Network error; falling back to deterministic coordinator.",
                        tool_error=msg,
                    )
                return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"

            # Handle Rate Limiting (429) gracefully
            if response.status_code == 429:
                msg = "NVIDIA NIM rate limit exceeded (HTTP 429). Falling back to deterministic engine."
                tool_trace_steps.append({
                    "iteration": iteration + 1,
                    "error": msg,
                    "status": "RATE_LIMITED",
                })
                if tracer and run_id:
                    tracer.record_event(
                        run_id=run_id,
                        event_type="FALLBACK_USED",
                        agent_name="NVIDIA NIM Reasoner",
                        invocation_reason="HTTP 429 Rate Limit; falling back to deterministic coordinator.",
                        tool_error=msg,
                    )
                return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"

            # Handle Non-200 Responses
            if response.status_code != 200:
                msg = f"NVIDIA NIM returned HTTP {response.status_code}: {response.text[:200]}"
                tool_trace_steps.append({
                    "iteration": iteration + 1,
                    "error": msg,
                    "status": f"HTTP_{response.status_code}",
                })
                if tracer and run_id:
                    tracer.record_event(
                        run_id=run_id,
                        event_type="FALLBACK_USED",
                        agent_name="NVIDIA NIM Reasoner",
                        invocation_reason=f"API error HTTP {response.status_code}; falling back to deterministic coordinator.",
                        tool_error=msg,
                    )
                return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"

            try:
                resp_json = response.json()
            except Exception:
                msg = "Failed to decode JSON from NVIDIA NIM response"
                tool_trace_steps.append({
                    "iteration": iteration + 1,
                    "error": msg,
                })
                if tracer and run_id:
                    tracer.record_event(
                        run_id=run_id,
                        event_type="FALLBACK_USED",
                        agent_name="NVIDIA NIM Reasoner",
                        invocation_reason="Malformed API response; falling back to deterministic coordinator.",
                        tool_error=msg,
                    )
                return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"

            choices = resp_json.get("choices", [])
            if not choices:
                return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"

            choice = choices[0]
            message = choice.get("message", {})
            tool_calls = message.get("tool_calls", [])

            # Check if model requested tool execution
            if tool_calls:
                messages.append({
                    "role": "assistant",
                    "content": message.get("content") or "",
                    "tool_calls": tool_calls,
                })

                for tc in tool_calls:
                    tool_id = tc.get("id", f"call_{iteration}")
                    fn = tc.get("function", {})
                    fn_name = fn.get("name")
                    fn_args_raw = fn.get("arguments", "{}")

                    # Handle malformed arguments gracefully
                    is_error = False
                    if isinstance(fn_args_raw, dict):
                        tool_input = fn_args_raw
                    else:
                        try:
                            tool_input = json.loads(fn_args_raw) if fn_args_raw else {}
                        except Exception as parse_ex:
                            tool_input = {}
                            is_error = True
                            tool_result = {"error": f"Malformed arguments from model: {str(parse_ex)}"}

                    if tracer and run_id:
                        tracer.record_event(
                            run_id=run_id,
                            event_type="TOOL_REQUESTED",
                            agent_name=f"NVIDIA NIM Reasoner ({model})",
                            invocation_reason=f"Model generated function call for {fn_name}",
                            tool_name=fn_name,
                            tool_arguments=tool_input,
                            tool_error=str(tool_result.get("error")) if is_error else None,
                        )

                    t_start = time.time()
                    if not is_error:
                        try:
                            tool_result = execute_registered_tool(fn_name, tool_input, db)
                        except Exception as exec_ex:
                            tool_result = {"error": str(exec_ex)}
                            is_error = True
                    tool_latency = (time.time() - t_start) * 1000.0

                    if tracer and run_id:
                        tracer.record_event(
                            run_id=run_id,
                            event_type="TOOL_COMPLETED",
                            agent_name=f"NVIDIA NIM Reasoner ({model})",
                            invocation_reason=f"Execution of registered tool {fn_name}",
                            tool_name=fn_name,
                            tool_arguments=tool_input,
                            tool_result=tool_result,
                            tool_error=str(tool_result.get("error")) if is_error else None,
                            latency_ms=tool_latency,
                        )

                    tool_trace_steps.append({
                        "iteration": iteration + 1,
                        "tool": fn_name,
                        "input": tool_input,
                        "output": tool_result,
                        "is_error": is_error,
                        "latency_ms": tool_latency,
                    })

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "name": fn_name,
                        "content": json.dumps(tool_result),
                    })

                continue

            # Model finished tool loop and provided final content
            raw_text = message.get("content", "")
            match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group(0))
                    decision_model = CoordinatorDecision(**parsed)
                    
                    # Hard clinical safety policy validation
                    rationale_lower = decision_model.rationale.lower()
                    if (
                        "medicine is safe" in rationale_lower
                        or "batch is safe" in rationale_lower
                        or "100% safe" in rationale_lower
                        or "completely safe" in rationale_lower
                    ):
                        msg = "Safety policy violation in rationale; rejected unsafe claim"
                        tool_trace_steps.append({
                            "iteration": iteration + 1,
                            "warning": msg,
                        })
                        if tracer and run_id:
                            tracer.record_event(
                                run_id=run_id,
                                event_type="AGENT_FAILED",
                                agent_name="NVIDIA NIM Reasoner",
                                invocation_reason="Safety policy violation: rationale declared medicine safe.",
                                tool_error=msg,
                            )
                            tracer.record_event(
                                run_id=run_id,
                                event_type="FALLBACK_USED",
                                agent_name="NVIDIA NIM Reasoner",
                                invocation_reason="Safety policy violated; falling back to deterministic coordinator.",
                            )
                        return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"

                    decision_dict = decision_model.model_dump()
                    usage = resp_json.get("usage", {})
                    decision_dict["_usage"] = usage

                    if tracer and run_id:
                        tracer.record_event(
                            run_id=run_id,
                            event_type="AGENT_COMPLETED",
                            agent_name=f"NVIDIA NIM Reasoner ({model})",
                            invocation_reason="Successfully resolved tool loop and generated structured decision.",
                            output_summary={
                                "chosen_option": decision_model.chosen_option,
                                "action_type": decision_model.action_type,
                                "required_role": decision_model.required_role,
                                "uncertainty_score": decision_model.uncertainty_score,
                                "tokens": usage,
                            },
                        )

                    return decision_dict, tool_trace_steps, "LIVE_LLM"
                except Exception as val_ex:
                    msg = f"Pydantic validation failed for decision: {str(val_ex)}"
                    tool_trace_steps.append({
                        "iteration": iteration + 1,
                        "error": msg,
                    })
                    if tracer and run_id:
                        tracer.record_event(
                            run_id=run_id,
                            event_type="AGENT_FAILED",
                            agent_name="NVIDIA NIM Reasoner",
                            invocation_reason="Model output failed Pydantic schema validation.",
                            tool_error=msg,
                        )
                        tracer.record_event(
                            run_id=run_id,
                            event_type="FALLBACK_USED",
                            agent_name="NVIDIA NIM Reasoner",
                            invocation_reason="Schema validation failed; falling back to deterministic coordinator.",
                        )
                    return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"

            break

    finally:
        if should_close:
            client_context.close()

    return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"
