from datetime import date, datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field

# Base & Entities
class ProductSchema(BaseModel):
    sku: str
    molecule: str
    brand: str
    category: str
    storage: str
    critical_drug: bool

    class Config:
        from_attributes = True

class BatchInventorySchema(BaseModel):
    id: int
    sku: str
    batch: str
    warehouse: str
    cold_room: Optional[str] = None
    qty: int
    mfg_date: date
    expiry_date: date
    status: str

    class Config:
        from_attributes = True

class CustomerSchema(BaseModel):
    customer_id: str
    name: str
    type: str
    location: str
    credit_terms: str

    class Config:
        from_attributes = True

class DispatchSchema(BaseModel):
    id: int
    date: date
    customer_id: str
    sku: str
    batch: str
    qty: int
    from_warehouse: str

    class Config:
        from_attributes = True

class TempLogSchema(BaseModel):
    id: int
    warehouse: str
    cold_room: str
    ts: datetime
    temp_c: float

    class Config:
        from_attributes = True

class RecallCreate(BaseModel):
    id: Optional[str] = None
    date: Optional[date] = None
    sku: str
    batches: List[str]
    reason: str
    recall_class: str = "II"

class RecallSchema(BaseModel):
    id: str
    date: date
    sku: str
    batches: List[str]
    reason: str
    recall_class: str

    class Config:
        from_attributes = True

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

    class Config:
        from_attributes = True

# Ledger & Verification
class LedgerEntrySchema(BaseModel):
    seq: int
    ts: str
    event_type: str
    payload: Dict[str, Any]
    prev_hash: str
    hash: str

    class Config:
        from_attributes = True

class AnchorSchema(BaseModel):
    id: int
    from_seq: int
    to_seq: int
    merkle_root: str
    tx_hash: str
    chain: str
    status: str

    class Config:
        from_attributes = True

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
