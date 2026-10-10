import json
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.db import get_db, SessionLocal
from app.models import (
    Customer,
    Dispatch,
    Product,
    Complaint,
    NotificationCampaign,
    NotificationRecipient,
    Ledger,
)
from app.notifications.email_service import _SIMULATOR_INSTANCE
from app.notifications.sms_service import _SIMULATOR_SMS_INSTANCE
from app.notifications.campaign_manager import (
    resolve_affected_recipients,
    sanitize_payload_for_audit,
    clean_and_validate_indian_phone,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_simulators():
    """Resets simulator providers between test runs and ensures scenario data."""
    _SIMULATOR_INSTANCE.dispatched_emails.clear()
    _SIMULATOR_INSTANCE.forced_failure = False
    _SIMULATOR_INSTANCE.failure_recipients.clear()

    _SIMULATOR_SMS_INSTANCE.dispatched_messages.clear()
    _SIMULATOR_SMS_INSTANCE.forced_failure = False
    _SIMULATOR_SMS_INSTANCE.failure_numbers.clear()

    # Seed customers and dispatches
    client.post("/api/demo/reset-scenario")


# ---------------------------------------------------------------------------
# 1. Complaint & Incident Creation Tests
# ---------------------------------------------------------------------------

def test_create_patient_website_complaint():
    """Tests intake of customer/patient complaint submitted via website."""
    payload = {
        "incident_source": "website_complaint",
        "caller_name": "Ramesh Kumar",
        "caller_phone": "+919876543210",
        "caller_email": "ramesh.kumar@example.com",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_category": "packaging",
        "complaint_description": "Found discolored tablets in blister pack with compromised foil seal.",
        "potential_harm": False,
        "urgency": "high",
    }
    resp = client.post("/api/incidents", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "created"
    assert data["case_id"].startswith("CMP-")
    assert data["incident_source"] == "website_complaint"
    assert data["is_batch_missing"] is False

    # Verify database persistence
    db: Session = SessionLocal()
    inc = db.query(Complaint).filter(Complaint.id == data["case_id"]).first()
    assert inc is not None
    assert inc.sku == "AMOX-625"
    assert inc.batch == "B2231"
    assert inc.verification_status == "verified_sku_batch"
    db.close()


def test_create_owner_reported_quality_issue():
    """Tests intake of quality issue reported directly by warehouse owner / authorized staff."""
    payload = {
        "incident_source": "owner_quality_issue",
        "reporter_name": "Suresh Hegde",
        "warehouse": "WH-1",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_category": "quality",
        "complaint_description": "Warehouse QC internal audit identified micro-fissures in primary amber glass packaging.",
        "reported_quantity": 40,
        "stock_remaining": True,
        "potential_harm": True,
        "potential_harm_details": "Potential microbial contamination risk if seal integrity compromised.",
        "urgency": "critical",
        "source_evidence": {"lab_report_no": "LAB-QC-994", "analyst": "Dr. V. Rao"},
    }
    resp = client.post("/api/incidents", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "created"
    assert data["case_id"].startswith("INC-")
    assert data["incident_source"] == "owner_quality_issue"


def test_create_incomplete_incident_flags_missing_batch():
    """Verifies that incomplete reports with missing batch are saved and clearly flagged without inventing a batch."""
    payload = {
        "incident_source": "website_complaint",
        "caller_name": "Anonymous Patient",
        "sku": "AMOX-625",
        "batch": "",  # Empty batch
        "complaint_description": "Tablet had bitter metallic taste, patient discarded the carton without noting batch.",
    }
    resp = client.post("/api/incidents", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "created"
    assert data["is_batch_missing"] is True
    assert "missing batch" in data["message"].lower()

    db: Session = SessionLocal()
    inc = db.query(Complaint).filter(Complaint.id == data["case_id"]).first()
    assert inc.batch is None
    assert inc.is_batch_missing is True
    db.close()


def test_duplicate_case_prevention():
    """Ensures duplicate cases are recognized and referenced rather than creating redundant parallel investigations."""
    payload = {
        "incident_source": "owner_quality_issue",
        "sku": "PARA-500",
        "batch": "B-DUP-01",
        "complaint_description": "Excess moisture detected during weekly quality sampling.",
        "prevent_duplicate": True,
    }
    resp1 = client.post("/api/incidents", json=payload)
    assert resp1.status_code == 200
    cid = resp1.json()["case_id"]

    # Post identical second incident
    resp2 = client.post("/api/incidents", json=payload)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2.get("is_duplicate") is True
    assert data2.get("existing_case_id") == cid


# ---------------------------------------------------------------------------
# 2. Recipient Selection & Contact Validation Tests
# ---------------------------------------------------------------------------

def test_resolve_affected_recipients_from_dispatches():
    """Verifies batch-to-customer matching using real dispatch records."""
    db: Session = SessionLocal()
    # Query for AMOX-625 batch B2231 which has seeded dispatches
    recipients = resolve_affected_recipients(db=db, sku="AMOX-625", batch="B2231")
    assert len(recipients) > 0

    # Ensure customers match existing customers and have calculated dispatched quantities
    first_rcpt = recipients[0]
    assert "customer_id" in first_rcpt
    assert "customer_name" in first_rcpt
    assert first_rcpt["dispatched_qty"] > 0
    assert first_rcpt["missing_contacts"] in ("none", "missing_email", "missing_phone", "missing_all")

    # Hospitals should be sorted before chemists
    types = [r["customer_type"] for r in recipients]
    if "hospital" in types and "chemist" in types:
        first_hosp_idx = types.index("hospital")
        first_chem_idx = types.index("chemist")
        assert first_hosp_idx < first_chem_idx
    db.close()


def test_contact_validation_rules():
    """Tests Indian phone sanitization and strict validation rules."""
    valid, formatted, err = clean_and_validate_indian_phone("+91 98450 12345")
    assert valid is True
    assert formatted == "+919845012345"

    valid2, formatted2, err2 = clean_and_validate_indian_phone("9876543210")
    assert valid2 is True
    assert formatted2 == "+919876543210"

    # Numbers starting with 1, 2, 3, 4, 5 are invalid Indian mobile numbers
    valid3, _, err3 = clean_and_validate_indian_phone("+91 3234567890")
    assert valid3 is False
    assert "start with 6, 7, 8, or 9" in err3

    # Short number
    valid4, _, err4 = clean_and_validate_indian_phone("98450")
    assert valid4 is False
    assert "10-digit" in err4


def test_preview_recipients_api():
    """Tests the preview recipients API endpoint for an incident."""
    # Create test incident
    resp_inc = client.post("/api/incidents", json={
        "incident_source": "owner_quality_issue",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Microbial test alert on B2231.",
    })
    inc_id = resp_inc.json()["case_id"]

    resp_prev = client.post(f"/api/incidents/{inc_id}/preview-recipients")
    assert resp_prev.status_code == 200
    pdata = resp_prev.json()
    assert pdata["total_recipients"] > 0
    assert pdata["sku"] == "AMOX-625"
    assert pdata["batch"] == "B2231"
    assert len(pdata["recipients"]) == pdata["total_recipients"]


# ---------------------------------------------------------------------------
# 3. Campaign Creation & Owner Approval Workflow Tests
# ---------------------------------------------------------------------------

def test_campaign_approval_and_rejection_workflow():
    """Tests the owner approval gate, message editing, reason requirement, and rejection."""
    # Create incident
    resp_inc = client.post("/api/incidents", json={
        "incident_source": "owner_quality_issue",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Lab investigation pending confirmation.",
    })
    inc_id = resp_inc.json()["case_id"]

    # Create campaign (starts in pending_approval)
    resp_camp = client.post(f"/api/incidents/{inc_id}/campaigns", json={"created_by": "Compliance Lead"})
    assert resp_camp.status_code == 200
    camp_id = resp_camp.json()["campaign_id"]
    assert resp_camp.json()["campaign_status"] == "pending_approval"

    # Attempt approval without reason -> should fail
    resp_fail = client.post(f"/api/notifications/campaigns/{camp_id}/approve", json={
        "approver_name": "Dr. Sharma",
        "approver_role": "Quality Safety Lead",
        "approval_reason": "",
    })
    assert resp_fail.status_code == 400

    # Attempt approval with unauthorized role -> should fail
    resp_role_fail = client.post(f"/api/notifications/campaigns/{camp_id}/approve", json={
        "approver_name": "Intern John",
        "approver_role": "Junior Clerk",
        "approval_reason": "Looks okay to me",
    })
    assert resp_role_fail.status_code == 403

    # Authorized approval with edits
    resp_app = client.post(f"/api/notifications/campaigns/{camp_id}/approve", json={
        "approver_name": "Dr. K. Sharma",
        "approver_role": "Quality Safety Lead",
        "approval_reason": "Verified lab batch samples and approved customer notification.",
        "email_subject": "AUTHORIZED URGENT RECALL: AMOX-625 Batch B2231",
    })
    assert resp_app.status_code == 200
    assert resp_app.json()["status"] == "approved"
    assert resp_app.json()["approved_by"] == "Dr. K. Sharma"

    # Check updated campaign details
    resp_det = client.get(f"/api/notifications/campaigns/{camp_id}")
    assert resp_det.status_code == 200
    cdet = resp_det.json()["campaign"]
    assert cdet["status"] == "approved"
    assert cdet["email_subject"] == "AUTHORIZED URGENT RECALL: AMOX-625 Batch B2231"


def test_campaign_rejection():
    """Tests that an authorized approver can reject an unjustified recall campaign."""
    resp_inc = client.post("/api/incidents", json={
        "incident_source": "website_complaint",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Taste was slightly different.",
    })
    inc_id = resp_inc.json()["case_id"]
    resp_camp = client.post(f"/api/incidents/{inc_id}/campaigns")
    camp_id = resp_camp.json()["campaign_id"]

    resp_rej = client.post(f"/api/notifications/campaigns/{camp_id}/reject", json={
        "rejected_by": "Quality Safety Lead",
        "role": "Quality Safety Lead",
        "rejection_reason": "Laboratory certificate of analysis confirmed batch within regulatory specifications. False alarm.",
    })
    assert resp_rej.status_code == 200
    assert resp_rej.json()["status"] == "rejected"

    resp_det = client.get(f"/api/notifications/campaigns/{camp_id}")
    assert resp_det.json()["campaign"]["status"] == "closed"


# ---------------------------------------------------------------------------
# 4. Email & SMS Provider Dispatch, Failure, and Controlled Retries
# ---------------------------------------------------------------------------

def test_successful_campaign_dispatch():
    """Tests end-to-end dispatch of Email and SMS notifications for an approved campaign."""
    resp_inc = client.post("/api/incidents", json={
        "incident_source": "owner_quality_issue",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Distribution stop required for B2231.",
    })
    inc_id = resp_inc.json()["case_id"]
    resp_camp = client.post(f"/api/incidents/{inc_id}/campaigns")
    camp_id = resp_camp.json()["campaign_id"]

    # Approve
    client.post(f"/api/notifications/campaigns/{camp_id}/approve", json={
        "approver_name": "Quality Lead",
        "approver_role": "Quality Safety Lead",
        "approval_reason": "Safety verified.",
    })

    # Dispatch
    resp_send = client.post(f"/api/notifications/campaigns/{camp_id}/send")
    assert resp_send.status_code == 200
    send_data = resp_send.json()
    assert send_data["emails_sent"] > 0
    assert send_data["sms_sent"] > 0
    assert send_data["status"] in ("sent", "partially_sent")

    # Verify messages in simulators
    assert len(_SIMULATOR_INSTANCE.dispatched_emails) > 0
    assert len(_SIMULATOR_SMS_INSTANCE.dispatched_messages) > 0


def test_idempotent_duplicate_send_prevention():
    """Verifies that sending an already dispatched campaign does not duplicate outgoing messages."""
    resp_inc = client.post("/api/incidents", json={
        "incident_source": "owner_quality_issue",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Idempotency validation test.",
    })
    inc_id = resp_inc.json()["case_id"]
    resp_camp = client.post(f"/api/incidents/{inc_id}/campaigns")
    camp_id = resp_camp.json()["campaign_id"]

    client.post(f"/api/notifications/campaigns/{camp_id}/approve", json={
        "approver_name": "Quality Lead",
        "approver_role": "Quality Safety Lead",
        "approval_reason": "Approved.",
    })

    # First send
    client.post(f"/api/notifications/campaigns/{camp_id}/send", headers={"Idempotency-Key": "TOKEN-12345"})
    initial_email_count = len(_SIMULATOR_INSTANCE.dispatched_emails)
    initial_sms_count = len(_SIMULATOR_SMS_INSTANCE.dispatched_messages)

    # Second send with same token (or repeated button click)
    resp_send2 = client.post(f"/api/notifications/campaigns/{camp_id}/send", headers={"Idempotency-Key": "TOKEN-12345"})
    assert resp_send2.status_code == 200

    # Ensure no additional emails or SMS were dispatched
    assert len(_SIMULATOR_INSTANCE.dispatched_emails) == initial_email_count
    assert len(_SIMULATOR_SMS_INSTANCE.dispatched_messages) == initial_sms_count


def test_partial_failure_and_controlled_retries():
    """
    Tests handling of upstream gateway failure:
    - Forces failures for specific recipients.
    - Runs campaign and verifies failed statuses.
    - Clears failures and triggers retry-failed.
    - Confirms that ONLY previously failed channels are re-attempted.
    """
    resp_inc = client.post("/api/incidents", json={
        "incident_source": "owner_quality_issue",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Testing gateway failure recovery.",
    })
    inc_id = resp_inc.json()["case_id"]
    resp_camp = client.post(f"/api/incidents/{inc_id}/campaigns")
    camp_id = resp_camp.json()["campaign_id"]

    client.post(f"/api/notifications/campaigns/{camp_id}/approve", json={
        "approver_name": "Quality Lead",
        "approver_role": "Quality Safety Lead",
        "approval_reason": "Approved for failure test.",
    })

    # Force SMS simulator failure
    _SIMULATOR_SMS_INSTANCE.forced_failure = True

    # Dispatch - SMS should fail, email should succeed
    resp_send = client.post(f"/api/notifications/campaigns/{camp_id}/send")
    assert resp_send.status_code == 200
    assert resp_send.json()["sms_failed"] > 0
    assert resp_send.json()["emails_sent"] > 0
    assert resp_send.json()["status"] in ("partially_sent", "failed")

    # Turn off simulated failure
    _SIMULATOR_SMS_INSTANCE.forced_failure = False
    sms_before_retry = len(_SIMULATOR_SMS_INSTANCE.dispatched_messages)
    emails_before_retry = len(_SIMULATOR_INSTANCE.dispatched_emails)

    # Trigger controlled retry
    resp_retry = client.post(f"/api/notifications/campaigns/{camp_id}/retry-failed")
    assert resp_retry.status_code == 200
    retry_data = resp_retry.json()
    assert retry_data["sms_sent"] > 0

    # Verify SMS was resent, but successful emails were NOT resent!
    assert len(_SIMULATOR_SMS_INSTANCE.dispatched_messages) > sms_before_retry
    assert len(_SIMULATOR_INSTANCE.dispatched_emails) == emails_before_retry


# ---------------------------------------------------------------------------
# 5. Delivery Webhooks & Human Acknowledgment Tracking
# ---------------------------------------------------------------------------

def test_delivery_webhook_callback():
    """Tests provider callback for confirmed message delivery receipt."""
    # Create and send campaign
    resp_inc = client.post("/api/incidents", json={
        "incident_source": "owner_quality_issue",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Testing webhook callbacks.",
    })
    inc_id = resp_inc.json()["case_id"]
    resp_camp = client.post(f"/api/incidents/{inc_id}/campaigns")
    camp_id = resp_camp.json()["campaign_id"]
    client.post(f"/api/notifications/campaigns/{camp_id}/approve", json={
        "approver_name": "Lead",
        "approver_role": "Quality Safety Lead",
        "approval_reason": "Approved.",
    })
    client.post(f"/api/notifications/campaigns/{camp_id}/send")

    # Get campaign details to find provider message ID
    resp_det = client.get(f"/api/notifications/campaigns/{camp_id}")
    rcpts = resp_det.json()["recipients"]
    rcpt_with_sms = next(r for r in rcpts if r["sms_provider_id"])
    provider_msg_id = rcpt_with_sms["sms_provider_id"]

    # Post webhook
    resp_wb = client.post(
        "/api/notifications/webhook/delivery?channel=sms",
        json={"provider_message_id": provider_msg_id, "status": "delivered"},
    )
    assert resp_wb.status_code == 200
    assert resp_wb.json()["delivery_status"] == "delivered"

    # Verify recipient status changed to delivered
    resp_det2 = client.get(f"/api/notifications/campaigns/{camp_id}")
    updated_rcpt = next(r for r in resp_det2.json()["recipients"] if r["id"] == rcpt_with_sms["id"])
    assert updated_rcpt["sms_status"] == "delivered"


def test_human_acknowledgement_and_stock_isolation():
    """Tests chemist/hospital human acknowledgment and recorded stock quarantine."""
    resp_inc = client.post("/api/incidents", json={
        "incident_source": "owner_quality_issue",
        "sku": "AMOX-625",
        "batch": "B2231",
        "complaint_description": "Stock quarantine tracking test.",
    })
    inc_id = resp_inc.json()["case_id"]
    resp_camp = client.post(f"/api/incidents/{inc_id}/campaigns")
    camp_id = resp_camp.json()["campaign_id"]

    resp_det = client.get(f"/api/notifications/campaigns/{camp_id}")
    first_rcpt_id = resp_det.json()["recipients"][0]["id"]

    # Record acknowledgment
    resp_ack = client.post(
        f"/api/notifications/recipients/{first_rcpt_id}/acknowledge",
        json={
            "acknowledged_by": "Chief Pharmacist John",
            "stock_isolated": True,
            "stock_isolated_qty": 25,
            "notes": "All 25 units moved to physical red-tag quarantine room.",
        },
    )
    assert resp_ack.status_code == 200
    assert resp_ack.json()["status"] == "acknowledged"
    assert resp_ack.json()["stock_isolated"] is True
    assert resp_ack.json()["stock_isolated_qty"] == 25

    # Verify campaign acknowledged count increased
    resp_camp_check = client.get(f"/api/notifications/campaigns/{camp_id}")
    assert resp_camp_check.json()["campaign"]["acknowledged_count"] >= 1


# ---------------------------------------------------------------------------
# 6. Privacy Sanitization & Audit Ledger Tests
# ---------------------------------------------------------------------------

def test_privacy_sanitization_for_audit_ledger():
    """Ensures phone numbers, email addresses, and customer names are masked before audit recording."""
    raw_payload = {
        "action": "CAMPAIGN_DISPATCHED",
        "phone": "+919876543210",
        "email": "pharmacist@hospital.org",
        "customer_name": "Apollo Pharmacy Hub",
        "batch": "B2231",
    }
    sanitized = sanitize_payload_for_audit(raw_payload)
    assert "***" in sanitized["phone"]
    assert not sanitized["phone"].startswith("+919876543210")
    assert "***" in sanitized["email"]
    assert not sanitized["email"].startswith("pharmacist@")
    assert "***" in sanitized["customer_name"]
    assert sanitized["batch"] == "B2231"  # Medicine data preserved without masking
