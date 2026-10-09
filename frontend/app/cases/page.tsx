Multi - Agent Execution Monitor: Architecture Audit & Implementation Report
Phase 1 — Comprehensive Architecture Audit
1. Specialist Classes, Orchestrator, Runners & Fallback Audit
Component	Actual Implementation	Execution Model


InvestigationAgent
Python class querying read - only database tools(tool_trace_batch, tool_get_supplier_terms).Synchronous Deterministic Python.Executes SQL queries against SQLite / Postgres.Zero LLM tokens consumed.


  RiskAssessmentAgent
Python class evaluating clinical exposure, financial value at risk, and regulatory class (CDSCO Schedule M).	Synchronous Deterministic Python.Multi - factor severity math formulas.Zero LLM tokens consumed.


  SolutionEvaluationAgent
Python class evaluating options against real clean warehouse stock(tool_coverage_check).Rejects prohibited options.Synchronous Deterministic Python.Enforces physical inventory constraints and regulatory prohibitions.


  ReviewAgent
Independent adversarial reviewer auditing clean stock arithmetic, role permissions, and safety policies.Synchronous Deterministic Python.Rejects ungrounded claims or unauthorized roles.


  CoordinatorAgent
Master coordinator dispatching the 4 specialist agents, computing uncertainty score, synthesizing final proposal.Synchronous Deterministic Python.Consolidates typed Pydantic specialist outputs.


  run_nvidia_tool_loop
OpenAI - compatible Function Calling loop over HTTP to https://integrate.api.nvidia.com/v1/chat/completions (z-ai/glm-5.3).	Single External LLM Loop. When configured, executes up to 5 multi-turn tool calling iterations.


Deterministic Coordinator Fallback
Default execution path whenever NVIDIA_API_KEY(and ANTHROPIC_API_KEY) is missing, timed out, or rate - limited.Deterministic Engine.Synthesizes recommendation from specialist agents without external network calls.
2. Detailed Agent Specification Matrix
Agent Name	Purpose	Invocation Condition	Inputs	Outputs	Registered Tools Used
Live LLM Reasoner(NVIDIA NIM)	Autonomous reasoning over finding context and multi - turn tool calling.settings.NVIDIA_API_KEY present.Finding summary, candidate options, tool specifications.CoordinatorDecision JSON(action_type, chosen_option, required_role, rationale, uncertainty_score).trace_batch, coverage_check, get_supplier_terms, compare_options, allocate_stock, investigate_root_cause, forecast_demand.
Investigation Agent	Factual ground - truth telemetry retrieval.Every compliance finding evaluation cycle.Finding(entities.batch, entities.sku).

  InvestigationOutput
  (warehouse stock, dispatched units, hospital accounts, telemetry warnings).tool_trace_batch, tool_get_supplier_terms.
Risk Assessment Agent	Quantify clinical urgency and patient hazard.After Investigation Agent completes.Finding, InvestigationOutput.

  RiskAssessmentOutput
  (exposure tier, clinical urgency, INR exposure, regulatory class).None(deterministic formulas & detector scores).
Solution Evaluation Agent	Filter infeasible responses against clean inventory.After Risk Assessment completes.Finding, InvestigationOutput, RiskAssessmentOutput.

  SolutionEvaluationOutput
  (recommended option, rejected options, clean stock, replacement shortfall).tool_coverage_check.
Review Agent	Independent adversarial audit of calculations and safety rules.After Solution Evaluation completes.Finding, InvestigationOutput, RiskAssessmentOutput, SolutionEvaluationOutput.

  ReviewOutput
  (review verdict, calculation checks, objections, warnings).None(independent arithmetic and role validation).
Coordinator Agent	Synthesize consensus, uncertainty, and draft action.Final step of agent cycle.Outputs of all 4 specialist agents(+ Live LLM output if present).

  MultiAgentSummary
  , staged

Action
  (status = "pending_approval").None(consensus reconciliation).
3. Complete End - to - End Execution Trace for One Real Finding(FINDING - RECALL - B2231)
mermaid
sequenceDiagram
autonumber
    participant D as Rule Detectors(detect_recalls)
    participant O as Orchestrator & Tracer
    participant L as Live LLM(NVIDIA NIM)
    participant I as Investigation Agent
    participant R as Risk Assessment Agent
    participant S as Solution Evaluation Agent
    participant V as Review Agent(Independent Audit)
    participant C as Coordinator Agent
    participant DB as SQLite Database
    participant Ledger as Cryptographic Ledger
    participant H as Authorized Pharmacist
D ->> O: Detect B2231 Recall(Severity 96.0)
O ->> DB: tracer.start_run(run_id = "RUN-...", finding_id = "FINDING-RECALL-B2231")
    alt NVIDIA_API_KEY is configured
O ->> L: run_nvidia_tool_loop(model = "z-ai/glm-5.3", tools = 7)
L ->> DB: TOOL_REQUESTED: trace_batch("B2231")
DB-- >> L: TOOL_COMPLETED: 1, 600 units dispatched, 400 in warehouse
L-- >> O: AGENT_COMPLETED: Model decision(OPT - B, SEND_NOTICES)
    else No NVIDIA_API_KEY configured(Current Local State)
O ->> DB: AGENT_SKIPPED: Live LLM Reasoner(No credentials)
O ->> DB: FALLBACK_USED: Deterministic Multi - Agent Engine
end
O ->> I: AGENT_STARTED: Investigation Agent
I ->> DB: tool_trace_batch("B2231"), tool_get_supplier_terms("AMOX-625")
I-- >> O: AGENT_COMPLETED: Warehouse: 400, Dispatches: 1, 600, Hospitals: 20
O ->> R: AGENT_STARTED: Risk Assessment Agent
R-- >> O: AGENT_COMPLETED: CDSCO Class II, Immediate Intervention, ₹2, 40,000 at risk
O ->> S: AGENT_STARTED: Solution Evaluation Agent
S ->> DB: tool_coverage_check("AMOX-625", needed = 1, 600, exclude = ["B2231"])
S-- >> O: AGENT_COMPLETED: Recommends OPT - B(Priority Hospital Allocation + Restock PO)
O ->> V: AGENT_STARTED: Review Agent(Independent Audit)
V-- >> O: AGENT_COMPLETED: Arithmetic matched(1, 200 clean + 400 shortfall = 1, 600), Review PASSED
O ->> C: AGENT_STARTED: Coordinator Agent
C-- >> O: AGENT_COMPLETED: Synthesized SEND_NOTICES proposal(Uncertainty: 0.15)
O ->> DB: Action(status = "pending_approval", required_role = "pharmacist")
O ->> Ledger: append_ledger_event("ACTION_DRAFTED", run_id = "RUN-...")
O ->> DB: tracer.complete_run("RUN-...", human_approval_status = "pending_approval")
    Note over H: Action cannot execute automatically
H ->> DB: POST / api / actions / { id } / approve(role = "pharmacist", user = "Chief Pharmacist Priya")
DB ->> DB: Action.status = "executed"
DB ->> DB: AgentRun.human_approval_status = "executed"
DB ->> Ledger: append_ledger_event("ACTION_APPROVED")
4. Critical Architecture Insights & Clarifications
Declared Agents vs.Actual Model Calls:
Previous documentation implied multiple distinct LLM calls(one per specialist).
In reality: At most ONE LLM session is executed(the NVIDIA NIM function- calling loop in run_nvidia_tool_loop).The 4 specialist agents(InvestigationAgent, RiskAssessmentAgent, SolutionEvaluationAgent, ReviewAgent) are deterministic Python classes executing local SQL queries and mathematical formulas.
When no external API key is present, zero LLM model calls are made; the system operates 100 % via the deterministic multi - agent coordinator(DETERMINISTIC_FALLBACK).
Strict Separation of Controls:
The model and deterministic agents only draft candidate actions with status = "pending_approval".
The AgentRun.human_approval_status(pending_approval, executed, rejected) is stored in a separate column and updated solely when an authorized human pharmacist or compliance officer approves or rejects the action via / api / actions / { id } / approve.
Physical warehouse isolation and ledger events are only triggered after this human gate.
  Phase 2 — Execution Tracing Implementation
1. Database Schema
Added two persistent SQLAlchemy tables in

  backend / app / models.py
:

agent_runs:
run_id(PK, e.g.RUN - CD9459FB9E)
correlation_id(Indexed correlation identifier)
finding_id, case_id, batch, sku
provider(nvidia_nim, anthropic, deterministic)
model(z - ai / glm - 5.3)
ai_mode(LIVE_LLM, DETERMINISTIC_FALLBACK)
fallback_reason(Explicit reason when fallback is activated)
status(running, completed, failed, fallback)
total_latency_ms, total_tokens, prompt_tokens, completion_tokens
chosen_option, recommended_action, required_role, uncertainty_score
review_passed, review_verdict, action_id
human_approval_status(pending_approval, executed, rejected)
created_at, completed_at
agent_trace_events:
id(PK, autoincrement)
run_id(FK to agent_runs.run_id)
event_seq(1 - indexed sequence number)
event_type(AGENT_STARTED, TOOL_REQUESTED, TOOL_COMPLETED, AGENT_COMPLETED, AGENT_FAILED, AGENT_SKIPPED, FALLBACK_USED, RUN_COMPLETED)
agent_name
invocation_reason
input_summary(Sanitized JSON)
referenced_evidence_ids(JSON list)
tool_name, tool_arguments, tool_result, tool_error
output_summary(Sanitized JSON)
latency_ms, timestamp
2. Execution Tracer Engine
Implemented

backend / app / agent / tracer.py
:

Privacy Sanitization Guard(sanitize_payload): Recursively strips and redacts any API keys(nvapi -..., sk - ant -..., Bearer ...), passwords, secret tokens, and patient PII(phone, email, patient_name) before storing in the database.
Sequential Lifecycle Logging: start_run(), record_event(), complete_run(), fail_run(), and update_human_approval_status().
3. API Router for Execution Monitor
Implemented 

backend / app / routers / agent_monitor.py
:

GET / api / agent - monitor / runs: Query historical runs filtered by status, provider, or finding_id.
  GET / api / agent - monitor / runs / { run_id }: Granular run inspector returning the complete sequential event timeline, tool invocations, inputs, outputs, calculation checks, and human decision.
    GET / api / agent - monitor / stats: Aggregate telemetry KPIs(total runs, live LLM runs, fallback runs, average latency, review pass rate %, pending human approvals).
      Phase 3 — Agent Execution Monitor UI
Built pure - white clinical dashboard in

  frontend / app / agents / page.tsx
 and updated

frontend / components / Navbar.tsx
:

Executive Metric Strip: Real - time counters for Total Runs, Live LLM Runs, Fallback Runs, Average Latency(ms), Independent Review Pass Rate(%), and Pending Human Approvals.
Run Explorer & Filtering: Filter runs by status(completed, fallback, failed) and provider(nvidia_nim, deterministic).
Deep Execution Inspector:
Meta Strip: Correlation ID, Target Finding, Batch, SKU, Provider, Model, and Latency.
Separation of Controls & Assembly Panel: Visually distinguishes Observed Ground Facts(ERP SQL), Model Decision(SEND_NOTICES, role required), and Human Approval Gate(pending_approval / executed).
Sequential Timeline: Every lifecycle step displayed in order with timing badges.Clickable to expand raw validated arguments, tool outputs, calculation audits, and error traces.
  Phase 4 — Verification & Actual Test Results
1. Backend Test Suite(57 / 57 Tests Passed)
Ran python - m pytest across all 8 test modules:

tests / test_agent_execution_monitor.py .......[12 %]
tests / test_api_and_scenarios.py ........[26 %]
tests / test_closed_loop_intelligence.py ........[40 %]
tests / test_dataset_adaptation.py ..........[57 %]
tests / test_detectors_and_engine.py .......[70 %]
tests / test_health_and_seed.py ...[75 %]
tests / test_multi_agent.py .....[84 %]
tests / test_nvidia_nim_integration.py .........[100 %]
============================= 57 passed in 27.71s =============================
2. Dedicated Execution Monitor Tests (

test_agent_execution_monitor.py
)
test_privacy_sanitizer_strips_sensitive_data: PASSED (verifies redaction of API keys, tokens, patient PII).
test_execution_tracer_lifecycle_events: PASSED (verifies sequence of AGENT_STARTED, TOOL_REQUESTED, TOOL_COMPLETED, RUN_COMPLETED).
test_orchestrator_end_to_end_trace_generation: PASSED (verifies finding scan writes complete specialist trace to SQLite).
test_human_approval_status_separation: PASSED (verifies human approval transitions human_approval_status from pending_approval to executed while preserving model decision).
test_skipped_agent_and_fallback_tracing_on_missing_credentials: PASSED (verifies AGENT_SKIPPED and FALLBACK_USED emitted on missing API keys).
test_tool_failure_handling_in_trace: PASSED (verifies tool failure logging without crashing the orchestrator).
test_agent_monitor_api_endpoints: PASSED (verifies /runs, /runs/{id}, and /stats endpoints).
3. Frontend Production Build Verification
Ran npm run build in frontend/:

Route (app)                              Size     First Load JS
┌ ○ /                                    4.34 kB         105 kB
├ ○ /_not-found                          873 B          88.2 kB
├ ○ /agents                              7.65 kB          95 kB
├ ○ /approvals                           4.79 kB        96.3 kB
├ ○ /cases                               9.98 kB         111 kB
├ ƒ /findings/[id]                       9.83 kB         111 kB
├ ○ /inventory                           7.45 kB          99 kB
├ ○ /trace                               4.42 kB        95.9 kB
└ ○ /verify                              4.33 kB        95.8 kB
✓ Compiled successfully (0 TypeScript errors, 10 static pages generated)
4. Real Trace Output from Live Database
Inspected actual run RUN-CD9459FB9E generated by the backend on port 8000:

text
Run ID:       RUN-CD9459FB9E
Finding:      FIND-EXP-FEFO-OLD
Provider:     deterministic (Fallback)
Status:       fallback
Human Status: pending_approval
Total Events: 12
Sequential Event Trace:
 -> Event 1:  AGENT_SKIPPED     | Agent: Live LLM Reasoner (Reason: No external credentials configured)
 -> Event 2:  FALLBACK_USED      | Agent: Deterministic Multi-Agent Engine (Reason: Deterministic coordinator active)
 -> Event 3:  AGENT_STARTED      | Agent: Investigation Agent (Reason: Retrieve ground-truth batch telemetry)
 -> Event 4:  AGENT_COMPLETED    | Agent: Investigation Agent (Extracted warehouse stock & dispatches)
 -> Event 5:  AGENT_STARTED      | Agent: Risk Assessment Agent (Reason: Quantify patient exposure)
 -> Event 6:  AGENT_COMPLETED    | Agent: Risk Assessment Agent (Classified regulatory risk & INR exposure)
 -> Event 7:  AGENT_STARTED      | Agent: Solution Evaluation Agent (Reason: Evaluate clean replacement stock)
 -> Event 8:  AGENT_COMPLETED    | Agent: Solution Evaluation Agent (Filtered infeasible options)
 -> Event 9:  AGENT_STARTED      | Agent: Review Agent (Reason: Independent audit on arithmetic & safety)
 -> Event 10: AGENT_COMPLETED    | Agent: Review Agent (Review PASSED: Arithmetic matched)
 -> Event 11: AGENT_COMPLETED    | Agent: Coordinator Agent (Synthesized PICK_INSTRUCTION recommendation)
 -> Event 12: RUN_COMPLETED      | Agent: MultiAgentCoordinator (Action staged: ACT-8A2D35A8)
Files Changed / Added
Backend Database & Schemas:


backend/app/models.py
: Added AgentRun and AgentTraceEvent tables.


backend/app/schemas.py
: Added run_id to Finding, added AgentTraceEventSchema, AgentRunSummarySchema, AgentRunDetailSchema, AgentMonitorStatsSchema.
Execution Tracing Engine & Runners:


backend/app/agent/tracer.py
: Implemented ExecutionTracer and privacy-sanitizing engine.


backend/app/agent/orchestrator.py
: Integrated full lifecycle event logging and correlation tracking.


backend/app/agent/nvidia_tool_runner.py
: Integrated tracer for tool calls, latency, rate limits, timeouts, and tokens.


backend/app/routers/actions.py
: Synchronized human approvals with AgentRun.human_approval_status.


backend/app/routers/agent_monitor.py
: Created /api/agent-monitor/runs, /runs/{id}, and /stats endpoints.


backend/app/main.py
: Mounted agent_monitor.router.
Frontend Presentation:


frontend/lib/types.ts
: Added Agent Monitor TypeScript definitions.


frontend/lib/api.ts
: Added API client methods.


frontend/components/Navbar.tsx
: Added "Agent Monitor" link with Cpu icon.


frontend/app/agents/page.tsx
: Created Agent Execution Monitor dashboard.
Test Suite:


backend/tests/test_agent_execution_monitor.py
: 7 dedicated unit and integration tests.
Remaining Limitations & Honest Disclosure
Mocked Protocol vs. Live Provider Calls: The tool calling protocol, error handling, rate limiting, and timeouts are verified via automated mocks (unittest.mock.MagicMock). Because an actual NVIDIA API key (nvapi-...) is not yet present in the local environment, live external calls are skipped (AGENT_SKIPPED), and TraceRx safely activates its deterministic fallback (FALLBACK_USED). When a user sets NVIDIA_API_KEY in .env, the system automatically executes live network calls without code changes.
Strict Human Approval Preservation: Model outputs never directly execute operational changes. All proposed actions remain strictly in pending_approval until an authorized human pharmacist or compliance officer approves them."use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Search,
  Filter,
  TrendingUp,
  Truck,
  ArrowRightLeft,
  ChevronRight,
  RefreshCw,
  XCircle,
  FileCheck2,
  Info,
  Check,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react";
import { api } from "../../lib/api";
import { Case, CaseStatus, VerificationStatus, DemandForecast, Shipment, WarehouseTransfer } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/Table";
import { Skeleton, ErrorState } from "../../components/ui/FeedbackStates";
import { useUser } from "../../lib/UserContext";
import { useToast } from "../../components/ui/Toast";

export default function CasesPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"cases" | "forecast" | "logistics">("cases");
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [verificationFilter, setVerificationFilter] = useState<string>("all");

  // Selected Case Modal / Action State
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [newVerificationStatus, setNewVerificationStatus] = useState<VerificationStatus>("verified");
  const [verificationReason, setVerificationReason] = useState("");
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Forecast state
  const [forecastSku, setForecastSku] = useState("SKU-WAR-001");
  const [forecastHorizon, setForecastHorizon] = useState(30);
  const [forecastData, setForecastData] = useState<DemandForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Logistics state (Shipments & Transfers)
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [transfers, setTransfers] = useState<WarehouseTransfer[]>([]);
  const [logisticsLoading, setLogisticsLoading] = useState(false);

  // Load cases
  const loadCases = async () => {
    try {
      setLoading(true);
      setError(null);
      // Auto-sync findings first to ensure cases exist
      await api.syncCases().catch(() => {});
      const data = await api.getCases();
      setCases(data);
    } catch (err: any) {
      setError(err.message || "Failed to load closed-loop cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  // Load logistics when tab changes
  useEffect(() => {
    if (activeTab === "logistics") {
      loadLogistics();
    } else if (activeTab === "forecast" && !forecastData) {
      handleFetchForecast(forecastSku);
    }
  }, [activeTab]);

  const loadLogistics = async () => {
    try {
      setLogisticsLoading(true);
      const [s, t] = await Promise.all([
        api.getShipments().catch(() => []),
        api.getTransfers().catch(() => []),
      ]);
      setShipments(s);
      setTransfers(t);
    } catch (err: any) {
      showToast("Failed to load shipments and transfers", "error");
    } finally {
      setLogisticsLoading(false);
    }
  };

  const handleFetchForecast = async (sku: string) => {
    if (!sku.trim()) return;
    try {
      setForecastLoading(true);
      const data = await api.getDemandForecast(sku, forecastHorizon);
      setForecastData(data);
    } catch (err: any) {
      showToast(err.message || "Failed to fetch demand forecast", "error");
    } finally {
      setForecastLoading(false);
    }
  };

  const handleVerifyCase = async () => {
    if (!selectedCase) return;
    if (!verificationReason.trim()) {
      showToast("Please provide a reason for the verification state change", "error");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await api.verifyCase(
        selectedCase.id,
        newVerificationStatus,
        verificationReason,
        `${currentUser.name} (${currentUser.roleTitle})`
      );
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedCase(updated);
      setVerifyModalOpen(false);
      setVerificationReason("");
      showToast(`Case verified as '${newVerificationStatus}' and committed to ledger`, "success");
    } catch (err: any) {
      showToast(err.message || "Verification failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleInvestigateCase = async (caseItem: Case) => {
    setActionLoading(true);
    try {
      const updated = await api.investigateCase(caseItem.id);
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (selectedCase?.id === updated.id) {
        setSelectedCase(updated);
      }
      showToast("Root cause investigation completed with confirmed facts & ranked hypotheses", "success");
    } catch (err: any) {
      showToast(err.message || "Investigation failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOutcomeCheck = async (caseItem: Case) => {
    setActionLoading(true);
    try {
      const updated = await api.outcomeCheckCase(caseItem.id, "Automated compliance verification check against inventory telemetry");
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (selectedCase?.id === updated.id) {
        setSelectedCase(updated);
      }
      showToast("Outcome checked and verified against live stock telemetry", "success");
    } catch (err: any) {
      showToast(err.message || "Outcome check failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseCase = async () => {
    if (!selectedCase) return;
    if (!closeReason.trim()) {
      showToast("A closure reason is required", "error");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await api.closeCase(selectedCase.id, closeReason, `${currentUser.name} (${currentUser.roleTitle})`);
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedCase(updated);
      setCloseModalOpen(false);
      setCloseReason("");
      showToast("Case closed and sealed into tamper-evident ledger", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to close case", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenCase = async () => {
    if (!selectedCase) return;
    if (!reopenReason.trim()) {
      showToast("A reopening justification is required", "error");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await api.reopenCase(selectedCase.id, reopenReason);
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedCase(updated);
      setReopenModalOpen(false);
      setReopenReason("");
      showToast("Case reopened for re-investigation", "info");
    } catch (err: any) {
      showToast(err.message || "Failed to reopen case", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Filter cases
  const filteredCases = cases.filter((c) => {
    const cStatus = c.status || "detected";
    const cVer = c.verification_status || c.verification_state || "unverified";
    if (statusFilter !== "all" && cStatus !== statusFilter) return false;
    if (verificationFilter !== "all" && cVer !== verificationFilter) return false;
    return true;
  });

  const getStatusBadgeVariant = (st?: string) => {
    switch (st) {
      case "closed":
        return "success";
      case "executed":
        return "info";
      case "pending_approval":
        return "warning";
      case "outcome_checking":
        return "purple";
      case "investigating":
        return "info";
      case "reopened":
        return "danger";
      default:
        return "neutral";
    }
  };

  const getVerificationBadgeVariant = (vs?: string) => {
    switch (vs) {
      case "verified":
        return "success";
      case "false_positive":
        return "danger";
      case "disputed":
        return "warning";
      case "duplicate":
        return "neutral";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Closed-Loop Supply Chain Intelligence
            </h1>
            <Badge variant="purple" size="sm">
              PHASE 2 ENGINE
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Persistent case lifecycle • Root-cause facts vs hypotheses • Seasonal demand forecasting • SHA-256 privacy audit
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab("cases")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === "cases"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            Cases Desk ({cases.length})
          </button>
          <button
            onClick={() => setActiveTab("forecast")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === "forecast"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            Seasonal Forecast & Replenishment
          </button>
          <button
            onClick={() => setActiveTab("logistics")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === "logistics"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Truck className="w-3.5 h-3.5 text-amber-600" />
            Shipments & Transfers
          </button>
        </div>
      </div>

      {/* TAB 1: CASES DESK */}
      {activeTab === "cases" && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="p-3 bg-white border-slate-200">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Cases</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{cases.length}</div>
            </Card>
            <Card className="p-3 bg-white border-slate-200">
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Verified Findings</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {cases.filter((c) => (c.verification_status || c.verification_state) === "verified").length}
              </div>
            </Card>
            <Card className="p-3 bg-white border-slate-200">
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Pending Action</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {cases.filter((c) => c.status === "pending_approval" || c.status === "recommended").length}
              </div>
            </Card>
            <Card className="p-3 bg-white border-slate-200">
              <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Executed / Verifying</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {cases.filter((c) => c.status === "executed" || c.status === "outcome_checking").length}
              </div>
            </Card>
            <Card className="p-3 bg-white border-slate-200">
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Closed & Audited</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {cases.filter((c) => c.status === "closed").length}
              </div>
            </Card>
          </div>

          {/* Filters & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold">Lifecycle Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="all">All Statuses ({cases.length})</option>
                  <option value="detected">Detected</option>
                  <option value="verified">Verified</option>
                  <option value="investigating">Investigating</option>
                  <option value="recommended">Recommended</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="executed">Executed</option>
                  <option value="outcome_checking">Outcome Checking</option>
                  <option value="closed">Closed</option>
                  <option value="reopened">Reopened</option>
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold">Verification:</span>
                <select
                  value={verificationFilter}
                  onChange={(e) => setVerificationFilter(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="all">All Verification States</option>
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified</option>
                  <option value="disputed">Disputed</option>
                  <option value="false_positive">False Positive</option>
                  <option value="duplicate">Duplicate</option>
                </select>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={loadCases}
              isLoading={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sync Findings & Refresh
            </Button>
          </div>

          {/* Cases Table */}
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-8 space-y-3">
              <Layers className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">No cases found matching filters</p>
              <p className="text-xs text-slate-500">Run a compliance scan or click Sync to import findings into persistent cases.</p>
              <Button variant="primary" size="sm" onClick={loadCases}>
                Sync Compliance Findings
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case ID & Finding</TableHead>
                  <TableHead>Batch / SKU</TableHead>
                  <TableHead>Lifecycle Stage</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Root Cause Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCases.map((c) => (
                  <TableRow
                    key={c.id}
                    className={`hover:bg-slate-50/80 transition cursor-pointer ${
                      selectedCase?.id === c.id ? "bg-blue-50/40" : ""
                    }`}
                    onClick={() => setSelectedCase(c)}
                  >
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">{c.id}</span>
                          <Badge variant="purple" size="sm">
                            {c.finding_type?.toUpperCase() || "CASE"}
                          </Badge>
                          <Badge
                            variant={
                              c.priority === "CRITICAL"
                                ? "danger"
                                : c.priority === "HIGH"
                                ? "warning"
                                : "neutral"
                            }
                            size="sm"
                          >
                            {c.priority}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-700 font-medium mt-0.5 max-w-md truncate">
                          {c.title}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="font-mono text-xs">
                        <span className="font-bold text-slate-900">{c.batch_id || "N/A"}</span>
                        {c.sku && <div className="text-[11px] text-slate-500">{c.sku}</div>}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(c.status)} size="sm" className="capitalize">
                        {(c.status || "detected").replace(/_/g, " ")}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div>
                        <Badge
                          variant={getVerificationBadgeVariant(c.verification_status || c.verification_state)}
                          size="sm"
                          className="capitalize"
                        >
                          {(c.verification_status || c.verification_state || "unverified").replace(/_/g, " ")}
                        </Badge>
                        {c.verification_reason && (
                          <div className="text-[10px] text-slate-500 max-w-xs truncate mt-0.5">
                            {c.verification_reason}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {c.root_cause || (c as any).root_cause_analysis ? (
                        <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {(c.root_cause?.confirmed_facts || (c.root_cause as any)?.facts || (c as any).root_cause_analysis?.facts || []).length} Facts /{" "}
                            {(c.root_cause?.ranked_hypotheses || (c as any).root_cause_analysis?.ranked_hypotheses || []).length} Hypotheses
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not investigated yet</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedCase(c)}
                          className="text-[11px] py-1 px-2.5"
                        >
                          Inspect
                        </Button>
                        <Link href={`/findings/${c.finding_id}`}>
                          <button className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition" title="Go to Finding Detail">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Detailed Selected Case Drawer / Card */}
          {selectedCase && (
            <Card className="p-6 bg-white border-slate-300 shadow-md space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                      {selectedCase.id}
                    </span>
                    <Badge variant={getStatusBadgeVariant(selectedCase.status)} size="sm">
                      LIFECYCLE: {(selectedCase.status || "detected").toUpperCase().replace(/_/g, " ")}
                    </Badge>
                    <Badge variant={getVerificationBadgeVariant(selectedCase.verification_status || selectedCase.verification_state)} size="sm">
                      VERIFICATION: {(selectedCase.verification_status || selectedCase.verification_state || "unverified").toUpperCase().replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <h2 className="text-base font-bold text-slate-900">{selectedCase.title}</h2>
                  <p className="text-xs text-slate-500">
                    Linked Finding ID: <code className="font-mono">{selectedCase.finding_id}</code> • Created:{" "}
                    {new Date(selectedCase.created_at).toLocaleString()}
                  </p>
                </div>

                {/* Case Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setNewVerificationStatus(
                        ((selectedCase.verification_status || selectedCase.verification_state) as VerificationStatus) || "verified"
                      );
                      setVerificationReason(selectedCase.verification_reason || "");
                      setVerifyModalOpen(true);
                    }}
                  >
                    Change Verification
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleInvestigateCase(selectedCase)}
                    isLoading={actionLoading}
                  >
                    Run Root-Cause Engine
                  </Button>

                  {selectedCase.status === "executed" && (
                    <Button
                      variant="emerald"
                      size="sm"
                      onClick={() => handleOutcomeCheck(selectedCase)}
                      isLoading={actionLoading}
                    >
                      Check Outcome
                    </Button>
                  )}

                  {selectedCase.status !== "closed" ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setCloseModalOpen(true)}
                    >
                      Close Case
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setReopenModalOpen(true)}
                    >
                      Reopen Case
                    </Button>
                  )}
                </div>
              </div>

              {/* Lifecycle Stage Progress Bar */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Closed-Loop Stage Progression
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-1 text-[11px] font-medium text-center">
                  {[
                    "detected",
                    "verified",
                    "investigating",
                    "recommended",
                    "pending_approval",
                    "executed",
                    "closed",
                  ].map((stage, idx) => {
                    const isPassed =
                      selectedCase.status === stage ||
                      (selectedCase.status === "closed" && stage !== "closed") ||
                      (selectedCase.status === "executed" && idx < 5) ||
                      (selectedCase.status === "pending_approval" && idx < 4);
                    const isCurrent = selectedCase.status === stage;

                    return (
                      <div
                        key={stage}
                        className={`p-2 rounded-lg border transition ${
                          isCurrent
                            ? "bg-blue-600 text-white font-bold border-blue-700 shadow-sm"
                            : isPassed
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold"
                            : "bg-slate-50 text-slate-400 border-slate-200"
                        }`}
                      >
                        <div className="text-[10px] uppercase">{stage.replace(/_/g, " ")}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Root Cause Facts vs Hypotheses */}
              {selectedCase.root_cause || (selectedCase as any).root_cause_analysis ? (
                (() => {
                  const rc = selectedCase.root_cause || (selectedCase as any).root_cause_analysis;
                  const confirmedFacts = rc.confirmed_facts || rc.facts || [];
                  const rankedHypotheses = rc.ranked_hypotheses || [];
                  const completenessScore = rc.evidence_completeness?.score ?? 50;
                  const isSufficient = rc.evidence_completeness?.is_sufficient ?? false;

                  return (
                    <div className="space-y-4 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          Deterministic Root-Cause Analysis (Zero Fabrication)
                        </h3>
                        <Badge variant={isSufficient ? "success" : "warning"} size="sm">
                          Evidence Completeness: {completenessScore}%
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Confirmed Facts */}
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                          <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            Confirmed Facts ({confirmedFacts.length})
                          </div>
                          <div className="space-y-2">
                            {confirmedFacts.map((cf: any, i: number) => (
                              <div key={i} className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs space-y-1">
                                <div className="font-semibold text-slate-900">{cf.fact}</div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  Source: {cf.evidence_source || cf.source || "Database"} {cf.timestamp ? `• ${cf.timestamp}` : ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Ranked Hypotheses */}
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                          <div className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4" />
                            Ranked Hypotheses ({rankedHypotheses.length})
                          </div>
                          <div className="space-y-2">
                            {rankedHypotheses.map((hyp: any, i: number) => (
                              <div key={i} className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-900">
                                    #{hyp.rank || i + 1} {hyp.hypothesis}
                                  </span>
                                  <Badge
                                    variant={
                                      hyp.likelihood === "HIGH"
                                        ? "danger"
                                        : hyp.likelihood === "MEDIUM"
                                        ? "warning"
                                        : "neutral"
                                    }
                                    size="sm"
                                  >
                                    {hyp.likelihood || "HYPOTHESIS"}
                                  </Badge>
                                </div>
                                {hyp.supporting_evidence && (
                                  <div className="text-[11px] text-slate-600">
                                    <strong>Supporting:</strong> {Array.isArray(hyp.supporting_evidence) ? hyp.supporting_evidence.join("; ") : hyp.supporting_evidence}
                                  </div>
                                )}
                                {hyp.recommended_verification && (
                                  <div className="text-[11px] text-slate-500">
                                    <strong>Verification:</strong> {hyp.recommended_verification}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 italic">
                        Strict Zero-Fabrication Rule: Hypotheses are generated only from cross-correlated database records.
                        Missing temperature loggers or unrecorded supplier notes are explicitly identified rather than assumed.
                      </p>
                    </div>
                  );
                })()
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                  <p className="text-xs text-slate-600">Root-cause investigation has not yet been executed for this case.</p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleInvestigateCase(selectedCase)}
                    isLoading={actionLoading}
                  >
                    Execute Deterministic Root-Cause Investigation
                  </Button>
                </div>
              )}

              {/* Evidence References */}
              {selectedCase.evidence_references && selectedCase.evidence_references.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Source Evidence References
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {selectedCase.evidence_references.map((ev, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono">
                        <div className="text-slate-500 text-[10px] uppercase font-bold">{ev.source_table}</div>
                        <div className="text-slate-900 font-semibold truncate">{ev.description}</div>
                        <div className="text-slate-400 text-[10px] mt-0.5">{ev.record_count} record(s) attached</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: SEASONAL DEMAND FORECASTING & REPLENISHMENT */}
      {activeTab === "forecast" && (
        <div className="space-y-6">
          <Card className="p-6 bg-white border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Statistical Demand Forecast & Suggested Replenishment
                </h2>
                <p className="text-xs text-slate-500">
                  Authoritative deterministic calculations • 95% service level ($Z=1.65$) • Lead-time safety stock • Strict Data Sufficiency Guard
                </p>
              </div>

              {/* SKU selector */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={forecastSku}
                  onChange={(e) => setForecastSku(e.target.value)}
                  placeholder="Enter SKU (e.g. SKU-WAR-001)"
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 w-44"
                />
                <select
                  value={forecastHorizon}
                  onChange={(e) => setForecastHorizon(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
                >
                  <option value={15}>15 Days Horizon</option>
                  <option value={30}>30 Days Horizon</option>
                  <option value={60}>60 Days Horizon</option>
                  <option value={90}>90 Days Horizon</option>
                </select>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleFetchForecast(forecastSku)}
                  isLoading={forecastLoading}
                >
                  Compute Forecast
                </Button>
              </div>
            </div>

            {/* Data Sufficiency Guard Banner */}
            {forecastData && !forecastData.data_sufficiency.is_sufficient && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  DATA SUFFICIENCY GUARD TRIGGERED — CONFIDENT FORECAST REFUSED
                </div>
                <p className="text-xs leading-relaxed">
                  {forecastData.data_sufficiency.warning ||
                    "TraceRx detected fewer than 10 historical dispatches or less than 14 days of distribution history. In accordance with clinical governance standards, automated automated purchase suggestions are suppressed."}
                </p>
                <div className="text-[11px] font-mono text-amber-800">
                  Historical Dispatches: {forecastData.data_sufficiency.total_dispatches} • Date Span: {forecastData.data_sufficiency.date_range_days} days (Minimum 14 required)
                </div>
              </div>
            )}

            {/* Active Forecast Display */}
            {forecastData && (
              <div className="space-y-6 pt-2">
                {/* Product Header */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Analyzed Molecule</div>
                    <div className="text-base font-bold text-slate-900">
                      {forecastData.product_name || forecastData.sku} ({forecastData.sku})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={forecastData.metrics.demand_volatility === "LOW" ? "success" : "warning"} size="sm">
                      Volatility: {forecastData.metrics.demand_volatility}
                    </Badge>
                    <Badge variant="neutral" size="sm">
                      CV: {Math.round(forecastData.metrics.coefficient_of_variation * 100)}%
                    </Badge>
                  </div>
                </div>

                {/* Mathematical Telemetry Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Avg Daily Demand</div>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      {forecastData.metrics.average_daily_demand} <span className="text-xs text-slate-500 font-normal">units/day</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Supplier Lead Time</div>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      {forecastData.replenishment.supplier_lead_time_days} <span className="text-xs text-slate-500 font-normal">days</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Safety Stock ($Z=1.65$)</div>
                    <div className="text-xl font-bold text-emerald-700 mt-1">
                      {forecastData.replenishment.safety_stock_units} <span className="text-xs text-slate-500 font-normal">units</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Reorder Point (ROP)</div>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      {forecastData.replenishment.reorder_point} <span className="text-xs text-slate-500 font-normal">units</span>
                    </div>
                  </div>
                </div>

                {/* Replenishment Calculation Card */}
                <Card className="p-5 bg-white border-slate-200 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-indigo-600" />
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                        Suggested Replenishment Recommendation
                      </h3>
                    </div>
                    <Badge
                      variant={forecastData.replenishment.replenishment_recommended ? "warning" : "success"}
                      size="sm"
                    >
                      {forecastData.replenishment.replenishment_recommended ? "REORDER REQUIRED" : "STOCK SUFFICIENT"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                        <span className="text-slate-600">Current Warehouse Stock:</span>
                        <span className="font-bold text-slate-900">{forecastData.replenishment.current_warehouse_stock} units</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                        <span className="text-slate-600">Incoming Supply (POs/Shipments):</span>
                        <span className="font-bold text-slate-900">{forecastData.replenishment.incoming_supply_units} units</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                        <span className="text-slate-600">Net Inventory Position:</span>
                        <span className="font-bold text-slate-900">{forecastData.replenishment.net_inventory_position} units</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                        <span className="text-slate-600">Supplier MOQ (Minimum Order):</span>
                        <span className="font-bold text-slate-900">{forecastData.replenishment.moq} units</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 flex justify-between text-blue-900 font-bold">
                        <span>Suggested Purchase Quantity:</span>
                        <span className="text-sm">{forecastData.replenishment.suggested_reorder_qty} units</span>
                      </div>
                      <div className="p-2 rounded bg-slate-100 font-mono text-[10px] text-slate-600">
                        Formula: {forecastData.replenishment.calculation_formula}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    <strong>Operational Rationale: </strong>{forecastData.replenishment.rationale}
                  </div>
                </Card>

                {/* Historical Monthly Trend */}
                {forecastData.historical_monthly_trend.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Historical Monthly Dispatch Profile
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-xs">
                      {forecastData.historical_monthly_trend.map((trend) => (
                        <div key={trend.month} className="p-3 rounded-lg bg-white border border-slate-200 text-center">
                          <div className="text-[10px] font-mono text-slate-500 uppercase">{trend.month}</div>
                          <div className="text-base font-bold text-slate-900 mt-1">{trend.units}</div>
                          <div className="text-[10px] text-slate-400">units</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: SUPPLY CHAIN LOGISTICS (SHIPMENTS & TRANSFERS) */}
      {activeTab === "logistics" && (
        <div className="space-y-6">
          {/* Active Shipments Card */}
          <Card className="p-6 bg-white border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-indigo-600" />
                  Active Inbound & Outbound Shipments
                </h2>
                <p className="text-xs text-slate-500">
                  Track cold-chain compliant pharma distribution with automated breach monitoring
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={loadLogistics}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
              </Button>
            </div>

            {logisticsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : shipments.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                No active external shipments in the system.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tracking #</TableHead>
                    <TableHead>Batch / SKU</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cold Chain Integrity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs font-bold text-slate-900">
                        {s.tracking_number}
                        <div className="text-[10px] text-slate-500 font-normal">{s.carrier || "Standard Pharma Courier"}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.batch_id || "N/A"} ({s.sku || "N/A"})
                      </TableCell>
                      <TableCell className="text-xs font-bold text-slate-900">{s.units}</TableCell>
                      <TableCell className="text-xs text-slate-700 capitalize">
                        {s.destination_type}: {s.destination_id}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === "delivered" ? "success" : "info"} size="sm" className="capitalize">
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.temperature_breach_detected ? (
                          <Badge variant="danger" size="sm">BREACH DETECTED</Badge>
                        ) : (
                          <Badge variant="success" size="sm">COMPLIANT (2-8°C)</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* Inter-Warehouse Transfers Card */}
          <Card className="p-6 bg-white border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-amber-600" />
                  Inter-Warehouse Stock Transfers
                </h2>
                <p className="text-xs text-slate-500">
                  Atomic physical stock balances updated upon execution with ledger commit
                </p>
              </div>
            </div>

            {logisticsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : transfers.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                No inter-warehouse transfers recorded. Approving a stock transfer action creates an entry here automatically.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer #</TableHead>
                    <TableHead>Batch / SKU</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs font-bold text-slate-900">
                        {t.transfer_number}
                        <div className="text-[10px] text-slate-500 font-normal">
                          {new Date(t.initiated_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {t.batch_id} ({t.sku})
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-800">
                        {t.from_warehouse} → {t.to_warehouse}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-slate-900">{t.units}</TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-xs truncate">{t.reason}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "completed" ? "success" : "warning"} size="sm" className="capitalize">
                          {t.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* Verification State Change Modal */}
      <Modal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        title="Verify Case Finding"
        description={`Record official state change for Case ${selectedCase?.id}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setVerifyModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleVerifyCase} isLoading={actionLoading}>
              Commit State to Ledger
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs text-slate-700">
          <div>
            <label className="block font-semibold text-slate-900 mb-1">Select Verification State:</label>
            <select
              value={newVerificationStatus}
              onChange={(e) => setNewVerificationStatus(e.target.value as VerificationStatus)}
              className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
            >
              <option value="verified">Verified (Confirmed authentic issue)</option>
              <option value="unverified">Unverified (Requires field audit)</option>
              <option value="disputed">Disputed (Challenged by supplier/facility)</option>
              <option value="false_positive">False Positive (Telemetry glitch or safe breach)</option>
              <option value="duplicate">Duplicate (Handled in existing case)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-900 mb-1">
              Recorded Reason & Supporting Telemetry:
            </label>
            <textarea
              value={verificationReason}
              onChange={(e) => setVerificationReason(e.target.value)}
              placeholder="State justification (e.g. Supplier recall letter confirmed via CDSCO circular)..."
              rows={3}
              className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>
      </Modal>

      {/* Close Case Modal */}
      <Modal
        isOpen={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        title="Close Compliance Case"
        description={`Formal closure and sealing into SHA-256 audit trail for Case ${selectedCase?.id}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleCloseCase} isLoading={actionLoading}>
              Confirm Closure & Commit
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-slate-700">
          <p className="text-slate-600">
            Please document the final clinical or operational resolution before sealing this case.
          </p>
          <textarea
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder="e.g. 100% of affected batch quarantined and replaced; hospital notified..."
            rows={3}
            className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </Modal>

      {/* Reopen Case Modal */}
      <Modal
        isOpen={reopenModalOpen}
        onClose={() => setReopenModalOpen(false)}
        title="Reopen Case"
        description={`Reopen Case ${selectedCase?.id} for re-investigation`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopenModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleReopenCase} isLoading={actionLoading}>
              Reopen Case
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-slate-700">
          <p className="text-slate-600">State the new evidence or operational rationale for reopening:</p>
          <textarea
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="e.g. Additional secondary customer reported adverse temperature reading..."
            rows={3}
            className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </Modal>
    </div>
  );
}
