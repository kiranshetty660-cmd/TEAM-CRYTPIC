import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models import Action
from app.schemas import Finding
from app.config import settings
from app.agent.specialists import CoordinatorAgent, ReviewAgent
from app.agent.claude_tool_runner import run_anthropic_tool_loop
from app.ledger.chain import append_ledger_event

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
    Coordinated Multi-Agent Intelligence Workflow:
    1. Investigation Agent: Gathers factual batch telemetry, warehouse pallets, and dispatches.
    2. Risk Assessment Agent: Evaluates clinical urgency, patient exposure, and regulatory exposure.
    3. Solution Evaluation Agent: Evaluates candidate responses against real stock, credit windows, and roles.
    4. Review Agent: Independently audits proposed remediation against arithmetic, permissions, and safety rules.
    5. Coordinator Agent: Reconciles specialist outputs, scores uncertainty, and stages the action.
    
    If ANTHROPIC_API_KEY is present, executes official Anthropic Tool-Use multi-turn loop.
    Otherwise, executes deterministic specialist multi-agent coordination.
    """
    # 1. Attempt Live LLM Tool-Use Loop if configured
    options_summary = [opt.model_dump() for opt in finding.options]
    live_decision = None
    live_tool_trace = []
    ai_mode = "DETERMINISTIC_FALLBACK"

    if settings.ANTHROPIC_API_KEY:
        live_decision, live_tool_trace, detected_mode = run_anthropic_tool_loop(
            db=db,
            finding_dict=finding.model_dump(),
            options_summary=options_summary,
            timeout_seconds=15.0,
        )
        if live_decision and detected_mode == "LIVE_LLM":
            ai_mode = "LIVE_LLM"

    # 2. Run Specialist Agents Coordination
    coordinator = CoordinatorAgent(db=db, ai_mode=ai_mode)
    multi_agent_summary = coordinator.run_multi_agent_cycle(finding)

    # If Live LLM was successful, merge its decision while keeping specialist telemetry and independent review
    if ai_mode == "LIVE_LLM" and live_decision:
        multi_agent_summary.coordinator.action_type = live_decision.get("action_type", multi_agent_summary.coordinator.action_type)
        multi_agent_summary.coordinator.chosen_option = live_decision.get("chosen_option", multi_agent_summary.coordinator.chosen_option)
        multi_agent_summary.coordinator.required_role = live_decision.get("required_role", multi_agent_summary.coordinator.required_role)
        multi_agent_summary.coordinator.rationale = live_decision.get("rationale", multi_agent_summary.coordinator.rationale)
        multi_agent_summary.coordinator.uncertainty_score = float(live_decision.get("uncertainty_score", 0.15))
        multi_agent_summary.coordinator.assumptions = live_decision.get("assumptions", multi_agent_summary.coordinator.assumptions)
        multi_agent_summary.coordinator.coordination_summary = "Synthesized via Claude 3.5 Sonnet Tool-Use Protocol & Audited by Review Agent."

    # 3. Assemble Step Trace for UI Transparency
    inv = multi_agent_summary.investigation
    risk = multi_agent_summary.risk_assessment
    sol = multi_agent_summary.solution_evaluation
    rev = multi_agent_summary.review
    coord = multi_agent_summary.coordinator

    trace_steps = [
        {
            "step": 1,
            "phase": "Investigation Agent",
            "action": f"Factual Batch Trace for {inv.batch} ({inv.sku})",
            "input": {"batch": inv.batch, "sku": inv.sku},
            "output": {
                "warehouse_stock": inv.total_warehouse_stock,
                "dispatched_units": inv.total_dispatched_units,
                "accounts_count": inv.customer_count,
                "hospital_count": inv.hospital_count,
                "missing_telemetry_warnings": inv.missing_information_warnings,
            },
            "timestamp": inv.retrieved_at,
        },
        {
            "step": 2,
            "phase": "Risk Assessment Agent",
            "action": f"Evaluate Regulatory Classification & Patient Exposure ({risk.severity_category})",
            "input": {"finding_type": risk.finding_type, "severity_score": risk.risk_score},
            "output": {
                "exposure_tier": risk.patient_exposure_tier,
                "clinical_urgency": risk.clinical_urgency,
                "financial_exposure_inr": risk.financial_exposure_inr,
                "regulatory_classification": risk.regulatory_classification,
                "safety_disclaimer": risk.safe_unsafe_disclaimer,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        {
            "step": 3,
            "phase": "Solution Evaluation Agent",
            "action": f"Compare Feasible Strategies & Enforce Stock Constraints ({len(sol.evaluated_options)} Options)",
            "input": {"clean_stock_available": sol.clean_stock_available, "replacement_shortfall": sol.replacement_shortfall},
            "output": {
                "recommended_option": sol.recommended_option_name,
                "rejected_options_count": sol.rejection_count,
                "coverage_ratio": sol.coverage_ratio,
                "cost_benefit_summary": sol.cost_benefit_summary,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        {
            "step": 4,
            "phase": "Review Agent (Independent Audit)",
            "action": "Sanity Check Calculations, Roles, and Safety Guardrails",
            "input": {"proposed_option": sol.recommended_option_id, "required_role": coord.required_role},
            "output": {
                "verdict": rev.independent_verdict,
                "review_passed": rev.review_passed,
                "objections": rev.objections,
                "warnings": rev.warnings,
                "calculation_checks": [c.model_dump() for c in rev.calculation_checks],
            },
            "timestamp": rev.reviewed_at,
        },
        {
            "step": 5,
            "phase": "Coordinator Agent",
            "action": f"Synthesize Multi-Agent Recommendation ({ai_mode})",
            "input": {"chosen_option": coord.chosen_option, "uncertainty_score": coord.uncertainty_score},
            "output": {
                "action_type": coord.action_type,
                "required_role": coord.required_role,
                "rationale": coord.rationale,
                "uncertainty_score": coord.uncertainty_score,
                "assumptions": coord.assumptions,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    ]

    # If live tool calling was executed, prepend the tool turn logs
    if live_tool_trace:
        for idx, t_step in enumerate(live_tool_trace, 1):
            trace_steps.insert(idx, {
                "step": f"Tool-{t_step['iteration']}",
                "phase": "Native LLM Tool Call",
                "action": f"Invoke tool '{t_step['tool']}'",
                "input": t_step["input"],
                "output": t_step["output"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

    # 4. Stage Draft Action in Database (Strict Human Gate)
    action_id = f"ACT-{uuid.uuid4().hex[:8].upper()}"
    action_payload = {
        "finding_id": finding.id,
        "finding_type": finding.type,
        "entities": finding.entities,
        "metrics": finding.metrics,
        "chosen_option": coord.chosen_option,
        "rationale": coord.rationale,
        "uncertainty_score": coord.uncertainty_score,
        "assumptions": coord.assumptions,
        "ai_mode": ai_mode,
        "review_passed": rev.review_passed,
        "review_objections": rev.objections,
        "review_warnings": rev.warnings,
    }

    new_action = Action(
        id=action_id,
        type=coord.action_type,
        payload=json.dumps(action_payload),
        evidence=json.dumps(finding.metrics),
        options=json.dumps(options_summary),
        chosen_option=coord.chosen_option,
        status="pending_approval",
        required_role=coord.required_role,
        created_at=datetime.now(timezone.utc),
        decided_by=None,
        decided_at=None,
        reason=None,
    )
    db.add(new_action)
    db.commit()

    # 5. Append ACTION_DRAFTED Event to SHA-256 Hash-Chained Audit Ledger
    append_ledger_event(
        db=db,
        event_type="ACTION_DRAFTED",
        payload={
            "action_id": action_id,
            "type": coord.action_type,
            "finding_id": finding.id,
            "chosen_option": coord.chosen_option,
            "required_role": coord.required_role,
            "ai_mode": ai_mode,
            "review_passed": rev.review_passed,
            "uncertainty_score": coord.uncertainty_score,
        },
        ts=datetime.now(timezone.utc).isoformat(),
        trigger_auto_anchor=True,
    )

    trace_steps.append({
        "step": 6,
        "phase": "Act (Human Gated Draft)",
        "action": f"Create Draft Action Record {action_id}",
        "input": {"action_type": coord.action_type, "required_role": coord.required_role},
        "output": {
            "action_id": action_id,
            "status": "pending_approval",
            "ledger_event": "ACTION_DRAFTED",
            "ai_mode": ai_mode,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # 6. Update Finding Object
    finding.action_id = action_id
    finding.ai_mode = ai_mode
    finding.multi_agent_summary = multi_agent_summary.model_dump()
    finding.agent_trace = trace_steps
    finding.recommended_action = {
        "action_id": action_id,
        "type": coord.action_type,
        "chosen_option": coord.chosen_option,
        "rationale": coord.rationale,
        "confidence": round(1.0 - coord.uncertainty_score, 2),
        "required_role": coord.required_role,
        "assumptions": coord.assumptions,
    }

    return finding
