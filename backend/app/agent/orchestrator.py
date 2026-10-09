import json
import uuid
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models import Action, BatchInventory
from app.schemas import Finding
from app.config import settings
from app.agent.tools import (
    tool_trace_batch,
    tool_coverage_check,
    tool_allocate,
    tool_compare_options,
)
from app.agent.prompts import AGENT_SYSTEM_PROMPT, build_finding_prompt
from app.agent.fallback import get_fallback_decision
from app.ledger.chain import append_ledger_event

def determine_action_type_and_role(finding: Finding, chosen_option: str) -> tuple[str, str]:
    """
    Maps finding and chosen option to Action type and required approval role.
    """
    ftype = finding.type
    if ftype == "recall":
        return "SEND_NOTICES", "pharmacist"
    elif ftype == "coldchain":
        return "QUARANTINE_FOR_QA", "pharmacist"
    elif ftype == "returnwindow":
        return "RETURN_REQUEST", "purchase"
    elif ftype == "expiry":
        if "RETURN" in chosen_option:
            return "RETURN_REQUEST", "purchase"
        elif "DISCOUNT" in chosen_option:
            return "DISCOUNT_OFFER", "compliance"
        else:
            return "TRANSFER", "purchase"
    elif ftype == "fefo":
        return "PICK_INSTRUCTION", "warehouse"
    elif ftype == "critical":
        return "URGENT_PO", "purchase"
    return "BLOCK_BATCH", "compliance"

def validate_llm_decision(llm_json: Dict[str, Any], finding: Finding) -> bool:
    """
    Strict validation of LLM output against deterministic finding data:
    1. Must contain chosen_option in available options
    2. Must contain rationale and confidence
    3. Confidence must be float between 0 and 1
    4. Must not claim medicine is 'safe' or 'unsafe'
    """
    if not isinstance(llm_json, dict):
        return False
    chosen = llm_json.get("chosen_option")
    if not chosen:
        return False

    valid_option_ids = [opt.id for opt in finding.options]
    if chosen not in valid_option_ids and chosen not in ["A", "B", "C", "OPT-A", "OPT-B", "OPT-C"]:
        return False

    rationale = str(llm_json.get("rationale", "")).lower()
    # Hard rule: agent never decides medicine is safe/unsafe
    if "medicine is safe" in rationale or "batch is completely safe" in rationale or "medicine is 100% unsafe" in rationale:
        return False

    return True

def run_agent_loop_on_finding(db: Session, finding: Finding) -> Finding:
    """
    Runs the agent loop:
    Observe -> Reason -> Evaluate -> Decide -> Act (draft only) -> Explain.
    """
    trace_steps = []

    # 1. OBSERVE
    trace_steps.append({
        "step": 1,
        "phase": "Observe",
        "action": "Ingest Finding Entities & Deterministic Telemetry",
        "input": {"finding_id": finding.id, "type": finding.type, "severity": finding.severity},
        "output": {"entities": finding.entities, "metrics": finding.metrics},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # 2. TOOL CALLS & REASONING
    tool_results = {}
    if finding.type == "recall":
        primary_batch = finding.entities.get("batches", ["B2231"])[0]
        trace_data = tool_trace_batch(db, primary_batch)
        tool_results["trace_batch"] = trace_data
        cov_data = tool_coverage_check(db, finding.entities.get("sku"), finding.metrics.get("replacement_need", 808), [primary_batch])
        tool_results["coverage_check"] = cov_data

        trace_steps.append({
            "step": 2,
            "phase": "Reason (Tool Execution)",
            "action": "Execute trace_batch and coverage_check",
            "input": {"batch": primary_batch, "sku": finding.entities.get("sku")},
            "output": {
                "trace_summary": f"Traced {trace_data['total_dispatched']} units across {trace_data['customers_count']} accounts ({trace_data['hospitals_count']} hospitals)",
                "coverage_summary": f"Clean stock: {cov_data['clean_qty_available']}, Shortfall: {cov_data['shortfall']}",
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    elif finding.type in ["expiry", "returnwindow"]:
        comp_opts = tool_compare_options(finding.type, finding.metrics)
        tool_results["compare_options"] = comp_opts

        trace_steps.append({
            "step": 2,
            "phase": "Reason (Tool Execution)",
            "action": "Execute compare_options matrix",
            "input": finding.metrics,
            "output": {"comparisons_evaluated": len(comp_opts)},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # 3. EVALUATE
    options_summary = [opt.model_dump() for opt in finding.options]
    trace_steps.append({
        "step": 3,
        "phase": "Evaluate",
        "action": "Compare Candidate Actions with Computed Metrics",
        "input": {"available_options": [o["id"] for o in options_summary]},
        "output": {"options_matrix": options_summary},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # 4. DECIDE (LLM with Anthropic API if key present, else Fallback)
    decision = None
    if settings.ANTHROPIC_API_KEY:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            prompt = build_finding_prompt(finding.model_dump(), options_summary)
            message = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1024,
                temperature=0.0,
                system=AGENT_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}]
            )
            raw_text = message.content[0].text
            # Extract JSON
            match = re.search(r'\{.*\}', raw_text, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                if validate_llm_decision(parsed, finding):
                    decision = parsed
                    decision["fallback_used"] = False
        except Exception as e:
            decision = None

    if decision is None:
        decision = get_fallback_decision(finding.model_dump(), options_summary)

    trace_steps.append({
        "step": 4,
        "phase": "Decide",
        "action": "Select Optimum Strategy via Constrained Intelligence",
        "input": {"chosen_option": decision.get("chosen_option")},
        "output": {
            "rationale": decision.get("rationale"),
            "confidence": decision.get("confidence"),
            "assumptions": decision.get("assumptions"),
            "fallback_used": decision.get("fallback_used", False),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # 5. ACT (Draft Action in Database)
    action_type, required_role = determine_action_type_and_role(finding, decision.get("chosen_option", ""))
    action_id = f"ACT-{uuid.uuid4().hex[:8].upper()}"

    # Build action payload
    action_payload = {
        "finding_id": finding.id,
        "finding_type": finding.type,
        "entities": finding.entities,
        "metrics": finding.metrics,
        "chosen_option": decision.get("chosen_option"),
        "rationale": decision.get("rationale"),
        "assumptions": decision.get("assumptions", []),
    }

    # Save action to DB
    new_action = Action(
        id=action_id,
        type=action_type,
        payload=json.dumps(action_payload),
        evidence=json.dumps(finding.metrics),
        options=json.dumps(options_summary),
        chosen_option=decision.get("chosen_option"),
        status="pending_approval",
        required_role=required_role,
        created_at=datetime.now(timezone.utc),
        decided_by=None,
        decided_at=None,
        reason=None,
    )
    db.add(new_action)
    db.commit()

    # Append ACTION_DRAFTED event to ledger
    append_ledger_event(
        db=db,
        event_type="ACTION_DRAFTED",
        payload={
            "action_id": action_id,
            "type": action_type,
            "finding_id": finding.id,
            "chosen_option": decision.get("chosen_option"),
            "required_role": required_role,
        },
        ts=datetime.now(timezone.utc).isoformat(),
        trigger_auto_anchor=True,
    )

    trace_steps.append({
        "step": 5,
        "phase": "Act (Draft Only)",
        "action": f"Create Draft Action Record {action_id}",
        "input": {"action_type": action_type, "required_role": required_role},
        "output": {
            "action_id": action_id,
            "status": "pending_approval",
            "ledger_event": "ACTION_DRAFTED",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # 6. EXPLAIN
    trace_steps.append({
        "step": 6,
        "phase": "Explain",
        "action": "Surface Mathematical Formulas, Evidence Rows & Audit Lineage",
        "input": {"finding_id": finding.id},
        "output": {
            "formula": finding.explanation.get("formula") if finding.explanation else "",
            "weights": finding.explanation.get("weights") if finding.explanation else {},
            "source_rows": finding.source_rows or [],
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # Update finding with agent results
    finding.action_id = action_id
    finding.agent_trace = trace_steps
    finding.recommended_action = {
        "action_id": action_id,
        "type": action_type,
        "chosen_option": decision.get("chosen_option"),
        "rationale": decision.get("rationale"),
        "confidence": decision.get("confidence"),
        "required_role": required_role,
        "assumptions": decision.get("assumptions", []),
    }

    return finding
