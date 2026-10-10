import json
import uuid
import re
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models import (
    Product,
    BatchInventory,
    Customer,
    Complaint,
    ComplaintEvent,
    CallRecord,
    CallTask,
    CallCampaign,
)
from app.calling.notifications import alert_complaint_received, alert_stock_isolated

class ConversationTurn:
    def __init__(self, role: str, text: str, timestamp: Optional[str] = None):
        self.role = role  # "agent" or "caller" / "recipient"
        self.text = text
        self.timestamp = timestamp or datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, str]:
        return {"role": self.role, "text": self.text, "timestamp": self.timestamp}


class CallingAgentEngine:
    """
    Shared Autonomous Voice AI Conversation Engine for TraceRx.
    Executes in one of two explicit modes:
    - COMPLAINT_INTAKE: Inbound call answering, structured complaint gathering, entity verification, owner escalation.
    - OUTBOUND_MEDICINE_ALERT: Outbound campaign execution, faithful communication of owner's approved message, acknowledgment & stock capture.
    """

    def __init__(self, db: Session):
        self.db = db

    # -------------------------------------------------------------------------
    # Database-Backed Entity Verification Tools
    # -------------------------------------------------------------------------

    def lookup_product(self, query: str) -> Optional[Dict[str, Any]]:
        """Verifies medicine against active TraceRx Products."""
        clean = (query or "").strip().upper()
        if not clean:
            return None
        # Exact SKU match
        prod = self.db.query(Product).filter(Product.sku == clean).first()
        if not prod:
            # Case-insensitive brand or molecule search
            prod = (
                self.db.query(Product)
                .filter(
                    (Product.brand.ilike(f"%{clean}%"))
                    | (Product.molecule.ilike(f"%{clean}%"))
                )
                .first()
            )
        if prod:
            return {
                "sku": prod.sku,
                "brand": prod.brand,
                "molecule": prod.molecule,
                "category": prod.category,
                "storage": prod.storage,
                "critical_drug": prod.critical_drug,
            }
        return None

    def lookup_batch(self, sku_or_name: Optional[str], batch_num: str) -> Optional[Dict[str, Any]]:
        """Verifies batch number against active TraceRx Batch Inventory."""
        clean_batch = (batch_num or "").strip()
        if not clean_batch:
            return None
        query = self.db.query(BatchInventory).filter(BatchInventory.batch == clean_batch)
        if sku_or_name:
            clean_sku = sku_or_name.strip().upper()
            prod = self.lookup_product(clean_sku)
            if prod:
                query = query.filter(BatchInventory.sku == prod["sku"])
        b = query.first()
        if b:
            return {
                "sku": b.sku,
                "batch": b.batch,
                "warehouse": b.warehouse,
                "qty": b.qty,
                "mfg_date": b.mfg_date.isoformat(),
                "expiry_date": b.expiry_date.isoformat(),
                "status": b.status,
            }
        return None

    def verify_customer(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Verifies customer identity from customer_id or phone."""
        clean = (identifier or "").strip()
        if not clean:
            return None
        cust = self.db.query(Customer).filter(Customer.customer_id == clean).first()
        if not cust:
            cust = self.db.query(Customer).filter(Customer.name.ilike(f"%{clean}%")).first()
        if not cust and hasattr(Customer, "phone"):
            cust = self.db.query(Customer).filter(Customer.phone == clean).first()
        if cust:
            return {
                "customer_id": cust.customer_id,
                "name": cust.name,
                "type": cust.type,
                "location": cust.location,
            }
        return None

    # -------------------------------------------------------------------------
    # Mode 1: WORKFLOW A — INCOMING COMPLAINT HANDLING
    # -------------------------------------------------------------------------

    def generate_complaint_initial_greeting(self) -> str:
        return (
            "Hello, this is the TraceRx Automated Quality and Safety Assistant on behalf of Arogya Pharma Distributors. "
            "This call may be recorded for compliance and safety investigations. "
            "How may I assist you with your medicine or batch inquiry today?"
        )

    def process_complaint_turn(
        self,
        call_id: str,
        caller_message: str,
        conversation_history: List[Dict[str, str]],
        caller_phone: Optional[str] = None,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Processes a caller turn during an incoming complaint, extracting entities,
        performing database lookups, and determining when sufficient details exist
        to persist the incident and alert the owner immediately.
        """
        text = caller_message.strip()

        # Check for medical emergency triggers
        emergency_pattern = r"(emergency|passed away|dying|hospitalized|icu|severe reaction|anaphylaxis|poison|bleeding)"
        has_medical_emergency = bool(re.search(emergency_pattern, text, re.I))

        # Rule-based entity extraction heuristics
        extracted: Dict[str, Any] = {
            "caller_phone": caller_phone,
            "raw_text": text,
            "potential_harm": has_medical_emergency,
        }

        # Look for SKU / medicine names
        found_prod = None
        for p in self.db.query(Product).all():
            if p.sku.lower() in text.lower() or p.brand.lower() in text.lower() or p.molecule.lower() in text.lower():
                found_prod = p
                break
        if found_prod:
            extracted["sku"] = found_prod.sku
            extracted["medicine_name"] = f"{found_prod.brand} ({found_prod.molecule})"
            extracted["manufacturer"] = found_prod.brand

        # Look for batch patterns like B1234, LOT-123, B2231
        batch_match = re.search(r"\b([A-Za-z]{1,3}[-_]?\d{3,6})\b", text)
        if batch_match:
            cand_batch = batch_match.group(1).upper()
            extracted["batch"] = cand_batch
            # Verify batch against database
            batch_record = self.lookup_batch(extracted.get("sku"), cand_batch)
            if batch_record:
                extracted["verified_batch"] = True
                if not extracted.get("sku"):
                    extracted["sku"] = batch_record["sku"]
            else:
                extracted["verified_batch"] = False

        # Look for quantity
        qty_match = re.search(r"(\d+)\s*(strips|boxes|vials|bottles|units|packs)?", text, re.I)
        if qty_match:
            try:
                extracted["reported_quantity"] = int(qty_match.group(1))
            except Exception:
                pass

        # Formulate response
        if has_medical_emergency:
            reply = (
                "If someone is experiencing a medical emergency or serious adverse reaction, "
                "please seek immediate emergency medical care or call your local emergency services right away. "
                "I am immediately escalating your report to our senior Pharmacovigilance and Quality Lead. "
                "Could you please share the batch number and medicine name so we can freeze distribution?"
            )
        elif not extracted.get("medicine_name") and not extracted.get("sku"):
            reply = (
                "I understand you are reporting an issue. Could you please specify the name of the medicine, "
                "the batch number printed on the package, and what problem you observed?"
            )
        elif not extracted.get("batch"):
            reply = (
                f"Thank you for reporting regarding {extracted.get('medicine_name', 'this medicine')}. "
                "Could you check the package for the batch number, and confirm whether you still have units in stock?"
            )
        else:
            v_note = (
                "This batch matches our distribution records."
                if extracted.get("verified_batch")
                else "I have logged the batch as reported (unverified in local dispatch records)."
            )
            reply = (
                f"Thank you. I have captured the report for {extracted.get('medicine_name', extracted.get('sku'))}, "
                f"Batch {extracted.get('batch')}. {v_note} "
                "Our Quality Assurance Lead has been alerted and will review this incident immediately. "
                "Please isolate any remaining units from dispensing."
            )

        return reply, extracted

    def record_final_complaint(
        self,
        call_id: str,
        caller_name: Optional[str],
        caller_phone: Optional[str],
        caller_organization: Optional[str],
        medicine_sku: Optional[str],
        medicine_name: Optional[str],
        batch_number: Optional[str],
        complaint_category: str,
        complaint_description: str,
        reported_quantity: Optional[int],
        potential_harm: bool,
        potential_harm_details: Optional[str] = None,
        source_transcript: Optional[List[Dict[str, str]]] = None,
    ) -> Complaint:
        """
        Authoritatively records the complaint into the database, generates a unique incident ID,
        verifies references, links related complaints on the same batch/SKU, and alerts the owner.
        """
        today_code = datetime.now().strftime("%Y%m%d")
        complaint_id = f"CMP-{today_code}-{uuid.uuid4().hex[:6].upper()}"

        # Determine verification status
        v_status = "unverified"
        verified_prod = self.lookup_product(medicine_sku or medicine_name or "")
        verified_batch = self.lookup_batch(medicine_sku, batch_number or "") if batch_number else None

        if verified_prod and verified_batch:
            v_status = "verified_sku_batch"
            sku_val = verified_prod["sku"]
            med_val = f"{verified_prod['brand']} ({verified_prod['molecule']})"
        elif verified_prod:
            v_status = "verified_sku_only"
            sku_val = verified_prod["sku"]
            med_val = f"{verified_prod['brand']} ({verified_prod['molecule']})"
        else:
            sku_val = medicine_sku
            med_val = medicine_name or medicine_sku

        # Check for related complaints to link
        linked_incident = None
        if batch_number:
            existing_related = (
                self.db.query(Complaint)
                .filter(Complaint.batch == batch_number, Complaint.id != complaint_id)
                .order_by(Complaint.created_at.desc())
                .first()
            )
            if existing_related:
                linked_incident = existing_related.linked_incident_id or existing_related.id

        urgency_val = "critical" if potential_harm else ("high" if v_status == "verified_sku_batch" else "medium")

        complaint = Complaint(
            id=complaint_id,
            source_call_id=call_id,
            caller_name=caller_name or "Anonymous Caller",
            caller_phone=caller_phone or "Unknown",
            caller_organization=caller_organization or "Unknown Pharmacy/Hospital",
            sku=sku_val,
            medicine_name=med_val,
            batch=batch_number,
            complaint_category=complaint_category or "quality",
            complaint_description=complaint_description,
            incident_timestamp=datetime.now(timezone.utc),
            incident_location="Customer Location",
            reported_quantity=reported_quantity,
            stock_remaining=bool(reported_quantity and reported_quantity > 0),
            potential_harm=potential_harm,
            potential_harm_details=potential_harm_details,
            urgency=urgency_val,
            verification_status=v_status,
            investigation_status="new",
            linked_incident_id=linked_incident,
            assigned_owner="Quality Safety Lead",
            raw_caller_statement=complaint_description,
            source_evidence=json.dumps({"transcript": source_transcript or []}),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(complaint)

        # Add event log
        event = ComplaintEvent(
            complaint_id=complaint_id,
            event_type="CREATED",
            actor="TraceRx AI Calling Agent",
            notes=f"Complaint captured via voice call {call_id}.",
            payload=json.dumps({"verification_status": v_status, "potential_harm": potential_harm}),
            timestamp=datetime.now(timezone.utc),
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(complaint)

        # Trigger immediate owner alert
        alert_complaint_received(self.db, complaint)

        return complaint

    # -------------------------------------------------------------------------
    # Mode 2: WORKFLOW B — OWNER-AUTHORIZED OUTGOING MEDICINE ALERTS
    # -------------------------------------------------------------------------

    def generate_outbound_script(
        self,
        campaign: CallCampaign,
        task: CallTask,
    ) -> str:
        """
        Constructs the strict, faithful greeting and message for the outbound call.
        Communicates the EXACT owner approved message without adding unapproved medical claims.
        """
        greeting = (
            f"Hello, this is the TraceRx Automated Calling Agent on behalf of Arogya Pharma Distributors. "
            f"I am calling for {task.customer_name}. "
            f"This call relates to an urgent product notification regarding SKU {campaign.sku}. "
            f"Message: \"{campaign.owner_message}\" "
            f"Could you please confirm if you have received and understood this notice, and whether you have any remaining units in stock?"
        )
        return greeting

    def process_outbound_turn(
        self,
        campaign: CallCampaign,
        task: CallTask,
        recipient_reply: str,
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Evaluates recipient response, checks for acknowledgment, stock isolation,
        remaining quantity, and refusal or complaints.
        """
        text = recipient_reply.strip().lower()

        # 1. Refusal or dispute
        if any(w in text for w in ["refuse", "not our problem", "wrong number", "hang up", "dispute", "lawyer"]):
            task.requires_human_follow_up = True
            task.follow_up_reason = f"Recipient disputed notice or refused instruction: '{recipient_reply[:200]}'"
            task.status = "needs_follow_up"
            return (
                "I understand your concern. I have logged your response for our Quality Safety Team, "
                "and an executive will contact your facility directly. Thank you.",
                {"acknowledged": False, "requires_follow_up": True},
            )

        # 2. Acknowledgment
        acknowledged = any(w in text for w in ["yes", "understood", "okay", "ok", "noted", "will do", "sure", "isolated", "quarantined"])
        task.acknowledged = acknowledged
        task.message_communicated = True

        # 3. Stock remaining & isolation
        isolated = any(w in text for w in ["isolation", "isolated", "isolate", "quarantined", "quarantine", "stopped", "kept aside", "separated", "in locker"])
        task.confirmed_stock_isolation = isolated

        # Check for remaining quantity
        qty_match = re.search(r"(\d+)\s*(units|strips|boxes|vials|bottles|packs)?", text)
        if qty_match:
            try:
                task.reported_remaining_qty = int(qty_match.group(1))
            except Exception:
                pass

        task.response_notes = recipient_reply
        task.answered = True
        task.status = "completed"

        if task.confirmed_stock_isolation and task.reported_remaining_qty:
            alert_stock_isolated(self.db, campaign, task)

        reply = (
            "Thank you very much for your cooperation in maintaining patient safety. "
            "Your confirmation and inventory status have been recorded. Our logistics team will follow up for retrieval. Goodbye."
        )
        return reply, {
            "acknowledged": task.acknowledged,
            "isolated": task.confirmed_stock_isolation,
            "confirmed_stock_isolation": task.confirmed_stock_isolation,
            "remaining_qty": task.reported_remaining_qty,
            "reported_remaining_qty": task.reported_remaining_qty,
        }
