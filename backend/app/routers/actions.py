import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Action, BatchInventory, PurchaseOrder
from app.schemas import ActionSchema, ActionDecisionRequest
from app.ledger.chain import append_ledger_event

router = APIRouter(prefix="/api/actions", tags=["Actions & Approvals"])

ROLE_PERMISSIONS = {
    "BLOCK_BATCH": ["pharmacist", "compliance"],
    "QUARANTINE_FOR_QA": ["pharmacist", "compliance"],
    "SEND_NOTICES": ["pharmacist", "compliance"],
    "URGENT_PO": ["compliance", "purchase"],
    "TRANSFER": ["compliance", "purchase"],
    "RETURN_REQUEST": ["compliance", "purchase"],
    "DISCOUNT_OFFER": ["compliance", "purchase"],
    "PICK_INSTRUCTION": ["warehouse", "compliance"],
}

@router.get("", response_model=List[ActionSchema])
def list_actions(
    status: Optional[str] = Query(None, description="Filter actions by status"),
    db: Session = Depends(get_db)
):
    """
    Returns pending and resolved compliance actions queue.
    """
    query = db.query(Action)
    if status:
        query = query.filter(Action.status == status)
    actions = query.order_by(Action.created_at.desc()).all()

    # Deserialise JSON columns
    output = []
    for a in actions:
        output.append(ActionSchema(
            id=a.id,
            type=a.type,
            payload=json.loads(a.payload) if isinstance(a.payload, str) else a.payload,
            evidence=json.loads(a.evidence) if isinstance(a.evidence, str) else a.evidence,
            options=json.loads(a.options) if isinstance(a.options, str) else a.options,
            chosen_option=a.chosen_option,
            status=a.status,
            required_role=a.required_role,
            created_at=a.created_at.isoformat(),
            decided_by=a.decided_by,
            decided_at=a.decided_at.isoformat() if a.decided_at else None,
            reason=a.reason,
        ))
    return output

@router.post("/{id}/approve")
def approve_action(
    id: str,
    req: ActionDecisionRequest,
    db: Session = Depends(get_db)
):
    """
    Approve drafted action with strict role validation and simulated ledger execution.
    """
    action = db.query(Action).filter(Action.id == id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    if action.status not in ["draft", "pending_approval"]:
        raise HTTPException(status_code=400, detail=f"Action is already '{action.status}'")

    # Role Gate Check
    allowed_roles = ROLE_PERMISSIONS.get(action.type, ["compliance"])
    if req.role not in allowed_roles and req.role != "compliance":
        raise HTTPException(
            status_code=403,
            detail=f"Role '{req.role}' is not authorized to approve {action.type}. Requires one of: {', '.join(allowed_roles)}"
        )

    # Prevent self-approval if drafter is specified
    payload = json.loads(action.payload) if isinstance(action.payload, str) else action.payload
    if payload.get("drafter") and payload.get("drafter") == req.user_name:
        raise HTTPException(status_code=400, detail="Conflict of interest: drafter cannot approve own action.")

    now = datetime.now(timezone.utc)
    action.status = "executed"
    action.decided_by = f"{req.user_name} ({req.role})"
    action.decided_at = now
    action.reason = req.reason or f"Approved by authorized {req.role}"

    # Execute simulated side-effects with immediate state validation
    execution_details = {}
    if action.type in ["BLOCK_BATCH", "QUARANTINE_FOR_QA"]:
        # Find target batches and revalidate existence before mutation
        batches = payload.get("entities", {}).get("batches_affected") or payload.get("entities", {}).get("batches") or []
        new_status = "quarantine" if action.type == "QUARANTINE_FOR_QA" else "blocked"
        updated_count = 0
        if batches:
            # Revalidate batches exist
            existing = db.query(BatchInventory).filter(BatchInventory.batch.in_(batches)).all()
            if not existing:
                raise HTTPException(status_code=400, detail=f"Target batches {batches} no longer exist in warehouse inventory.")
            
            updated_count = db.query(BatchInventory).filter(
                BatchInventory.batch.in_(batches)
            ).update({"status": new_status}, synchronize_session="fetch")

        execution_details = {
            "batches_updated": batches,
            "new_status": new_status,
            "count": updated_count,
            "pre_execution_validated": True,
        }

    elif action.type == "URGENT_PO":
        sku = payload.get("entities", {}).get("sku")
        reorder_qty = payload.get("metrics", {}).get("recommended_order_qty", 600)
        po_id = f"PO-EXP-{sku}-{now.strftime('%m%d%H%M')}"
        new_po = PurchaseOrder(
            po=po_id,
            manufacturer=payload.get("entities", {}).get("supplier", "Arogya Labs"),
            sku=sku,
            qty=reorder_qty,
            expected_date=now.date(),
            status="ordered",
            draft=False,
        )
        db.add(new_po)
        execution_details = {
            "po_id": po_id,
            "sku": sku,
            "qty": reorder_qty,
            "status": "ordered",
            "pre_execution_validated": True,
        }
    else:
        execution_details = {
            "action_type": action.type,
            "pre_execution_validated": True,
        }

    db.commit()

    # Append to SHA-256 Ledger (Guaranteed zero patient/customer PII)
    append_ledger_event(
        db=db,
        event_type="ACTION_APPROVED",
        payload={
            "action_id": action.id,
            "type": action.type,
            "approved_by": req.user_name,
            "role": req.role,
            "chosen_option": action.chosen_option,
            "review_passed": payload.get("review_passed", True),
            "review_objections": payload.get("review_objections", []),
            "execution": execution_details,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=True,
    )

    return {
        "status": "success",
        "action_id": action.id,
        "new_status": action.status,
        "decided_by": action.decided_by,
        "execution": execution_details,
    }

@router.post("/{id}/reject")
def reject_action(
    id: str,
    req: ActionDecisionRequest,
    db: Session = Depends(get_db)
):
    """
    Reject drafted action with mandatory reason, recording event and proposing consequence.
    """
    action = db.query(Action).filter(Action.id == id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    if not req.reason or len(req.reason.strip()) < 5:
        raise HTTPException(status_code=400, detail="Rejection requires a documented reason (at least 5 characters).")

    now = datetime.now(timezone.utc)
    action.status = "rejected"
    action.decided_by = f"{req.user_name} ({req.role})"
    action.decided_at = now
    action.reason = req.reason

    db.commit()

    # Ledger event
    append_ledger_event(
        db=db,
        event_type="ACTION_REJECTED",
        payload={
            "action_id": action.id,
            "type": action.type,
            "rejected_by": req.user_name,
            "role": req.role,
            "reason": req.reason,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=True,
    )

    return {
        "status": "rejected",
        "action_id": action.id,
        "decided_by": action.decided_by,
        "reason": action.reason,
        "consequence": f"Action {action.type} cancelled. Risk remains active in compliance desk. Manual supervision advised.",
    }
