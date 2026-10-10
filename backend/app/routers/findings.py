from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.schemas import Finding
from app.routers.board import _LATEST_FINDINGS_CACHE, execute_full_scan

router = APIRouter(prefix="/api/findings", tags=["Findings"])

@router.get("/{id}", response_model=Finding)
def get_finding_by_id(id: str, db: Session = Depends(get_db)):
    """
    Returns granular detail for a compliance risk finding, including evidence,
    options matrix, agent step trace, and explain panel formulas.
    """
    global _LATEST_FINDINGS_CACHE
    if id not in _LATEST_FINDINGS_CACHE:
        execute_full_scan(db)

    finding = _LATEST_FINDINGS_CACHE.get(id)
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding with ID {id} not found")

    if not finding.multi_agent_summary:
        from app.agent.orchestrator import run_agent_loop_on_finding
        finding = run_agent_loop_on_finding(db, finding, allow_llm=False)
        _LATEST_FINDINGS_CACHE[id] = finding

    return finding
