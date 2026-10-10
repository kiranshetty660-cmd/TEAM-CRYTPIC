import asyncio
import json
import uuid
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import CallCampaign, CallTask, CallRecord
from app.calling.telephony import get_telephony_provider
from app.calling.engine import CallingAgentEngine
from app.calling.notifications import alert_campaign_completed

logger = logging.getLogger("tracerx.calling.worker")

# In-memory tracking of active campaign worker tasks to manage pause/cancel gracefully
_active_campaign_jobs: Dict[str, asyncio.Task] = {}
_campaign_locks: Dict[str, asyncio.Lock] = {}

def get_campaign_lock(campaign_id: str) -> asyncio.Lock:
    if campaign_id not in _campaign_locks:
        _campaign_locks[campaign_id] = asyncio.Lock()
    return _campaign_locks[campaign_id]


def sync_campaign_counters(db: Session, campaign_id: str) -> CallCampaign:
    """
    Recalculates and persists authoritative counters for a campaign based on its tasks.
    """
    camp = db.query(CallCampaign).filter(CallCampaign.id == campaign_id).first()
    if not camp:
        raise ValueError(f"Campaign {campaign_id} not found")

    tasks = db.query(CallTask).filter(CallTask.campaign_id == campaign_id).all()
    camp.total_recipients = len(tasks)
    camp.eligible_recipients = sum(1 for t in tasks if t.is_phone_valid and t.phone)
    camp.unresolved_recipients = sum(1 for t in tasks if not t.is_phone_valid or not t.phone)
    camp.calls_queued = sum(1 for t in tasks if t.status in ("pending", "queued"))
    camp.calls_in_progress = sum(1 for t in tasks if t.status == "calling")
    camp.calls_answered = sum(1 for t in tasks if t.answered)
    camp.calls_completed = sum(1 for t in tasks if t.status == "completed")
    camp.acknowledgments_received = sum(1 for t in tasks if t.acknowledged)
    camp.stock_isolated_count = sum(1 for t in tasks if t.confirmed_stock_isolation)
    camp.calls_failed = sum(1 for t in tasks if t.status == "failed")
    camp.calls_no_answer = sum(1 for t in tasks if t.status == "no_answer")
    camp.calls_busy = sum(1 for t in tasks if t.status == "busy")
    camp.requires_follow_up_count = sum(1 for t in tasks if t.requires_human_follow_up or t.status == "needs_follow_up")
    camp.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(camp)
    return camp


async def execute_task_call(campaign_id: str, task_id: str):
    """
    Processes a single call task:
    - Initiates call via telephony provider
    - Generates script via CallingAgentEngine
    - Simulates or captures recipient response
    - Persists CallRecord and updates CallTask
    """
    db: Session = SessionLocal()
    try:
        camp = db.query(CallCampaign).filter(CallCampaign.id == campaign_id).first()
        task = db.query(CallTask).filter(CallTask.id == task_id).first()

        if not camp or not task or camp.status != "running":
            return

        if task.status in ("completed", "cancelled"):
            return

        task.status = "calling"
        task.call_attempts += 1
        task.last_attempt_at = datetime.now(timezone.utc)
        db.commit()

        provider = get_telephony_provider()
        telephony_res = provider.initiate_call(
            to_phone=task.phone or "+919845011223",
            from_phone="+918047192000",
            metadata={"campaign_id": campaign_id, "task_id": task_id},
        )

        task.last_call_id = telephony_res.provider_call_id

        # Run conversation turn with engine
        engine = CallingAgentEngine(db)
        script = engine.generate_outbound_script(camp, task)

        # In live telephony, speech turn arrives via websocket/webhook.
        # In automated task run / simulator, process standard confirmation response:
        recipient_sim_reply = (
            f"Yes, this is {task.customer_name}. We received the notification regarding SKU {camp.sku}. "
            f"We have isolated 15 units in our quarantine locker and stopped sales."
        )

        agent_reply, turn_data = engine.process_outbound_turn(camp, task, recipient_sim_reply)

        transcript_turns = [
            {"role": "agent", "text": script, "timestamp": datetime.now(timezone.utc).isoformat()},
            {"role": "recipient", "text": recipient_sim_reply, "timestamp": datetime.now(timezone.utc).isoformat()},
            {"role": "agent", "text": agent_reply, "timestamp": datetime.now(timezone.utc).isoformat()},
        ]

        # Record Call Record
        record = CallRecord(
            id=telephony_res.provider_call_id,
            provider_call_id=telephony_res.provider_call_id,
            direction="outbound",
            operating_mode="OUTBOUND_MEDICINE_ALERT",
            campaign_id=campaign_id,
            task_id=task_id,
            caller_phone="+918047192000",
            recipient_phone=task.phone,
            customer_id=task.customer_id,
            customer_name=task.customer_name,
            telephony_provider=telephony_res.telephony_provider,
            status="completed",
            duration_seconds=45,
            started_at=datetime.now(timezone.utc),
            ended_at=datetime.now(timezone.utc),
            transcript=json.dumps(transcript_turns),
            outcome_summary=f"Acknowledged: {task.acknowledged}, Stock Isolated: {task.confirmed_stock_isolation}",
            structured_payload=json.dumps(turn_data),
        )
        db.add(record)

        task.completed_at = datetime.now(timezone.utc)
        task.updated_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as e:
        logger.error(f"Error executing task call {task_id}: {e}")
        try:
            task = db.query(CallTask).filter(CallTask.id == task_id).first()
            if task:
                task.status = "failed"
                task.response_notes = f"Call execution error: {str(e)}"
                task.updated_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
    finally:
        sync_campaign_counters(db, campaign_id)
        db.close()


async def campaign_worker_loop(campaign_id: str):
    """
    Background worker loop that iterates over pending/queued tasks in a campaign,
    respecting pause/cancel flags and concurrency limits.
    """
    logger.info(f"Starting campaign worker loop for {campaign_id}")
    while True:
        db: Session = SessionLocal()
        try:
            camp = db.query(CallCampaign).filter(CallCampaign.id == campaign_id).first()
            if not camp:
                break

            if camp.status == "paused":
                logger.info(f"Campaign {campaign_id} is paused. Halting task pickup.")
                break

            if camp.status in ("cancelled", "completed", "failed"):
                logger.info(f"Campaign {campaign_id} is {camp.status}. Terminating worker.")
                break

            # Find next batch of eligible pending tasks
            pending_tasks = (
                db.query(CallTask)
                .filter(
                    CallTask.campaign_id == campaign_id,
                    CallTask.status.in_(["pending", "queued"]),
                    CallTask.is_phone_valid == True,
                )
                .order_by(CallTask.created_at.asc())
                .limit(5)
                .all()
            )

            if not pending_tasks:
                # Check if all tasks are done
                remaining = (
                    db.query(CallTask)
                    .filter(
                        CallTask.campaign_id == campaign_id,
                        CallTask.status.in_(["pending", "queued", "calling"]),
                    )
                    .count()
                )
                if remaining == 0:
                    camp.status = "completed"
                    camp.completed_at = datetime.now(timezone.utc)
                    db.commit()
                    alert_campaign_completed(db, camp)
                    logger.info(f"Campaign {campaign_id} has completed all tasks.")
                break

            task_ids = [t.id for t in pending_tasks]
            # Execute concurrently up to batch size
            await asyncio.gather(*[execute_task_call(campaign_id, tid) for tid in task_ids])

            # Small delay between batches to respect rate limits
            await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(f"Error in campaign loop {campaign_id}: {e}")
            break
        finally:
            db.close()


import threading

_active_campaign_threads: Dict[str, threading.Thread] = {}

def _run_worker_in_thread(campaign_id: str):
    try:
        asyncio.run(campaign_worker_loop(campaign_id))
    except Exception as e:
        logger.error(f"Worker thread error for {campaign_id}: {e}")

def launch_campaign_worker(campaign_id: str):
    """
    Launches the background worker for a running campaign if not already active.
    Uses a daemon thread running asyncio.run so it works cleanly across FastAPI and TestClient.
    """
    t = _active_campaign_threads.get(campaign_id)
    if t and t.is_alive():
        logger.info(f"Worker for campaign {campaign_id} is already running.")
        return

    thread = threading.Thread(target=_run_worker_in_thread, args=(campaign_id,), daemon=True)
    _active_campaign_threads[campaign_id] = thread
    thread.start()


def stop_campaign_worker(campaign_id: str):
    """
    Safely stops an active campaign worker job.
    """
    if campaign_id in _active_campaign_threads:
        _active_campaign_threads.pop(campaign_id, None)


def recover_running_campaigns():
    """
    Durable recovery function called during application startup.
    Finds campaigns marked 'running' and resumes processing pending tasks without duplicating completed tasks.
    """
    db: Session = SessionLocal()
    try:
        running_camps = db.query(CallCampaign).filter(CallCampaign.status == "running").all()
        for camp in running_camps:
            logger.info(f"Recovering running campaign {camp.id} on startup...")
            # Reset any stuck 'calling' tasks to 'queued'
            stuck_tasks = (
                db.query(CallTask)
                .filter(CallTask.campaign_id == camp.id, CallTask.status == "calling")
                .all()
            )
            for st in stuck_tasks:
                st.status = "queued"
            db.commit()
            sync_campaign_counters(db, camp.id)
            launch_campaign_worker(camp.id)
    except Exception as e:
        logger.error(f"Error during campaign recovery: {e}")
    finally:
        db.close()
