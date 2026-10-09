from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db import get_db
from app.models import Recall, BatchInventory, Action
from app.schemas import BoardResponse, BoardKPI, Finding
from app.config import settings
from app.detectors.recall import detect_recalls
from app.detectors.coldchain import detect_coldchain_breaches
from app.detectors.expiry import detect_near_expiry
from app.detectors.returnwindow import detect_return_window_closing
from app.detectors.fefo import detect_fefo_violations
from app.detectors.critical import detect_critical_shortages
from app.engine.ranking import rank_findings
from app.agent.orchestrator import run_agent_loop_on_finding

router = APIRouter(prefix="/api", tags=["Board & Scan"])

# In-memory findings cache to support instant detail navigation
_LATEST_FINDINGS_CACHE: dict[str, Finding] = {}

def execute_full_scan(db: Session) -> BoardResponse:
    global _LATEST_FINDINGS_CACHE
    _LATEST_FINDINGS_CACHE.clear()
    all_findings: List[Finding] = []

    # 1. Run all compliance detectors
    all_findings.extend(detect_recalls(db))
    all_findings.extend(detect_coldchain_breaches(db))
    all_findings.extend(detect_critical_shortages(db))
    all_findings.extend(detect_return_window_closing(db))
    all_findings.extend(detect_near_expiry(db))
    all_findings.extend(detect_fefo_violations(db))

    # 2. Rank findings deterministically
    ranked = rank_findings(all_findings)

    # 3. Run Agent loop for top findings
    processed_findings = []
    for f in ranked:
        # Run agent on findings
        processed = run_agent_loop_on_finding(db, f)
        processed_findings.append(processed)
        _LATEST_FINDINGS_CACHE[processed.id] = processed

    # 4. Compute Board KPIs
    open_recalls = db.query(Recall).count()
    cold_breaches = sum(1 for f in ranked if f.type == "coldchain")
    val_at_risk = sum(f.metrics.get("value_at_risk_inr", 0.0) for f in ranked)
    pending_approvals = db.query(Action).filter(Action.status == "pending_approval").count()
    quarantined_batches = db.query(BatchInventory).filter(BatchInventory.status == "quarantine").count()

    kpi = BoardKPI(
        open_recalls=open_recalls,
        cold_breaches=cold_breaches,
        value_at_risk_inr=round(val_at_risk, 2),
        pending_approvals=pending_approvals,
        quarantined_batches=quarantined_batches,
    )

    return BoardResponse(
        kpis=kpi,
        findings=processed_findings,
        weights={
            "safety": settings.SAFETY_WEIGHT,
            "time_pressure": settings.TIME_PRESSURE_WEIGHT,
            "value_at_risk": settings.VALUE_AT_RISK_WEIGHT,
            "breadth": settings.BREADTH_WEIGHT,
        },
        scanned_at=datetime.now(timezone.utc).isoformat(),
    )

@router.get("/board", response_model=BoardResponse)
def get_board(db: Session = Depends(get_db)):
    """
    Returns high-level KPI strip, ranked risk findings, and weight matrix.
    If no scan has occurred yet, runs initial scan automatically.
    """
    global _LATEST_FINDINGS_CACHE
    if not _LATEST_FINDINGS_CACHE:
        return execute_full_scan(db)

    # Compute current KPIs
    open_recalls = db.query(Recall).count()
    cold_breaches = sum(1 for f in _LATEST_FINDINGS_CACHE.values() if f.type == "coldchain")
    val_at_risk = sum(f.metrics.get("value_at_risk_inr", 0.0) for f in _LATEST_FINDINGS_CACHE.values())
    pending_approvals = db.query(Action).filter(Action.status == "pending_approval").count()
    quarantined = db.query(BatchInventory).filter(BatchInventory.status == "quarantine").count()

    kpi = BoardKPI(
        open_recalls=open_recalls,
        cold_breaches=cold_breaches,
        value_at_risk_inr=round(val_at_risk, 2),
        pending_approvals=pending_approvals,
        quarantined_batches=quarantined,
    )

    return BoardResponse(
        kpis=kpi,
        findings=list(_LATEST_FINDINGS_CACHE.values()),
        weights={
            "safety": settings.SAFETY_WEIGHT,
            "time_pressure": settings.TIME_PRESSURE_WEIGHT,
            "value_at_risk": settings.VALUE_AT_RISK_WEIGHT,
            "breadth": settings.BREADTH_WEIGHT,
        },
        scanned_at=datetime.now(timezone.utc).isoformat(),
    )

@router.post("/scan", response_model=BoardResponse)
def trigger_scan(db: Session = Depends(get_db)):
    """
    Trigger complete risk discovery and agentic drafting scan.
    """
    return execute_full_scan(db)
