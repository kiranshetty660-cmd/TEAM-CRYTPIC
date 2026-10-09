import json
import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Recall, Product
from app.schemas import RecallCreate, RecallSchema
from app.ledger.chain import append_ledger_event
from app.routers.board import execute_full_scan
from app.config import settings

router = APIRouter(prefix="/api/recalls", tags=["Recalls"])

@router.get("", response_model=List[RecallSchema])
def list_recalls(db: Session = Depends(get_db)):
    """
    Returns all registered recall alerts.
    """
    recalls = db.query(Recall).all()
    output = []
    for r in recalls:
        b_list = json.loads(r.batches) if isinstance(r.batches, str) else r.batches
        output.append(RecallSchema(
            id=r.id,
            date=r.date,
            sku=r.sku,
            batches=b_list,
            reason=r.reason,
            recall_class=r.recall_class,
        ))
    return output

@router.post("", response_model=RecallSchema)
def create_recall(req: RecallCreate, db: Session = Depends(get_db)):
    """
    Ingest regulatory drug recall. Automatically logs RECALL_RECEIVED to ledger,
    triggers risk scanner, and drafts compliance mitigation actions.
    """
    prod = db.query(Product).filter(Product.sku == req.sku).first()
    if not prod:
        raise HTTPException(status_code=400, detail=f"Invalid SKU '{req.sku}'. Product does not exist.")

    recall_id = req.id or f"REC-{uuid.uuid4().hex[:6].upper()}"
    recall_date = req.date or settings.today

    # Save to recalls table
    new_recall = Recall(
        id=recall_id,
        date=recall_date,
        sku=req.sku,
        batches=json.dumps(req.batches),
        reason=req.reason,
        recall_class=req.recall_class,
    )
    db.add(new_recall)
    db.commit()

    # Append to Ledger
    append_ledger_event(
        db=db,
        event_type="RECALL_RECEIVED",
        payload={
            "recall_id": recall_id,
            "sku": req.sku,
            "batches": req.batches,
            "reason": req.reason,
            "recall_class": req.recall_class,
            "date": recall_date.isoformat(),
        },
        ts=datetime.now(timezone.utc).isoformat(),
        trigger_auto_anchor=True,
    )

    # Re-run scan to immediately draft mitigation actions
    execute_full_scan(db)

    return RecallSchema(
        id=new_recall.id,
        date=new_recall.date,
        sku=new_recall.sku,
        batches=req.batches,
        reason=new_recall.reason,
        recall_class=new_recall.recall_class,
    )

@router.post("/replay-b2231")
def replay_b2231_recall(db: Session = Depends(get_db)):
    """
    Dedicated demo replay trigger for S1 Scenario: Class II Recall on Amoxiclav 625 Batch B2231.
    """
    # Delete existing B2231 recall if present to make replay clean
    existing = db.query(Recall).filter(Recall.sku == "AMOX-625").all()
    for e in existing:
        db.delete(e)
    db.commit()

    # Re-trigger recall
    req = RecallCreate(
        id="REC-2026-B2231",
        date=settings.today,
        sku="AMOX-625",
        batches=["B2231"],
        reason="Sub-potency assay failure detected at routine stability inspection (Schedule M violation)",
        recall_class="II",
    )
    return create_recall(req, db)
