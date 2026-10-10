from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    Date,
    DateTime,
    Text,
    Index,
    ForeignKey,
)
from app.db import Base

class Product(Base):
    __tablename__ = "products"

    sku = Column(String(50), primary_key=True, index=True)
    molecule = Column(String(200), nullable=False)
    brand = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False)
    storage = Column(String(20), nullable=False)  # 'ambient' or '2-8C'
    critical_drug = Column(Boolean, default=False, nullable=False)

class BatchInventory(Base):
    __tablename__ = "batch_inventory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    batch = Column(String(50), nullable=False, index=True)
    warehouse = Column(String(50), nullable=False, index=True)
    cold_room = Column(String(50), nullable=True)
    qty = Column(Integer, nullable=False, default=0)
    mfg_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="active")  # 'active', 'blocked', 'quarantine', 'returned'
    import_batch_id = Column(String(36), nullable=True, index=True)

    __table_args__ = (
        Index("idx_batch_inv_sku_expiry", "sku", "expiry_date"),
        Index("idx_batch_inv_sku_batch", "sku", "batch"),
    )

class Customer(Base):
    __tablename__ = "customers"

    customer_id = Column(String(50), primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    type = Column(String(20), nullable=False)  # 'chemist' or 'hospital'
    location = Column(String(200), nullable=False)
    credit_terms = Column(String(50), nullable=False, default="Net 30")
    phone = Column(String(50), nullable=True)
    email = Column(String(150), nullable=True)

class Dispatch(Base):
    __tablename__ = "dispatches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True)
    customer_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(50), nullable=False, index=True)
    batch = Column(String(50), nullable=False, index=True)
    qty = Column(Integer, nullable=False)
    from_warehouse = Column(String(50), nullable=False, default="WH-1")

    __table_args__ = (
        Index("idx_dispatches_sku_date", "sku", "date"),
        Index("idx_dispatches_batch", "batch"),
    )

class TempLog(Base):
    __tablename__ = "temp_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    warehouse = Column(String(50), nullable=False, index=True)
    cold_room = Column(String(50), nullable=False, index=True)
    ts = Column(DateTime, nullable=False, index=True)
    temp_c = Column(Float, nullable=False)

    __table_args__ = (
        Index("idx_temp_logs_wh_room_ts", "warehouse", "cold_room", "ts"),
    )

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manufacturer = Column(String(200), nullable=False, index=True)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    lead_time_days = Column(Integer, nullable=False, default=7)
    moq = Column(Integer, nullable=False, default=100)
    return_window_days = Column(Integer, nullable=False, default=60)
    credit_pct = Column(Float, nullable=False, default=0.60)
    unit_cost = Column(Float, nullable=False, default=100.0)

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po = Column(String(50), primary_key=True, index=True)
    manufacturer = Column(String(200), nullable=False)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    qty = Column(Integer, nullable=False)
    expected_date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="ordered")  # 'draft', 'ordered', 'received', 'cancelled'
    draft = Column(Boolean, nullable=False, default=False)

class Recall(Base):
    __tablename__ = "recalls"

    id = Column(String(50), primary_key=True, index=True)
    date = Column(Date, nullable=False)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    batches = Column(Text, nullable=False)  # JSON serialized list of batch IDs e.g. '["B2231"]'
    reason = Column(Text, nullable=False)
    recall_class = Column(String(10), nullable=False)  # 'I', 'II', 'III'

class Action(Base):
    __tablename__ = "actions"

    id = Column(String(50), primary_key=True, index=True)
    type = Column(String(50), nullable=False)  # BLOCK_BATCH, SEND_NOTICES, URGENT_PO, TRANSFER, RETURN_REQUEST, etc.
    payload = Column(Text, nullable=False)  # JSON
    evidence = Column(Text, nullable=False)  # JSON
    options = Column(Text, nullable=False)  # JSON
    chosen_option = Column(String(50), nullable=True)
    status = Column(String(30), nullable=False, default="draft")  # draft, pending_approval, approved, executed, rejected
    required_role = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False)
    decided_by = Column(String(100), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    reason = Column(Text, nullable=True)

class Ledger(Base):
    __tablename__ = "ledger"

    seq = Column(Integer, primary_key=True, autoincrement=False)  # strictly sequential 1, 2, 3...
    ts = Column(String(50), nullable=False)
    event_type = Column(String(50), nullable=False)
    payload = Column(Text, nullable=False)  # canonical JSON
    prev_hash = Column(String(64), nullable=False)
    hash = Column(String(64), nullable=False)

class Anchor(Base):
    __tablename__ = "anchors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    from_seq = Column(Integer, nullable=False)
    to_seq = Column(Integer, nullable=False)
    merkle_root = Column(String(66), nullable=False)
    tx_hash = Column(String(100), nullable=False)
    chain = Column(String(50), nullable=False, default="simulated")  # 'amoy' or 'simulated'
    status = Column(String(20), nullable=False, default="confirmed")

class DatasetImport(Base):
    __tablename__ = "dataset_imports"

    id = Column(String(36), primary_key=True)               # IMP-UUID
    filename = Column(String(255), nullable=False)
    file_type = Column(String(10), nullable=False)            # "csv" or "xlsx"
    file_sha256 = Column(String(64), nullable=False, index=True)
    target_table = Column(String(50), nullable=False)
    total_rows = Column(Integer, nullable=False, default=0)
    valid_rows = Column(Integer, nullable=False, default=0)
    invalid_rows = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="staged")  # staged, committed, rolled_back
    mapping_config = Column(Text, nullable=False)            # JSON string
    capability_report = Column(Text, nullable=False)         # JSON string
    errors_summary = Column(Text, nullable=True)             # JSON string
    affected_ids = Column(Text, nullable=True)               # JSON list of batch/SKU IDs
    previous_state = Column(Text, nullable=True)             # JSON string of prior values
    imported_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False)
    committed_at = Column(DateTime, nullable=True)

class Case(Base):
    __tablename__ = "cases"

    id = Column(String(50), primary_key=True, index=True)
    finding_id = Column(String(100), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # recall, coldchain, expiry, returnwindow, fefo, critical
    severity = Column(Float, nullable=False)
    status = Column(String(50), nullable=False, default="detected")
    # detected, unverified, verified, disputed, false_positive, duplicate, investigating, recommended, pending_approval, executed, outcome_checking, closed, reopened
    verification_state = Column(String(30), nullable=False, default="unverified")
    # unverified, verified, disputed, false_positive, duplicate
    verification_reason = Column(Text, nullable=True)
    verification_evidence = Column(Text, nullable=True)  # JSON
    verified_by = Column(String(100), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    root_cause_analysis = Column(Text, nullable=True)  # JSON: facts, confirmed_causes, ranked_hypotheses
    action_id = Column(String(50), ForeignKey("actions.id"), nullable=True)
    outcome_metrics = Column(Text, nullable=True)  # JSON
    outcome_check_result = Column(String(30), nullable=True)  # resolved, pending_monitoring, reopened
    closure_reason = Column(Text, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    closed_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)

class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(String(50), primary_key=True, index=True)
    tracking_number = Column(String(100), nullable=False, index=True)
    carrier = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False)  # 'inbound' or 'outbound'
    po_id = Column(String(50), nullable=True)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False)
    batch = Column(String(50), nullable=True)
    qty = Column(Integer, nullable=False)
    origin = Column(String(100), nullable=False)
    destination = Column(String(100), nullable=False)
    temp_controlled = Column(Boolean, default=False, nullable=False)
    status = Column(String(30), nullable=False, default="in_transit")  # in_transit, delivered, delayed, exception
    dispatched_at = Column(DateTime, nullable=False)
    expected_delivery = Column(DateTime, nullable=False)
    actual_delivery = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

class WarehouseTransfer(Base):
    __tablename__ = "warehouse_transfers"

    id = Column(String(50), primary_key=True, index=True)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False)
    batch = Column(String(50), nullable=False)
    from_warehouse = Column(String(50), nullable=False)
    to_warehouse = Column(String(50), nullable=False)
    qty = Column(Integer, nullable=False)
    reason = Column(String(255), nullable=False)
    status = Column(String(30), nullable=False, default="requested")  # requested, approved, in_transit, completed, cancelled
    requested_by = Column(String(100), nullable=False)
    approved_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)

class AgentRun(Base):
    __tablename__ = "agent_runs"

    run_id = Column(String(50), primary_key=True, index=True)
    correlation_id = Column(String(50), nullable=False, index=True)
    finding_id = Column(String(100), nullable=False, index=True)
    case_id = Column(String(50), nullable=True, index=True)
    batch = Column(String(50), nullable=True)
    sku = Column(String(50), nullable=True)
    provider = Column(String(50), nullable=False, default="deterministic")  # nvidia_nim, anthropic, deterministic
    model = Column(String(100), nullable=True)
    ai_mode = Column(String(50), nullable=False, default="DETERMINISTIC_FALLBACK")  # LIVE_LLM, DETERMINISTIC_FALLBACK
    fallback_reason = Column(String(255), nullable=True)
    status = Column(String(30), nullable=False, default="running")  # running, completed, failed, fallback
    total_latency_ms = Column(Float, nullable=False, default=0.0)
    total_tokens = Column(Integer, nullable=False, default=0)
    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)
    chosen_option = Column(String(50), nullable=True)
    recommended_action = Column(String(50), nullable=True)
    required_role = Column(String(50), nullable=True)
    uncertainty_score = Column(Float, nullable=False, default=0.0)
    review_passed = Column(Boolean, nullable=False, default=True)
    review_verdict = Column(Text, nullable=True)
    action_id = Column(String(50), nullable=True, index=True)
    human_approval_status = Column(String(30), nullable=False, default="pending_approval")  # pending_approval, executed, rejected
    created_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)

class AgentTraceEvent(Base):
    __tablename__ = "agent_trace_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(50), ForeignKey("agent_runs.run_id"), nullable=False, index=True)
    event_seq = Column(Integer, nullable=False)
    event_type = Column(String(50), nullable=False)  # AGENT_STARTED, TOOL_REQUESTED, TOOL_COMPLETED, AGENT_COMPLETED, AGENT_FAILED, AGENT_SKIPPED, FALLBACK_USED, RUN_COMPLETED
    agent_name = Column(String(100), nullable=False)
    invocation_reason = Column(String(255), nullable=True)
    input_summary = Column(Text, nullable=True)  # JSON
    referenced_evidence_ids = Column(Text, nullable=True)  # JSON list
    tool_name = Column(String(100), nullable=True)
    tool_arguments = Column(Text, nullable=True)  # JSON
    tool_result = Column(Text, nullable=True)  # JSON
    tool_error = Column(Text, nullable=True)
    output_summary = Column(Text, nullable=True)  # JSON
    latency_ms = Column(Float, nullable=True)
    timestamp = Column(DateTime, nullable=False)


# =============================================================================
# Autonomous AI Calling Agent Entities (Complaints & Outbound Medicine Alerts)
# =============================================================================

class CallCampaign(Base):
    __tablename__ = "call_campaigns"

    id = Column(String(50), primary_key=True, index=True)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    batches = Column(Text, nullable=False)  # JSON list of batch IDs e.g. '["B2231"]'
    reason = Column(Text, nullable=False)
    owner_message = Column(Text, nullable=False)
    status = Column(String(30), nullable=False, default="draft")
    # 'draft', 'pending_approval', 'approved', 'running', 'paused', 'completed', 'cancelled', 'failed'
    created_by = Column(String(100), nullable=False, default="owner")
    approved_by = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    message_hash = Column(String(64), nullable=True)  # SHA-256 to invalidate approval on material edits
    total_recipients = Column(Integer, nullable=False, default=0)
    eligible_recipients = Column(Integer, nullable=False, default=0)
    unresolved_recipients = Column(Integer, nullable=False, default=0)
    calls_queued = Column(Integer, nullable=False, default=0)
    calls_in_progress = Column(Integer, nullable=False, default=0)
    calls_answered = Column(Integer, nullable=False, default=0)
    calls_completed = Column(Integer, nullable=False, default=0)
    acknowledgments_received = Column(Integer, nullable=False, default=0)
    stock_isolated_count = Column(Integer, nullable=False, default=0)
    calls_failed = Column(Integer, nullable=False, default=0)
    calls_no_answer = Column(Integer, nullable=False, default=0)
    calls_busy = Column(Integer, nullable=False, default=0)
    requires_follow_up_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class CallTask(Base):
    __tablename__ = "call_tasks"

    id = Column(String(50), primary_key=True, index=True)
    campaign_id = Column(String(50), ForeignKey("call_campaigns.id"), nullable=False, index=True)
    customer_id = Column(String(50), ForeignKey("customers.customer_id"), nullable=False, index=True)
    customer_name = Column(String(200), nullable=False)
    customer_type = Column(String(20), nullable=False)  # 'chemist' or 'hospital'
    location = Column(String(200), nullable=False)
    phone = Column(String(50), nullable=True)
    is_phone_valid = Column(Boolean, nullable=False, default=True)
    dispatched_batches = Column(Text, nullable=False)  # JSON list of batch IDs
    total_dispatched_qty = Column(Integer, nullable=False, default=0)
    status = Column(String(30), nullable=False, default="pending")
    # 'pending', 'queued', 'calling', 'answered', 'completed', 'no_answer', 'busy', 'failed', 'cancelled', 'needs_follow_up'
    retry_count = Column(Integer, nullable=False, default=0)
    max_retries = Column(Integer, nullable=False, default=3)
    last_call_id = Column(String(100), nullable=True)
    call_attempts = Column(Integer, nullable=False, default=0)
    answered = Column(Boolean, nullable=False, default=False)
    message_communicated = Column(Boolean, nullable=False, default=False)
    acknowledged = Column(Boolean, nullable=False, default=False)
    confirmed_stock_isolation = Column(Boolean, nullable=False, default=False)
    reported_remaining_qty = Column(Integer, nullable=True)
    response_notes = Column(Text, nullable=True)
    requires_human_follow_up = Column(Boolean, nullable=False, default=False)
    follow_up_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    last_attempt_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_call_tasks_campaign_status", "campaign_id", "status"),
        Index("idx_call_tasks_cust_camp", "customer_id", "campaign_id"),
    )


class CallRecord(Base):
    __tablename__ = "call_records"

    id = Column(String(100), primary_key=True, index=True)  # CALL-UUID or Provider SID
    provider_call_id = Column(String(100), nullable=True, index=True)
    direction = Column(String(20), nullable=False)  # 'inbound' or 'outbound'
    operating_mode = Column(String(40), nullable=False)  # 'COMPLAINT_INTAKE' or 'OUTBOUND_MEDICINE_ALERT'
    campaign_id = Column(String(50), nullable=True, index=True)
    task_id = Column(String(50), nullable=True, index=True)
    caller_phone = Column(String(50), nullable=True)
    recipient_phone = Column(String(50), nullable=True)
    customer_id = Column(String(50), nullable=True, index=True)
    customer_name = Column(String(200), nullable=True)
    telephony_provider = Column(String(50), nullable=False, default="simulator")
    status = Column(String(30), nullable=False, default="initiated")
    duration_seconds = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    transcript = Column(Text, nullable=True)  # JSON list of turns
    audio_recording_url = Column(String(255), nullable=True)
    outcome_summary = Column(Text, nullable=True)
    structured_payload = Column(Text, nullable=True)  # JSON


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(String(50), primary_key=True, index=True)  # CMP-YYYYMMDD-XXXX or INC-YYYYMMDD-XXXX
    incident_source = Column(String(50), nullable=False, default="website_complaint")
    # 'website_complaint' (patient/customer) or 'owner_quality_issue' (warehouse owner / authorized staff)
    source_call_id = Column(String(100), nullable=True, index=True)
    caller_name = Column(String(100), nullable=True)  # reporter name
    caller_phone = Column(String(50), nullable=True)  # reporter phone
    caller_email = Column(String(150), nullable=True)  # reporter email
    caller_organization = Column(String(200), nullable=True)
    customer_id = Column(String(50), nullable=True, index=True)
    warehouse = Column(String(50), nullable=True)  # warehouse where known
    sku = Column(String(50), nullable=True, index=True)
    medicine_name = Column(String(200), nullable=True)
    batch = Column(String(50), nullable=True, index=True)
    is_batch_missing = Column(Boolean, nullable=False, default=False)
    manufacturer = Column(String(200), nullable=True)
    complaint_category = Column(String(50), nullable=False, default="quality")
    # 'quality', 'packaging', 'efficacy', 'adverse_reaction', 'contamination', 'counterfeit'
    complaint_description = Column(Text, nullable=False)
    incident_timestamp = Column(DateTime, nullable=True)
    incident_location = Column(String(200), nullable=True)
    reported_quantity = Column(Integer, nullable=True)
    stock_remaining = Column(Boolean, nullable=False, default=False)
    potential_harm = Column(Boolean, nullable=False, default=False)
    potential_harm_details = Column(Text, nullable=True)
    urgency = Column(String(20), nullable=False, default="high")  # critical, high, medium, low
    verification_status = Column(String(30), nullable=False, default="unverified")
    # 'verified_sku_batch', 'verified_sku_only', 'unverified', 'disputed'
    investigation_status = Column(String(30), nullable=False, default="new")
    # 'new', 'under_review', 'investigating', 'linked_to_incident', 'escalated', 'closed'
    linked_incident_id = Column(String(50), nullable=True, index=True)
    assigned_reviewer = Column(String(100), nullable=False, default="Quality Safety Lead")
    assigned_owner = Column(String(100), nullable=False, default="Quality Safety Lead")
    rejection_reason = Column(Text, nullable=True)
    approval_history = Column(Text, nullable=True)  # JSON list of approval events
    affected_customers_summary = Column(Text, nullable=True)  # JSON cache of affected customers
    campaign_id = Column(String(50), nullable=True, index=True)
    raw_caller_statement = Column(Text, nullable=True)
    source_evidence = Column(Text, nullable=True)  # JSON list or dict of supporting evidence
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


class ComplaintEvent(Base):
    __tablename__ = "complaint_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    complaint_id = Column(String(50), ForeignKey("complaints.id"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    # CREATED, OWNER_ALERTED, ESCALATED, STATUS_CHANGED, LINKED, APPROVED, REJECTED, CAMPAIGN_INITIATED
    actor = Column(String(100), nullable=False)
    notes = Column(Text, nullable=True)
    payload = Column(Text, nullable=True)  # JSON
    timestamp = Column(DateTime, nullable=False)


class OwnerNotification(Base):
    __tablename__ = "owner_notifications"

    id = Column(String(50), primary_key=True, index=True)  # NOTIF-UUID
    type = Column(String(50), nullable=False)
    # COMPLAINT_RECEIVED, SERIOUS_HARM_ESCALATION, CAMPAIGN_STARTED, CAMPAIGN_FAILED, STOCK_REPORTED, MANUAL_INTERVENTION_NEEDED
    reference_id = Column(String(50), nullable=False, index=True)
    recipient = Column(String(100), nullable=False, default="Responsible Owner")
    channel = Column(String(30), nullable=False, default="in_app")  # in_app, webhook, sms, email
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    urgency = Column(String(20), nullable=False, default="high")  # critical, high, normal
    status = Column(String(20), nullable=False, default="delivered")  # queued, delivered, failed, acknowledged
    delivery_attempts = Column(Integer, nullable=False, default=1)
    last_error = Column(Text, nullable=True)
    escalated = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False)
    delivered_at = Column(DateTime, nullable=True)


# =============================================================================
# Email & SMS Complaint/Recall Notification Campaign Entities
# =============================================================================

class NotificationCampaign(Base):
    __tablename__ = "notification_campaigns"

    id = Column(String(50), primary_key=True, index=True)  # CMPGN-YYYYMMDD-XXXX
    incident_id = Column(String(50), ForeignKey("complaints.id"), nullable=False, index=True)
    sku = Column(String(50), ForeignKey("products.sku"), nullable=False, index=True)
    batch = Column(String(50), nullable=False, index=True)
    warehouse = Column(String(50), nullable=True)
    title = Column(String(255), nullable=False)
    status = Column(String(30), nullable=False, default="draft")
    # 'draft', 'pending_approval', 'approved', 'queued', 'sending', 'partially_sent', 'sent', 'failed', 'closed'
    email_subject = Column(String(255), nullable=False)
    email_body_html = Column(Text, nullable=False)
    email_body_text = Column(Text, nullable=False)
    sms_text = Column(Text, nullable=False)
    created_by = Column(String(100), nullable=False, default="System")
    approved_by = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_role = Column(String(50), nullable=True)
    approval_decision = Column(String(30), nullable=True)  # 'approved', 'rejected'
    approval_reason = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    is_escalated = Column(Boolean, nullable=False, default=False)
    escalated_to = Column(String(100), nullable=True)
    escalated_at = Column(DateTime, nullable=True)
    total_recipients = Column(Integer, nullable=False, default=0)
    eligible_recipients = Column(Integer, nullable=False, default=0)
    missing_contact_count = Column(Integer, nullable=False, default=0)
    emails_sent = Column(Integer, nullable=False, default=0)
    emails_delivered = Column(Integer, nullable=False, default=0)
    emails_failed = Column(Integer, nullable=False, default=0)
    sms_sent = Column(Integer, nullable=False, default=0)
    sms_delivered = Column(Integer, nullable=False, default=0)
    sms_failed = Column(Integer, nullable=False, default=0)
    acknowledged_count = Column(Integer, nullable=False, default=0)
    stock_isolated_count = Column(Integer, nullable=False, default=0)
    idempotency_key = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_notif_camp_incident", "incident_id"),
        Index("idx_notif_camp_sku_batch", "sku", "batch"),
    )


class NotificationRecipient(Base):
    __tablename__ = "notification_recipients"

    id = Column(String(50), primary_key=True, index=True)  # NRCP-UUID
    campaign_id = Column(String(50), ForeignKey("notification_campaigns.id"), nullable=False, index=True)
    customer_id = Column(String(50), ForeignKey("customers.customer_id"), nullable=False, index=True)
    customer_name = Column(String(200), nullable=False)
    customer_type = Column(String(20), nullable=False)  # 'chemist' or 'hospital'
    location = Column(String(200), nullable=False)
    phone = Column(String(50), nullable=True)
    email = Column(String(150), nullable=True)
    is_phone_valid = Column(Boolean, nullable=False, default=False)
    is_email_valid = Column(Boolean, nullable=False, default=False)
    missing_contacts = Column(String(50), nullable=False, default="none")
    # 'none', 'missing_email', 'missing_phone', 'missing_all'
    dispatched_qty = Column(Integer, nullable=False, default=0)
    dispatches_count = Column(Integer, nullable=False, default=0)
    last_dispatch_date = Column(Date, nullable=True)
    email_status = Column(String(30), nullable=False, default="pending")
    # 'not_applicable', 'pending', 'queued', 'sent', 'delivered', 'failed'
    email_provider_id = Column(String(100), nullable=True)
    email_sent_at = Column(DateTime, nullable=True)
    email_delivered_at = Column(DateTime, nullable=True)
    email_error = Column(Text, nullable=True)
    email_retries = Column(Integer, nullable=False, default=0)
    sms_status = Column(String(30), nullable=False, default="pending")
    # 'not_applicable', 'pending', 'queued', 'sent', 'delivered', 'failed'
    sms_provider_id = Column(String(100), nullable=True)
    sms_sent_at = Column(DateTime, nullable=True)
    sms_delivered_at = Column(DateTime, nullable=True)
    sms_error = Column(Text, nullable=True)
    sms_retries = Column(Integer, nullable=False, default=0)
    acknowledged = Column(Boolean, nullable=False, default=False)
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by = Column(String(100), nullable=True)
    acknowledgement_notes = Column(Text, nullable=True)
    stock_isolated = Column(Boolean, nullable=False, default=False)
    stock_isolated_qty = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)

    __table_args__ = (
        Index("idx_notif_rcpt_camp_status", "campaign_id", "email_status", "sms_status"),
        Index("idx_notif_rcpt_cust_camp", "customer_id", "campaign_id"),
    )



