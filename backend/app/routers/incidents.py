import re
import json
import uuid
from datetime import datetime, timezone, date
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Header
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from app.db import get_db
from app.models import (
    Complaint,
    ComplaintEvent,
    NotificationCampaign,
    NotificationRecipient,
    Product,
    BatchInventory,
    Dispatch,
    Customer,
)
from app.ledger.chain import append_ledger_event
from app.notifications.campaign_manager import (
    resolve_affected_recipients,
    create_notification_campaign,
    approve_notification_campaign,
    reject_notification_campaign,
    escalate_notification_campaign,
    dispatch_notification_campaign,
    retry_failed_notifications,
    record_human_acknowledgement,
    process_delivery_webhook,
    sanitize_payload_for_audit,
    AUTHORIZED_ROLES,
)
from app.config import settings

router = APIRouter(tags=["Complaints & Recall Notifications"])


# -----------------------------------------------------------------------------
# 1. Complaint & Incident Management Endpoints
# -----------------------------------------------------------------------------

@router.post("/api/incidents")
def create_incident(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """
    Submits a new complaint or quality issue from either:
    1. 'website_complaint': Patient / Customer complaint through the portal.
    2. 'owner_quality_issue': Warehouse owner / authorized quality staff report.

    Allows incomplete reports to be saved (clearly flags missing batch instead of inventing it).
    Prevents duplicate active cases where appropriate.
    """
    source = payload.get("incident_source", "website_complaint")
    if source not in ("website_complaint", "owner_quality_issue"):
        source = "website_complaint"

    sku = payload.get("sku")
    if sku:
        sku = str(sku).strip().upper()

    raw_batch = payload.get("batch")
    batch = str(raw_batch).strip() if (raw_batch and str(raw_batch).strip() not in ("None", "", "null")) else None
    is_batch_missing = batch is None or len(batch) == 0

    desc_text = payload.get("complaint_description")
    if not desc_text or not str(desc_text).strip():
        raise HTTPException(status_code=400, detail="Complaint description is required.")

    # Duplicate check: check if identical open case exists in last 24h
    if sku and batch:
        existing = (
            db.query(Complaint)
            .filter(
                Complaint.sku == sku,
                Complaint.batch == batch,
                Complaint.investigation_status.in_(["new", "under_review", "investigating"]),
            )
            .first()
        )
        if existing and payload.get("prevent_duplicate", False):
            # If explicit duplicate check enabled, return existing case reference with note
            return {
                "status": "duplicate",
                "message": "Potential duplicate detected: Case already active for this batch.",
                "is_duplicate": True,
                "case_id": existing.id,
                "existing_case_id": existing.id,
                "incident": {
                    "id": existing.id,
                    "sku": existing.sku,
                    "batch": existing.batch,
                    "status": existing.investigation_status,
                    "created_at": existing.created_at.isoformat(),
                }
            }

    now = datetime.now(timezone.utc)
    case_prefix = "INC" if source == "owner_quality_issue" else "CMP"
    case_id = f"{case_prefix}-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    # Auto-resolve medicine name if SKU is provided
    medicine_name = payload.get("medicine_name")
    if not medicine_name and sku:
        prod = db.query(Product).filter(Product.sku == sku).first()
        if prod:
            medicine_name = prod.brand

    evidence_data = payload.get("source_evidence")
    if isinstance(evidence_data, (dict, list)):
        evidence_json = json.dumps(evidence_data)
    elif evidence_data:
        evidence_json = str(evidence_data)
    else:
        evidence_json = None

    incident = Complaint(
        id=case_id,
        incident_source=source,
        caller_name=payload.get("caller_name") or payload.get("reporter_name"),
        caller_phone=payload.get("caller_phone") or payload.get("reporter_phone"),
        caller_email=payload.get("caller_email") or payload.get("reporter_email"),
        caller_organization=payload.get("caller_organization"),
        customer_id=payload.get("customer_id"),
        warehouse=payload.get("warehouse"),
        sku=sku,
        medicine_name=medicine_name,
        batch=batch,
        is_batch_missing=is_batch_missing,
        manufacturer=payload.get("manufacturer"),
        complaint_category=payload.get("complaint_category", "quality"),
        complaint_description=str(desc_text).strip(),
        reported_quantity=payload.get("reported_quantity"),
        stock_remaining=bool(payload.get("stock_remaining", False)),
        potential_harm=bool(payload.get("potential_harm", False)),
        potential_harm_details=payload.get("potential_harm_details"),
        urgency=payload.get("urgency", "high" if payload.get("potential_harm") else "medium"),
        verification_status="verified_sku_batch" if (sku and batch) else ("verified_sku_only" if sku else "unverified"),
        investigation_status="new",
        assigned_reviewer=payload.get("assigned_reviewer", "Quality Safety Lead"),
        assigned_owner="Quality Safety Lead",
        approval_history=json.dumps([]),
        raw_caller_statement=payload.get("raw_caller_statement"),
        source_evidence=evidence_json,
        created_at=now,
        updated_at=now,
    )
    db.add(incident)

    # Initial Event
    db.add(ComplaintEvent(
        complaint_id=case_id,
        event_type="CREATED",
        actor=incident.caller_name or ("Warehouse Owner" if source == "owner_quality_issue" else "Patient Website"),
        notes=f"Incident filed from {source}. Missing batch: {is_batch_missing}",
        timestamp=now,
    ))

    db.commit()

    # Append to tamper-evident audit ledger (with PII sanitization)
    audit_data = sanitize_payload_for_audit({
        "action": "INCIDENT_CREATED",
        "case_id": case_id,
        "source": source,
        "sku": sku,
        "batch": batch,
        "is_batch_missing": is_batch_missing,
        "urgency": incident.urgency,
        "potential_harm": incident.potential_harm,
    })
    append_ledger_event(db, "INCIDENT_RECORDED", audit_data)

    return {
        "status": "created",
        "case_id": case_id,
        "incident_source": source,
        "is_batch_missing": is_batch_missing,
        "created_at": now.isoformat(),
        "assigned_reviewer": incident.assigned_reviewer,
        "message": "Incident record created successfully." if not is_batch_missing else "Incident recorded with missing batch information flagged for investigation.",
    }


@router.get("/api/incidents")
def list_incidents(
    source: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Lists incidents with rich filtering and linked campaign outcomes."""
    query = db.query(Complaint)

    if source:
        query = query.filter(Complaint.incident_source == source)
    if status:
        query = query.filter(Complaint.investigation_status == status)
    if urgency:
        query = query.filter(Complaint.urgency == urgency)
    if sku:
        query = query.filter(Complaint.sku == sku.upper())
    if batch:
        query = query.filter(Complaint.batch == batch)
    if search:
        search_filter = or_(
            Complaint.id.ilike(f"%{search}%"),
            Complaint.sku.ilike(f"%{search}%"),
            Complaint.batch.ilike(f"%{search}%"),
            Complaint.complaint_description.ilike(f"%{search}%"),
            Complaint.caller_name.ilike(f"%{search}%"),
        )
        query = query.filter(search_filter)

    total_count = query.count()
    incidents = query.order_by(Complaint.created_at.desc()).offset(offset).limit(limit).all()

    # Pre-fetch linked campaigns
    campaign_ids = [inc.campaign_id for inc in incidents if inc.campaign_id]
    campaigns_map = {}
    if campaign_ids:
        campaigns = db.query(NotificationCampaign).filter(NotificationCampaign.id.in_(campaign_ids)).all()
        campaigns_map = {c.id: c for c in campaigns}

    results = []
    for inc in incidents:
        camp = campaigns_map.get(inc.campaign_id)
        results.append({
            "id": inc.id,
            "incident_source": inc.incident_source,
            "caller_name": inc.caller_name,
            "caller_phone": inc.caller_phone,
            "caller_email": inc.caller_email,
            "caller_organization": inc.caller_organization,
            "warehouse": inc.warehouse,
            "sku": inc.sku,
            "medicine_name": inc.medicine_name,
            "batch": inc.batch,
            "is_batch_missing": inc.is_batch_missing,
            "complaint_category": inc.complaint_category,
            "complaint_description": inc.complaint_description,
            "urgency": inc.urgency,
            "potential_harm": inc.potential_harm,
            "investigation_status": inc.investigation_status,
            "verification_status": inc.verification_status,
            "assigned_reviewer": inc.assigned_reviewer,
            "created_at": inc.created_at.isoformat(),
            "updated_at": inc.updated_at.isoformat(),
            "campaign_id": inc.campaign_id,
            "campaign_status": camp.status if camp else None,
            "campaign_outcomes": {
                "emails_sent": camp.emails_sent,
                "emails_delivered": camp.emails_delivered,
                "emails_failed": camp.emails_failed,
                "sms_sent": camp.sms_sent,
                "sms_delivered": camp.sms_delivered,
                "sms_failed": camp.sms_failed,
                "acknowledged": camp.acknowledged_count,
            } if camp else None,
        })

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "incidents": results,
    }


@router.get("/api/incidents/{incident_id}")
def get_incident_detail(
    incident_id: str,
    db: Session = Depends(get_db),
):
    """
    Returns full incident detail including:
    - Case info and investigation status
    - Warehouse batch inventory
    - Affected recipient resolution from dispatches
    - Approval history and evidence
    - Linked campaign status and per-recipient outcomes
    """
    incident = db.query(Complaint).filter(Complaint.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")

    # Warehouse batch inventory records
    inventory_items = []
    if incident.sku and incident.batch:
        invs = (
            db.query(BatchInventory)
            .filter(BatchInventory.sku == incident.sku, BatchInventory.batch == incident.batch)
            .all()
        )
        for inv in invs:
            inventory_items.append({
                "warehouse": inv.warehouse,
                "cold_room": inv.cold_room,
                "qty": inv.qty,
                "status": inv.status,
                "expiry_date": inv.expiry_date.isoformat(),
            })

    # Resolved recipients from dispatches
    affected_recipients = []
    if incident.sku and incident.batch:
        affected_recipients = resolve_affected_recipients(db=db, sku=incident.sku, batch=incident.batch)

    # Linked campaign details
    campaign_data = None
    recipient_tasks = []
    if incident.campaign_id:
        camp = db.query(NotificationCampaign).filter(NotificationCampaign.id == incident.campaign_id).first()
        if camp:
            campaign_data = {
                "id": camp.id,
                "title": camp.title,
                "status": camp.status,
                "approved_by": camp.approved_by,
                "approval_role": camp.approval_role,
                "approved_at": camp.approved_at.isoformat() if camp.approved_at else None,
                "approval_reason": camp.approval_reason,
                "rejection_reason": camp.rejection_reason,
                "is_escalated": camp.is_escalated,
                "escalated_to": camp.escalated_to,
                "email_subject": camp.email_subject,
                "email_body_html": camp.email_body_html,
                "email_body_text": camp.email_body_text,
                "sms_text": camp.sms_text,
                "total_recipients": camp.total_recipients,
                "eligible_recipients": camp.eligible_recipients,
                "missing_contact_count": camp.missing_contact_count,
                "emails_sent": camp.emails_sent,
                "emails_delivered": camp.emails_delivered,
                "emails_failed": camp.emails_failed,
                "sms_sent": camp.sms_sent,
                "sms_delivered": camp.sms_delivered,
                "sms_failed": camp.sms_failed,
                "acknowledged_count": camp.acknowledged_count,
                "stock_isolated_count": camp.stock_isolated_count,
                "created_at": camp.created_at.isoformat(),
                "sent_at": camp.sent_at.isoformat() if camp.sent_at else None,
            }
            rcpts = db.query(NotificationRecipient).filter(NotificationRecipient.campaign_id == camp.id).all()
            for r in rcpts:
                recipient_tasks.append({
                    "id": r.id,
                    "customer_id": r.customer_id,
                    "customer_name": r.customer_name,
                    "customer_type": r.customer_type,
                    "location": r.location,
                    "phone": r.phone,
                    "email": r.email,
                    "is_phone_valid": r.is_phone_valid,
                    "is_email_valid": r.is_email_valid,
                    "missing_contacts": r.missing_contacts,
                    "dispatched_qty": r.dispatched_qty,
                    "email_status": r.email_status,
                    "email_provider_id": r.email_provider_id,
                    "email_error": r.email_error,
                    "email_retries": r.email_retries,
                    "sms_status": r.sms_status,
                    "sms_provider_id": r.sms_provider_id,
                    "sms_error": r.sms_error,
                    "sms_retries": r.sms_retries,
                    "acknowledged": r.acknowledged,
                    "acknowledged_at": r.acknowledged_at.isoformat() if r.acknowledged_at else None,
                    "acknowledged_by": r.acknowledged_by,
                    "stock_isolated": r.stock_isolated,
                    "stock_isolated_qty": r.stock_isolated_qty,
                    "acknowledgement_notes": r.acknowledgement_notes,
                })

    # Timeline events
    events = (
        db.query(ComplaintEvent)
        .filter(ComplaintEvent.complaint_id == incident.id)
        .order_by(ComplaintEvent.timestamp.asc())
        .all()
    )

    return {
        "incident": {
            "id": incident.id,
            "incident_source": incident.incident_source,
            "caller_name": incident.caller_name,
            "caller_phone": incident.caller_phone,
            "caller_email": incident.caller_email,
            "caller_organization": incident.caller_organization,
            "warehouse": incident.warehouse,
            "sku": incident.sku,
            "medicine_name": incident.medicine_name,
            "batch": incident.batch,
            "is_batch_missing": incident.is_batch_missing,
            "manufacturer": incident.manufacturer,
            "complaint_category": incident.complaint_category,
            "complaint_description": incident.complaint_description,
            "urgency": incident.urgency,
            "potential_harm": incident.potential_harm,
            "potential_harm_details": incident.potential_harm_details,
            "investigation_status": incident.investigation_status,
            "verification_status": incident.verification_status,
            "assigned_reviewer": incident.assigned_reviewer,
            "approval_history": json.loads(incident.approval_history or "[]"),
            "source_evidence": json.loads(incident.source_evidence) if incident.source_evidence else None,
            "created_at": incident.created_at.isoformat(),
            "updated_at": incident.updated_at.isoformat(),
        },
        "inventory": inventory_items,
        "affected_recipients": affected_recipients,
        "campaign": campaign_data,
        "recipient_tasks": recipient_tasks,
        "events": [
            {
                "id": ev.id,
                "event_type": ev.event_type,
                "actor": ev.actor,
                "notes": ev.notes,
                "timestamp": ev.timestamp.isoformat(),
            }
            for ev in events
        ],
    }


@router.patch("/api/incidents/{incident_id}")
def update_incident_status(
    incident_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Updates incident investigation status, assigned reviewer, or batch."""
    incident = db.query(Complaint).filter(Complaint.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")

    now = datetime.now(timezone.utc)
    updated_fields = []

    if "investigation_status" in payload:
        new_status = payload["investigation_status"]
        incident.investigation_status = new_status
        updated_fields.append(f"status -> {new_status}")

    if "assigned_reviewer" in payload:
        incident.assigned_reviewer = payload["assigned_reviewer"]
        updated_fields.append(f"reviewer -> {payload['assigned_reviewer']}")

    if "batch" in payload and payload["batch"]:
        incident.batch = str(payload["batch"]).strip()
        incident.is_batch_missing = False
        incident.verification_status = "verified_sku_batch" if incident.sku else "unverified"
        updated_fields.append(f"batch -> {incident.batch}")

    incident.updated_at = now

    if updated_fields:
        db.add(ComplaintEvent(
            complaint_id=incident.id,
            event_type="STATUS_CHANGED",
            actor=payload.get("updated_by", "Quality Reviewer"),
            notes="Updated: " + ", ".join(updated_fields),
            timestamp=now,
        ))
        db.commit()

    return {"status": "updated", "incident_id": incident.id, "updated_fields": updated_fields}


@router.post("/api/incidents/{incident_id}/preview-recipients")
def preview_incident_recipients(
    incident_id: str,
    db: Session = Depends(get_db),
):
    """
    Resolves shops and hospitals that received the batch from dispatch records.
    Validates phone and email addresses, flags missing contacts.
    """
    incident = db.query(Complaint).filter(Complaint.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")

    if not incident.sku or not incident.batch:
        return {
            "eligible_recipients": 0,
            "total_recipients": 0,
            "missing_batch": True,
            "message": "Cannot resolve dispatches: Incident has missing SKU or Batch.",
            "recipients": [],
        }

    recipients = resolve_affected_recipients(db=db, sku=incident.sku, batch=incident.batch)
    eligible = sum(1 for r in recipients if r["is_eligible"])
    missing = sum(1 for r in recipients if r["missing_contacts"] != "none")

    return {
        "incident_id": incident.id,
        "sku": incident.sku,
        "batch": incident.batch,
        "total_recipients": len(recipients),
        "eligible_recipients": eligible,
        "missing_contact_recipients": missing,
        "recipients": recipients,
    }


# -----------------------------------------------------------------------------
# 2. Campaign Creation & Approval Workflow Endpoints
# -----------------------------------------------------------------------------

@router.post("/api/incidents/{incident_id}/campaigns")
def create_campaign_for_incident(
    incident_id: str,
    payload: Dict[str, Any] = Body(default={}),
    db: Session = Depends(get_db),
):
    """Creates a notification campaign for an incident."""
    incident = db.query(Complaint).filter(Complaint.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")

    if not incident.sku or not incident.batch:
        raise HTTPException(status_code=400, detail="Cannot create campaign: Missing SKU or Batch.")

    try:
        campaign = create_notification_campaign(
            db=db,
            incident_id=incident.id,
            sku=incident.sku,
            batch=incident.batch,
            warehouse=incident.warehouse,
            created_by=payload.get("created_by", "Authorized Staff"),
            custom_instructions=payload.get("instructions"),
        )
        return {
            "status": "created",
            "campaign_id": campaign.id,
            "campaign_status": campaign.status,
            "total_recipients": campaign.total_recipients,
            "eligible_recipients": campaign.eligible_recipients,
            "missing_contact_count": campaign.missing_contact_count,
        }
    except Exception as ex:
        raise HTTPException(status_code=400, detail=str(ex))


@router.get("/api/notifications/campaigns")
def list_campaigns(
    status: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Lists all recall notification campaigns."""
    query = db.query(NotificationCampaign)
    if status:
        query = query.filter(NotificationCampaign.status == status)
    if sku:
        query = query.filter(NotificationCampaign.sku == sku.upper())
    if batch:
        query = query.filter(NotificationCampaign.batch == batch)

    camps = query.order_by(NotificationCampaign.created_at.desc()).limit(limit).all()
    return [
        {
            "id": c.id,
            "incident_id": c.incident_id,
            "sku": c.sku,
            "batch": c.batch,
            "title": c.title,
            "status": c.status,
            "approved_by": c.approved_by,
            "approval_role": c.approval_role,
            "total_recipients": c.total_recipients,
            "eligible_recipients": c.eligible_recipients,
            "emails_sent": c.emails_sent,
            "emails_delivered": c.emails_delivered,
            "emails_failed": c.emails_failed,
            "sms_sent": c.sms_sent,
            "sms_delivered": c.sms_delivered,
            "sms_failed": c.sms_failed,
            "acknowledged_count": c.acknowledged_count,
            "created_at": c.created_at.isoformat(),
            "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        }
        for c in camps
    ]


@router.get("/api/notifications/campaigns/{campaign_id}")
def get_campaign_detail(
    campaign_id: str,
    db: Session = Depends(get_db),
):
    """Returns detailed campaign status, message previews, and recipient task list."""
    camp = db.query(NotificationCampaign).filter(NotificationCampaign.id == campaign_id).first()
    if not camp:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found.")

    recipients = db.query(NotificationRecipient).filter(NotificationRecipient.campaign_id == camp.id).all()

    return {
        "campaign": {
            "id": camp.id,
            "incident_id": camp.incident_id,
            "sku": camp.sku,
            "batch": camp.batch,
            "warehouse": camp.warehouse,
            "title": camp.title,
            "status": camp.status,
            "email_subject": camp.email_subject,
            "email_body_html": camp.email_body_html,
            "email_body_text": camp.email_body_text,
            "sms_text": camp.sms_text,
            "approved_by": camp.approved_by,
            "approval_role": camp.approval_role,
            "approved_at": camp.approved_at.isoformat() if camp.approved_at else None,
            "approval_reason": camp.approval_reason,
            "rejection_reason": camp.rejection_reason,
            "is_escalated": camp.is_escalated,
            "escalated_to": camp.escalated_to,
            "total_recipients": camp.total_recipients,
            "eligible_recipients": camp.eligible_recipients,
            "missing_contact_count": camp.missing_contact_count,
            "emails_sent": camp.emails_sent,
            "emails_delivered": camp.emails_delivered,
            "emails_failed": camp.emails_failed,
            "sms_sent": camp.sms_sent,
            "sms_delivered": camp.sms_delivered,
            "sms_failed": camp.sms_failed,
            "acknowledged_count": camp.acknowledged_count,
            "stock_isolated_count": camp.stock_isolated_count,
            "created_at": camp.created_at.isoformat(),
            "sent_at": camp.sent_at.isoformat() if camp.sent_at else None,
        },
        "recipients": [
            {
                "id": r.id,
                "customer_id": r.customer_id,
                "customer_name": r.customer_name,
                "customer_type": r.customer_type,
                "location": r.location,
                "phone": r.phone,
                "email": r.email,
                "is_phone_valid": r.is_phone_valid,
                "is_email_valid": r.is_email_valid,
                "missing_contacts": r.missing_contacts,
                "dispatched_qty": r.dispatched_qty,
                "email_status": r.email_status,
                "email_provider_id": r.email_provider_id,
                "email_error": r.email_error,
                "email_retries": r.email_retries,
                "sms_status": r.sms_status,
                "sms_provider_id": r.sms_provider_id,
                "sms_error": r.sms_error,
                "sms_retries": r.sms_retries,
                "acknowledged": r.acknowledged,
                "acknowledged_at": r.acknowledged_at.isoformat() if r.acknowledged_at else None,
                "acknowledged_by": r.acknowledged_by,
                "stock_isolated": r.stock_isolated,
                "stock_isolated_qty": r.stock_isolated_qty,
                "acknowledgement_notes": r.acknowledgement_notes,
            }
            for r in recipients
        ],
    }


@router.post("/api/notifications/campaigns/{campaign_id}/approve")
def approve_campaign(
    campaign_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """
    Authorizes a proposed recall notification campaign.
    Enforces qualified personnel role and requires an approval reason.
    Allows editing subject/body/SMS before authorization.
    """
    approver_name = payload.get("approver_name") or "Dr. K. Sharma"
    approver_role = payload.get("approver_role") or "Quality Safety Lead"
    reason = payload.get("approval_reason")
    if reason is None:
        reason = "Assessed lab report and batch traceability; authorized distribution-stop notice."

    try:
        camp = approve_notification_campaign(
            db=db,
            campaign_id=campaign_id,
            approver_name=approver_name,
            approver_role=approver_role,
            approval_reason=reason,
            edited_email_subject=payload.get("email_subject"),
            edited_email_body=payload.get("email_body"),
            edited_sms_text=payload.get("sms_text"),
        )
        return {
            "status": "approved",
            "campaign_id": camp.id,
            "approved_by": camp.approved_by,
            "approval_role": camp.approval_role,
            "approved_at": camp.approved_at.isoformat() if camp.approved_at else None,
        }
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/api/notifications/campaigns/{campaign_id}/reject")
def reject_campaign(
    campaign_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Halts proposed recall notice with rejection reason."""
    rejected_by = payload.get("rejected_by") or "Quality Safety Lead"
    role = payload.get("role") or "Quality Safety Lead"
    reason = payload.get("rejection_reason")
    if not reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required.")

    try:
        camp = reject_notification_campaign(
            db=db,
            campaign_id=campaign_id,
            rejected_by=rejected_by,
            role=role,
            rejection_reason=reason,
        )
        return {"status": "rejected", "campaign_id": camp.id, "rejection_reason": camp.rejection_reason}
    except Exception as ex:
        raise HTTPException(status_code=400, detail=str(ex))


@router.post("/api/notifications/campaigns/{campaign_id}/escalate")
def escalate_campaign(
    campaign_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Urgent escalation to the designated compliance person."""
    escalated_by = payload.get("escalated_by") or "Quality Safety Lead"
    escalate_to = payload.get("escalate_to") or "Chief Compliance Officer"
    reason = payload.get("reason") or "Serious adverse reaction potential requiring executive escalation."

    try:
        camp = escalate_notification_campaign(
            db=db,
            campaign_id=campaign_id,
            escalated_by=escalated_by,
            escalate_to=escalate_to,
            escalation_reason=reason,
        )
        return {
            "status": "escalated",
            "campaign_id": camp.id,
            "escalated_to": camp.escalated_to,
            "escalated_at": camp.escalated_at.isoformat() if camp.escalated_at else None,
        }
    except Exception as ex:
        raise HTTPException(status_code=400, detail=str(ex))


@router.post("/api/notifications/campaigns/{campaign_id}/send")
def send_campaign(
    campaign_id: str,
    payload: Dict[str, Any] = Body(default={}),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    """
    Dispatches approved campaign via email and SMS.
    Guarded by idempotency to prevent duplicate sends on repeated button clicks.
    """
    idemp = idempotency_key or payload.get("idempotency_key")
    try:
        camp = dispatch_notification_campaign(db=db, campaign_id=campaign_id, idempotency_key=idemp)
        return {
            "status": camp.status,
            "campaign_id": camp.id,
            "emails_sent": camp.emails_sent,
            "emails_failed": camp.emails_failed,
            "sms_sent": camp.sms_sent,
            "sms_failed": camp.sms_failed,
            "completed_at": camp.completed_at.isoformat() if camp.completed_at else None,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/api/notifications/campaigns/{campaign_id}/retry-failed")
def retry_failed_campaign_notifications(
    campaign_id: str,
    db: Session = Depends(get_db),
):
    """Retries ONLY failed channels/recipients without resending successful notifications."""
    try:
        camp = retry_failed_notifications(db=db, campaign_id=campaign_id)
        return {
            "status": camp.status,
            "campaign_id": camp.id,
            "emails_sent": camp.emails_sent,
            "emails_failed": camp.emails_failed,
            "sms_sent": camp.sms_sent,
            "sms_failed": camp.sms_failed,
        }
    except Exception as ex:
        raise HTTPException(status_code=400, detail=str(ex))


@router.post("/api/notifications/recipients/{recipient_id}/acknowledge")
def acknowledge_recipient(
    recipient_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Records chemist/hospital confirmation that stock has been physically quarantined."""
    by = payload.get("acknowledged_by") or "Hospital Pharmacy Supervisor"
    isolated = bool(payload.get("stock_isolated", True))
    qty = payload.get("stock_isolated_qty")
    notes = payload.get("notes") or payload.get("acknowledgement_notes")

    try:
        rcpt = record_human_acknowledgement(
            db=db,
            recipient_id=recipient_id,
            acknowledged_by=by,
            stock_isolated=isolated,
            stock_isolated_qty=qty,
            acknowledgement_notes=notes,
        )
        return {
            "status": "acknowledged",
            "recipient_id": rcpt.id,
            "customer_id": rcpt.customer_id,
            "acknowledged_at": rcpt.acknowledged_at.isoformat() if rcpt.acknowledged_at else None,
            "stock_isolated": rcpt.stock_isolated,
            "stock_isolated_qty": rcpt.stock_isolated_qty,
        }
    except Exception as ex:
        raise HTTPException(status_code=400, detail=str(ex))


@router.post("/api/notifications/webhook/delivery")
def delivery_receipt_webhook(
    payload: Dict[str, Any] = Body(...),
    channel: str = Query("sms"),
    db: Session = Depends(get_db),
):
    """Webhook callback endpoint for external telco / email provider delivery receipts."""
    provider_id = payload.get("provider_message_id") or payload.get("MessageSid") or payload.get("id")
    status = payload.get("status") or payload.get("MessageStatus") or "delivered"
    reason = payload.get("error") or payload.get("ErrorMessage")

    # Map external status words
    norm_status = "delivered" if status.lower() in ("delivered", "sent", "success", "read") else "failed"

    if not provider_id:
        return {"status": "ignored", "reason": "No provider_message_id found in webhook payload"}

    rcpt = process_delivery_webhook(
        db=db,
        provider_id=provider_id,
        channel=channel,
        delivery_status=norm_status,
        error_reason=reason,
    )
    if rcpt:
        return {"status": "processed", "recipient_id": rcpt.id, "channel": channel, "delivery_status": norm_status}
    return {"status": "unmatched_provider_id", "provider_id": provider_id}
