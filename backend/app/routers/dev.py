import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Ledger, Dispatch
from app.seed.seed import run_seed
from app.routers.board import execute_full_scan

router = APIRouter(prefix="/api/dev", tags=["Developer & Tamper Simulation"])

@router.post("/tamper")
def simulate_tampering(seq: int = 10, db: Session = Depends(get_db)):
    """
    Simulates malicious tampering: Modifies the payload of a past ledger entry
    without valid re-computation of the SHA-256 chain.
    Causes /api/ledger/verify to fail at the exact sequence number.
    """
    entry = db.query(Ledger).filter(Ledger.seq == seq).first()
    if not entry:
        # Fallback to last entry if seq doesn't exist
        entry = db.query(Ledger).order_by(Ledger.seq.desc()).first()
        if not entry:
            raise HTTPException(status_code=400, detail="Ledger is empty")

    original_payload = entry.payload
    try:
        data = json.loads(original_payload)
        if "qty" in data:
            data["qty"] = data["qty"] + 999  # Maliciously inflated quantity
        else:
            data["TAMPERED_BY_MALICIOUS_ACTOR"] = True
        modified_str = json.dumps(data)
    except Exception:
        modified_str = original_payload + " [CORRUPTED_TAMPERED]"

    entry.payload = modified_str
    db.commit()

    return {
        "status": "tampered",
        "tampered_seq": entry.seq,
        "message": f"Ledger entry seq={entry.seq} payload was maliciously modified in the database. Run /api/ledger/verify to inspect detection.",
    }

@router.post("/reset-db")
def dev_reset_database(db: Session = Depends(get_db)):
    """
    Resets database back to clean deterministic seed state.
    """
    run_seed(reset=True)
    execute_full_scan(db)
    return {"status": "reset_completed"}
