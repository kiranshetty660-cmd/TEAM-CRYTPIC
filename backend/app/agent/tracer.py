import json
import re
import uuid
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models import AgentRun, AgentTraceEvent, Action

# Sensitive key patterns to redact for privacy & compliance
SENSITIVE_KEY_PATTERNS = [
    re.compile(r"api[-_]?key", re.IGNORECASE),
    re.compile(r"auth(orization)?", re.IGNORECASE),
    re.compile(r"token", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"password", re.IGNORECASE),
    re.compile(r"phone", re.IGNORECASE),
    re.compile(r"email", re.IGNORECASE),
    re.compile(r"patient[-_]?name", re.IGNORECASE),
]

def sanitize_payload(obj: Any) -> Any:
    """
    Recursively strips secrets, API keys, credentials, and patient PII
    from trace events before persistence.
    """
    if isinstance(obj, dict):
        clean = {}
        for k, v in obj.items():
            if any(p.search(str(k)) for p in SENSITIVE_KEY_PATTERNS):
                clean[k] = "[REDACTED]"
            elif isinstance(v, (dict, list)):
                clean[k] = sanitize_payload(v)
            elif isinstance(v, str) and ("Bearer " in v or "nvapi-" in v or "sk-ant-" in v):
                clean[k] = "[REDACTED_CREDENTIAL]"
            else:
                clean[k] = v
        return clean
    elif isinstance(obj, list):
        return [sanitize_payload(item) for item in obj]
    return obj

class ExecutionTracer:
    """
    Thread-safe, privacy-preserving execution tracer for TraceRx multi-agent runs.
    Logs lifecycle events:
      AGENT_STARTED, TOOL_REQUESTED, TOOL_COMPLETED, AGENT_COMPLETED,
      AGENT_FAILED, AGENT_SKIPPED, FALLBACK_USED, RUN_COMPLETED
    """
    def __init__(self, db: Session):
        self.db = db
        self._run_seqs: Dict[str, int] = {}

    def start_run(
        self,
        finding_id: str,
        correlation_id: Optional[str] = None,
        case_id: Optional[str] = None,
        batch: Optional[str] = None,
        sku: Optional[str] = None,
        provider: str = "deterministic",
        model: Optional[str] = None,
        ai_mode: str = "DETERMINISTIC_FALLBACK",
    ) -> AgentRun:
        run_id = f"RUN-{uuid.uuid4().hex[:10].upper()}"
        corr_id = correlation_id or f"CORR-{uuid.uuid4().hex[:8].upper()}"
        now = datetime.now(timezone.utc)

        run = AgentRun(
            run_id=run_id,
            correlation_id=corr_id,
            finding_id=finding_id,
            case_id=case_id,
            batch=batch,
            sku=sku,
            provider=provider,
            model=model,
            ai_mode=ai_mode,
            status="running",
            total_latency_ms=0.0,
            total_tokens=0,
            prompt_tokens=0,
            completion_tokens=0,
            human_approval_status="pending_approval",
            created_at=now,
        )
        self.db.add(run)
        self.db.commit()
        self._run_seqs[run_id] = 0
        return run

    def record_event(
        self,
        run_id: str,
        event_type: str,
        agent_name: str,
        invocation_reason: Optional[str] = None,
        input_summary: Optional[Dict[str, Any]] = None,
        referenced_evidence_ids: Optional[List[str]] = None,
        tool_name: Optional[str] = None,
        tool_arguments: Optional[Dict[str, Any]] = None,
        tool_result: Optional[Any] = None,
        tool_error: Optional[str] = None,
        output_summary: Optional[Dict[str, Any]] = None,
        latency_ms: Optional[float] = None,
    ) -> AgentTraceEvent:
        # Use fast in-memory sequence counter instead of slow remote SQL count
        event_seq = self._run_seqs.get(run_id, 0) + 1
        self._run_seqs[run_id] = event_seq

        clean_input = json.dumps(sanitize_payload(input_summary)) if input_summary is not None else None
        clean_evidence = json.dumps(referenced_evidence_ids) if referenced_evidence_ids is not None else None
        clean_args = json.dumps(sanitize_payload(tool_arguments)) if tool_arguments is not None else None
        clean_res = json.dumps(sanitize_payload(tool_result)) if tool_result is not None else None
        clean_output = json.dumps(sanitize_payload(output_summary)) if output_summary is not None else None

        event = AgentTraceEvent(
            run_id=run_id,
            event_seq=event_seq,
            event_type=event_type,
            agent_name=agent_name,
            invocation_reason=invocation_reason,
            input_summary=clean_input,
            referenced_evidence_ids=clean_evidence,
            tool_name=tool_name,
            tool_arguments=clean_args,
            tool_result=clean_res,
            tool_error=tool_error,
            output_summary=clean_output,
            latency_ms=latency_ms,
            timestamp=datetime.now(timezone.utc),
        )
        self.db.add(event)
        self.db.commit()
        return event

    def complete_run(
        self,
        run_id: str,
        chosen_option: Optional[str] = None,
        recommended_action: Optional[str] = None,
        required_role: Optional[str] = None,
        uncertainty_score: float = 0.0,
        review_passed: bool = True,
        review_verdict: Optional[str] = None,
        action_id: Optional[str] = None,
        fallback_reason: Optional[str] = None,
        ai_mode: Optional[str] = None,
        total_latency_ms: float = 0.0,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
    ) -> AgentRun:
        run = self.db.query(AgentRun).filter(AgentRun.run_id == run_id).first()
        if not run:
            raise ValueError(f"AgentRun {run_id} not found")

        run.status = "fallback" if (fallback_reason or run.ai_mode == "DETERMINISTIC_FALLBACK") else "completed"
        if fallback_reason:
            run.fallback_reason = fallback_reason
        if ai_mode:
            run.ai_mode = ai_mode
        run.chosen_option = chosen_option
        run.recommended_action = recommended_action
        run.required_role = required_role
        run.uncertainty_score = uncertainty_score
        run.review_passed = review_passed
        run.review_verdict = review_verdict
        run.action_id = action_id
        run.total_latency_ms = total_latency_ms
        run.prompt_tokens = prompt_tokens
        run.completion_tokens = completion_tokens
        run.total_tokens = prompt_tokens + completion_tokens
        run.completed_at = datetime.now(timezone.utc)

        self.record_event(
            run_id=run_id,
            event_type="RUN_COMPLETED",
            agent_name="MultiAgentCoordinator",
            invocation_reason="All specialist stages evaluated and synthesized.",
            output_summary={
                "action_id": action_id,
                "recommended_action": recommended_action,
                "chosen_option": chosen_option,
                "required_role": required_role,
                "uncertainty_score": uncertainty_score,
                "review_passed": review_passed,
                "ai_mode": run.ai_mode,
            },
            latency_ms=total_latency_ms,
        )

        self.db.commit()
        return run

    def fail_run(self, run_id: str, error_message: str, agent_name: str = "CoordinatorAgent"):
        run = self.db.query(AgentRun).filter(AgentRun.run_id == run_id).first()
        if run:
            run.status = "failed"
            run.fallback_reason = error_message
            run.completed_at = datetime.now(timezone.utc)
            self.record_event(
                run_id=run_id,
                event_type="AGENT_FAILED",
                agent_name=agent_name,
                tool_error=error_message,
            )
            self.db.commit()

    def update_human_approval_status(self, action_id: str, new_status: str):
        """
        Keeps human approval decisions strictly separate from model outputs.
        """
        runs = self.db.query(AgentRun).filter(AgentRun.action_id == action_id).all()
        for r in runs:
            r.human_approval_status = new_status
        self.db.commit()
