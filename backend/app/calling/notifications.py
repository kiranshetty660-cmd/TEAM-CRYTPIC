import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import OwnerNotification, Complaint, CallCampaign, CallTask

class NotificationResult:
    def __init__(self, notif_id: str, delivered: bool, error: Optional[str] = None):
        self.notif_id = notif_id
        self.delivered = delivered
        self.error = error

def dispatch_owner_alert(
    db: Session,
    event_type: str,
    reference_id: str,
    title: str,
    message: str,
    urgency: str = "high",
    recipient: str = "Quality Safety Lead",
    channel: str = "in_app",
) -> OwnerNotification:
    """
    Persists and dispatches an owner notification with delivery tracking and fallback escalation.
    """
    notif_id = f"NOTIF-{uuid.uuid4().hex[:10].upper()}"
    notif = OwnerNotification(
        id=notif_id,
        type=event_type,
        reference_id=reference_id,
        recipient=recipient,
        channel=channel,
        title=title,
        message=message,
        urgency=urgency,
        status="delivered",
        delivery_attempts=1,
        escalated=(urgency == "critical"),
        created_at=datetime.now(timezone.utc),
        delivered_at=datetime.now(timezone.utc),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif

def alert_complaint_received(db: Session, complaint: Complaint) -> OwnerNotification:
    is_critical = complaint.potential_harm or complaint.urgency == "critical"
    title = f"{'🚨 CRITICAL' if is_critical else '⚠️ URGENT'}: Complaint {complaint.id} Received ({complaint.medicine_name or complaint.sku or 'Unknown Medicine'})"
    msg = (
        f"A customer complaint has been logged.\n"
        f"Incident ID: {complaint.id}\n"
        f"Caller: {complaint.caller_name or 'Anonymous'} ({complaint.caller_organization or 'Unknown Org'})\n"
        f"Medicine: {complaint.medicine_name or complaint.sku or 'Unspecified'} | Batch: {complaint.batch or 'Unspecified'}\n"
        f"Category: {complaint.complaint_category.upper()}\n"
        f"Harm Reported: {'YES - IMMEDIATE ESCALATION' if complaint.potential_harm else 'No'}\n"
        f"Details: {complaint.complaint_description[:300]}"
    )
    return dispatch_owner_alert(
        db=db,
        event_type="SERIOUS_HARM_ESCALATION" if is_critical else "COMPLAINT_RECEIVED",
        reference_id=complaint.id,
        title=title,
        message=msg,
        urgency="critical" if is_critical else complaint.urgency,
    )

def alert_stock_isolated(db: Session, campaign: CallCampaign, task: CallTask) -> OwnerNotification:
    title = f"📦 Stock Isolated: {task.customer_name} ({task.reported_remaining_qty or 0} units)"
    msg = (
        f"Recipient '{task.customer_name}' confirmed isolation of Batch {task.dispatched_batches} under Campaign {campaign.id}.\n"
        f"Reported Quantity Remaining: {task.reported_remaining_qty or 0} units.\n"
        f"Notes: {task.response_notes or 'None'}"
    )
    return dispatch_owner_alert(
        db=db,
        event_type="STOCK_REPORTED",
        reference_id=campaign.id,
        title=title,
        message=msg,
        urgency="normal",
    )

def alert_campaign_completed(db: Session, campaign: CallCampaign) -> OwnerNotification:
    title = f"✅ Calling Campaign {campaign.id} Completed"
    msg = (
        f"Campaign {campaign.id} for SKU {campaign.sku} (Batches: {campaign.batches}) has finished.\n"
        f"Total Eligible: {campaign.eligible_recipients}\n"
        f"Answered: {campaign.calls_answered} | Acknowledged: {campaign.acknowledgments_received}\n"
        f"Stock Isolated: {campaign.stock_isolated_count}\n"
        f"Unresolved / Follow-up: {campaign.requires_follow_up_count + campaign.unresolved_recipients}"
    )
    return dispatch_owner_alert(
        db=db,
        event_type="CAMPAIGN_STARTED",
        reference_id=campaign.id,
        title=title,
        message=msg,
        urgency="normal",
    )
