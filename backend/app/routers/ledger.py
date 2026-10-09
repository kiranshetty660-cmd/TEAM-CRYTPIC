import json
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Ledger, Anchor
from app.schemas import LedgerEntrySchema, AnchorSchema, LedgerVerifyResponse
from app.ledger.chain import verify_ledger
from app.ledger.anchor import anchor_range

router = APIRouter(prefix="/api/ledger", tags=["Ledger & Blockchain"])

@router.get("", response_model=List[LedgerEntrySchema])
def get_ledger_entries(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Returns sequential, hash-chained tamper-evident audit ledger entries.
    """
    entries = db.query(Ledger).order_by(Ledger.seq.desc()).offset(offset).limit(limit).all()
    output = []
    for e in entries:
        output.append(LedgerEntrySchema(
            seq=e.seq,
            ts=e.ts,
            event_type=e.event_type,
            payload=json.loads(e.payload) if isinstance(e.payload, str) else e.payload,
            prev_hash=e.prev_hash,
            hash=e.hash,
        ))
    return output

@router.get("/verify", response_model=LedgerVerifyResponse)
def verify_ledger_endpoint(db: Session = Depends(get_db)):
    """
    Cryptographically verifies SHA-256 hash chaining from Genesis block to latest entry.
    Detects any database tampering, returning exact corrupted sequence number and diff.
    """
    return verify_ledger(db)

@router.get("/anchors", response_model=List[AnchorSchema])
def list_anchors(db: Session = Depends(get_db)):
    """
    Returns history of Merkle root anchors committed to EVM (Polygon Amoy / simulated).
    """
    return db.query(Anchor).order_by(Anchor.id.desc()).all()

@router.post("/anchor", response_model=AnchorSchema)
def trigger_anchor_endpoint(
    from_seq: Optional[int] = Query(None),
    to_seq: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Generates Merkle root over ledger range and anchors it to EVM testnet (Polygon Amoy or simulated).
    """
    last_entry = db.query(Ledger).order_by(Ledger.seq.desc()).first()
    if not last_entry:
        raise HTTPException(status_code=400, detail="Ledger is empty")

    if to_seq is None:
        to_seq = last_entry.seq
    if from_seq is None:
        # Last anchored sequence or max(1, to_seq - 19)
        last_anchor = db.query(Anchor).order_by(Anchor.to_seq.desc()).first()
        from_seq = (last_anchor.to_seq + 1) if last_anchor else 1

    if from_seq > to_seq:
        from_seq = max(1, to_seq - 19)

    return anchor_range(db, from_seq=from_seq, to_seq=to_seq)
