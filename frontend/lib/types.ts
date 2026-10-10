export type Role = "pharmacist" | "compliance" | "purchase" | "warehouse" | "auditor";

export interface DemoUser {
  id: string;
  name: string;
  email?: string;
  role: Role;
  roleTitle: string;
  avatar: string;
  initials: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    id: "usr_owner",
    name: "Chethan",
    email: "chethuc809@gmail.com",
    role: "pharmacist",
    roleTitle: "Warehouse Owner & Principal Admin",
    avatar: "bg-indigo-600 text-white",
    initials: "CH",
  },
  {
    id: "usr_1",
    name: "Dr. Sneha Rao",
    email: "sneha.rao@arogyapharma.in",
    role: "pharmacist",
    roleTitle: "Chief Pharmacist (Responsible Person)",
    avatar: "bg-blue-600 text-white",
    initials: "SR",
  },
  {
    id: "usr_2",
    name: "Arun Kumar",
    role: "compliance",
    roleTitle: "Regulatory Compliance Lead",
    avatar: "bg-emerald-600 text-white",
    initials: "AK",
  },
  {
    id: "usr_3",
    name: "Pooja Sharma",
    role: "purchase",
    roleTitle: "Procurement & Purchase Manager",
    avatar: "bg-purple-600 text-white",
    initials: "PS",
  },
  {
    id: "usr_4",
    name: "Vikram Singh",
    role: "warehouse",
    roleTitle: "Distribution & Warehouse Operations Head",
    avatar: "bg-amber-600 text-white",
    initials: "VS",
  },
  {
    id: "usr_5",
    name: "Devika Menon",
    role: "auditor",
    roleTitle: "External Qualified Auditor",
    avatar: "bg-slate-600 text-white",
    initials: "DM",
  },
];

export interface FindingOption {
  id: string;
  name: string;
  description: string;
  metrics: Record<string, any>;
  projected_outcome: string;
}

export interface AgentTraceStep {
  step: number;
  phase: string;
  action: string;
  input: any;
  output: any;
  timestamp: string;
}

export interface Finding {
  id: string;
  type: "recall" | "coldchain" | "expiry" | "returnwindow" | "fefo" | "critical";
  severity: number;
  title: string;
  description: string;
  entities: Record<string, any>;
  metrics: Record<string, any>;
  deadline?: string;
  options: FindingOption[];
  recommended_action?: {
    action_id: string;
    type: string;
    chosen_option: string;
    rationale: string;
    confidence: number;
    required_role: Role;
    assumptions: string[];
  };
  explanation?: {
    formula: string;
    weights: Record<string, number>;
    sub_scores: Record<string, number>;
    is_pinned: boolean;
    final_score: number;
  };
  agent_trace?: AgentTraceStep[];
  action_id?: string;
  source_rows?: any[];
  ai_mode?: "LIVE_LLM" | "DETERMINISTIC_FALLBACK";
  multi_agent_summary?: MultiAgentSummary;
  evidence_sources?: Array<Record<string, any>>;
  rule_metadata?: Record<string, any>;
  calculation_steps?: Array<Record<string, any>>;
  data_quality_warnings?: string[];
  root_cause_analysis?: RootCauseAnalysis;
  case_id?: string;
  case_status?: string;
}

export interface RootCauseAnalysis {
  finding_type: string;
  batch?: string;
  sku?: string;
  investigated_at: string;
  confirmed_facts: Array<{
    category: string;
    fact: string;
    evidence_source: string;
    timestamp?: string;
  }>;
  ranked_hypotheses: Array<{
    rank: number;
    hypothesis: string;
    likelihood: string;
    supporting_evidence: string[];
    contradicting_evidence: string[];
    recommended_verification: string;
  }>;
  evidence_completeness: {
    score: number;
    missing_data: string[];
    is_sufficient: boolean;
  };
  investigation_summary: string;
}

export type CaseStatus =
  | "detected"
  | "verified"
  | "investigating"
  | "recommended"
  | "pending_approval"
  | "executed"
  | "outcome_checking"
  | "closed"
  | "reopened";

export type VerificationStatus =
  | "verified"
  | "unverified"
  | "disputed"
  | "false_positive"
  | "duplicate";

export interface Case {
  id: string;
  finding_id: string;
  title: string;
  status: CaseStatus | string;
  verification_status?: VerificationStatus | string;
  verification_state?: string;
  verification_reason?: string;
  verified_by?: string;
  verified_at?: string;
  assigned_role?: string;
  assigned_user?: string;
  priority?: string;
  severity?: number;
  type?: string;
  batch_id?: string;
  sku?: string;
  finding_type?: string;
  evidence_references?: Array<Record<string, any>>;
  root_cause?: RootCauseAnalysis;
  root_cause_analysis?: any;
  action_id?: string;
  recommended_action_id?: string;
  outcome_metrics?: Record<string, any>;
  outcome_notes?: string;
  closure_reason?: string;
  closed_at?: string;
  closed_by?: string;
  reopened_reason?: string;
  reopened_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DemandForecast {
  sku: string;
  product_name?: string;
  molecule?: string;
  data_sufficiency: {
    total_dispatches: number;
    date_range_days: number;
    has_minimum_history: boolean;
    is_sufficient: boolean;
    warning?: string;
  };
  metrics: {
    average_daily_demand: number;
    standard_deviation: number;
    coefficient_of_variation: number;
    demand_volatility: string;
    data_points_analyzed: number;
  };
  replenishment: {
    forecast_horizon_days: number;
    horizon_demand: number;
    supplier_lead_time_days: number;
    lead_time_demand: number;
    safety_stock_units: number;
    service_level_pct: number;
    reorder_point: number;
    current_warehouse_stock: number;
    incoming_supply_units: number;
    net_inventory_position: number;
    moq: number;
    suggested_reorder_qty: number;
    calculation_formula: string;
    replenishment_recommended: boolean;
    rationale: string;
  };
  historical_monthly_trend: Array<{ month: string; units: number }>;
}

export interface Shipment {
  id: string;
  tracking_number: string;
  carrier?: string;
  status: string;
  origin_type: string;
  origin_id?: string;
  destination_type: string;
  destination_id?: string;
  batch_id?: string;
  sku?: string;
  units: number;
  estimated_delivery?: string;
  actual_delivery?: string;
  cold_chain_compliant: boolean;
  temperature_breach_detected: boolean;
  created_at: string;
}

export interface WarehouseTransfer {
  id: string;
  transfer_number: string;
  from_warehouse: string;
  to_warehouse: string;
  batch_id: string;
  sku: string;
  units: number;
  status: string;
  reason: string;
  authorized_by?: string;
  initiated_at: string;
  completed_at?: string;
}

export interface MultiAgentSummary {
  ai_mode: "LIVE_LLM" | "DETERMINISTIC_FALLBACK";
  investigation: {
    batch: string;
    sku: string;
    product_name: string;
    storage_condition: string;
    is_critical_drug: boolean;
    total_warehouse_stock: number;
    warehouse_locations: any[];
    total_dispatched_units: number;
    customer_count: number;
    hospital_count: number;
    chemist_count: number;
    hospital_accounts: any[];
    manufacturer?: string;
    supplier_lead_time_days?: number;
    supplier_return_window_days?: number;
    supplier_credit_pct?: number;
    missing_information_warnings: string[];
    retrieved_at: string;
  };
  risk_assessment: {
    finding_type: string;
    risk_score: number;
    severity_category: string;
    patient_exposure_tier: string;
    clinical_urgency: string;
    regulatory_classification?: string;
    financial_exposure_inr: number;
    formula_used: string;
    sub_scores: Record<string, number>;
    regulatory_implications: string[];
    safe_unsafe_disclaimer: string;
  };
  solution_evaluation: {
    finding_type: string;
    evaluated_options: Array<{
      id: string;
      name: string;
      description: string;
      feasible: boolean;
      rejection_reason?: string;
      metrics: Record<string, any>;
      projected_financial_impact: string;
      target_role: string;
    }>;
    recommended_option_id: string;
    recommended_option_name: string;
    rejection_count: number;
    clean_stock_available: number;
    replacement_shortfall: number;
    coverage_ratio: number;
    cost_benefit_summary: string;
  };
  review: {
    review_passed: boolean;
    independent_verdict: string;
    objections: string[];
    warnings: string[];
    calculation_checks: Array<{
      metric: string;
      claimed_value: any;
      verified_value: any;
      matched: boolean;
      notes: string;
    }>;
    permissions_verified: boolean;
    safety_rule_compliant: boolean;
    reviewed_at: string;
  };
  coordinator: {
    action_type: string;
    chosen_option: string;
    required_role: string;
    rationale: string;
    uncertainty_score: number;
    assumptions: string[];
    coordination_summary: string;
  };
}

export interface BoardKPI {
  open_recalls: number;
  cold_breaches: number;
  value_at_risk_inr: number;
  pending_approvals: number;
  quarantined_batches: number;
}

export interface BoardResponse {
  kpis: BoardKPI;
  findings: Finding[];
  weights: Record<string, number>;
  scanned_at: string;
}

export interface BatchTraceForwardCustomer {
  customer_id: string;
  name: string;
  type: string;
  location: string;
  dispatched_qty: number;
  dispatches_count: number;
  last_dispatch_date: string;
}

export interface BatchTraceWarehouseLocation {
  warehouse: string;
  cold_room?: string;
  qty: number;
  status: string;
  mfg_date: string;
  expiry_date: string;
}

export interface BatchTraceBackwardManufacturer {
  manufacturer: string;
  lead_time_days: number;
  moq: number;
  return_window_days: number;
  credit_pct: number;
  purchase_orders: any[];
}

export interface BatchTraceResponse {
  batch: string;
  sku: string;
  product_name: string;
  molecule: string;
  storage: string;
  critical_drug: boolean;
  current_locations: BatchTraceWarehouseLocation[];
  forward_customers: BatchTraceForwardCustomer[];
  backward_manufacturer?: BatchTraceBackwardManufacturer;
  total_stock_in_wh: number;
  total_dispatched: number;
  customers_count: number;
  hospitals_count: number;
  chemists_count: number;
}

export interface ActionItem {
  id: string;
  type: string;
  payload: Record<string, any>;
  evidence: Record<string, any>;
  options: any[];
  chosen_option?: string;
  status: "draft" | "pending_approval" | "approved" | "executed" | "rejected";
  required_role: Role;
  created_at: string;
  decided_by?: string;
  decided_at?: string;
  reason?: string;
}

export interface LedgerEntry {
  seq: number;
  ts: string;
  event_type: string;
  payload: Record<string, any>;
  prev_hash: string;
  hash: string;
  curr_hash?: string;
}

export interface AnchorItem {
  id: number;
  from_seq: number;
  to_seq: number;
  merkle_root: string;
  tx_hash: string;
  chain: string;
  status: string;
}

export interface LedgerVerifyResult {
  ok: boolean;
  checked: number;
  first_bad_seq?: number;
  diff?: {
    seq: number;
    reason: string;
    expected_hash?: string;
    stored_hash?: string;
    expected_prev_hash?: string;
    actual_prev_hash?: string;
  };
}

export interface AgentTraceEvent {
  id: number;
  run_id: string;
  event_seq: number;
  event_type: "AGENT_STARTED" | "TOOL_REQUESTED" | "TOOL_COMPLETED" | "AGENT_COMPLETED" | "AGENT_FAILED" | "AGENT_SKIPPED" | "FALLBACK_USED" | "RUN_COMPLETED" | string;
  agent_name: string;
  invocation_reason?: string;
  input_summary?: any;
  referenced_evidence_ids?: string[];
  tool_name?: string;
  tool_arguments?: any;
  tool_result?: any;
  tool_error?: string;
  output_summary?: any;
  latency_ms?: number;
  timestamp: string;
}

export interface AgentRunSummary {
  run_id: string;
  correlation_id: string;
  finding_id: string;
  case_id?: string;
  batch?: string;
  sku?: string;
  provider: string;
  model?: string;
  ai_mode: string;
  fallback_reason?: string;
  status: "running" | "completed" | "failed" | "fallback" | string;
  total_latency_ms: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  chosen_option?: string;
  recommended_action?: string;
  required_role?: string;
  uncertainty_score: number;
  review_passed: boolean;
  review_verdict?: string;
  action_id?: string;
  human_approval_status: "pending_approval" | "executed" | "rejected" | string;
  created_at: string;
  completed_at?: string;
  events_count: number;
}

export interface AgentRunDetail extends AgentRunSummary {
  events: AgentTraceEvent[];
}

export interface AgentMonitorStats {
  total_runs: number;
  live_llm_runs: number;
  fallback_runs: number;
  failed_runs: number;
  avg_latency_ms: number;
  review_pass_rate_pct: number;
  pending_human_approvals: number;
  tool_invocation_counts: Record<string, number>;
}

