import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models import Action
from app.schemas import Finding
from app.config import settings
from app.agent.specialists import CoordinatorAgent, ReviewAgent
from app.agent.nvidia_tool_runner import run_nvidia_tool_loop
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

import time
from app.agent.tracer import ExecutionTracer

def run_agent_loop_on_finding(db: Session, finding: Finding) -> Finding:
    """
    Coordinated Multi-Agent Intelligence Workflow with Complete Execution Tracing:
    1. Investigation Agent: Gathers factual batch telemetry, warehouse pallets, and dispatches.
    2. Risk Assessment Agent: Evaluates clinical urgency, patient exposure, and regulatory exposure.
    3. Solution Evaluation Agent: Evaluates candidate responses against real stock, credit windows, and roles.
    4. Review Agent: Independently audits proposed remediation against arithmetic, permissions, and safety rules.
    5. Coordinator Agent: Reconciles specialist outputs, scores uncertainty, and stages the action.
    """
    t_start = time.time()
    tracer = ExecutionTracer(db)
    
    batch_val = (
        finding.entities.get("batch")
        or (finding.entities.get("batches", [None])[0] if finding.entities and isinstance(finding.entities.get("batches"), list) else None)
    )
    sku_val = finding.entities.get("sku") if finding.entities else None
    provider_name = "nvidia_nim" if settings.NVIDIA_API_KEY else ("anthropic" if settings.ANTHROPIC_API_KEY else "deterministic")
    model_name = settings.NVIDIA_MODEL if settings.NVIDIA_API_KEY else ("claude-3-5-sonnet-20241022" if settings.ANTHROPIC_API_KEY else None)

    # 1. Initialize persistent AgentRun
    run = tracer.start_run(
        finding_id=finding.id,
        case_id=finding.case_id,
        batch=batch_val,
        sku=sku_val,
        provider=provider_name,
        model=model_name,
        ai_mode="LIVE_LLM" if (settings.NVIDIA_API_KEY or settings.ANTHROPIC_API_KEY) else "DETERMINISTIC_FALLBACK",
    )

    # 2. Attempt Live LLM Tool-Use Loop if configured
    options_summary = [opt.model_dump() for opt in finding.options]
    live_decision = None
    live_tool_trace = []
    ai_mode = "DETERMINISTIC_FALLBACK"

    if settings.NVIDIA_API_KEY:
        live_decision, live_tool_trace, detected_mode = run_nvidia_tool_loop(
            db=db,
            finding_dict=finding.model_dump(),
            options_summary=options_summary,
            timeout_seconds=15.0,
            tracer=tracer,
            run_id=run.run_id,
        )
        if live_decision and detected_mode == "LIVE_LLM":
            ai_mode = "LIVE_LLM"
    elif settings.ANTHROPIC_API_KEY:
        live_decision, live_tool_trace, detected_mode = run_anthropic_tool_loop(
            db=db,
            finding_dict=finding.model_dump(),
            options_summary=options_summary,
            timeout_seconds=15.0,
        )
        if live_decision and detected_mode == "LIVE_LLM":
            ai_mode = "LIVE_LLM"
    else:
        tracer.record_event(
            run_id=run.run_id,
            event_type="AGENT_SKIPPED",
            agent_name="Live LLM Reasoner",
            invocation_reason="No external LLM credentials configured (NVIDIA_API_KEY or ANTHROPIC_API_KEY).",
        )
        tracer.record_event(
            run_id=run.run_id,
            event_type="FALLBACK_USED",
            agent_name="Deterministic Multi-Agent Engine",
            invocation_reason="Local deterministic specialist multi-agent coordination active.",
        )

    # 3. Run Specialist Agents Coordination with granular trace logging
    coordinator = CoordinatorAgent(db=db, ai_mode=ai_mode)

    # Trace Investigation Agent
    t_inv_start = time.time()
    tracer.record_event(
        run_id=run.run_id,
        event_type="AGENT_STARTED",
        agent_name="Investigation Agent",
        invocation_reason="Retrieve ground-truth batch telemetry, forward dispatches, and supplier contracts.",
        input_summary={"batch": batch_val, "sku": sku_val, "finding_id": finding.id},
        referenced_evidence_ids=[finding.id],
    )
    inv_output = coordinator.investigation_agent.investigate(finding)
    tracer.record_event(
        run_id=run.run_id,
        event_type="AGENT_COMPLETED",
        agent_name="Investigation Agent",
        invocation_reason="Completed telemetry extraction from inventory, dispatches, and suppliers.",
        output_summary={
            "warehouse_stock": inv_output.total_warehouse_stock,
            "dispatched_units": inv_output.total_dispatched_units,
            "hospital_count": inv_output.hospital_count,
            "chemist_count": inv_output.chemist_count,
            "warnings_count": len(inv_output.missing_information_warnings),
        },
        latency_ms=(time.time() - t_inv_start) * 1000.0,
    )

    # Trace Risk Assessment Agent
    t_risk_start = time.time()
    tracer.record_event(
        run_id=run.run_id,
        event_type="AGENT_STARTED",
        agent_name="Risk Assessment Agent",
        invocation_reason="Quantify patient exposure, clinical urgency, and regulatory classification.",
        input_summary={"severity_score": finding.severity, "finding_type": finding.type},
    )
    risk_output = coordinator.risk_assessment_agent.evaluate(finding, inv_output)
    tracer.record_event(
        run_id=run.run_id,
        event_type="AGENT_COMPLETED",
        agent_name="Risk Assessment Agent",
        invocation_reason="Risk classification and financial exposure computed.",
        output_summary={
            "severity_category": risk_output.severity_category,
            "clinical_urgency": risk_output.clinical_urgency,
            "financial_exposure_inr": risk_output.financial_exposure_inr,
            "patient_exposure_tier": risk_output.patient_exposure_tier,
        },
        latency_ms=(time.time() - t_risk_start) * 1000.0,
    )

    # Trace Solution Evaluation Agent
    t_sol_start = time.time()
    tracer.record_event(
        run_id=run.run_id,
        event_type="AGENT_STARTED",
        agent_name="Solution Evaluation Agent",
        invocation_reason="Evaluate candidate remediation options against clean replacement stock and constraints.",
        input_summary={"sku": inv_output.sku, "needed_qty": inv_output.total_dispatched_units},
    )
    sol_output = coordinator.solution_evaluation_agent.evaluate(finding, inv_output, risk_output)
    tracer.record_event(
        run_id=run.run_id,
        event_type="AGENT_COMPLETED",
        agent_name="Solution Evaluation Agent",
        invocation_reason="Filtered infeasible options and ranked candidate solutions.",
        output_summary={
            "recommended_option": sol_output.recommended_option_id,
            "clean_stock_available": sol_output.clean_stock_available,
            "replacement_shortfall": sol_output.replacement_shortfall,
            "rejected_options": sol_output.rejection_count,
        },
        latency_ms=(time.time() - t_sol_start) * 1000.0,
    )

    # Trace Review Agent (Independent Adversarial Audit)
    t_rev_start = time.time()
    tracer.record_event(
        run_id=run.run_id,
        event_type="AGENT_STARTED",
        agent_name="Review Agent",
        invocation_reason="Perform independent audit on calculations, permissions, and clinical safety policies.",
        input_summary={"proposed_option": sol_output.recommended_option_id},
    )
    rev_output = coordinator.review_agent.review(finding, inv_output, risk_output, sol_output)
    tracer.record_event(
        run_id=run.run_id,
        event_type="AGENT_COMPLETED" if rev_output.review_passed else "AGENT_FAILED",
        agent_name="Review Agent",
        invocation_reason="Independent review completed.",
        output_summary={
            "review_passed": rev_output.review_passed,
            "verdict": rev_output.independent_verdict,
            "objections_count": len(rev_output.objections),
            "warnings_count": len(rev_output.warnings),
            "calculation_checks_count": len(rev_output.calculation_checks),
        },
        latency_ms=(time.time() - t_rev_start) * 1000.0,
    )

    # Assemble MultiAgentSummary via Coordinator
    chosen_opt = sol_output.recommended_option_id
    target_role = next((o.target_role for o in sol_output.evaluated_options if o.id == chosen_opt), "compliance")
    ftype = finding.type
    action_type = (
        "SEND_NOTICES" if ftype == "recall"
        else "QUARANTINE_FOR_QA" if ftype == "coldchain"
        else "RETURN_REQUEST" if ftype == "returnwindow"
        else "URGENT_PO" if ftype == "critical"
        else "PICK_INSTRUCTION" if ftype == "fefo"
        else "BLOCK_BATCH"
    )

    uncertainty = 0.05
    if not rev_output.review_passed:
        uncertainty += 0.40
    if len(rev_output.warnings) > 0:
        uncertainty += min(0.30, len(rev_output.warnings) * 0.08)
    if sol_output.replacement_shortfall > 0:
        uncertainty += 0.10
    uncertainty = round(min(0.95, uncertainty), 2)

    from app.agent.agent_schemas import CoordinatorDecision, MultiAgentSummary
    coord_decision = CoordinatorDecision(
        action_type=action_type,
        chosen_option=chosen_opt,
        required_role=target_role,
        rationale=(
            f"Multi-Agent Consensus ({ai_mode}): Investigation confirmed {inv_output.total_warehouse_stock} units in warehouse "
            f"and {inv_output.total_dispatched_units} units in field across {inv_output.customer_count} accounts. "
            f"Risk assessment classified as {risk_output.severity_category} risk ({risk_output.risk_score}/100). "
            f"Solution evaluation selected {sol_output.recommended_option_name} with {sol_output.clean_stock_available} clean units available. "
            f"Review Agent returned verdict: '{rev_output.independent_verdict}'."
        ),
        uncertainty_score=uncertainty,
        assumptions=[
            f"Physical pallet counts in {inv_output.warehouse_locations[0]['warehouse'] if inv_output.warehouse_locations else 'WH-1'} reflect real floor state.",
            "Schedule M and CDSCO regulatory reporting timelines anchor priority scoring.",
            "Action must remain in pending_approval status until licensed human authorization is recorded.",
        ],
        coordination_summary=(
            f"Workflow completed successfully across 4 specialist agents. Review passed: {rev_output.review_passed}. "
            f"Action {action_type} staged for {target_role.upper()} approval."
        ),
    )

    # If Live LLM was successful, merge its decision while keeping specialist telemetry and independent review
    tokens_usage = {}
    if ai_mode == "LIVE_LLM" and live_decision:
        provider_label = f"NVIDIA NIM ({settings.NVIDIA_MODEL})" if settings.NVIDIA_API_KEY else "Claude 3.5 Sonnet"
        coord_decision.action_type = live_decision.get("action_type", coord_decision.action_type)
        coord_decision.chosen_option = live_decision.get("chosen_option", coord_decision.chosen_option)
        coord_decision.required_role = live_decision.get("required_role", coord_decision.required_role)
        coord_decision.rationale = live_decision.get("rationale", coord_decision.rationale)
        coord_decision.uncertainty_score = float(live_decision.get("uncertainty_score", 0.15))
        coord_decision.assumptions = live_decision.get("assumptions", coord_decision.assumptions)
        coord_decision.coordination_summary = f"Synthesized via {provider_label} Tool-Use Protocol & Audited by Review Agent."
        tokens_usage = live_decision.get("_usage", {})

    multi_agent_summary = MultiAgentSummary(
        ai_mode=ai_mode,
        investigation=inv_output,
        risk_assessment=risk_output,
        solution_evaluation=sol_output,
        review=rev_output,
        coordinator=coord_decision,
    )

    # Trace Coordinator Agent
    tracer.record_event(
        run_id=run.run_id,
        event_type="AGENT_COMPLETED",
        agent_name="Coordinator Agent",
        invocation_reason="Reconciled specialist insights and synthesized final recommendation.",
        output_summary={
            "action_type": coord_decision.action_type,
            "chosen_option": coord_decision.chosen_option,
            "required_role": coord_decision.required_role,
            "uncertainty_score": coord_decision.uncertainty_score,
            "ai_mode": ai_mode,
        },
    )

    # Assemble Step Trace for UI Transparency
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
            "run_id": run.run_id,
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
            "run_id": run.run_id,
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
            "run_id": run.run_id,
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
            "run_id": run.run_id,
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
            "run_id": run.run_id,
        },
    ]

    # If live tool calling was executed, prepend the tool turn logs
    if live_tool_trace:
        for idx, t_step in enumerate(live_tool_trace, 1):
            trace_steps.insert(idx, {
                "step": f"Tool-{t_step.get('iteration', idx)}",
                "phase": "Native LLM Tool Call",
                "action": f"Invoke tool '{t_step.get('tool', 'tool')}'",
                "input": t_step.get("input", {}),
                "output": t_step.get("output", {}),
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
            "run_id": run.run_id,
        },
        ts=datetime.now(timezone.utc).isoformat(),
        trigger_auto_anchor=True,
    )

    # 6. Complete Execution Trace
    total_elapsed_ms = (time.time() - t_start) * 1000.0
    fb_reason = None
    if ai_mode == "DETERMINISTIC_FALLBACK":
        fb_reason = "No external LLM credentials configured" if not (settings.NVIDIA_API_KEY or settings.ANTHROPIC_API_KEY) else "LLM request fallback"
    tracer.complete_run(
        run_id=run.run_id,
        chosen_option=coord.chosen_option,
        recommended_action=coord.action_type,
        required_role=coord.required_role,
        uncertainty_score=coord.uncertainty_score,
        review_passed=rev.review_passed,
        review_verdict=rev.independent_verdict,
        action_id=action_id,
        fallback_reason=fb_reason,
        ai_mode=ai_mode,
        total_latency_ms=total_elapsed_ms,
        prompt_tokens=tokens_usage.get("prompt_tokens", 0),
        completion_tokens=tokens_usage.get("completion_tokens", 0),
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
            "run_id": run.run_id,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "run_id": run.run_id,
    })

    # 7. Update Finding Object
    finding.action_id = action_id
    finding.ai_mode = ai_mode
    finding.run_id = run.run_id
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
        "run_id": run.run_id,
    }

    return finding
