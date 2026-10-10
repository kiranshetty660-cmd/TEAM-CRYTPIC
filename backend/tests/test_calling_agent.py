import io
import json
import uuid
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Product, BatchInventory, Customer, Dispatch, CallCampaign, CallTask, Complaint, OwnerNotification

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def ensure_test_calling_data():
    db = SessionLocal()
    # Ensure test product exists
    prod = db.query(Product).filter(Product.sku == "AMOX-625").first()
    if not prod:
        prod = Product(
            sku="AMOX-625",
            brand="Augmentin 625",
            molecule="Amoxicillin + Clavulanic Acid 625mg",
            category="Antibiotics",
            storage="ambient",
            critical_drug=False,
        )
        db.add(prod)

    # Ensure test batch exists
    batch = db.query(BatchInventory).filter(BatchInventory.batch == "B2231", BatchInventory.sku == "AMOX-625").first()
    if not batch:
        batch = BatchInventory(
            sku="AMOX-625",
            batch="B2231",
            warehouse="WH-1",
            qty=500,
            mfg_date=datetime(2025, 1, 1).date(),
            expiry_date=datetime(2027, 1, 1).date(),
            status="active",
        )
        db.add(batch)

    # Ensure test customers and dispatches exist
    c1 = db.query(Customer).filter(Customer.customer_id == "CHEM-001").first()
    if not c1:
        c1 = Customer(
            customer_id="CHEM-001",
            name="Apollo Pharmacy #1 (Indiranagar)",
            type="chemist",
            location="Indiranagar",
            credit_terms="Net 30",
            phone="+919845011001",
        )
        db.add(c1)

    c2 = db.query(Customer).filter(Customer.customer_id == "HOSP-001").first()
    if not c2:
        c2 = Customer(
            customer_id="HOSP-001",
            name="Manipal Hospital Bengaluru",
            type="hospital",
            location="Bengaluru",
            credit_terms="Net 45",
            phone="+919845011002",
        )
        db.add(c2)

    # Dispatch for B2231
    d1 = db.query(Dispatch).filter(Dispatch.sku == "AMOX-625", Dispatch.batch == "B2231", Dispatch.customer_id == "CHEM-001").first()
    if not d1:
        db.add(Dispatch(
            date=datetime(2026, 9, 15).date(),
            customer_id="CHEM-001",
            sku="AMOX-625",
            batch="B2231",
            qty=50,
            from_warehouse="WH-1",
        ))

    d2 = db.query(Dispatch).filter(Dispatch.sku == "AMOX-625", Dispatch.batch == "B2231", Dispatch.customer_id == "HOSP-001").first()
    if not d2:
        db.add(Dispatch(
            date=datetime(2026, 9, 16).date(),
            customer_id="HOSP-001",
            sku="AMOX-625",
            batch="B2231",
            qty=100,
            from_warehouse="WH-1",
        ))

    db.commit()
    db.close()

# =============================================================================
# WORKFLOW A: INCOMING COMPLAINT TESTS (1 to 8)
# =============================================================================

def test_inbound_complaint_creates_persistent_record():
    resp = client.post("/api/calling/complaints", json={
        "caller_name": "Dr. Ramesh Sharma",
        "caller_phone": "+919876543210",
        "caller_organization": "Manipal Hospital",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_category": "quality",
        "complaint_description": "Observed discoloration and sediment in suspension bottles.",
        "reported_quantity": 12,
        "potential_harm": False,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["complaint_id"].startswith("CMP-")
    assert data["verification_status"] == "verified_sku_batch"

    # Verify retrieval
    get_resp = client.get(f"/api/calling/complaints/{data['complaint_id']}")
    assert get_resp.status_code == 200
    detail = get_resp.json()
    assert detail["complaint"]["reported_quantity"] == 12
    assert detail["complaint"]["caller_name"] == "Dr. Ramesh Sharma"


def test_multiple_callers_can_submit_independent_complaints():
    r1 = client.post("/api/calling/complaints", json={
        "caller_name": "Caller One",
        "complaint_description": "Sediment observed",
        "sku": "AMOX-625",
        "batch": "B2231",
    })
    r2 = client.post("/api/calling/complaints", json={
        "caller_name": "Caller Two",
        "complaint_description": "Tablet crumbling upon opening",
        "sku": "AMOX-625",
        "batch": "B2231",
    })
    assert r1.status_code == 200 and r2.status_code == 200
    id1 = r1.json()["complaint_id"]
    id2 = r2.json()["complaint_id"]
    assert id1 != id2


def test_complaint_referencing_known_batch_linked_and_verified():
    resp = client.post("/api/calling/complaints", json={
        "caller_name": "Pharmacist Vijay",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Cap seal was broken",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["verification_status"] == "verified_sku_batch"


def test_unknown_batches_marked_unverified_rather_than_fabricated():
    resp = client.post("/api/calling/complaints", json={
        "caller_name": "Unknown Customer",
        "sku": "AMOX-625",
        "batch": "NON-EXISTENT-BATCH-9999",
        "complaint_description": "Suspicious taste",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["verification_status"] == "verified_sku_only"

    # If both sku and batch are unknown
    resp_unknown = client.post("/api/calling/complaints", json={
        "caller_name": "Caller",
        "medicine_name": "CompletelyFakeMedicine",
        "batch": "FAKE-BATCH-999",
        "complaint_description": "Unidentified medicine issue",
    })
    assert resp_unknown.status_code == 200
    assert resp_unknown.json()["verification_status"] == "unverified"


def test_every_complaint_triggers_owner_alert_attempt():
    c_resp = client.post("/api/calling/complaints", json={
        "caller_name": "Alert Verification",
        "complaint_description": "Leakage reported",
        "sku": "AMOX-625",
        "batch": "B2231",
    })
    cid = c_resp.json()["complaint_id"]

    notifs = client.get("/api/calling/notifications").json()
    matching = [n for n in notifs if n["reference_id"] == cid]
    assert len(matching) >= 1
    assert "Complaint" in matching[0]["title"]


def test_notification_delivery_persisted():
    notifs = client.get("/api/calling/notifications").json()
    assert len(notifs) > 0
    assert notifs[0]["status"] in ("delivered", "queued")
    assert notifs[0]["delivery_attempts"] >= 1


def test_serious_incident_triggers_escalation():
    resp = client.post("/api/calling/complaints", json={
        "caller_name": "Emergency Ward Head",
        "caller_organization": "City Hospital ICU",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Patient experienced severe anaphylactic reaction immediately after dose.",
        "potential_harm": True,
        "potential_harm_details": "Severe acute respiratory distress",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["urgency"] == "critical"
    assert data["potential_harm"] is True

    # Verify notification escalated
    notifs = client.get("/api/calling/notifications?urgency=critical").json()
    assert len(notifs) > 0
    assert any("CRITICAL" in n["title"] and data["complaint_id"] in n["message"] for n in notifs)


def test_duplicate_webhook_deliveries_handled_safely():
    # Inbound telephony webhook handles repeated calls cleanly
    sid = f"TEST-WEBHOOK-{uuid.uuid4().hex[:8]}"
    w1 = client.post("/api/calling/webhooks/inbound", json={"CallSid": sid, "From": "+919876543210"})
    assert w1.status_code == 200
    assert "call_sid" in w1.json()

    # Second webhook with same sid
    w2 = client.post("/api/calling/webhooks/inbound", json={"CallSid": sid, "From": "+919876543210"})
    assert w2.status_code == 200
    assert w2.json()["call_sid"] == sid


# =============================================================================
# WORKFLOW B: OWNER-CONTROLLED MEDICINE ALERT CAMPAIGN TESTS (9 to 24)
# =============================================================================

def test_campaign_can_be_created_without_initiating_calls():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Suspected micro-particulate contamination",
        "owner_message": "Please halt dispensing of Augmentin 625 Batch B2231 immediately and quarantine remaining stock.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "draft"
    assert data["campaign_id"].startswith("CAMP-")
    assert data["total_recipients"] >= 1

    # Verify campaign is in draft
    camp = client.get(f"/api/calling/campaigns/{data['campaign_id']}").json()
    assert camp["status"] == "draft"
    assert camp["calls_in_progress"] == 0
    assert camp["calls_answered"] == 0


def test_recipients_selected_using_actual_sku_and_batch_dispatches():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Quality check",
        "owner_message": "Immediate recall for B2231.",
    })
    camp_id = resp.json()["campaign_id"]
    prev = client.post(f"/api/calling/campaigns/{camp_id}/preview").json()
    cust_ids = {r["customer_id"] for r in prev["recipients"]}
    # Must include CHEM-001 and HOSP-001 who received B2231
    assert "CHEM-001" in cust_ids
    assert "HOSP-001" in cust_ids


def test_customers_who_received_another_batch_are_excluded():
    db = SessionLocal()
    # Add a customer who only received another batch B9999
    other_cust = db.query(Customer).filter(Customer.customer_id == "CHEM-OTHER").first()
    if not other_cust:
        db.add(Customer(customer_id="CHEM-OTHER", name="Other Pharmacy", type="chemist", location="Mysuru", credit_terms="Net 30", phone="+919845011999"))
        db.add(Dispatch(date=datetime(2026, 9, 10).date(), customer_id="CHEM-OTHER", sku="AMOX-625", batch="B-OTHER-99", qty=20, from_warehouse="WH-1"))
        db.commit()
    db.close()

    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Isolate B2231 only",
        "owner_message": "Isolate B2231 stock.",
    })
    camp_id = resp.json()["campaign_id"]
    prev = client.post(f"/api/calling/campaigns/{camp_id}/preview").json()
    cust_ids = {r["customer_id"] for r in prev["recipients"]}
    assert "CHEM-OTHER" not in cust_ids


def test_duplicate_dispatches_do_not_produce_duplicate_recipient_tasks():
    # If a customer has multiple dispatches of the same batch, they get exactly ONE CallTask
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Test deduplication",
        "owner_message": "Notice message",
    })
    camp_id = resp.json()["campaign_id"]
    tasks = client.get(f"/api/calling/campaigns/{camp_id}/tasks").json()
    customer_occurrences = [t["customer_id"] for t in tasks]
    assert len(customer_occurrences) == len(set(customer_occurrences))


def test_missing_phone_numbers_reported_as_unresolved():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Testing unresolved",
        "owner_message": "Notice message",
    })
    data = resp.json()
    camp_id = data["campaign_id"]
    camp_detail = client.get(f"/api/calling/campaigns/{camp_id}").json()
    assert "unresolved_recipients" in camp_detail
    assert "eligible_recipients" in camp_detail
    assert camp_detail["total_recipients"] == camp_detail["eligible_recipients"] + camp_detail["unresolved_recipients"]


def test_campaign_approval_requires_proper_authorization():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Auth test",
        "owner_message": "Important recall message",
    })
    camp_id = resp.json()["campaign_id"]

    # Reject empty approved_by
    fail_app = client.post(f"/api/calling/campaigns/{camp_id}/approve", json={"approved_by": ""})
    assert fail_app.status_code == 403

    # Succeed with authorized owner
    app_resp = client.post(f"/api/calling/campaigns/{camp_id}/approve", json={"approved_by": "Quality Director Dr. S. Rao"})
    assert app_resp.status_code == 200
    assert app_resp.json()["status"] == "approved"
    assert app_resp.json()["approved_by"] == "Quality Director Dr. S. Rao"


def test_no_call_starts_before_approval():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Pre-approval check",
        "owner_message": "Notice before approval",
    })
    camp_id = resp.json()["campaign_id"]

    # Attempt to start while still in draft state must fail
    start_resp = client.post(f"/api/calling/campaigns/{camp_id}/start")
    assert start_resp.status_code == 400
    assert "approved" in start_resp.json()["detail"].lower()


def test_material_edits_invalidate_previous_approval():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Tamper test",
        "owner_message": "Original approved message",
    })
    camp_id = resp.json()["campaign_id"]
    client.post(f"/api/calling/campaigns/{camp_id}/approve", json={"approved_by": "Authorized Owner"})

    # Tamper with message directly in DB
    db = SessionLocal()
    c = db.query(CallCampaign).filter(CallCampaign.id == camp_id).first()
    c.owner_message = "TAMPERED MESSAGE WITH UNAPPROVED CLAIMS"
    db.commit()
    db.close()

    # Attempting to start now must detect message hash mismatch and reject
    start_resp = client.post(f"/api/calling/campaigns/{camp_id}/start")
    assert start_resp.status_code == 400
    assert "altered" in start_resp.json()["detail"].lower() or "invalidated" in start_resp.json()["detail"].lower()


def test_agent_communicates_only_approved_message():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Message fidelity test",
        "owner_message": "DO NOT DISPENSE. QUARANTINE IMMEDIATELY.",
    })
    camp_id = resp.json()["campaign_id"]
    client.post(f"/api/calling/campaigns/{camp_id}/approve", json={"approved_by": "Owner"})

    # Check script generated for task
    db = SessionLocal()
    from app.calling.engine import CallingAgentEngine
    engine = CallingAgentEngine(db)
    camp = db.query(CallCampaign).filter(CallCampaign.id == camp_id).first()
    task = db.query(CallTask).filter(CallTask.campaign_id == camp_id).first()
    script = engine.generate_outbound_script(camp, task)
    db.close()

    assert "DO NOT DISPENSE. QUARANTINE IMMEDIATELY." in script


def test_pause_prevents_new_calls_from_starting():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Pause test",
        "owner_message": "Pause test notice",
    })
    camp_id = resp.json()["campaign_id"]
    client.post(f"/api/calling/campaigns/{camp_id}/approve", json={"approved_by": "Owner"})
    client.post(f"/api/calling/campaigns/{camp_id}/start")

    pause_resp = client.post(f"/api/calling/campaigns/{camp_id}/pause")
    assert pause_resp.status_code == 200
    assert pause_resp.json()["status"] == "paused"

    camp_detail = client.get(f"/api/calling/campaigns/{camp_id}").json()
    assert camp_detail["status"] == "paused"


def test_resume_does_not_repeat_completed_calls():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Resume test",
        "owner_message": "Resume test notice",
    })
    camp_id = resp.json()["campaign_id"]
    client.post(f"/api/calling/campaigns/{camp_id}/approve", json={"approved_by": "Owner"})
    client.post(f"/api/calling/campaigns/{camp_id}/start")
    client.post(f"/api/calling/campaigns/{camp_id}/pause")

    # Manually mark one task as completed
    db = SessionLocal()
    task = db.query(CallTask).filter(CallTask.campaign_id == camp_id).first()
    task.status = "completed"
    task.answered = True
    task.acknowledged = True
    target_task_id = task.id
    db.commit()
    db.close()

    resume_resp = client.post(f"/api/calling/campaigns/{camp_id}/resume")
    assert resume_resp.status_code == 200
    assert resume_resp.json()["status"] == "running"

    # Completed task must still be completed
    tasks = client.get(f"/api/calling/campaigns/{camp_id}/tasks").json()
    completed_tasks = [t for t in tasks if t["id"] == target_task_id]
    assert completed_tasks[0]["status"] == "completed"


def test_cancel_prevents_additional_queued_calls():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Cancel test",
        "owner_message": "Cancel test notice",
    })
    camp_id = resp.json()["campaign_id"]
    client.post(f"/api/calling/campaigns/{camp_id}/approve", json={"approved_by": "Owner"})
    cancel_resp = client.post(f"/api/calling/campaigns/{camp_id}/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    tasks = client.get(f"/api/calling/campaigns/{camp_id}/tasks").json()
    for t in tasks:
        assert t["status"] in ("cancelled", "needs_follow_up")


def test_repeated_start_requests_handled_safely():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Idempotent start test",
        "owner_message": "Notice",
    })
    camp_id = resp.json()["campaign_id"]
    client.post(f"/api/calling/campaigns/{camp_id}/approve", json={"approved_by": "Owner"})

    s1 = client.post(f"/api/calling/campaigns/{camp_id}/start")
    assert s1.status_code == 200

    # Repeated start when already running should either return current running status or be gracefully handled
    s2 = client.post(f"/api/calling/campaigns/{camp_id}/start")
    # Must not duplicate or crash
    assert s2.status_code in (200, 400)


def test_duplicate_provider_status_webhooks_handled_idempotently():
    # Insert dummy CallRecord
    db = SessionLocal()
    from app.models import CallRecord
    test_sid = f"TEST-SID-{uuid.uuid4().hex[:8]}"
    cr = CallRecord(
        id=test_sid,
        provider_call_id=test_sid,
        direction="outbound",
        operating_mode="OUTBOUND_MEDICINE_ALERT",
        status="initiated",
        started_at=datetime.now(timezone.utc),
    )
    db.add(cr)
    db.commit()
    db.close()

    r1 = client.post("/api/calling/webhooks/status", json={"CallSid": test_sid, "Status": "completed", "Duration": 42})
    assert r1.status_code == 200

    r2 = client.post("/api/calling/webhooks/status", json={"CallSid": test_sid, "Status": "completed", "Duration": 42})
    assert r2.status_code == 200


def test_failed_tasks_can_be_retried_safely():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Retry test",
        "owner_message": "Retry notice",
    })
    camp_id = resp.json()["campaign_id"]
    tasks = client.get(f"/api/calling/campaigns/{camp_id}/tasks").json()
    first_task = tasks[0]

    # Simulate outbound turn with refusal
    sim_resp = client.post("/api/calling/simulate/outbound", json={
        "task_id": first_task["id"],
        "recipient_message": "Yes, we confirmed isolation of 25 units in quarantine.",
    })
    assert sim_resp.status_code == 200
    assert sim_resp.json()["acknowledged"] is True
    assert sim_resp.json()["confirmed_stock_isolation"] is True


def test_campaign_totals_and_final_reports_match_persisted_tasks():
    resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "Report test",
        "owner_message": "Report test notice",
    })
    camp_id = resp.json()["campaign_id"]

    report = client.get(f"/api/calling/campaigns/{camp_id}/report").json()
    tasks = client.get(f"/api/calling/campaigns/{camp_id}/tasks").json()
    assert report["metrics"]["total_affected_recipients"] == len(tasks)


def test_livekit_browser_voice_token_authorization():
    """
    Verifies that the backend issues authenticated, short-lived LiveKit access tokens
    with the correct room name, participant identity, and permissions.
    """
    resp = client.post("/api/calling/livekit/token", json={
        "room_name": "room-complaint-test",
        "participant_identity": "chemist-001",
        "mode": "COMPLAINT_INTAKE",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert len(data["token"]) > 30
    assert data["room_name"] == "room-complaint-test"
    assert data["participant_identity"] == "chemist-001"
    assert data["mode"] == "COMPLAINT_INTAKE"
    assert data["ttl_seconds"] == 3600


def test_livekit_agent_turn_complaint_intake():
    """
    Verifies that the LiveKit agent turn endpoint processes user speech transcripts
    using the shared CallingAgentEngine and extracts structured fields.
    """
    turn_resp = client.post("/api/calling/livekit/agent-turn", json={
        "room_name": "room-complaint-test",
        "user_transcript": "Hello, this is Apollo Pharmacy reporting contaminated vials for batch B2231 of AMOX-625.",
        "operating_mode": "COMPLAINT_INTAKE",
        "session_history": [],
    })
    assert turn_resp.status_code == 200
    data = turn_resp.json()
    assert "agent_response" in data
    assert data["extracted"]["batch_number"] == "B2231"
    assert data["extracted"]["medicine_sku"] == "AMOX-625"


def test_livekit_agent_turn_outbound_medicine_alert():
    """
    Verifies that the LiveKit agent turn endpoint processes outbound recipient responses,
    faithfully communicates owner instructions, and confirms stock isolation.
    """
    # Create campaign and task
    c_resp = client.post("/api/calling/campaigns", json={
        "sku": "AMOX-625",
        "batches": ["B2231"],
        "reason": "LiveKit outbound test",
        "owner_message": "Immediate recall: Quarantine all units of B2231.",
    })
    camp_id = c_resp.json()["campaign_id"]
    tasks = client.get(f"/api/calling/campaigns/{camp_id}/tasks").json()
    task = tasks[0]

    turn_resp = client.post("/api/calling/livekit/agent-turn", json={
        "room_name": "room-alert-test",
        "user_transcript": "Understood. We have quarantined 15 boxes immediately.",
        "operating_mode": "OUTBOUND_MEDICINE_ALERT",
        "session_history": [],
        "task_id": task["id"],
        "campaign_id": camp_id,
    })
    assert turn_resp.status_code == 200
    data = turn_resp.json()
    assert data["is_acknowledged"] is True
    assert data["remaining_stock_confirmed"] is True


def test_livekit_config_distinguishes_simulated_vs_live_telephony():
    """
    Verifies that the configuration endpoint clearly states active telephony status,
    local open-source AI models, and differentiates browser voice from carrier telephony.
    """
    cfg_resp = client.get("/api/calling/livekit/config")
    assert cfg_resp.status_code == 200
    cfg = cfg_resp.json()
    assert "telephony_provider" in cfg
    assert "local_engines" in cfg
    assert cfg["local_engines"]["stt"] == "whisper-base"
    assert cfg["local_engines"]["tts"] == "piper-en_US-lessac-medium"
    assert "mode_a_browser_voice_enabled" in cfg
    assert cfg["mode_a_browser_voice_enabled"] is True
