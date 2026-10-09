import json
import re
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.config import settings
from app.agent.tools import ANTHROPIC_TOOLS, execute_registered_tool
from app.agent.prompts import AGENT_SYSTEM_PROMPT
from app.agent.agent_schemas import CoordinatorDecision

MAX_TOOL_ITERATIONS = 5

def run_anthropic_tool_loop(
    db: Session,
    finding_dict: Dict[str, Any],
    options_summary: List[Dict[str, Any]],
    timeout_seconds: float = 15.0,
) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]], str]:
    """
    Executes official Anthropic Tool-Use / Tool-Result multi-turn protocol:
    1. Sends finding to Claude 3.5 Sonnet along with registered read-only tools.
    2. Model requests tool execution (e.g. trace_batch, coverage_check).
    3. Tool is executed safely against local DB and returns tool_result.
    4. Model continues reasoning with bounded iterations (max 5) and timeouts.
    5. Returns (parsed_decision, tool_trace_steps, ai_mode).
    
    If ANTHROPIC_API_KEY is missing, API fails, or output is invalid, returns (None, [], "DETERMINISTIC_FALLBACK").
    """
    if not settings.ANTHROPIC_API_KEY:
        return None, [], "DETERMINISTIC_FALLBACK"

    try:
        import anthropic
    except ImportError:
        return None, [], "DETERMINISTIC_FALLBACK"

    tool_trace_steps = []
    messages = [
        {
            "role": "user",
            "content": f"""You are investigating compliance finding {finding_dict.get('id')} ({finding_dict.get('type')}).
Use the provided registered tools (trace_batch, coverage_check, get_supplier_terms, compare_options, allocate_stock)
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

You must invoke tools to verify stock and dispatches. When finished, return your final response strictly as valid JSON:
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
        }
    ]

    try:
        client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=timeout_seconds,
        )

        for iteration in range(MAX_TOOL_ITERATIONS):
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1024,
                temperature=0.0,
                system=AGENT_SYSTEM_PROMPT,
                tools=ANTHROPIC_TOOLS,
                messages=messages,
            )

            # Check if model requested tool use
            tool_use_blocks = [c for c in response.content if c.type == "tool_use"]
            if response.stop_reason == "tool_use" and tool_use_blocks:
                # Add assistant message with tool_use blocks
                messages.append({"role": "assistant", "content": response.content})

                tool_results_content = []
                for tool_call in tool_use_blocks:
                    tool_name = tool_call.name
                    tool_input = tool_call.input
                    tool_id = tool_call.id

                    # Execute safely via registered dispatcher
                    try:
                        result = execute_registered_tool(tool_name, tool_input, db)
                        is_error = False
                    except Exception as ex:
                        result = {"error": str(ex)}
                        is_error = True

                    tool_trace_steps.append({
                        "iteration": iteration + 1,
                        "tool": tool_name,
                        "input": tool_input,
                        "output": result,
                        "is_error": is_error,
                    })

                    tool_results_content.append({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": json.dumps(result),
                        "is_error": is_error,
                    })

                messages.append({"role": "user", "content": tool_results_content})
                continue

            # Model finished reasoning and returned final text
            text_blocks = [c.text for c in response.content if hasattr(c, "text")]
            raw_text = "".join(text_blocks)

            # Parse and validate JSON output
            match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                # Validate with Pydantic
                decision_model = CoordinatorDecision(**parsed)
                # Hard safety validation
                rationale_lower = decision_model.rationale.lower()
                if "medicine is safe" in rationale_lower or "batch is safe" in rationale_lower or "100% safe" in rationale_lower:
                    # Reject safety claim
                    return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"

                return decision_model.model_dump(), tool_trace_steps, "LIVE_LLM"

            break

    except Exception:
        # Fall back gracefully on network error, invalid key, or timeout
        return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"

    return None, tool_trace_steps, "DETERMINISTIC_FALLBACK"
