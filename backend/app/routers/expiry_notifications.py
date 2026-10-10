from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional

from app.db import get_db
from app.services.expiry_scheduler import (
    get_schedule_status,
    scan_and_notify_expiry,
    update_schedule_config,
)

router = APIRouter(prefix="/api/inventory", tags=["Expiry Notifications"])


class ExpiryScheduleConfigUpdate(BaseModel):
    cadence_days: Optional[int] = Field(default=None, ge=1, le=30)
    admin_email: Optional[str] = None
    admin_phone: Optional[str] = None
    enabled: Optional[bool] = None


@router.get("/expiry-schedule")
def get_expiry_schedule_status_endpoint(db: Session = Depends(get_db)):
    """
    Returns the automated 3-day medicine expiry notification schedule status,
    configured admin contacts, last execution time, and current warehouse expiry risk summary.
    """
    return get_schedule_status(db)


@router.post("/expiry-schedule/trigger")
def trigger_expiry_notification_endpoint(db: Session = Depends(get_db)):
    """
    Triggers an immediate 3-day expiry audit and sends multi-channel notification
    (In-App, Email to chethuc809@gmail.com, and SMS to +917996662516),
    logging the event directly to the audit ledger.
    """
    result = scan_and_notify_expiry(db, force=True, triggered_by="Admin Manual Trigger (Inventory Radar)")
    return result


@router.post("/expiry-schedule/config")
def update_expiry_schedule_config_endpoint(
    config: ExpiryScheduleConfigUpdate,
    db: Session = Depends(get_db),
):
    """
    Updates the automated expiry notification configuration (cadence, recipient, enabled status).
    """
    updated = update_schedule_config(
        cadence_days=config.cadence_days,
        admin_email=config.admin_email,
        admin_phone=config.admin_phone,
        enabled=config.enabled,
    )
    return updated
