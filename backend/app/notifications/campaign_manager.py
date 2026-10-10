import re
import json
import uuid
import hashlib
from datetime import datetime, timezone, date
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import (
    Customer,
    Dispatch,
    Product,
    Complaint,
    ComplaintEvent,
    NotificationCampaign,
    NotificationRecipient,
    Ledger,
)
from app.ledger.chain import append_ledger_event
from app.notifications.email_service import (
    get_email_provider,
    generate_recall_email_html,
    generate_recall_email_text,
)
from app.notifications.sms_service import (
    get_sms_provider,
    format_dlt_recall_sms,
    clean_and_validate_indian_phone,
)
from app.config import settings


AUTHORIZED_ROLES = {
    "Quality Safety Lead",
    "Warehouse Manager",
    "Compliance Officer",
    "Authorized Pharmacist",
    "Responsible Owner",
    "System Admin",
}


def sanitize_payload_for_audit(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitizes personal identifiable information (PII) before recording
    into the public/auditable cryptographic ledger.
    Customer phone numbers and email addresses are hashed or masked.
    """
    sanitized = {}
    for k, v in payload.items():
        if isinstance(v, dict):
            sanitized[k] = sanitize_payload_for_audit(v)
        elif isinstance(v, list):
            sanitized[k] = [
                sanitize_payload_for_audit(item) if isinstance(item, dict) else item
                for item in v
            ]
        elif k in ("phone", "caller_phone", "reporter_phone", "mobile"):
            if v:
                str_v = str(v)
                sanitized[k] = f"***-***-{str_v[-4:]}" if len(str_v) >= 4 else "***"
            else:
                sanitized[k] = None
        elif k in ("email", "caller_email", "reporter_email"):
            if v and "@" in str(v):
                parts = str(v).split("@")
                masked_user = parts[0][:2] + "***" if len(parts[0]) > 2 else "***"
                sanitized[k] = f"{masked_user}@{parts[1]}"
            else:
                sanitized[k] = None
        elif k in ("customer_name", "reporter_name", "caller_name"):
            if v:
                str_v = str(v)
                sanitized[k] = str_v[:3] + "***" if len(str_v) > 3 else "***"
            else:
                sanitized[k] = None
        else:
            sanitized[k] = v
    return sanitized


def is_valid_email_address(raw_email: Optional[str]) -> bool:
    """Validates email format strictly."""
    if not raw_email:
        return False
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", str(raw_email).strip()))


def resolve_affected_recipients(
    db: Session,
    sku: str,
    batch: str,
) -> List[Dict[str, Any]]:
    """
    Identifies all shops and hospitals that received the affected batch
    from official dispatch records.
    Matches recipients to registered email addresses and phone numbers.
    Flags missing or invalid contact details without fabricating data.
    """
    dispatches = (
        db.query(Dispatch)
        .filter(Dispatch.sku == sku, Dispatch.batch == batch)
        .order_by(Dispatch.date.desc())
        .all()
    )

    if not dispatches:
        return []

    # Aggregate dispatches per customer
    customer_agg: Dict[str, Dict[str, Any]] = {}
    for d in dispatches:
        cid = d.customer_id
        if cid not in customer_agg:
            customer_agg[cid] = {
                "customer_id": cid,
                "total_qty": 0,
                "dispatches_count": 0,
                "last_dispatch_date": d.date,
            }
        customer_agg[cid]["total_qty"] += d.qty
        customer_agg[cid]["dispatches_count"] += 1
        if d.date and (customer_agg[cid]["last_dispatch_date"] is None or d.date > customer_agg[cid]["last_dispatch_date"]):
            customer_agg[cid]["last_dispatch_date"] = d.date

    cust_ids = list(customer_agg.keys())
    customers = {c.customer_id: c for c in db.query(Customer).filter(Customer.customer_id.in_(cust_ids)).all()}

    recipients_result = []
    for cid, agg in customer_agg.items():
        cust = customers.get(cid)
        c_name = cust.name if cust else f"Customer {cid}"
        c_type = cust.type if cust else "chemist"
        c_loc = cust.location if cust else "Unknown"
        c_phone = cust.phone if cust else None
        c_email = cust.email if cust else None

        # Contact validation
        has_phone_valid, std_phone, phone_err = clean_and_validate_indian_phone(c_phone)
        has_email_valid = is_valid_email_address(c_email)

        # Missing contact classification
        if not has_email_valid and not has_phone_valid:
            missing_category = "missing_all"
        elif not has_email_valid:
            missing_category = "missing_email"
        elif not has_phone_valid:
            missing_category = "missing_phone"
        else:
            missing_category = "none"

        is_eligible = has_email_valid or has_phone_valid

        recipients_result.append({
            "customer_id": cid,
            "customer_name": c_name,
            "customer_type": c_type,
            "location": c_loc,
            "phone": std_phone if has_phone_valid else c_phone,
            "email": c_email,
            "is_phone_valid": has_phone_valid,
            "is_email_valid": has_email_valid,
            "missing_contacts": missing_category,
            "is_eligible": is_eligible,
            "phone_error": phone_err,
            "dispatched_qty": agg["total_qty"],
            "dispatches_count": agg["dispatches_count"],
            "last_dispatch_date": agg["last_dispatch_date"].isoformat() if agg["last_dispatch_date"] else None,
        })

    # Sort hospitals first, then largest dispatched quantity
    recipients_result.sort(key=lambda r: (0 if r["customer_type"] == "hospital" else 1, -r["dispatched_qty"]))
    return recipients_result


def create_notification_campaign(
    db: Session,
    incident_id: str,
    sku: str,
    batch: str,
    warehouse: Optional[str] = None,
    created_by: str = "Authorized Pharmacist",
    custom_instructions: Optional[str] = None,
) -> NotificationCampaign:
    """
    Creates a persistent notification campaign linked to an incident.
    Populates recipient records from dispatch history and stages initial templates.
    """
    incident = db.query(Complaint).filter(Complaint.id == incident_id).first()
    if not incident:
        raise ValueError(f"Incident with ID '{incident_id}' not found.")

    # Avoid duplicate active campaigns for same incident
    existing_campaign = db.query(NotificationCampaign).filter(
        NotificationCampaign.incident_id == incident_id,
        NotificationCampaign.status.in_(["draft", "pending_approval", "approved", "sending", "queued"]),
    ).first()
    if existing_campaign:
        return existing_campaign

    # Fetch product information
    product = db.query(Product).filter(Product.sku == sku).first()
    medicine_name = product.brand if product else (incident.medicine_name or sku)

    # Resolve recipients from dispatch records
    recipients = resolve_affected_recipients(db=db, sku=sku, batch=batch)

    # Initial proposed instructions
    instructions = custom_instructions or (
        "QUARANTINE IMMEDIATELY: Stop distribution, isolate all physical stock of this batch in designated quarantine area. "
        "Do not dispense to patients. Acknowledge receipt on the portal to confirm physical stock quarantine."
    )

    now = datetime.now(timezone.utc)
    campaign_id = f"CMPGN-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    # Generate initial templates
    email_subject = f"URGENT PHARMA RECALL: {sku} Batch {batch} - Quarantine Stock Immediately"
    email_html = generate_recall_email_html(
        incident_id=incident_id,
        sku=sku,
        batch=batch,
        medicine_name=medicine_name,
        instructions=instructions,
        warehouse=warehouse or incident.warehouse,
    )
    email_text = generate_recall_email_text(
        incident_id=incident_id,
        sku=sku,
        batch=batch,
        medicine_name=medicine_name,
        instructions=instructions,
        warehouse=warehouse or incident.warehouse,
    )
    sms_text = format_dlt_recall_sms(sku=sku, batch=batch, incident_id=incident_id)

    eligible_count = sum(1 for r in recipients if r["is_eligible"])
    missing_count = sum(1 for r in recipients if r["missing_contacts"] != "none")

    campaign = NotificationCampaign(
        id=campaign_id,
        incident_id=incident_id,
        sku=sku,
        batch=batch,
        warehouse=warehouse or incident.warehouse,
        title=f"Recall Notification: {sku} Batch {batch}",
        status="pending_approval",  # Requires human authorization
        email_subject=email_subject,
        email_body_html=email_html,
        email_body_text=email_text,
        sms_text=sms_text,
        created_by=created_by,
        total_recipients=len(recipients),
        eligible_recipients=eligible_count,
        missing_contact_count=missing_count,
        created_at=now,
        updated_at=now,
    )
    db.add(campaign)

    # Add recipient task records
    for r in recipients:
        rcpt = NotificationRecipient(
            id=f"NRCP-{uuid.uuid4().hex[:10].upper()}",
            campaign_id=campaign_id,
            customer_id=r["customer_id"],
            customer_name=r["customer_name"],
            customer_type=r["customer_type"],
            location=r["location"],
            phone=r["phone"],
            email=r["email"],
            is_phone_valid=r["is_phone_valid"],
            is_email_valid=r["is_email_valid"],
            missing_contacts=r["missing_contacts"],
            dispatched_qty=r["dispatched_qty"],
            dispatches_count=r["dispatches_count"],
            last_dispatch_date=date.fromisoformat(r["last_dispatch_date"]) if r["last_dispatch_date"] else None,
            email_status="pending" if r["is_email_valid"] else "not_applicable",
            sms_status="pending" if r["is_phone_valid"] else "not_applicable",
            email_error=None if r["is_email_valid"] else "No valid registered email address",
            sms_error=None if r["is_phone_valid"] else ("No valid phone: " + (r.get("phone_error") or "missing")),
            created_at=now,
            updated_at=now,
        )
        db.add(rcpt)

    # Link campaign to incident
    incident.campaign_id = campaign_id
    incident.affected_customers_summary = json.dumps([
        {"customer_id": r["customer_id"], "name": r["customer_name"], "qty": r["dispatched_qty"]}
        for r in recipients
    ])
    incident.updated_at = now

    db.commit()

    # Append to tamper-evident audit ledger
    audit_payload = sanitize_payload_for_audit({
        "action": "NOTIFICATION_CAMPAIGN_CREATED",
        "campaign_id": campaign_id,
        "incident_id": incident_id,
        "sku": sku,
        "batch": batch,
        "total_recipients": len(recipients),
        "eligible_recipients": eligible_count,
        "created_by": created_by,
    })
    append_ledger_event(db, "CAMPAIGN_CREATED", audit_payload)

    return campaign


def approve_notification_campaign(
    db: Session,
    campaign_id: str,
    approver_name: str,
    approver_role: str,
    approval_reason: str,
    edited_email_subject: Optional[str] = None,
    edited_email_body: Optional[str] = None,
    edited_sms_text: Optional[str] = None,
) -> NotificationCampaign:
    """
    Owner approval gate: authorizes dispatch of medicine recall notifications.
    Allows editing messages before authorization.
    Verifies qualified personnel authorization.
    """
    if approver_role not in AUTHORIZED_ROLES:
        raise PermissionError(
            f"Role '{approver_role}' is not authorized to approve recall notices. "
            f"Authorized roles: {', '.join(sorted(AUTHORIZED_ROLES))}"
        )

    if not approval_reason or not approval_reason.strip():
        raise ValueError("An approval reason is required for compliance audit integrity.")

    campaign = db.query(NotificationCampaign).filter(NotificationCampaign.id == campaign_id).first()
    if not campaign:
        raise ValueError(f"Campaign '{campaign_id}' not found.")

    if campaign.status == "approved":
        return campaign

    now = datetime.now(timezone.utc)

    # Apply any edits made by the approver
    if edited_email_subject:
        campaign.email_subject = edited_email_subject.strip()
    if edited_email_body:
        campaign.email_body_text = edited_email_body.strip()
        campaign.email_body_html = edited_email_body.strip()
    if edited_sms_text:
        campaign.sms_text = edited_sms_text.strip()

    campaign.status = "approved"
    campaign.approved_by = approver_name
    campaign.approval_role = approver_role
    campaign.approval_decision = "approved"
    campaign.approval_reason = approval_reason.strip()
    campaign.approved_at = now
    campaign.updated_at = now

    # Update linked complaint approval history
    incident = db.query(Complaint).filter(Complaint.id == campaign.incident_id).first()
    if incident:
        history = json.loads(incident.approval_history or "[]")
        history.append({
            "action": "APPROVED",
            "campaign_id": campaign_id,
            "approver": approver_name,
            "role": approver_role,
            "reason": approval_reason.strip(),
            "timestamp": now.isoformat(),
        })
        incident.approval_history = json.dumps(history)
        incident.investigation_status = "linked_to_incident"
        incident.updated_at = now

        db.add(ComplaintEvent(
            complaint_id=incident.id,
            event_type="APPROVED",
            actor=f"{approver_name} ({approver_role})",
            notes=f"Approved campaign {campaign_id}: {approval_reason.strip()}",
            timestamp=now,
        ))

    db.commit()

    # Append to audit ledger
    audit_payload = sanitize_payload_for_audit({
        "action": "CAMPAIGN_APPROVED",
        "campaign_id": campaign_id,
        "incident_id": campaign.incident_id,
        "sku": campaign.sku,
        "batch": campaign.batch,
        "approved_by": approver_name,
        "approval_role": approver_role,
        "reason": approval_reason,
    })
    append_ledger_event(db, "CAMPAIGN_APPROVED", audit_payload)

    return campaign


def reject_notification_campaign(
    db: Session,
    campaign_id: str,
    rejected_by: str,
    role: str,
    rejection_reason: str,
) -> NotificationCampaign:
    """Rejection gate: halts proposed recall campaign with reason."""
    if role not in AUTHORIZED_ROLES:
        raise PermissionError(f"Role '{role}' is not authorized to reject recall actions.")

    if not rejection_reason or not rejection_reason.strip():
        raise ValueError("A clear rejection reason must be provided.")

    campaign = db.query(NotificationCampaign).filter(NotificationCampaign.id == campaign_id).first()
    if not campaign:
        raise ValueError(f"Campaign '{campaign_id}' not found.")

    now = datetime.now(timezone.utc)
    campaign.status = "closed"
    campaign.approval_decision = "rejected"
    campaign.rejection_reason = rejection_reason.strip()
    campaign.updated_at = now

    # Update incident
    incident = db.query(Complaint).filter(Complaint.id == campaign.incident_id).first()
    if incident:
        history = json.loads(incident.approval_history or "[]")
        history.append({
            "action": "REJECTED",
            "campaign_id": campaign_id,
            "rejected_by": rejected_by,
            "role": role,
            "reason": rejection_reason.strip(),
            "timestamp": now.isoformat(),
        })
        incident.approval_history = json.dumps(history)
        incident.rejection_reason = rejection_reason.strip()
        incident.updated_at = now

        db.add(ComplaintEvent(
            complaint_id=incident.id,
            event_type="REJECTED",
            actor=f"{rejected_by} ({role})",
            notes=f"Rejected campaign {campaign_id}: {rejection_reason.strip()}",
            timestamp=now,
        ))

    db.commit()

    audit_payload = sanitize_payload_for_audit({
        "action": "CAMPAIGN_REJECTED",
        "campaign_id": campaign_id,
        "rejected_by": rejected_by,
        "role": role,
        "reason": rejection_reason,
    })
    append_ledger_event(db, "CAMPAIGN_REJECTED", audit_payload)

    return campaign


def escalate_notification_campaign(
    db: Session,
    campaign_id: str,
    escalated_by: str,
    escalate_to: str,
    escalation_reason: str,
) -> NotificationCampaign:
    """Escalates incident to designated compliance officer for urgent intervention."""
    campaign = db.query(NotificationCampaign).filter(NotificationCampaign.id == campaign_id).first()
    if not campaign:
        raise ValueError(f"Campaign '{campaign_id}' not found.")

    now = datetime.now(timezone.utc)
    campaign.is_escalated = True
    campaign.escalated_to = escalate_to
    campaign.escalated_at = now
    campaign.updated_at = now

    incident = db.query(Complaint).filter(Complaint.id == campaign.incident_id).first()
    if incident:
        incident.investigation_status = "escalated"
        incident.assigned_owner = escalate_to
        incident.updated_at = now
        db.add(ComplaintEvent(
            complaint_id=incident.id,
            event_type="ESCALATED",
            actor=escalated_by,
            notes=f"Escalated to {escalate_to}: {escalation_reason}",
            timestamp=now,
        ))

    db.commit()

    # Dispatch urgent escalation alert to owner / compliance admin
    try:
        email_prov = get_email_provider()
        target_email = escalate_to if (escalate_to and "@" in escalate_to) else settings.OWNER_ADMIN_EMAIL
        email_prov.send_email(
            to_email=target_email,
            recipient_name="TraceRx Owner / Compliance Lead",
            subject=f"URGENT ESCALATION: Batch {campaign.batch} Recall Campaign Requires Executive Action",
            html_body=(
                f"<h2>TraceRx Compliance Escalation</h2>"
                f"<p>Incident <strong>{campaign.incident_id}</strong> for Batch <strong>{campaign.batch}</strong> "
                f"({campaign.sku}) has been escalated by <strong>{escalated_by}</strong>.</p>"
                f"<p><strong>Escalation Reason:</strong> {escalation_reason}</p>"
                f"<p>Please access the TraceRx portal to review evidence and authorize actions.</p>"
            ),
            text_body=(
                f"TraceRx Compliance Escalation\n"
                f"Incident: {campaign.incident_id}\nBatch: {campaign.batch} ({campaign.sku})\n"
                f"Escalated by: {escalated_by}\nReason: {escalation_reason}\n"
            ),
            incident_id=campaign.incident_id,
            campaign_id=campaign.id,
        )
    except Exception:
        pass

    audit_payload = sanitize_payload_for_audit({
        "action": "CAMPAIGN_ESCALATED",
        "campaign_id": campaign_id,
        "escalated_by": escalated_by,
        "escalated_to": escalate_to,
        "reason": escalation_reason,
    })
    append_ledger_event(db, "CAMPAIGN_ESCALATED", audit_payload)

    return campaign


def dispatch_notification_campaign(
    db: Session,
    campaign_id: str,
    idempotency_key: Optional[str] = None,
) -> NotificationCampaign:
    """
    Executes email and SMS dispatch for an approved campaign.
    Enforces idempotency to prevent duplicate sends caused by repeated clicks.
    Tracks provider acceptance separately for Email and SMS per recipient.
    """
    campaign = db.query(NotificationCampaign).filter(NotificationCampaign.id == campaign_id).first()
    if not campaign:
        raise ValueError(f"Campaign '{campaign_id}' not found.")

    if campaign.status not in ("approved", "failed", "partially_sent"):
        if campaign.status in ("sending", "sent", "queued"):
            # Already in progress or sent - idempotently return current campaign
            return campaign
        raise ValueError(f"Campaign cannot be sent from status '{campaign.status}'. Must be 'approved'.")

    # Idempotency token check
    now = datetime.now(timezone.utc)
    key = idempotency_key or f"IDEMP-{campaign_id}-{now.strftime('%Y%m%d%H%M')}"
    if campaign.idempotency_key and campaign.idempotency_key == key and campaign.status in ("sending", "sent"):
        return campaign

    campaign.idempotency_key = key
    campaign.status = "sending"
    campaign.sent_at = now
    campaign.updated_at = now
    db.commit()

    email_provider = get_email_provider()
    sms_provider = get_sms_provider()

    recipients = db.query(NotificationRecipient).filter(NotificationRecipient.campaign_id == campaign_id).all()

    emails_sent = 0
    emails_failed = 0
    sms_sent = 0
    sms_failed = 0

    portal_base = settings.PORTAL_BASE_URL

    for rcpt in recipients:
        ack_url = f"{portal_base}/notifications?incident={campaign.incident_id}&rcpt={rcpt.id}"

        # 1. Email Dispatch
        if rcpt.is_email_valid and rcpt.email and rcpt.email_status in ("pending", "failed"):
            email_res = email_provider.send_email(
                to_email=rcpt.email,
                recipient_name=rcpt.customer_name,
                subject=campaign.email_subject,
                html_body=campaign.email_body_html,
                text_body=campaign.email_body_text,
                incident_id=campaign.incident_id,
                campaign_id=campaign.id,
            )
            rcpt.email_status = email_res.status
            rcpt.email_provider_id = email_res.provider_message_id
            rcpt.email_error = email_res.error_message
            rcpt.email_sent_at = now if email_res.status in ("queued", "sent") else None
            rcpt.updated_at = now

            if email_res.status in ("queued", "sent"):
                emails_sent += 1
            else:
                emails_failed += 1

        # 2. SMS Dispatch
        if rcpt.is_phone_valid and rcpt.phone and rcpt.sms_status in ("pending", "failed"):
            sms_text_formatted = format_dlt_recall_sms(
                sku=campaign.sku,
                batch=campaign.batch,
                incident_id=campaign.incident_id,
                portal_url=ack_url,
            )
            sms_res = sms_provider.send_sms(
                to_phone=rcpt.phone,
                recipient_name=rcpt.customer_name,
                text=sms_text_formatted,
                template_id=settings.SMS_DLT_TE_ID,
                incident_id=campaign.incident_id,
                campaign_id=campaign.id,
            )
            rcpt.sms_status = sms_res.status
            rcpt.sms_provider_id = sms_res.provider_message_id
            rcpt.sms_error = sms_res.error_message
            rcpt.sms_sent_at = now if sms_res.status in ("queued", "sent") else None
            rcpt.updated_at = now

            if sms_res.status in ("queued", "sent"):
                sms_sent += 1
            else:
                sms_failed += 1

    campaign.emails_sent = emails_sent
    campaign.emails_failed = emails_failed
    campaign.sms_sent = sms_sent
    campaign.sms_failed = sms_failed

    # Calculate overall campaign status
    total_eligible = campaign.eligible_recipients
    total_failures = emails_failed + sms_failed

    if total_failures == 0:
        campaign.status = "sent"
    elif emails_sent > 0 or sms_sent > 0:
        campaign.status = "partially_sent"
    else:
        campaign.status = "failed"

    campaign.completed_at = datetime.now(timezone.utc)
    campaign.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Append to audit ledger
    audit_payload = sanitize_payload_for_audit({
        "action": "CAMPAIGN_DISPATCHED",
        "campaign_id": campaign.id,
        "incident_id": campaign.incident_id,
        "status": campaign.status,
        "emails_sent": emails_sent,
        "emails_failed": emails_failed,
        "sms_sent": sms_sent,
        "sms_failed": sms_failed,
    })
    append_ledger_event(db, "CAMPAIGN_DISPATCHED", audit_payload)

    return campaign


def retry_failed_notifications(
    db: Session,
    campaign_id: str,
) -> NotificationCampaign:
    """
    Retries failed notifications for a campaign without resending to already
    successful channels or recipients.
    """
    campaign = db.query(NotificationCampaign).filter(NotificationCampaign.id == campaign_id).first()
    if not campaign:
        raise ValueError(f"Campaign '{campaign_id}' not found.")

    failed_recipients = (
        db.query(NotificationRecipient)
        .filter(
            NotificationRecipient.campaign_id == campaign_id,
            (NotificationRecipient.email_status == "failed") | (NotificationRecipient.sms_status == "failed"),
        )
        .all()
    )

    if not failed_recipients:
        return campaign

    now = datetime.now(timezone.utc)
    email_provider = get_email_provider()
    sms_provider = get_sms_provider()

    for rcpt in failed_recipients:
        ack_url = f"{settings.PORTAL_BASE_URL}/notifications?incident={campaign.incident_id}&rcpt={rcpt.id}"

        # Retry Email only if it was failed and email is valid
        if rcpt.email_status == "failed" and rcpt.is_email_valid and rcpt.email:
            rcpt.email_retries += 1
            res = email_provider.send_email(
                to_email=rcpt.email,
                recipient_name=rcpt.customer_name,
                subject=campaign.email_subject,
                html_body=campaign.email_body_html,
                text_body=campaign.email_body_text,
                incident_id=campaign.incident_id,
                campaign_id=campaign.id,
            )
            rcpt.email_status = res.status
            rcpt.email_provider_id = res.provider_message_id
            rcpt.email_error = res.error_message
            if res.status in ("queued", "sent"):
                rcpt.email_sent_at = now
                campaign.emails_sent += 1
                campaign.emails_failed = max(0, campaign.emails_failed - 1)
            rcpt.updated_at = now

        # Retry SMS only if it was failed and phone is valid
        if rcpt.sms_status == "failed" and rcpt.is_phone_valid and rcpt.phone:
            rcpt.sms_retries += 1
            sms_text_formatted = format_dlt_recall_sms(
                sku=campaign.sku,
                batch=campaign.batch,
                incident_id=campaign.incident_id,
                portal_url=ack_url,
            )
            res = sms_provider.send_sms(
                to_phone=rcpt.phone,
                recipient_name=rcpt.customer_name,
                text=sms_text_formatted,
                template_id=settings.SMS_DLT_TE_ID,
                incident_id=campaign.incident_id,
                campaign_id=campaign.id,
            )
            rcpt.sms_status = res.status
            rcpt.sms_provider_id = res.provider_message_id
            rcpt.sms_error = res.error_message
            if res.status in ("queued", "sent"):
                rcpt.sms_sent_at = now
                campaign.sms_sent += 1
                campaign.sms_failed = max(0, campaign.sms_failed - 1)
            rcpt.updated_at = now

    # Recalculate campaign status
    still_failed = (
        db.query(NotificationRecipient)
        .filter(
            NotificationRecipient.campaign_id == campaign_id,
            (NotificationRecipient.email_status == "failed") | (NotificationRecipient.sms_status == "failed"),
        )
        .count()
    )

    campaign.status = "sent" if still_failed == 0 else "partially_sent"
    campaign.updated_at = now
    db.commit()

    audit_payload = sanitize_payload_for_audit({
        "action": "CAMPAIGN_RETRIED",
        "campaign_id": campaign.id,
        "retried_recipients_count": len(failed_recipients),
        "new_status": campaign.status,
    })
    append_ledger_event(db, "CAMPAIGN_RETRIED", audit_payload)

    return campaign


def record_human_acknowledgement(
    db: Session,
    recipient_id: str,
    acknowledged_by: str,
    stock_isolated: bool = True,
    stock_isolated_qty: Optional[int] = None,
    acknowledgement_notes: Optional[str] = None,
) -> NotificationRecipient:
    """
    Records customer/chemist confirmation that the recall notice was received
    and stock has been physically quarantined.
    """
    rcpt = db.query(NotificationRecipient).filter(NotificationRecipient.id == recipient_id).first()
    if not rcpt:
        raise ValueError(f"Recipient record '{recipient_id}' not found.")

    now = datetime.now(timezone.utc)
    was_already_ack = rcpt.acknowledged

    rcpt.acknowledged = True
    rcpt.acknowledged_at = now
    rcpt.acknowledged_by = acknowledged_by
    rcpt.stock_isolated = stock_isolated
    rcpt.stock_isolated_qty = stock_isolated_qty or rcpt.dispatched_qty
    rcpt.acknowledgement_notes = acknowledgement_notes
    rcpt.updated_at = now

    campaign = db.query(NotificationCampaign).filter(NotificationCampaign.id == rcpt.campaign_id).first()
    if campaign and not was_already_ack:
        campaign.acknowledged_count += 1
        if stock_isolated:
            campaign.stock_isolated_count += 1
        campaign.updated_at = now

    db.commit()

    audit_payload = sanitize_payload_for_audit({
        "action": "RECIPIENT_ACKNOWLEDGED",
        "recipient_id": recipient_id,
        "customer_id": rcpt.customer_id,
        "acknowledged_by": acknowledged_by,
        "stock_isolated": stock_isolated,
        "stock_isolated_qty": stock_isolated_qty,
    })
    append_ledger_event(db, "RECIPIENT_ACKNOWLEDGED", audit_payload)

    return rcpt


def process_delivery_webhook(
    db: Session,
    provider_id: str,
    channel: str,  # 'email' or 'sms'
    delivery_status: str,  # 'delivered' or 'failed'
    error_reason: Optional[str] = None,
) -> Optional[NotificationRecipient]:
    """
    Processes verified delivery confirmation callbacks from external telco/email gateways.
    Status only flips to 'delivered' when external provider confirms.
    """
    now = datetime.now(timezone.utc)
    if channel.lower() == "email":
        rcpt = db.query(NotificationRecipient).filter(NotificationRecipient.email_provider_id == provider_id).first()
        if not rcpt:
            return None
        rcpt.email_status = delivery_status
        if delivery_status == "delivered":
            rcpt.email_delivered_at = now
        elif delivery_status == "failed" and error_reason:
            rcpt.email_error = error_reason
        rcpt.updated_at = now
    else:
        rcpt = db.query(NotificationRecipient).filter(NotificationRecipient.sms_provider_id == provider_id).first()
        if not rcpt:
            return None
        rcpt.sms_status = delivery_status
        if delivery_status == "delivered":
            rcpt.sms_delivered_at = now
        elif delivery_status == "failed" and error_reason:
            rcpt.sms_error = error_reason
        rcpt.updated_at = now

    # Update campaign statistics
    campaign = db.query(NotificationCampaign).filter(NotificationCampaign.id == rcpt.campaign_id).first()
    if campaign:
        if channel.lower() == "email" and delivery_status == "delivered":
            campaign.emails_delivered += 1
        elif channel.lower() == "sms" and delivery_status == "delivered":
            campaign.sms_delivered += 1
        campaign.updated_at = now

    db.commit()
    return rcpt
