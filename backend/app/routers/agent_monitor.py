import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db import get_db
from app.models import AgentRun, AgentTraceEvent, Action
from app.schemas import (
    AgentRunSummarySchema,
    AgentRunDetailSchema,
    AgentTraceEventSchema,
    AgentMonitorStatsSchema,
)

router = APIRouter(prefix="/api/agent-monitor", tags=["Agent Execution Monitor"])

def _parse_json_safe(val: Optional[str]) -> Any:
    if not val:
        return None
    try:
        return json.loads(val)
    except Exception:
        return val

@router.get("/runs", response_model=List[AgentRunSummarySchema])
def list_agent_runs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="Filter by status: running, completed, failed, fallback"),
    provider: Optional[str] = Query(None, description="Filter by provider: nvidia_nim, anthropic, deterministic"),
    finding_id: Optional[str] = Query(None, description="Filter by specific finding ID"),
    db: Session = Depends(get_db),
):
    """
    Returns list of recorded agent execution runs with performance metrics and lifecycle status.
    """
    query = db.query(AgentRun)
    if status:
        query = query.filter(AgentRun.status == status)
    if provider:
        query = query.filter(AgentRun.provider == provider)
    if finding_id:
        query = query.filter(AgentRun.finding_id == finding_id)

    runs = query.order_by(AgentRun.created_at.desc()).offset(offset).limit(limit).all()

    output = []
    for r in runs:
        events_count = db.query(AgentTraceEvent).filter(AgentTraceEvent.run_id == r.run_id).count()
        output.append(AgentRunSummarySchema(
            run_id=r.run_id,
            correlation_id=r.correlation_id,
            finding_id=r.finding_id,
            case_id=r.case_id,
            batch=r.batch,
            sku=r.sku,
            provider=r.provider,
            model=r.model,
            ai_mode=r.ai_mode,
            fallback_reason=r.fallback_reason,
            status=r.status,
            total_latency_ms=round(r.total_latency_ms, 2),
            total_tokens=r.total_tokens,
            prompt_tokens=r.prompt_tokens,
            completion_tokens=r.completion_tokens,
            chosen_option=r.chosen_option,
            recommended_action=r.recommended_action,
            required_role=r.required_role,
            uncertainty_score=round(r.uncertainty_score, 2),
            review_passed=r.review_passed,
            review_verdict=r.review_verdict,
            action_id=r.action_id,
            human_approval_status=r.human_approval_status,
            created_at=r.created_at.isoformat(),
            completed_at=r.completed_at.isoformat() if r.completed_at else None,
            events_count=events_count,
        ))
    return output

@router.get("/runs/{run_id}", response_model=AgentRunDetailSchema)
def get_agent_run_detail(
    run_id: str,
    db: Session = Depends(get_db),
):
    """
    Returns granular run detail with complete sequential timeline of lifecycle events,
    tool requests, validated arguments, responses, and calculation audits.
    """
    run = db.query(AgentRun).filter(AgentRun.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail=f"AgentRun '{run_id}' not found")

    events = db.query(AgentTraceEvent).filter(AgentTraceEvent.run_id == run_id).order_by(AgentTraceEvent.event_seq.asc()).all()

    event_schemas = []
    for ev in events:
        event_schemas.append(AgentTraceEventSchema(
            id=ev.id,
            run_id=ev.run_id,
            event_seq=ev.event_seq,
            event_type=ev.event_type,
            agent_name=ev.agent_name,
            invocation_reason=ev.invocation_reason,
            input_summary=_parse_json_safe(ev.input_summary),
            referenced_evidence_ids=_parse_json_safe(ev.referenced_evidence_ids),
            tool_name=ev.tool_name,
            tool_arguments=_parse_json_safe(ev.tool_arguments),
            tool_result=_parse_json_safe(ev.tool_result),
            tool_error=ev.tool_error,
            output_summary=_parse_json_safe(ev.output_summary),
            latency_ms=round(ev.latency_ms, 2) if ev.latency_ms else None,
            timestamp=ev.timestamp.isoformat(),
        ))

    return AgentRunDetailSchema(
        run_id=run.run_id,
        correlation_id=run.correlation_id,
        finding_id=run.finding_id,
        case_id=run.case_id,
        batch=run.batch,
        sku=run.sku,
        provider=run.provider,
        model=run.model,
        ai_mode=run.ai_mode,
        fallback_reason=run.fallback_reason,
        status=run.status,
        total_latency_ms=round(run.total_latency_ms, 2),
        total_tokens=run.total_tokens,
        prompt_tokens=run.prompt_tokens,
        completion_tokens=run.completion_tokens,
        chosen_option=run.chosen_option,
        recommended_action=run.recommended_action,
        required_role=run.required_role,
        uncertainty_score=round(run.uncertainty_score, 2),
        review_passed=run.review_passed,
        review_verdict=run.review_verdict,
        action_id=run.action_id,
        human_approval_status=run.human_approval_status,
        created_at=run.created_at.isoformat(),
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
        events_count=len(event_schemas),
        events=event_schemas,
    )

@router.get("/stats", response_model=AgentMonitorStatsSchema)
def get_agent_monitor_stats(db: Session = Depends(get_db)):
    """
    Returns aggregate performance metrics across all agent executions.
    """
    total_runs = db.query(AgentRun).count()
    live_llm_runs = db.query(AgentRun).filter(AgentRun.ai_mode == "LIVE_LLM").count()
    fallback_runs = db.query(AgentRun).filter(AgentRun.status == "fallback").count()
    failed_runs = db.query(AgentRun).filter(AgentRun.status == "failed").count()

    # Latency
    avg_lat = db.query(func.avg(AgentRun.total_latency_ms)).scalar() or 0.0

    # Review pass rate
    passed_reviews = db.query(AgentRun).filter(AgentRun.review_passed == True).count()
    pass_rate = (passed_reviews / total_runs * 100.0) if total_runs > 0 else 100.0

    # Pending human approvals
    pending_approvals = db.query(Action).filter(Action.status == "pending_approval").count()

    # Tool invocation counts from trace events
    tool_events = (
        db.query(AgentTraceEvent.tool_name, func.count(AgentTraceEvent.id))
        .filter(AgentTraceEvent.event_type.in_(["TOOL_REQUESTED", "TOOL_COMPLETED"]), AgentTraceEvent.tool_name != None)
        .group_by(AgentTraceEvent.tool_name)
        .all()
    )
    tool_counts = {t[0]: t[1] for t in tool_events if t[0]}

    return AgentMonitorStatsSchema(
        total_runs=total_runs,
        live_llm_runs=live_llm_runs,
        fallback_runs=fallback_runs,
        failed_runs=failed_runs,
        avg_latency_ms=round(float(avg_lat), 2),
        review_pass_rate_pct=round(pass_rate, 1),
        pending_human_approvals=pending_approvals,
        tool_invocation_counts=tool_counts,
    )
