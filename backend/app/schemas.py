from datetime import date as dt_date, datetime as dt_datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, ConfigDict

# Base & Entities
class ProductSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sku: str
    molecule: str
    brand: str
    category: str
    storage: str
    critical_drug: bool

class BatchInventorySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sku: str
    batch: str
    warehouse: str
    cold_room: Optional[str] = None
    qty: int
    mfg_date: dt_date
    expiry_date: dt_date
    status: str

class CustomerSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    customer_id: str
    name: str
    type: str
    location: str
    credit_terms: str

class DispatchSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: dt_date
    customer_id: str
    sku: str
    batch: str
    qty: int
    from_warehouse: str

class TempLogSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    warehouse: str
    cold_room: str
    ts: dt_datetime
    temp_c: float

class RecallCreate(BaseModel):
    id: Optional[str] = None
    date: Optional[dt_date] = None
    sku: str
    batches: List[str]
    reason: str
    recall_class: str = "II"

class RecallSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    date: dt_date
    sku: str
    batches: List[str]
    reason: str
    recall_class: str



# Findings & Detection
class FindingOption(BaseModel):
    id: str
    name: str
    description: str
    metrics: Dict[str, Any] = Field(default_factory=dict)
    projected_outcome: str = ""

class Finding(BaseModel):
    id: str
    type: str  # recall, coldchain, expiry, returnwindow, fefo, critical
    severity: float  # 0 to 100
    title: str
    description: str
    entities: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    deadline: Optional[str] = None
    options: List[FindingOption] = Field(default_factory=list)
    recommended_action: Optional[Dict[str, Any]] = None
    explanation: Optional[Dict[str, Any]] = None
    agent_trace: Optional[List[Dict[str, Any]]] = None
    action_id: Optional[str] = None
    source_rows: Optional[List[Dict[str, Any]]] = None
    ai_mode: Optional[str] = "DETERMINISTIC_FALLBACK"
    multi_agent_summary: Optional[Dict[str, Any]] = None

    # Evidence-backed audit fields
    evidence_sources: List[Dict[str, Any]] = Field(default_factory=list)
    rule_metadata: Optional[Dict[str, Any]] = None
    calculation_steps: List[Dict[str, Any]] = Field(default_factory=list)
    data_quality_warnings: List[str] = Field(default_factory=list)
    root_cause_analysis: Optional[Dict[str, Any]] = None
    case_id: Optional[str] = None
    case_status: Optional[str] = None
    run_id: Optional[str] = None

# Actions & Approvals
class ActionCreate(BaseModel):
    type: str
    payload: Dict[str, Any]
    evidence: Dict[str, Any]
    options: List[Dict[str, Any]]
    chosen_option: Optional[str] = None
    required_role: str

class ActionDecisionRequest(BaseModel):
    role: str
    user_name: str
    reason: Optional[str] = None

class ActionSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: str
    payload: Dict[str, Any]
    evidence: Dict[str, Any]
    options: List[Dict[str, Any]]
    chosen_option: Optional[str] = None
    status: str
    required_role: str
    created_at: str
    decided_by: Optional[str] = None
    decided_at: Optional[str] = None
    reason: Optional[str] = None

# Ledger & Verification
class LedgerEntrySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    seq: int
    ts: str
    event_type: str
    payload: Dict[str, Any]
    prev_hash: str
    hash: str

class AnchorSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    from_seq: int
    to_seq: int
    merkle_root: str
    tx_hash: str
    chain: str
    status: str


class LedgerVerifyResponse(BaseModel):
    ok: bool
    checked: int
    first_bad_seq: Optional[int] = None
    diff: Optional[Dict[str, Any]] = None

# Trace & Board
class BatchTraceForwardCustomer(BaseModel):
    customer_id: str
    name: str
    type: str
    location: str
    dispatched_qty: int
    dispatches_count: int
    last_dispatch_date: str

class BatchTraceWarehouseLocation(BaseModel):
    warehouse: str
    cold_room: Optional[str] = None
    qty: int
    status: str
    mfg_date: str
    expiry_date: str

class BatchTraceBackwardManufacturer(BaseModel):
    manufacturer: str
    lead_time_days: int
    moq: int
    return_window_days: int
    credit_pct: float
    purchase_orders: List[Dict[str, Any]] = Field(default_factory=list)

class BatchTraceResponse(BaseModel):
    batch: str
    sku: str
    product_name: str
    molecule: str
    storage: str
    critical_drug: bool
    current_locations: List[BatchTraceWarehouseLocation]
    forward_customers: List[BatchTraceForwardCustomer]
    backward_manufacturer: Optional[BatchTraceBackwardManufacturer]
    total_stock_in_wh: int
    total_dispatched: int
    customers_count: int
    hospitals_count: int
    chemists_count: int

class BoardKPI(BaseModel):
    open_recalls: int
    cold_breaches: int
    value_at_risk_inr: float
    pending_approvals: int
    quarantined_batches: int

class BoardResponse(BaseModel):
    kpis: BoardKPI
    findings: List[Finding]
    weights: Dict[str, float]
    scanned_at: str

# Closed-Loop Cases
class CaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    finding_id: str
    title: str
    type: str
    severity: float
    status: str
    verification_state: str
    verification_status: Optional[str] = None
    verification_reason: Optional[str] = None
    verification_evidence: Optional[Dict[str, Any]] = None
    verified_by: Optional[str] = None
    verified_at: Optional[str] = None
    batch_id: Optional[str] = None
    sku: Optional[str] = None
    root_cause: Optional[Dict[str, Any]] = None
    root_cause_analysis: Optional[Dict[str, Any]] = None
    action_id: Optional[str] = None
    outcome_metrics: Optional[Dict[str, Any]] = None
    outcome_check_result: Optional[str] = None
    closure_reason: Optional[str] = None
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    created_at: str
    updated_at: str

class CaseVerificationRequest(BaseModel):
    verification_state: str  # verified, disputed, false_positive, duplicate
    reason: str
    verified_by: str
    evidence_notes: Optional[str] = None

class CaseCloseRequest(BaseModel):
    reason: str
    closed_by: str
    resolution_notes: Optional[str] = None

class CaseReopenRequest(BaseModel):
    reason: str
    reopened_by: str

# Supply Chain Operations
class ShipmentSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tracking_number: str
    carrier: str
    type: str
    po_id: Optional[str] = None
    sku: str
    batch: Optional[str] = None
    qty: int
    origin: str
    destination: str
    temp_controlled: bool
    status: str
    dispatched_at: str
    expected_delivery: str
    actual_delivery: Optional[str] = None
    notes: Optional[str] = None

class ShipmentCreate(BaseModel):
    tracking_number: str
    carrier: str
    type: str = "inbound"
    po_id: Optional[str] = None
    sku: str
    batch: Optional[str] = None
    qty: int
    origin: str
    destination: str
    temp_controlled: bool = False
    dispatched_at: Optional[str] = None
    expected_delivery: str
    notes: Optional[str] = None

class WarehouseTransferSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sku: str
    batch: str
    from_warehouse: str
    to_warehouse: str
    qty: int
    reason: str
    status: str
    requested_by: str
    approved_by: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None

class WarehouseTransferCreate(BaseModel):
    sku: str
    batch: str
    from_warehouse: str
    to_warehouse: str
    qty: int
    reason: str
    requested_by: str

# ---------------------------------------------------------------------------
# Agent Execution Monitor Schemas
# ---------------------------------------------------------------------------

class AgentTraceEventSchema(BaseModel):
    id: int
    run_id: str
    event_seq: int
    event_type: str  # AGENT_STARTED, TOOL_REQUESTED, TOOL_COMPLETED, AGENT_COMPLETED, AGENT_FAILED, AGENT_SKIPPED, FALLBACK_USED, RUN_COMPLETED
    agent_name: str
    invocation_reason: Optional[str] = None
    input_summary: Optional[Dict[str, Any]] = None
    referenced_evidence_ids: Optional[List[str]] = None
    tool_name: Optional[str] = None
    tool_arguments: Optional[Dict[str, Any]] = None
    tool_result: Optional[Any] = None
    tool_error: Optional[str] = None
    output_summary: Optional[Dict[str, Any]] = None
    latency_ms: Optional[float] = None
    timestamp: str

class AgentRunSummarySchema(BaseModel):
    run_id: str
    correlation_id: str
    finding_id: str
    case_id: Optional[str] = None
    batch: Optional[str] = None
    sku: Optional[str] = None
    provider: str
    model: Optional[str] = None
    ai_mode: str
    fallback_reason: Optional[str] = None
    status: str
    total_latency_ms: float
    total_tokens: int
    prompt_tokens: int = 0
    completion_tokens: int = 0
    chosen_option: Optional[str] = None
    recommended_action: Optional[str] = None
    required_role: Optional[str] = None
    uncertainty_score: float
    review_passed: bool
    review_verdict: Optional[str] = None
    action_id: Optional[str] = None
    human_approval_status: str
    created_at: str
    completed_at: Optional[str] = None
    events_count: int = 0

class AgentRunDetailSchema(AgentRunSummarySchema):
    events: List[AgentTraceEventSchema] = Field(default_factory=list)

class AgentMonitorStatsSchema(BaseModel):
    total_runs: int
    live_llm_runs: int
    fallback_runs: int
    failed_runs: int
    avg_latency_ms: float
    review_pass_rate_pct: float
    pending_human_approvals: int
    tool_invocation_counts: Dict[str, int] = Field(default_factory=dict)

