import re
import uuid
import threading
import time
from datetime import datetime, timezone, timedelta, date as dt_date
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import BatchInventory, Product, OwnerNotification
from app.config import settings
from app.ledger.chain import append_ledger_event
from app.notifications.email_service import get_email_provider
from app.notifications.sms_service import get_sms_provider

# In-memory persistent state for the 3-day notification schedule
_SCHEDULE_STATE: Dict[str, Any] = {
    "cadence_days": 3,
    "enabled": True,
    "admin_name": "Chethan (Warehouse Owner & Admin)",
    "admin_email": "chethuc809@gmail.com",
    "admin_phone": "+917996662516",
    "channels": ["in_app", "email", "sms"],
    "last_run_at": None,
    "next_run_due": None,
    "last_run_status": None,
    "last_result": None,
}

_SCHEDULER_THREAD_STARTED = False
_LOCK = threading.Lock()


def _ensure_schedule_initialized():
    with _LOCK:
        if _SCHEDULE_STATE["next_run_due"] is None:
            # Schedule next run in 3 days from now
            now = datetime.now(timezone.utc)
            _SCHEDULE_STATE["next_run_due"] = (now + timedelta(days=_SCHEDULE_STATE["cadence_days"])).isoformat()


def get_schedule_status(db: Session) -> Dict[str, Any]:
    """Returns the current 3-day expiry notification status and risk overview."""
    _ensure_schedule_initialized()
    today = settings.today
    ninety_days_future = today + timedelta(days=90)

    # Fast scan of current warehouse inventory
    products = {p.sku: p.brand or p.name for p in db.query(Product).all()}
    batches = db.query(BatchInventory).filter(
        BatchInventory.status == "active",
        BatchInventory.qty > 0
    ).all()

    expired_list = []
    near_expiry_list = []

    for b in batches:
        days_left = (b.expiry_date - today).days
        item = {
            "batch": b.batch,
            "sku": b.sku,
            "medicine_name": products.get(b.sku, b.sku),
            "warehouse": b.warehouse,
            "qty": b.qty,
            "expiry_date": b.expiry_date.isoformat(),
            "days_left": days_left,
        }
        if days_left <= 0:
            expired_list.append(item)
        elif days_left <= 90:
            near_expiry_list.append(item)

    return {
        "cadence_days": _SCHEDULE_STATE["cadence_days"],
        "enabled": _SCHEDULE_STATE["enabled"],
        "admin_name": _SCHEDULE_STATE["admin_name"],
        "admin_email": _SCHEDULE_STATE["admin_email"],
        "admin_phone": _SCHEDULE_STATE["admin_phone"],
        "channels": _SCHEDULE_STATE["channels"],
        "last_run_at": _SCHEDULE_STATE["last_run_at"],
        "next_run_due": _SCHEDULE_STATE["next_run_due"],
        "last_run_status": _SCHEDULE_STATE["last_run_status"],
        "last_result": _SCHEDULE_STATE["last_result"],
        "current_audit": {
            "today_configured": settings.TODAY_STR,
            "expired_batches_count": len(expired_list),
            "expired_total_units": sum(x["qty"] for x in expired_list),
            "near_expiry_batches_count": len(near_expiry_list),
            "near_expiry_total_units": sum(x["qty"] for x in near_expiry_list),
            "sample_expired": expired_list[:5],
            "sample_near_expiry": near_expiry_list[:5],
        }
    }


def update_schedule_config(
    cadence_days: Optional[int] = None,
    admin_email: Optional[str] = None,
    admin_phone: Optional[str] = None,
    enabled: Optional[bool] = None,
) -> Dict[str, Any]:
    with _LOCK:
        if cadence_days is not None and cadence_days > 0:
            _SCHEDULE_STATE["cadence_days"] = cadence_days
            now = datetime.now(timezone.utc)
            _SCHEDULE_STATE["next_run_due"] = (now + timedelta(days=cadence_days)).isoformat()
        if admin_email is not None and admin_email.strip():
            _SCHEDULE_STATE["admin_email"] = admin_email.strip()
        if admin_phone is not None and admin_phone.strip():
            _SCHEDULE_STATE["admin_phone"] = admin_phone.strip()
        if enabled is not None:
            _SCHEDULE_STATE["enabled"] = enabled

    db = SessionLocal()
    try:
        return get_schedule_status(db)
    finally:
        db.close()


def scan_and_notify_expiry(
    db: Session,
    force: bool = False,
    triggered_by: str = "Automated 3-Day Cadence Engine",
) -> Dict[str, Any]:
    """
    Scans all warehouse batches for expired and near-expiry medicines.
    Dispatches In-App OwnerNotification, live/simulated Email and SMS to admin,
    and records the event into the immutable audit ledger.
    """
    _ensure_schedule_initialized()
    today = settings.today
    now_utc = datetime.now(timezone.utc)

    products = {p.sku: p.brand or p.name for p in db.query(Product).all()}
    batches = db.query(BatchInventory).filter(
        BatchInventory.status == "active",
        BatchInventory.qty > 0
    ).all()

    expired_list = []
    near_expiry_list = []

    for b in batches:
        days_left = (b.expiry_date - today).days
        item = {
            "batch": b.batch,
            "sku": b.sku,
            "medicine_name": products.get(b.sku, b.sku),
            "warehouse": b.warehouse,
            "qty": b.qty,
            "expiry_date": b.expiry_date.isoformat(),
            "days_left": days_left,
        }
        if days_left <= 0:
            expired_list.append(item)
        elif days_left <= 90:
            near_expiry_list.append(item)

    expired_count = len(expired_list)
    near_expiry_count = len(near_expiry_list)
    total_expired_units = sum(x["qty"] for x in expired_list)
    total_near_units = sum(x["qty"] for x in near_expiry_list)

    ref_id = f"EXP-3DAY-{now_utc.strftime('%Y%m%d%H%M')}"
    notif_id = f"NOTIF-EXP-{uuid.uuid4().hex[:8].upper()}"

    # Build human-readable audit text
    lines = [
        f"Automated 3-Day Medicine Expiry Audit (Triggered by: {triggered_by})",
        f"Distribution Reference Date: {settings.TODAY_STR}",
        f"Summary: {expired_count} Expired Batches ({total_expired_units:,} units) | {near_expiry_count} Near-Expiry Batches ({total_near_units:,} units).",
        "",
    ]

    if expired_list:
        lines.append("CRITICAL: Expired Batches requiring immediate red-bin warehouse quarantine:")
        for exp in expired_list:
            lines.append(f"  • Batch {exp['batch']} ({exp['sku']} - {exp['medicine_name']}): {exp['qty']} units in {exp['warehouse']} [EXPIRED on {exp['expiry_date']}]")
        lines.append("")

    if near_expiry_list:
        lines.append("ACTION RECOMMENDED: Near-Expiry Batches (≤ 90 days shelf-life remaining):")
        for ne in near_expiry_list[:8]:
            lines.append(f"  • Batch {ne['batch']} ({ne['sku']} - {ne['medicine_name']}): {ne['qty']} units in {ne['warehouse']} [Expires in {ne['days_left']} days]")

    notification_body = "\n".join(lines)
    notification_title = (
        f"3-Day Expiry Alert: {expired_count} Expired Batches Detected"
        if expired_count > 0
        else f"3-Day Expiry Digest: {near_expiry_count} Near-Expiry Batches Monitored"
    )

    # 1. Create In-App OwnerNotification in Database
    owner_notif = OwnerNotification(
        id=notif_id,
        type="EXPIRY_CADENCE_ALERT",
        reference_id=ref_id,
        recipient=_SCHEDULE_STATE["admin_name"],
        channel="in_app,email,sms",
        title=notification_title,
        message=notification_body,
        urgency="critical" if expired_count > 0 else "high",
        status="delivered",
        delivery_attempts=1,
        escalated=expired_count > 0,
        created_at=now_utc,
        delivered_at=now_utc,
    )
    db.add(owner_notif)
    db.commit()

    # 2. Dispatch Email to Admin (chethuc809@gmail.com)
    email_prov = get_email_provider()
    email_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
  <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(15,23,42,0.06);">
    <div style="background-color: {'#b91c1c' if expired_count > 0 else '#0284c7'}; padding: 18px 24px; color: #ffffff;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.9;">TraceRx Arogya Pharma Automated 3-Day Expiry Monitor</div>
      <h1 style="margin: 4px 0 0; font-size: 18px; font-weight: 700;">{notification_title}</h1>
    </div>
    <div style="padding: 24px; line-height: 1.6; font-size: 13px;">
      <p style="margin-top: 0;">Dear {_SCHEDULE_STATE['admin_name']},</p>
      <p>This is your automated 3-day expiry audit report generated across warehouses (Bengaluru WH-1, Hubballi WH-2, Mysuru WH-3).</p>
      
      <div style="display: flex; gap: 12px; margin: 16px 0;">
        <div style="flex: 1; padding: 12px; border-radius: 8px; background-color: #fef2f2; border: 1px solid #fecaca;">
          <div style="font-size: 10px; font-weight: 700; color: #991b1b; text-transform: uppercase;">Expired Batches</div>
          <div style="font-size: 20px; font-weight: 800; color: #7f1d1d; margin-top: 2px;">{expired_count} ({total_expired_units:,} units)</div>
        </div>
        <div style="flex: 1; padding: 12px; border-radius: 8px; background-color: #fffbeb; border: 1px solid #fde68a;">
          <div style="font-size: 10px; font-weight: 700; color: #92400e; text-transform: uppercase;">Near-Expiry (≤90d)</div>
          <div style="font-size: 20px; font-weight: 800; color: #78350f; margin-top: 2px;">{near_expiry_count} ({total_near_units:,} units)</div>
        </div>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <pre style="margin: 0; font-family: monospace; font-size: 11px; white-space: pre-wrap; color: #334155;">{notification_body}</pre>
      </div>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
        This notification was automatically dispatched per your 3-day notification schedule. Reference ID: <strong>{ref_id}</strong>.
      </div>
    </div>
  </div>
</body>
</html>"""

    email_result = email_prov.send_email(
        to_email=_SCHEDULE_STATE["admin_email"],
        recipient_name=_SCHEDULE_STATE["admin_name"],
        subject=f"[TraceRx 3-Day Alert] {notification_title}",
        html_body=email_html,
        text_body=notification_body,
        incident_id=ref_id,
        campaign_id=notif_id,
    )

    # 3. Dispatch SMS to Admin (+917996662516)
    sms_prov = get_sms_provider()
    sms_text = (
        f"TraceRx 3-Day Expiry Alert: {expired_count} expired batches ({total_expired_units} units) "
        f"& {near_expiry_count} near-expiry batches detected. Immediate quarantine review required for Admin."
    )
    sms_result = sms_prov.send_sms(
        to_phone=_SCHEDULE_STATE["admin_phone"],
        recipient_name=_SCHEDULE_STATE["admin_name"],
        text=sms_text,
        incident_id=ref_id,
        campaign_id=notif_id,
    )

    # 4. Record to Audit Ledger for CDSCO / GMP Regulatory Compliance
    ledger_entry = append_ledger_event(
        db=db,
        event_type="EXPIRY_3DAY_ADMIN_ALERT",
        payload={
            "notification_id": notif_id,
            "reference_id": ref_id,
            "triggered_by": triggered_by,
            "admin_recipient": _SCHEDULE_STATE["admin_name"],
            "admin_email": _SCHEDULE_STATE["admin_email"],
            "admin_phone": _SCHEDULE_STATE["admin_phone"],
            "expired_batches_count": expired_count,
            "expired_total_units": total_expired_units,
            "near_expiry_batches_count": near_expiry_count,
            "near_expiry_total_units": total_near_units,
            "email_status": email_result.status,
            "sms_status": sms_result.status,
            "cadence_days": _SCHEDULE_STATE["cadence_days"],
        },
    )

    # 5. Advance next run schedule by 3 days
    with _LOCK:
        _SCHEDULE_STATE["last_run_at"] = now_utc.isoformat()
        _SCHEDULE_STATE["next_run_due"] = (now_utc + timedelta(days=_SCHEDULE_STATE["cadence_days"])).isoformat()
        _SCHEDULE_STATE["last_run_status"] = "delivered"
        _SCHEDULE_STATE["last_result"] = {
            "notification_id": notif_id,
            "reference_id": ref_id,
            "title": notification_title,
            "expired_count": expired_count,
            "expired_units": total_expired_units,
            "near_expiry_count": near_expiry_count,
            "near_expiry_units": total_near_units,
            "email_status": email_result.status,
            "sms_status": sms_result.status,
            "ledger_seq": ledger_entry.seq,
            "delivered_at": now_utc.isoformat(),
        }

    return {
        "success": True,
        "notification_id": notif_id,
        "reference_id": ref_id,
        "title": notification_title,
        "expired_batches_count": expired_count,
        "expired_total_units": total_expired_units,
        "near_expiry_batches_count": near_expiry_count,
        "near_expiry_total_units": total_near_units,
        "email_delivery": email_result.to_dict(),
        "sms_delivery": sms_result.to_dict(),
        "ledger_sequence": ledger_entry.seq,
        "next_scheduled_run": _SCHEDULE_STATE["next_run_due"],
        "message": f"Successfully audited warehouse stock and delivered 3-day expiry notification to admin ({_SCHEDULE_STATE['admin_email']} & {_SCHEDULE_STATE['admin_phone']}).",
    }


def _scheduler_background_loop():
    """Background worker that runs the 3-day automated audit when due."""
    while True:
        try:
            time.sleep(300)  # Check every 5 minutes
            if not _SCHEDULE_STATE.get("enabled", True):
                continue

            next_due_str = _SCHEDULE_STATE.get("next_run_due")
            if not next_due_str:
                continue

            next_due = datetime.fromisoformat(next_due_str.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)

            if now >= next_due:
                db = SessionLocal()
                try:
                    scan_and_notify_expiry(db, triggered_by="Automated 3-Day Background Cron")
                finally:
                    db.close()
        except Exception as e:
            print(f"[ExpiryScheduler] Background worker warning: {e}")


def start_scheduler_thread():
    """Starts the 3-day background cron daemon thread."""
    global _SCHEDULER_THREAD_STARTED
    with _LOCK:
        if not _SCHEDULER_THREAD_STARTED:
            _ensure_schedule_initialized()
            thread = threading.Thread(target=_scheduler_background_loop, daemon=True, name="Expiry3DayScheduler")
            thread.start()
            _SCHEDULER_THREAD_STARTED = True
