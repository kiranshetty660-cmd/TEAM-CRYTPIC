import json
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from app.models import Ledger
from app.ledger.anchor import anchor_range

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

def canonical_json(data: Any) -> str:
    """
    Serializes data to canonical JSON with sorted keys and no whitespace.
    """
    return json.dumps(data, sort_keys=True, separators=(',', ':'), default=str)

def compute_event_hash(prev_hash: str, canonical_payload: str) -> str:
    """
    hash_n = SHA256(prev_hash || canonical_json(event_n))
    """
    return hashlib.sha256(f"{prev_hash}{canonical_payload}".encode("utf-8")).hexdigest()

def append_ledger_event(
    db: Session,
    event_type: str,
    payload: Dict[str, Any],
    ts: Optional[str] = None,
    trigger_auto_anchor: bool = True
) -> Ledger:
    """
    Appends a new event to the ledger maintaining strict hash chaining.
    """
    if ts is None:
        ts = datetime.now(timezone.utc).isoformat()

    last_entry = db.query(Ledger).order_by(Ledger.seq.desc()).first()
    if last_entry is None:
        new_seq = 1
        prev_hash = GENESIS_HASH
    else:
        new_seq = last_entry.seq + 1
        prev_hash = last_entry.hash

    payload_str = canonical_json(payload)
    event_hash = compute_event_hash(prev_hash, payload_str)

    entry = Ledger(
        seq=new_seq,
        ts=ts,
        event_type=event_type,
        payload=payload_str,
        prev_hash=prev_hash,
        hash=event_hash,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    # Auto-anchor every 20 events
    if trigger_auto_anchor and new_seq % 20 == 0:
        try:
            anchor_range(db, from_seq=new_seq - 19, to_seq=new_seq)
        except Exception as e:
            # Anchor logging should not break ledger append
            pass

    return entry

def verify_ledger(db: Session) -> Dict[str, Any]:
    """
    Recomputes hashes for the entire ledger chain.
    Returns: {ok: bool, checked: int, first_bad_seq: Optional[int], diff: Optional[dict]}
    """
    entries = db.query(Ledger).order_by(Ledger.seq.asc()).all()
    if not entries:
        return {"ok": True, "checked": 0, "first_bad_seq": None, "diff": None}

    expected_prev = GENESIS_HASH
    for entry in entries:
        # Check prev_hash link
        if entry.prev_hash != expected_prev:
            return {
                "ok": False,
                "checked": entry.seq - 1,
                "first_bad_seq": entry.seq,
                "diff": {
                    "seq": entry.seq,
                    "reason": "Previous hash pointer mismatch",
                    "expected_prev_hash": expected_prev,
                    "actual_prev_hash": entry.prev_hash,
                }
            }

        # Verify current event hash
        recomputed = compute_event_hash(entry.prev_hash, entry.payload)
        if entry.hash != recomputed:
            return {
                "ok": False,
                "checked": entry.seq - 1,
                "first_bad_seq": entry.seq,
                "diff": {
                    "seq": entry.seq,
                    "reason": "Payload hash mismatch",
                    "expected_hash": recomputed,
                    "stored_hash": entry.hash,
                }
            }

        expected_prev = entry.hash

    return {
        "ok": True,
        "checked": len(entries),
        "first_bad_seq": None,
        "diff": None
    }
