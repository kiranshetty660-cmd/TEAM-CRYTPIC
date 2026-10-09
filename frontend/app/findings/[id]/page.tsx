"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Sparkles,
  Layers,
  FileCheck2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  CheckCircle,
  Info,
  Search,
  Scale,
  Bot,
  AlertOctagon,
  CheckCircle2,
  Check,
  TrendingUp,
  Database,
  Cpu,
  History,
  FileText,
  CheckCheck,
} from "lucide-react";
import { api } from "../../../lib/api";
import { Finding, DemandForecast, Case } from "../../../lib/types";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { Modal } from "../../../components/ui/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/Table";
import { Skeleton, ErrorState } from "../../../components/ui/FeedbackStates";
import { useUser } from "../../../lib/UserContext";
import { useToast } from "../../../components/ui/Toast";

export default function FindingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useUser();
  const { showToast } = useToast();

  const findingId = params.id as string;
  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decision Modal State
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<"approve" | "reject">("approve");
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(true);

  // Demand Forecast State
  const [forecastModalOpen, setForecastModalOpen] = useState(false);
  const [forecastData, setForecastData] = useState<DemandForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  useEffect(() => {
    async function loadFinding() {
      try {
        setLoading(true);
        const res = await api.getFinding(findingId);
        setFinding(res);
      } catch (err: any) {
        setError(err.message || "Failed to load finding details");
      } finally {
        setLoading(false);
      }
    }
    loadFinding();
  }, [findingId]);

  const handleDecision = async () => {
    if (!finding?.action_id) return;
    setSubmitting(true);
    try {
      if (decisionType === "approve") {
        await api.approveAction(
          finding.action_id,
          currentUser.role,
          currentUser.name,
          `Approved by ${currentUser.name} (${currentUser.roleTitle})`
        );
        showToast(`Action ${finding.action_id} authorized and executed into audit ledger`, "success");
      } else {
        if (!rejectionReason.trim()) {
          showToast("A rejection reason is required", "error");
          setSubmitting(false);
          return;
        }
        await api.rejectAction(finding.action_id, currentUser.role, currentUser.name, rejectionReason);
        showToast(`Action ${finding.action_id} rejected and logged to ledger`, "info");
      }
      setDecisionModalOpen(false);
      router.push("/approvals");
    } catch (err: any) {
      showToast(err.message || "Decision submission failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadForecast = async (sku: string) => {
    try {
      setForecastLoading(true);
      setForecastModalOpen(true);
      const data = await api.getDemandForecast(sku, 30);
      setForecastData(data);
    } catch (err: any) {
      showToast(err.message || "Failed to load demand forecast", "error");
    } finally {
      setForecastLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (error || !finding) {
    return <ErrorState message={error || "Finding not found"} />;
  }

  // Check role authorization for this action
  const requiredRole = finding.recommended_action?.required_role;
  const isAuthorizedRole =
    currentUser.role === "compliance" ||
    (requiredRole && currentUser.role === requiredRole);

  const mas = finding.multi_agent_summary;
  const aiMode = finding.ai_mode || "DETERMINISTIC_FALLBACK";

  return (
    <div className="space-y-6">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Compliance Board
        </Link>

        <div className="flex items-center gap-2">
          {aiMode === "LIVE_LLM" ? (
            <Badge variant="success" size="sm" className="flex items-center gap-1.5 font-semibold">
              <Bot className="w-3.5 h-3.5" />
              AI MODE: LIVE LLM (NVIDIA NIM / GLM-5.3 TOOL-USE)
            </Badge>
          ) : (
            <Badge variant="info" size="sm" className="flex items-center gap-1.5 font-semibold">
              <Bot className="w-3.5 h-3.5" />
              AI MODE: DETERMINISTIC MULTI-AGENT ENGINE
            </Badge>
          )}

          <button
            onClick={() => setExplainOpen(!explainOpen)}
            className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 font-medium min-h-[38px]"
          >
            <HelpCircle className="w-4 h-4" />
            Decision Lineage (Explain Panel)
          </button>
        </div>
      </div>

      {/* Header Banner */}
      <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="purple" size="sm">
                {finding.type.toUpperCase()} ALERT
              </Badge>
              <Badge variant={finding.severity >= 90 ? "danger" : "warning"} size="sm">
                Severity Score: {finding.severity}
              </Badge>
              <Link href="/cases">
                <Badge variant="purple" size="sm" className="hover:bg-purple-100 transition cursor-pointer">
                  LIFECYCLE: {finding.case_status?.toUpperCase() || "ACTIVE"}
                </Badge>
              </Link>
              {mas?.coordinator?.uncertainty_score !== undefined && (
                <Badge variant="neutral" size="sm">
                  Uncertainty: {Math.round(mas.coordinator.uncertainty_score * 100)}%
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{finding.title}</h1>
            <p className="text-xs text-slate-600 leading-relaxed">{finding.description}</p>
          </div>

          <div className="flex flex-col sm:flex-row items-end gap-2 shrink-0">
            {finding.deadline && (
              <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs shrink-0 flex items-center gap-1.5 font-medium">
                <Clock className="w-4 h-4" />
                <span>Target Deadline: {new Date(finding.deadline).toLocaleDateString()}</span>
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleLoadForecast(finding.entities?.sku || "SKU-WAR-001")}
              className="flex items-center gap-1.5 text-xs"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              Demand Forecast & Replenishment
            </Button>
          </div>
        </div>

        {/* Deterministic Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          {Object.entries(finding.metrics).map(([key, val]) => (
            <div key={key} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                {key.replace(/_/g, " ")}
              </div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {typeof val === "number" ? val.toLocaleString() : String(val)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Data Quality Warnings Alert */}
      {finding.data_quality_warnings && finding.data_quality_warnings.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            DATA QUALITY & TELEMETRY WARNINGS
          </div>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {finding.data_quality_warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence-Backed Audit & Source Attribution Card */}
      {(finding.evidence_sources || finding.rule_metadata || finding.calculation_steps) && (
        <Card className="p-5 bg-white border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Evidence-Backed Telemetry & Source Attribution
              </h2>
            </div>
            <Badge variant="neutral" size="sm">Audit Source Records</Badge>
          </div>

          {/* Rule Metadata */}
          {finding.rule_metadata && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-slate-900 flex items-center justify-between">
                <span>Detection Rule: {finding.rule_metadata.name || finding.rule_metadata.rule_id}</span>
                <span className="font-mono text-[10px] text-slate-500">{finding.rule_metadata.rule_id}</span>
              </div>
              <p className="text-slate-600">{finding.rule_metadata.description}</p>
              {finding.rule_metadata.regulatory_reference && (
                <div className="text-[11px] text-indigo-700 font-semibold pt-0.5">
                  Regulatory Mandate: {finding.rule_metadata.regulatory_reference}
                </div>
              )}
            </div>
          )}

          {/* Evidence Sources */}
          {finding.evidence_sources && finding.evidence_sources.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Source Record References Attached to Finding:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {finding.evidence_sources.map((ev, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">{ev.source_table}</div>
                    <div className="font-semibold text-slate-900 truncate mt-0.5">{ev.description}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      {ev.record_count} record(s) attached
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step-by-Step Calculation Trace */}
          {finding.calculation_steps && finding.calculation_steps.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Step-by-Step Calculation Steps:
              </div>
              <div className="space-y-1.5">
                {finding.calculation_steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-slate-50 border border-slate-200 text-xs flex items-center justify-between font-mono"
                  >
                    <span className="text-slate-700 font-semibold">
                      {step.step}: {step.formula}
                    </span>
                    <span className="text-slate-900 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                      {step.result}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Deterministic Root-Cause Analysis Card */}
      {finding.root_cause_analysis && (
        <Card className="p-5 bg-white border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Deterministic Root-Cause Analysis (Zero Evidence Fabrication)
              </h2>
            </div>
            <Badge
              variant={finding.root_cause_analysis.evidence_completeness.is_sufficient ? "success" : "warning"}
              size="sm"
            >
              Completeness: {finding.root_cause_analysis.evidence_completeness.score}%
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Confirmed Facts */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-bold uppercase text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Confirmed Facts ({finding.root_cause_analysis.confirmed_facts.length})
              </div>
              <div className="space-y-1.5">
                {finding.root_cause_analysis.confirmed_facts.map((cf, i) => (
                  <div key={i} className="p-2 rounded bg-white border border-slate-200 text-xs">
                    <div className="font-semibold text-slate-900">{cf.fact}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">Source: {cf.evidence_source}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ranked Hypotheses */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-bold uppercase text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Ranked Hypotheses ({finding.root_cause_analysis.ranked_hypotheses.length})
              </div>
              <div className="space-y-1.5">
                {finding.root_cause_analysis.ranked_hypotheses.map((hyp, i) => (
                  <div key={i} className="p-2 rounded bg-white border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        #{hyp.rank} {hyp.hypothesis}
                      </span>
                      <Badge variant={hyp.likelihood === "HIGH" ? "danger" : "warning"} size="sm">
                        {hyp.likelihood}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Supporting: {hyp.supporting_evidence.join("; ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Multi-Agent Specialist Intelligence Desk */}
      {mas && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-600" />
              Coordinated Multi-Agent Specialist Analysis
            </h2>
            <span className="text-xs text-slate-500">
              5 Dedicated Agent Roles • Structured Pydantic Telemetry
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Investigation Agent Output */}
            <Card className="p-4 bg-white border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    1. Investigation Agent
                  </h3>
                </div>
                <Badge variant="neutral" size="sm">Factual Evidence</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Batch / SKU</div>
                  <div className="font-bold text-slate-900">{mas.investigation.batch} ({mas.investigation.sku})</div>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Warehouse Pallets</div>
                  <div className="font-bold text-slate-900">{mas.investigation.total_warehouse_stock} units</div>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Field Dispatches (30d)</div>
                  <div className="font-bold text-slate-900">{mas.investigation.total_dispatched_units} units</div>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Healthcare Accounts</div>
                  <div className="font-bold text-slate-900">
                    {mas.investigation.customer_count} ({mas.investigation.hospital_count} Hosp, {mas.investigation.chemist_count} Chem)
                  </div>
                </div>
              </div>
              {mas.investigation.missing_information_warnings.length > 0 && (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Telemetry Warnings:
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {mas.investigation.missing_information_warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* 2. Risk Assessment Agent Output */}
            <Card className="p-4 bg-white border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    2. Risk Assessment Agent
                  </h3>
                </div>
                <Badge variant={mas.risk_assessment.risk_score >= 80 ? "danger" : "warning"} size="sm">
                  {mas.risk_assessment.severity_category} Tier
                </Badge>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-semibold">Patient Exposure: </span>
                  <span className="text-slate-900 font-bold">{mas.risk_assessment.patient_exposure_tier}</span>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-semibold">Clinical Urgency: </span>
                  <span className="text-slate-900 font-bold">{mas.risk_assessment.clinical_urgency}</span>
                </div>
                {mas.risk_assessment.regulatory_classification && (
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 font-semibold">Regulatory Implication: </span>
                    <span className="text-slate-900 font-bold">{mas.risk_assessment.regulatory_classification}</span>
                  </div>
                )}
                <div className="p-2 rounded bg-blue-50/60 border border-blue-200 text-[11px] text-blue-900 leading-relaxed">
                  <strong>Safety Policy: </strong>{mas.risk_assessment.safe_unsafe_disclaimer}
                </div>
              </div>
            </Card>

            {/* 3. Solution Evaluation Agent Output */}
            <Card className="p-4 bg-white border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-amber-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    3. Solution Evaluation Agent
                  </h3>
                </div>
                <Badge variant="info" size="sm">Constraints Enforced</Badge>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-[10px] text-slate-500 font-semibold">RECOMMENDED STRATEGY</div>
                  <div className="font-bold text-slate-900">{mas.solution_evaluation.recommended_option_name}</div>
                  <div className="text-slate-600 text-[11px]">{mas.solution_evaluation.cost_benefit_summary}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 text-[10px]">Clean Stock Available</div>
                    <div className="font-bold text-emerald-700">{mas.solution_evaluation.clean_stock_available} units</div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 text-[10px]">Replacement Shortfall</div>
                    <div className="font-bold text-rose-700">{mas.solution_evaluation.replacement_shortfall} units</div>
                  </div>
                </div>
                {mas.solution_evaluation.rejection_count > 0 && (
                  <div className="p-2 rounded bg-slate-100 border border-slate-200 text-[11px] text-slate-700">
                    <strong>Constraint Enforcement: </strong>{mas.solution_evaluation.rejection_count} candidate response option(s) rejected due to insufficient stock or regulatory bans.
                  </div>
                )}
              </div>
            </Card>

            {/* 4. Independent Review Agent Output */}
            <Card className="p-4 bg-white border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    4. Independent Review Agent
                  </h3>
                </div>
                <Badge variant={mas.review.review_passed ? "success" : "danger"} size="sm">
                  {mas.review.review_passed ? "REVIEW PASSED" : "FLAGGED WITH OBJECTIONS"}
                </Badge>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800">
                  <div className="text-slate-500 font-bold mb-1">INDEPENDENT VERDICT:</div>
                  <div>{mas.review.independent_verdict}</div>
                </div>

                {/* Calculation Checks */}
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Arithmetic & Permission Sanity Checks:
                  </div>
                  {mas.review.calculation_checks.map((chk, i) => (
                    <div key={i} className="flex items-start gap-1.5 p-1.5 rounded bg-slate-50 text-[11px]">
                      {chk.matched ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-slate-800">{chk.metric}: </span>
                        <span className="text-slate-600">{chk.notes}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {mas.review.warnings.length > 0 && (
                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                    <strong className="block font-semibold mb-0.5">Reviewer Advisory Warnings:</strong>
                    <ul className="list-disc list-inside space-y-0.5">
                      {mas.review.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Explain Panel (Collapsible) */}
      {explainOpen && finding.explanation && (
        <Card className="p-5 border-blue-200 bg-blue-50/50 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase tracking-wider">
            <HelpCircle className="w-4 h-4" />
            Decision Engine Explanation & Mathematical Lineage
          </div>
          <div className="text-xs text-slate-800 font-mono bg-white p-3 rounded-lg border border-blue-200">
            Formula: {finding.explanation.formula}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(finding.explanation.sub_scores).map(([k, v]) => (
              <div key={k} className="p-2.5 rounded bg-white border border-slate-200 text-slate-700">
                <span className="text-slate-500 capitalize">{k}: </span>
                <span className="font-bold text-slate-900">{v} / 100</span>
              </div>
            ))}
          </div>
          {finding.source_rows && finding.source_rows.length > 0 && (
            <div className="text-[11px] text-slate-600 pt-1 font-mono">
              <strong className="text-slate-800">Source Records: </strong>
              {JSON.stringify(finding.source_rows)}
            </div>
          )}
        </Card>
      )}

      {/* Options Comparator Matrix */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-600" />
          Deterministic Options Comparison Matrix
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate Strategy</TableHead>
              <TableHead>Operational Details</TableHead>
              <TableHead>Computed Trade-offs</TableHead>
              <TableHead>Projected Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {finding.options.map((opt) => {
              const isRecommended = finding.recommended_action?.chosen_option === opt.id;
              return (
                <TableRow key={opt.id} className={isRecommended ? "bg-blue-50/60 border-l-4 border-blue-600" : ""}>
                  <TableCell className="font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      {opt.name}
                      {isRecommended && (
                        <Badge variant="info" size="sm">
                          CHOSEN
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{opt.description}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-800">
                    {Object.entries(opt.metrics).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-slate-500">{k}: </span>
                        <span className="font-semibold">{String(v)}</span>
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{opt.projected_outcome}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Agent Step Trace */}
      {finding.agent_trace && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            Agentic Execution Trace (Investigation → Risk Assessment → Solution Evaluation → Review → Coordinator)
          </h2>
          <div className="space-y-2.5">
            {finding.agent_trace.map((step: any, index: number) => (
              <Card key={index} className="p-4 bg-white border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-[11px]">
                      {step.step}
                    </span>
                    <span className="font-bold text-slate-900">{step.phase}:</span>
                    <span className="text-slate-600">{step.action}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : ""}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono text-slate-800 overflow-x-auto text-[11px]">
                  <span className="text-slate-500 font-semibold">Output: </span>
                  {typeof step.output === "object" ? JSON.stringify(step.output, null, 2) : String(step.output)}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Action Approval Card (Strict Human Gate) */}
      {finding.recommended_action && (
        <Card className="p-6 bg-white border-slate-200 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-slate-800" />
                <h3 className="text-base font-bold text-slate-900">
                  Draft Action: {finding.recommended_action.type} ({finding.action_id})
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Required Role Gate:{" "}
                <span className="text-slate-900 font-bold uppercase">{finding.recommended_action.required_role}</span>
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                variant="danger"
                size="md"
                onClick={() => {
                  setDecisionType("reject");
                  setDecisionModalOpen(true);
                }}
              >
                Reject Action
              </Button>

              <Button
                variant="emerald"
                size="md"
                onClick={() => {
                  setDecisionType("approve");
                  setDecisionModalOpen(true);
                }}
                disabled={!isAuthorizedRole}
              >
                Authorize & Execute
              </Button>
            </div>
          </div>

          {!isAuthorizedRole && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>
                Your current role is <strong className="uppercase">{currentUser.role}</strong>. Approving this action requires{" "}
                <strong className="uppercase">{requiredRole}</strong> or <strong>COMPLIANCE</strong>. Switch persona via the top navigation bar.
              </span>
            </div>
          )}

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div>
              <span className="font-semibold text-slate-900">Coordinator Rationale: </span>
              <span className="text-slate-700">{finding.recommended_action.rationale}</span>
            </div>
            {finding.recommended_action.assumptions && finding.recommended_action.assumptions.length > 0 && (
              <div>
                <span className="font-semibold text-slate-800">Explicit Assumptions: </span>
                <ul className="list-disc list-inside text-slate-600 mt-1 space-y-0.5">
                  {finding.recommended_action.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Decision Confirmation Modal */}
      <Modal
        isOpen={decisionModalOpen}
        onClose={() => setDecisionModalOpen(false)}
        title={decisionType === "approve" ? "Authorize Compliance Action" : "Reject Compliance Action"}
        description={`Signing Persona: ${currentUser.name} (${currentUser.roleTitle})`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecisionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={decisionType === "approve" ? "emerald" : "danger"}
              onClick={handleDecision}
              isLoading={submitting}
            >
              {decisionType === "approve" ? "Confirm & Commit to Ledger" : "Reject & Record Reason"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs text-slate-700">
          {decisionType === "approve" ? (
            <div className="space-y-3">
              <p>
                You are about to authorize <strong>{finding.recommended_action?.type}</strong> for Action{" "}
                <code className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-bold">{finding.action_id}</code>.
              </p>
              <p className="text-slate-500">
                This execution updates inventory status and commits an <code>ACTION_APPROVED</code> event to the SHA-256 hash-chained ledger.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-semibold text-slate-900">Document the compliance reason for rejecting this drafted action:</p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="State clinical or operational justification (e.g. alternate stock identified)..."
                rows={4}
                className="w-full p-3 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Demand Forecast & Suggested Replenishment Modal */}
      <Modal
        isOpen={forecastModalOpen}
        onClose={() => setForecastModalOpen(false)}
        title="Seasonal Demand Forecast & Suggested Replenishment"
        description={`Deterministic Supply Chain Replenishment Analysis for SKU ${forecastData?.sku || ""}`}
        footer={
          <Button variant="secondary" onClick={() => setForecastModalOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4 text-xs text-slate-700">
          {forecastLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : !forecastData ? (
            <p className="text-slate-500 italic">No forecast data retrieved for this molecule.</p>
          ) : (
            <div className="space-y-4">
              {/* Data Sufficiency Warning */}
              {!forecastData.data_sufficiency.is_sufficient ? (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    DATA SUFFICIENCY GUARD TRIGGERED
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {forecastData.data_sufficiency.warning ||
                      "Insufficient historical dispatches to generate an automated purchase order recommendation with statistical confidence."}
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-xs">
                    Data Sufficiency Verified: {forecastData.data_sufficiency.total_dispatches} historical dispatches analyzed across {forecastData.data_sufficiency.date_range_days} days.
                  </span>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Average Daily Demand</div>
                  <div className="text-sm font-bold text-slate-900">{forecastData.metrics.average_daily_demand} units/day</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Demand Volatility</div>
                  <div className="text-sm font-bold text-slate-900">{forecastData.metrics.demand_volatility} (CV: {Math.round(forecastData.metrics.coefficient_of_variation * 100)}%)</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Supplier Lead Time</div>
                  <div className="text-sm font-bold text-slate-900">{forecastData.replenishment.supplier_lead_time_days} days</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Safety Stock (95%)</div>
                  <div className="text-sm font-bold text-emerald-700">{forecastData.replenishment.safety_stock_units} units</div>
                </div>
              </div>

              {/* Replenishment Recommendation */}
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-900 text-xs">Suggested Reorder Quantity:</span>
                  <span className="text-base font-extrabold text-blue-900">
                    {forecastData.replenishment.suggested_reorder_qty} units
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Net Inventory: {forecastData.replenishment.net_inventory_position} units • Reorder Point: {forecastData.replenishment.reorder_point} units • MOQ: {forecastData.replenishment.moq}
                </div>
                <div className="text-[10px] font-mono text-slate-500 bg-white/80 p-1.5 rounded border border-blue-100">
                  Formula: {forecastData.replenishment.calculation_formula}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
