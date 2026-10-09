from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone

class InvestigationOutput(BaseModel):
    batch: str
    sku: str
    product_name: str
    molecule: str
    storage_condition: str
    is_critical_drug: bool
    total_warehouse_stock: int
    warehouse_locations: List[Dict[str, Any]] = Field(default_factory=list)
    total_dispatched_units: int
    customer_count: int
    hospital_count: int
    chemist_count: int
    hospital_accounts: List[Dict[str, Any]] = Field(default_factory=list)
    manufacturer: Optional[str] = None
    supplier_lead_time_days: Optional[int] = None
    supplier_return_window_days: Optional[int] = None
    supplier_credit_pct: Optional[float] = None
    missing_information_warnings: List[str] = Field(default_factory=list)
    retrieved_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class RiskAssessmentOutput(BaseModel):
    finding_type: str
    risk_score: float = Field(ge=0.0, le=100.0)
    severity_category: str  # Critical, High, Moderate, Low
    patient_exposure_tier: str  # Direct Hospital ICU Exposure, Retail Pharmacy Distribution, Internal Warehouse Quarantined
    clinical_urgency: str
    regulatory_classification: Optional[str] = None  # e.g. "CDSCO Class II Recall (Schedule M)"
    financial_exposure_inr: float = 0.0
    formula_used: str
    sub_scores: Dict[str, float] = Field(default_factory=dict)
    regulatory_implications: List[str] = Field(default_factory=list)
    safe_unsafe_disclaimer: str = (
        "Strict Policy Notice: The Risk Assessment Agent NEVER declares a medicine safe or unsafe. "
        "Evaluations are strictly operational and regulatory; clinical efficacy reviews must be performed by a licensed Chief Pharmacist."
    )

class EvaluatedOption(BaseModel):
    id: str
    name: str
    description: str
    feasible: bool
    rejection_reason: Optional[str] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
    projected_financial_impact: str = ""
    target_role: str

class SolutionEvaluationOutput(BaseModel):
    finding_type: str
    evaluated_options: List[EvaluatedOption] = Field(default_factory=list)
    recommended_option_id: str
    recommended_option_name: str
    rejection_count: int = 0
    clean_stock_available: int = 0
    replacement_shortfall: int = 0
    coverage_ratio: float = 0.0
    allocation_summary: Optional[Dict[str, Any]] = None
    cost_benefit_summary: str = ""

class CalculationCheck(BaseModel):
    metric: str
    claimed_value: Any
    verified_value: Any
    matched: bool
    notes: str

class ReviewOutput(BaseModel):
    review_passed: bool
    independent_verdict: str
    objections: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    calculation_checks: List[CalculationCheck] = Field(default_factory=list)
    permissions_verified: bool
    safety_rule_compliant: bool
    reviewed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CoordinatorDecision(BaseModel):
    action_type: str
    chosen_option: str
    required_role: str
    rationale: str
    uncertainty_score: float = Field(ge=0.0, le=1.0)  # 0.0 = total certainty, 1.0 = maximum uncertainty
    assumptions: List[str] = Field(default_factory=list)
    coordination_summary: str

class MultiAgentSummary(BaseModel):
    ai_mode: str  # "LIVE_LLM" | "DETERMINISTIC_FALLBACK"
    investigation: InvestigationOutput
    risk_assessment: RiskAssessmentOutput
    solution_evaluation: SolutionEvaluationOutput
    review: ReviewOutput
    coordinator: CoordinatorDecision
