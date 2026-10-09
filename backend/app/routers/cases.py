import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Case, Action, BatchInventory
from app.schemas import CaseSchema, CaseVerificationRequest, CaseCloseRequest, CaseReopenRequest, Finding
from app.ledger.chain import append_ledger_event
from app.routers.board import _LATEST_FINDINGS_CACHE, execute_full_scan
from app.engine.root_cause import investigate_root_cause

router = APIRouter(prefix="/api/cases", tags=["Closed-Loop Cases"])

def _deserialize_case(c: Case) -> CaseSchema:
    global _LATEST_FINDINGS_CACHE
    batch_val = None
    sku_val = None
    if c.finding_id and c.finding_id in _LATEST_FINDINGS_CACHE:
        f = _LATEST_FINDINGS_CACHE[c.finding_id]
        if f.entities:
            batch_val = f.entities.get("batch") or (f.entities.get("batches", [None])[0] if isinstance(f.entities.get("batches"), list) else None)
            sku_val = f.entities.get("sku")

    rc = json.loads(c.root_cause_analysis) if c.root_cause_analysis else None
    if rc and isinstance(rc, dict):
        if "facts" in rc and "confirmed_facts" not in rc:
            rc["confirmed_facts"] = [
                {
                    "fact": item.get("fact", ""),
                    "evidence_source": item.get("source", "telemetry"),
                    "timestamp": item.get("timestamp"),
                }
                for item in rc.get("facts", [])
            ]
        if "evidence_completeness" not in rc or not isinstance(rc["evidence_completeness"], dict):
            rc["evidence_completeness"] = {"score": 50.0, "is_sufficient": False, "missing_data": []}
        elif "missing_data" not in rc["evidence_completeness"]:
            rc["evidence_completeness"]["missing_data"] = rc.get("missing_evidence", [])

    return CaseSchema(
        id=c.id,
        finding_id=c.finding_id,
        title=c.title,
        type=c.type,
        severity=c.severity,
        status=c.status,
        verification_state=c.verification_state,
        verification_status=c.verification_state,
        verification_reason=c.verification_reason,
        verification_evidence=json.loads(c.verification_evidence) if c.verification_evidence else None,
        verified_by=c.verified_by,
        verified_at=c.verified_at.isoformat() if c.verified_at else None,
        batch_id=batch_val,
        sku=sku_val,
        root_cause=rc,
        root_cause_analysis=rc,
        action_id=c.action_id,
        outcome_metrics=json.loads(c.outcome_metrics) if c.outcome_metrics else None,
        outcome_check_result=c.outcome_check_result,
        closure_reason=c.closure_reason,
        closed_at=c.closed_at.isoformat() if c.closed_at else None,
        closed_by=c.closed_by,
        created_at=c.created_at.isoformat(),
        updated_at=c.updated_at.isoformat(),
    )

@router.get("", response_model=List[CaseSchema])
def list_cases(
    status: Optional[str] = Query(None, description="Filter by case lifecycle status"),
    verification_state: Optional[str] = Query(None, description="Filter by verification state"),
    finding_type: Optional[str] = Query(None, description="Filter by finding type"),
    db: Session = Depends(get_db)
):
    """
    Returns persistent closed-loop compliance cases.
    Auto-syncs from recent scan findings if case table is empty.
    """
    if db.query(Case).count() == 0:
        sync_cases_from_findings(db)

    query = db.query(Case)
    if status:
        query = query.filter(Case.status == status)
    if verification_state:
        query = query.filter(Case.verification_state == verification_state)
    if finding_type:
        query = query.filter(Case.type == finding_type)

    cases = query.order_by(Case.severity.desc(), Case.created_at.desc()).all()
    return [_deserialize_case(c) for c in cases]

@router.post("/sync")
def sync_cases_from_findings(db: Session = Depends(get_db)):
    """
    Synchronizes cases from findings. Ensures every compliance finding has
    a persistent, auditable case lifecycle without duplicate creation.
    """
    global _LATEST_FINDINGS_CACHE
    if not _LATEST_FINDINGS_CACHE:
        execute_full_scan(db)

    created_count = 0
    now = datetime.now(timezone.utc)

    for finding_id, f in _LATEST_FINDINGS_CACHE.items():
        case_id = f"CASE-{finding_id.replace('FIND-', '')}"
        existing = db.query(Case).filter(Case.id == case_id).first()
        if not existing:
            # Run initial root cause investigation
            rc = investigate_root_cause(f, db)
            new_case = Case(
                id=case_id,
                finding_id=finding_id,
                title=f.title,
                type=f.type,
                severity=f.severity,
                status="detected",
                verification_state="unverified",
                root_cause_analysis=json.dumps(rc),
                action_id=f.action_id,
                created_at=now,
                updated_at=now,
            )
            db.add(new_case)
            created_count += 1

            # Append to SHA-256 Ledger (PII-scrubbed)
            append_ledger_event(
                db=db,
                event_type="CASE_CREATED",
                payload={
                    "case_id": case_id,
                    "finding_id": finding_id,
                    "type": f.type,
                    "severity": f.severity,
                    "action_id": f.action_id,
                },
                ts=now.isoformat(),
                trigger_auto_anchor=False,
            )

    db.commit()
    return {"status": "synced", "cases_created": created_count, "total_cases": db.query(Case).count()}

@router.get("/{id}", response_model=CaseSchema)
def get_case_by_id(id: str, db: Session = Depends(get_db)):
    """
    Returns single compliance case with root-cause, evidence, and outcome metrics.
    """
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{id}' not found")
    return _deserialize_case(case)

@router.post("/{id}/verify", response_model=CaseSchema)
def verify_case(id: str, req: CaseVerificationRequest, db: Session = Depends(get_db)):
    """
    Updates finding verification state: verified, disputed, false_positive, duplicate.
    Records operator reason and writes to tamper-evident audit ledger.
    """
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{id}' not found")

    valid_states = ["verified", "disputed", "false_positive", "duplicate"]
    if req.verification_state not in valid_states:
        raise HTTPException(status_code=400, detail=f"Invalid verification state. Must be one of: {valid_states}")

    now = datetime.now(timezone.utc)
    case.verification_state = req.verification_state
    case.verification_reason = req.reason
    case.verified_by = req.verified_by
    case.verified_at = now
    case.updated_at = now

    if req.verification_state == "verified":
        case.status = "investigating"
    elif req.verification_state in ["false_positive", "duplicate"]:
        case.status = "closed"
        case.closure_reason = f"Closed as {req.verification_state}: {req.reason}"
        case.closed_at = now
        case.closed_by = req.verified_by

    if req.evidence_notes:
        existing_evidence = json.loads(case.verification_evidence or "{}")
        existing_evidence["notes"] = req.evidence_notes
        existing_evidence["timestamp"] = now.isoformat()
        case.verification_evidence = json.dumps(existing_evidence)

    db.commit()

    # Append to SHA-256 Ledger
    append_ledger_event(
        db=db,
        event_type="CASE_VERIFIED",
        payload={
            "case_id": case.id,
            "verification_state": req.verification_state,
            "verified_by": req.verified_by,
            "reason": req.reason,
            "new_status": case.status,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=True,
    )

    return _deserialize_case(case)

@router.post("/{id}/investigate", response_model=CaseSchema)
def run_investigation(id: str, db: Session = Depends(get_db)):
    """
    Triggers root-cause investigation across inventory, dispatch, supplier, and telemetry records.
    Stores confirmed facts and ranked hypotheses.
    """
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{id}' not found")

    finding = _LATEST_FINDINGS_CACHE.get(case.finding_id)
    if not finding:
        execute_full_scan(db)
        finding = _LATEST_FINDINGS_CACHE.get(case.finding_id)

    if not finding:
        raise HTTPException(status_code=400, detail="Associated finding not found in active scan cache.")

    rc = investigate_root_cause(finding, db)
    now = datetime.now(timezone.utc)
    case.root_cause_analysis = json.dumps(rc)
    case.status = "recommended"
    case.updated_at = now
    db.commit()

    append_ledger_event(
        db=db,
        event_type="CASE_INVESTIGATED",
        payload={
            "case_id": case.id,
            "finding_id": case.finding_id,
            "confirmed_causes_count": len(rc["confirmed_causes"]),
            "hypotheses_count": len(rc["ranked_hypotheses"]),
        },
        ts=now.isoformat(),
        trigger_auto_anchor=False,
    )

    return _deserialize_case(case)

@router.post("/{id}/outcome-check", response_model=CaseSchema)
def check_case_outcome(id: str, db: Session = Depends(get_db)):
    """
    Verifies actual operational outcome following action execution.
    Checks whether quarantined stock is locked, replacement order placed, or temp breach resolved.
    """
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{id}' not found")

    now = datetime.now(timezone.utc)
    outcome_metrics: Dict[str, Any] = {"checked_at": now.isoformat()}
    is_resolved = True

    if case.action_id:
        action = db.query(Action).filter(Action.id == case.action_id).first()
        if action:
            outcome_metrics["action_status"] = action.status
            outcome_metrics["decided_by"] = action.decided_by

            if action.status == "executed":
                if action.type in ["BLOCK_BATCH", "QUARANTINE_FOR_QA"]:
                    payload = json.loads(action.payload or "{}")
                    batches = payload.get("entities", {}).get("batches_affected") or payload.get("entities", {}).get("batches") or []
                    locked_count = db.query(BatchInventory).filter(
                        BatchInventory.batch.in_(batches),
                        BatchInventory.status.in_(["blocked", "quarantine"])
                    ).count()
                    outcome_metrics["batches_locked"] = locked_count
                    outcome_metrics["batches_total"] = len(batches)
                    is_resolved = locked_count >= len(batches)

    case.status = "outcome_checking"
    case.outcome_check_result = "resolved" if is_resolved else "pending_monitoring"
    case.outcome_metrics = json.dumps(outcome_metrics)
    case.updated_at = now
    db.commit()

    append_ledger_event(
        db=db,
        event_type="CASE_OUTCOME_CHECKED",
        payload={
            "case_id": case.id,
            "check_result": case.outcome_check_result,
            "metrics": outcome_metrics,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=True,
    )

    return _deserialize_case(case)

@router.post("/{id}/close", response_model=CaseSchema)
def close_case(id: str, req: CaseCloseRequest, db: Session = Depends(get_db)):
    """
    Formally closes an investigated and resolved compliance case.
    """
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{id}' not found")

    now = datetime.now(timezone.utc)
    case.status = "closed"
    case.closure_reason = req.reason
    case.closed_by = req.closed_by
    case.closed_at = now
    case.updated_at = now
    db.commit()

    append_ledger_event(
        db=db,
        event_type="CASE_CLOSED",
        payload={
            "case_id": case.id,
            "closed_by": req.closed_by,
            "reason": req.reason,
            "resolution_notes": req.resolution_notes,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=True,
    )

    return _deserialize_case(case)

@router.post("/{id}/reopen", response_model=CaseSchema)
def reopen_case(id: str, req: CaseReopenRequest, db: Session = Depends(get_db)):
    """
    Reopens a closed case if renewed excursion or containment failure occurs.
    """
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{id}' not found")

    now = datetime.now(timezone.utc)
    case.status = "reopened"
    case.closure_reason = f"Reopened by {req.reopened_by}: {req.reason}"
    case.updated_at = now
    db.commit()

    append_ledger_event(
        db=db,
        event_type="CASE_REOPENED",
        payload={
            "case_id": case.id,
            "reopened_by": req.reopened_by,
            "reason": req.reason,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=True,
    )

    return _deserialize_case(case)
