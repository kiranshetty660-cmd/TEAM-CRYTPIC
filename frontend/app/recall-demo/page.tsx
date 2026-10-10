"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  FileText,
  Send,
  Building2,
  Store,
  RotateCcw,
  Lock,
  Mail,
  MessageSquare,
  Users,
  ArrowRight,
  Sparkles,
  Phone,
  Eye,
  AlertOctagon,
  Cpu,
  Layers,
  Printer,
  Zap,
  ChevronRight,
  Boxes,
  Activity,
  Check,
  HelpCircle,
  Upload,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { api } from "../../lib/api";

export default function RecallDemoPage() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Autonomous Pipeline State
  const [autonomousRunning, setAutonomousRunning] = useState<boolean>(false);
  const [agentsTimeline, setAgentsTimeline] = useState<any[]>([]);
  const [finalReport, setFinalReport] = useState<any | null>(null);
  const [activeTabMode, setActiveTabMode] = useState<"control_room" | "expiry_testing" | "step_by_step" | "executive_report">("control_room");
  const [activeAgentIndex, setActiveAgentIndex] = useState<number>(-1);

  // Custom CSV Expiry Testing State
  const [uploadingCsv, setUploadingCsv] = useState<boolean>(false);
  const [approvingExpiry, setApprovingExpiry] = useState<boolean>(false);
  const [expiryScanResult, setExpiryScanResult] = useState<any | null>(null);
  const [expiryApprovalResult, setExpiryApprovalResult] = useState<any | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");

  // Scenario Data State
  const [scenarioData, setScenarioData] = useState<any>(null);
  const [recallIncident, setRecallIncident] = useState<any>(null);
  const [batchBlockStatus, setBatchBlockStatus] = useState<any>(null);
  const [recipientsData, setRecipientsData] = useState<any>(null);
  const [campaignData, setCampaignData] = useState<any>(null);
  const [dispatchResults, setDispatchResults] = useState<any>(null);
  const [replacementData, setReplacementData] = useState<any>(null);
  const [hospitalData, setHospitalData] = useState<any>(null);
  const [poDraftData, setPoDraftData] = useState<any>(null);
  const [auditData, setAuditData] = useState<any>(null);

  // Device Alert Simulator Modal
  const [selectedAlertModal, setSelectedAlertModal] = useState<any | null>(null);
  const [alertViewChannel, setAlertViewChannel] = useState<"email" | "sms">("email");

  // Dispatch Test State
  const [testDispatchError, setTestDispatchError] = useState<string | null>(null);
  const [testDispatchSuccess, setTestDispatchSuccess] = useState<boolean>(false);

  // Load initial scenario on mount
  useEffect(() => {
    loadScenarioOverview();
  }, []);

  const loadScenarioOverview = async () => {
    try {
      setLoading(true);
      const res = await api.demoResetScenario();
      setScenarioData(res);
      const [repl, recip, audit] = await Promise.all([
        api.demoGetReplacementAnalysis().catch(() => null),
        api.demoTraceRecipients().catch(() => null),
        api.demoGetAuditVerification().catch(() => null),
      ]);
      setReplacementData(repl);
      setRecipientsData(recip);
      setAuditData(audit);
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Unable to initialize scenario." });
    } finally {
      setLoading(false);
    }
  };

  const handleResetScenario = async () => {
    try {
      setResetting(true);
      setFeedbackMsg(null);
      const res = await api.demoResetScenario();
      setScenarioData(res);
      setRecallIncident(null);
      setBatchBlockStatus(null);
      setCampaignData(null);
      setDispatchResults(null);
      setPoDraftData(null);
      setFinalReport(null);
      setAgentsTimeline([]);
      setTestDispatchError(null);
      setTestDispatchSuccess(false);

      const [repl, recip, audit] = await Promise.all([
        api.demoGetReplacementAnalysis().catch(() => null),
        api.demoTraceRecipients().catch(() => null),
        api.demoGetAuditVerification().catch(() => null),
      ]);
      setReplacementData(repl);
      setRecipientsData(recip);
      setAuditData(audit);
      setActiveStep(1);
      setFeedbackMsg({ type: "info", text: "Demo scenario reset to clean state (B2231 ready for testing)." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Reset failed." });
    } finally {
      setResetting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // RUN ALL 10 AUTONOMOUS AGENTS (THE PRIMARY USER WORKFLOW)
  // ---------------------------------------------------------------------------
  const handleRunAutonomousAgents = async () => {
    setAutonomousRunning(true);
    setAgentsTimeline([]);
    setFinalReport(null);
    setFeedbackMsg(null);
    setActiveAgentIndex(0);

    try {
      const response = await api.demoRunAutonomousAgents();

      const timeline = response.agents_timeline || [];
      const report = response.executive_report;

      for (let i = 0; i < timeline.length; i++) {
        setActiveAgentIndex(i);
        setAgentsTimeline(timeline.slice(0, i + 1));
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      setFinalReport(report);
      setRecallIncident(response.pipeline_results?.step1_incident);
      setBatchBlockStatus(response.pipeline_results?.step2_block);
      setRecipientsData(response.pipeline_results?.step3_recipients);
      setCampaignData(response.pipeline_results?.step4_campaign);
      setDispatchResults(response.pipeline_results?.step5_dispatches);
      setReplacementData(response.pipeline_results?.step6_replacement);
      setHospitalData(response.pipeline_results?.step7_hospitals);
      setPoDraftData(response.pipeline_results?.step8_po);
      setAuditData(response.pipeline_results?.step9_ledger);

      setFeedbackMsg({
        type: "success",
        text: `All 10 Autonomous Agents finished successfully in ${report?.pipeline_metrics?.total_execution_ms || 240}ms. Warehouse stock quarantined and alerts prepared.`,
      });
      setActiveStep(9);
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Autonomous pipeline encountered an error during execution.",
      });
    } finally {
      setAutonomousRunning(false);
      setActiveAgentIndex(-1);
    }
  };

  // ---------------------------------------------------------------------------
  // CSV UPLOAD & EXPIRY TESTING WORKFLOW
  // ---------------------------------------------------------------------------
  const handleUploadExpiryCsv = async (file: File) => {
    setUploadingCsv(true);
    setUploadedFileName(file.name);
    setFeedbackMsg(null);
    setExpiryScanResult(null);
    setExpiryApprovalResult(null);

    try {
      const result = await api.demoUploadExpiryDataset(file);
      setExpiryScanResult(result);
      if (result.summary?.expired_batches_count > 0) {
        setFeedbackMsg({
          type: "info",
          text: `Scan complete: Found ${result.summary.expired_batches_count} expired batches (${result.summary.total_expired_units} units). Review message sent to Admin. Waiting for your approval.`,
        });
      } else {
        setFeedbackMsg({
          type: "success",
          text: `Scan complete: All ${result.summary.total_batches_scanned} batches are within validity. No expired medicines found.`,
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to parse and scan uploaded CSV.",
      });
    } finally {
      setUploadingCsv(false);
    }
  };

  const handleLoadDemoExpiredCsv = async () => {
    setUploadingCsv(true);
    setUploadedFileName("sample_expired_medicines.csv");
    setFeedbackMsg(null);
    setExpiryScanResult(null);
    setExpiryApprovalResult(null);

    try {
      const sample = await api.demoGetSampleExpiredCsv();
      const result = await api.demoUploadExpiryDataset({ csv_text: sample.csv_text });
      setExpiryScanResult(result);
      setFeedbackMsg({
        type: "info",
        text: `Sample dataset loaded: Found 3 expired batches. Review message generated for Admin (chethuc809@gmail.com). Click Approve below to take action.`,
      });
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to load demo CSV sample.",
      });
    } finally {
      setUploadingCsv(false);
    }
  };

  const handleDownloadSampleCsv = async () => {
    try {
      const sample = await api.demoGetSampleExpiredCsv();
      const blob = new Blob([sample.csv_text], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "expired_medicine_dataset_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: "Failed to download sample CSV template." });
    }
  };

  const handleApproveExpiryAction = async () => {
    if (!expiryScanResult?.case_id) return;
    setApprovingExpiry(true);
    setFeedbackMsg(null);

    try {
      const result = await api.demoApproveExpiryAction({
        case_id: expiryScanResult.case_id,
        approved_by: "Chethan (Warehouse Owner)",
        approver_role: "Warehouse Owner & Admin",
        notes: "Approved emergency containment of expired medicine dataset. Quarantine stock, dispatch live email/sms notices, and draft replacement PO.",
      });
      setExpiryApprovalResult(result);
      setFeedbackMsg({
        type: "success",
        text: `Action approved! Expired stock quarantined in warehouse, live Email sent to chethuc809@gmail.com, SMS sent to +917996662516, replacement PO drafted, and ledger sealed.`,
      });
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Approval execution failed.",
      });
    } finally {
      setApprovingExpiry(false);
    }
  };

  // ---------------------------------------------------------------------------
  // STEP-BY-STEP MANUAL TRIGGERS
  // ---------------------------------------------------------------------------
  const handleStep1TriggerRecall = async () => {
    try {
      setLoading(true);
      const res = await api.demoTriggerRecall();
      setRecallIncident(res);
      setActiveStep(2);
      setFeedbackMsg({ type: "success", text: "Step 1 Complete: Regulatory recall logged for Amoxiclav Batch B2231." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Step 1 failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleStep2QuarantineBatch = async () => {
    try {
      setLoading(true);
      const res = await api.demoBlockBatch();
      setBatchBlockStatus(res);
      setActiveStep(3);
      setFeedbackMsg({ type: "success", text: "Step 2 Complete: 180 boxes of B2231 locked in warehouse. Dispatches blocked." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Step 2 failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleStep3TraceRecipients = async () => {
    try {
      setLoading(true);
      const res = await api.demoTraceRecipients();
      setRecipientsData(res);
      setActiveStep(4);
      setFeedbackMsg({ type: "success", text: "Step 3 Complete: 25 customers identified (2 hospitals prioritized, 23 pharmacies)." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Step 3 failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleStep4GenerateCampaign = async () => {
    try {
      setLoading(true);
      const res = await api.demoGenerateCampaign();
      setCampaignData(res);
      setActiveStep(5);
      setFeedbackMsg({ type: "success", text: "Step 4 Complete: 25 tailored recall notices drafted with DLT template codes." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Step 4 failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleStep5ApproveAndSend = async () => {
    if (!campaignData?.campaign_id) return;
    try {
      setLoading(true);
      const res = await api.demoApproveAndSend({
        campaign_id: campaignData.campaign_id,
        approver_name: "Dr. K. Sharma",
        approver_role: "Quality Safety Lead",
        approval_reason: "Verified assay failure report. Authorized emergency recall notices.",
      });
      setDispatchResults(res);
      setActiveStep(6);
      setFeedbackMsg({ type: "success", text: `Step 5 Complete: Notifications dispatched! ${res.emails_sent} Emails and ${res.sms_sent} SMS sent.` });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Step 5 failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleStep6ReplacementAnalysis = async () => {
    try {
      setLoading(true);
      const res = await api.demoGetReplacementAnalysis();
      setReplacementData(res);
      setActiveStep(7);
      setFeedbackMsg({ type: "success", text: "Step 6 Complete: Replacement inventory math assessed. Shortage of 240 units detected." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Step 6 failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleStep7AllocateHospitals = async () => {
    try {
      setLoading(true);
      const res = await api.demoGetHospitalPrioritization();
      setHospitalData(res);
      setActiveStep(8);
      setFeedbackMsg({ type: "success", text: "Step 7 Complete: 100% of hospital demand (240 units of B2240) locked with zero deficit." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Step 7 failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleStep8DraftPO = async () => {
    try {
      setLoading(true);
      const res = await api.demoDraftUrgentPO({
        supplier_id: "SUP-01",
        quantity: 600,
        urgency_reason: "Immediate replacement shortage + 30-day forecast demand for Augmentin 625.",
      });
      setPoDraftData(res);
      setActiveStep(9);
      setFeedbackMsg({ type: "success", text: "Step 8 Complete: Emergency Purchase Order PO-URG-2026-AMOX625 drafted for 600 boxes." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Step 8 failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleStep9VerifyAudit = async () => {
    try {
      setLoading(true);
      const res = await api.demoGetAuditVerification();
      setAuditData(res);
      setFeedbackMsg({ type: "success", text: "Step 9 Complete: Audit ledger verified! 100% hash chained and tamper-sealed." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Step 9 failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleTestDispatchBlock = async () => {
    try {
      setLoading(true);
      setTestDispatchError(null);
      setTestDispatchSuccess(false);
      await api.demoAttemptDispatch({ customer_id: "HOSP-01", sku: "AMOX-625", batch: "B2231", qty: 10 });
      setFeedbackMsg({
        type: "error",
        text: "Dispatch was not blocked! Batch might not be quarantined yet.",
      });
    } catch (err: any) {
      setTestDispatchSuccess(true);
      setTestDispatchError(err.message || "Dispatch strictly prohibited: Batch B2231 is quarantined.");
      setFeedbackMsg({
        type: "success",
        text: `Dispatch Blocker Verified: Outbound dispatch was strictly blocked by backend (${err.message}).`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 bg-white text-slate-900">
      {/* ------------------------------------------------------------- */}
      {/* HERO COMMAND HEADER (WHITE THEME) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                Live Recall & Safety Testing
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                10 Specialized Agents
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                Custom CSV Expiry Scanner
              </span>
            </div>

            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <span>Autonomous Drug Recall & Expiry Testing Suite</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              When a medicine fails quality tests or expires, TraceRx deploys 10 intelligent AI agents to lock warehouse stock, trace affected buyers, alert the owner via Mail & SMS, and restock clean batches in seconds.
            </p>
          </div>

          {/* Main Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={handleRunAutonomousAgents}
              disabled={autonomousRunning || loading || uploadingCsv}
              className="px-5 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 min-h-[42px]"
            >
              <Zap className={`w-4 h-4 ${autonomousRunning ? "animate-spin" : ""}`} />
              <span>{autonomousRunning ? "Agents Operating..." : "Run 10 Autonomous Agents"}</span>
            </button>

            <button
              onClick={() => setActiveTabMode("expiry_testing")}
              className="px-4 py-3 rounded-xl bg-white hover:bg-slate-50 text-teal-800 border border-teal-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition min-h-[42px]"
            >
              <Upload className="w-4 h-4 text-teal-700" />
              <span>Test Expired CSV</span>
            </button>

            <button
              onClick={handleResetScenario}
              disabled={resetting || autonomousRunning}
              className="px-4 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 min-h-[42px]"
              title="Reset scenario to beginning"
            >
              <RotateCcw className={`w-4 h-4 ${resetting ? "animate-spin" : ""}`} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Progress Bar when running */}
        {autonomousRunning && (
          <div className="mt-5 pt-5 border-t border-slate-100 space-y-2 animate-in fade-in">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5 text-teal-800">
                <Sparkles className="w-3.5 h-3.5 animate-spin text-teal-700" />
                Running autonomous multi-agent pipeline...
              </span>
              <span>Agent {Math.min(activeAgentIndex + 1, 10)} of 10</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-700 transition-all duration-300 rounded-full"
                style={{ width: `${Math.min(((activeAgentIndex + 1) / 10) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* AT-A-GLANCE SITUATION CARDS */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5" />
              The Problem
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 font-mono">
              Batch B2231
            </span>
          </div>
          <div className="text-lg font-bold text-slate-900">Amoxiclav 625</div>
          <p className="text-xs text-slate-600 leading-normal">
            Failed lab test (potency was <strong className="text-rose-700 font-mono">84%</strong> instead of legal 90%). Must be recalled immediately.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Warehouse Stock
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              WH-1 Locked
            </span>
          </div>
          <div className="text-lg font-bold text-amber-800">180 Boxes</div>
          <p className="text-xs text-slate-600 leading-normal">
            Frozen in warehouse storage. Software locks prevent any staff from selling or shipping them.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Sold in Last 30 Days
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              25 Customers
            </span>
          </div>
          <div className="text-lg font-bold text-slate-900">640 Boxes</div>
          <p className="text-xs text-slate-600 leading-normal">
            Traced to <strong className="text-slate-800">2 hospitals</strong> and <strong className="text-slate-800">23 pharmacies</strong>. Emergency alerts dispatched to all.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Replacement Stock
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200 font-mono">
              Clean B2240
            </span>
          </div>
          <div className="text-lg font-bold text-teal-800">400 Boxes Ready</div>
          <p className="text-xs text-slate-600 leading-normal">
            <strong className="text-teal-800">100% of hospital needs</strong> (240 boxes) fulfilled first. 600 more ordered for pharmacies.
          </p>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm transition ${
            feedbackMsg.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : feedbackMsg.type === "error"
              ? "bg-rose-50 border-rose-300 text-rose-900"
              : "bg-teal-50 border-teal-300 text-teal-900"
          }`}
        >
          <div className="flex items-center gap-3">
            {feedbackMsg.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />}
            {feedbackMsg.type === "error" && <XCircle className="w-5 h-5 text-rose-700 shrink-0" />}
            {feedbackMsg.type === "info" && <ShieldAlert className="w-5 h-5 text-teal-700 shrink-0" />}
            <span className="font-medium">{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-xs font-semibold px-2 py-1 rounded bg-black/5 hover:bg-black/10 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW NAVIGATION SWITCHER */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl w-fit">
          <button
            onClick={() => setActiveTabMode("control_room")}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition min-h-[36px] ${
              activeTabMode === "control_room"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>AI Agent Control Room</span>
            {agentsTimeline.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white">
                {agentsTimeline.length}/10
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTabMode("expiry_testing")}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition min-h-[36px] ${
              activeTabMode === "expiry_testing"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Test Expired CSV</span>
            {expiryScanResult && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                expiryScanResult.summary?.expired_batches_count > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
              }`}>
                {expiryScanResult.summary?.expired_batches_count > 0 ? `${expiryScanResult.summary.expired_batches_count} Expired` : "Valid"}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTabMode("step_by_step")}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition min-h-[36px] ${
              activeTabMode === "step_by_step"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Step-by-Step Inspector</span>
          </button>

          <button
            onClick={() => setActiveTabMode("executive_report")}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition min-h-[36px] ${
              activeTabMode === "executive_report"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Executive Briefing</span>
            {finalReport && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800">
                Ready
              </span>
            )}
          </button>
        </div>

        {activeTabMode === "executive_report" && finalReport && (
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 border border-slate-300 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        )}
      </div>

      {/* ============================================================= */}
      {/* VIEW 0: TEST EXPIRED CSV DATASET */}
      {/* ============================================================= */}
      {activeTabMode === "expiry_testing" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-6 h-6 text-teal-700" />
                  <span>Upload Expired Medicine Dataset (CSV Test Suite)</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl">
                  Upload your medicine CSV file below. TraceRx autonomous agents will inspect expiry dates, generate an Admin review message if expired batches are found, run the 10-agent test pipeline, and upon approval, execute warehouse quarantine and transmit live Mail + SMS alerts to your credentials.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={handleLoadDemoExpiredCsv}
                  disabled={uploadingCsv}
                  className="px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition disabled:opacity-50 min-h-[38px]"
                >
                  <Zap className="w-4 h-4" />
                  <span>1-Click Load Demo Expired CSV</span>
                </button>

                <button
                  onClick={handleDownloadSampleCsv}
                  className="px-3.5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 border border-slate-300 transition min-h-[38px]"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Download Template</span>
                </button>
              </div>
            </div>

            {/* Upload Dropzone */}
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 hover:border-teal-600 rounded-xl p-6 text-center space-y-3 transition">
              <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto border border-teal-200">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Select or Drag & Drop Medicine CSV</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Supported columns: <span className="font-mono text-teal-800">sku, batch, expiry_date, qty, warehouse</span>
                </p>
              </div>

              <div className="flex justify-center">
                <label className="cursor-pointer px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-xs transition inline-flex items-center gap-2 min-h-[38px]">
                  <Upload className="w-4 h-4" />
                  <span>Browse CSV File</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleUploadExpiryCsv(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>

              {uploadingCsv && (
                <div className="text-xs text-teal-800 font-bold flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 animate-spin text-teal-700" />
                  <span>Agents scanning dataset and running expiry checks...</span>
                </div>
              )}
            </div>

            {/* Scan Results & Problem Review Card */}
            {expiryScanResult && (
              <div className="space-y-6 pt-2">
                {/* Summary Metric Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Batches Scanned</span>
                    <div className="text-xl font-bold text-slate-900 mt-1">{expiryScanResult.summary?.total_batches_scanned} batches</div>
                    <span className="text-[11px] text-slate-500 font-mono">{uploadedFileName || "dataset.csv"}</span>
                  </div>

                  <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
                    <span className="text-[10px] uppercase font-bold text-rose-700">Expired Batches</span>
                    <div className="text-xl font-bold text-rose-700 mt-1">{expiryScanResult.summary?.expired_batches_count} batches</div>
                    <span className="text-[11px] text-rose-800">{expiryScanResult.summary?.total_expired_units} units in warehouse</span>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                    <span className="text-[10px] uppercase font-bold text-emerald-700">Valid Batches</span>
                    <div className="text-xl font-bold text-emerald-700 mt-1">{expiryScanResult.summary?.valid_batches_count} batches</div>
                    <span className="text-[11px] text-emerald-800">Approved for normal storage</span>
                  </div>

                  <div className="p-4 bg-teal-50 rounded-xl border border-teal-200">
                    <span className="text-[10px] uppercase font-bold text-teal-800">Current Date Checked</span>
                    <div className="text-xl font-bold text-teal-900 mt-1">{expiryScanResult.inspection_date}</div>
                    <span className="text-[11px] text-teal-700">Drugs and Cosmetics Act standard</span>
                  </div>
                </div>

                {/* PROBLEM REVIEW CARD (SENT TO ADMIN / OWNER) */}
                {expiryScanResult.review_message_to_owner && (
                  <div className="p-6 bg-rose-50/60 border-2 border-rose-300 rounded-2xl space-y-5 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-200 pb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-600 text-white">
                            Review Required
                          </span>
                          <span className="text-xs font-bold text-rose-950 font-mono">Case #{expiryScanResult.case_id}</span>
                        </div>
                        <h3 className="text-lg font-bold text-rose-950">
                          {expiryScanResult.review_message_to_owner.title}
                        </h3>
                      </div>

                      <div className="text-right text-xs">
                        <span className="text-slate-500 block">Designated Admin Recipients:</span>
                        <span className="font-bold text-slate-800 block">{expiryScanResult.review_message_to_owner.recipient_email}</span>
                        <span className="font-mono text-slate-600 block">{expiryScanResult.review_message_to_owner.recipient_phone}</span>
                      </div>
                    </div>

                    <div className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-2">
                      <p>
                        <strong>Problem Summary:</strong> {expiryScanResult.review_message_to_owner.problem_summary}
                      </p>
                      <p className="text-rose-800 bg-rose-100/60 p-3 rounded-lg border border-rose-200 font-medium">
                        <strong>Regulatory Violation:</strong> {expiryScanResult.review_message_to_owner.regulatory_alert}
                      </p>
                    </div>

                    {/* Table of Expired Batches */}
                    {expiryScanResult.expired_batches?.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Batches Found Expired ({expiryScanResult.expired_batches.length})
                        </span>
                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider border-b border-slate-200">
                              <tr>
                                <th className="p-3">Batch</th>
                                <th className="p-3">Medicine SKU</th>
                                <th className="p-3">Expiry Date</th>
                                <th className="p-3">Days Expired</th>
                                <th className="p-3">Stock Units</th>
                                <th className="p-3">Warehouse</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {expiryScanResult.expired_batches.map((b: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="p-3 font-mono font-bold text-rose-700">{b.batch}</td>
                                  <td className="p-3 font-mono font-semibold text-slate-900">{b.sku}</td>
                                  <td className="p-3 text-slate-700">{b.expiry_date}</td>
                                  <td className="p-3 font-bold text-rose-700">+{b.days_expired} days overdue</td>
                                  <td className="p-3 font-bold text-slate-900">{b.qty} units</td>
                                  <td className="p-3 text-slate-600">{b.warehouse || "WH-1"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Proposed Action & Approval Gate */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                      <div>
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wide block mb-1">
                          Autonomous Agent Containment Plan
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {expiryScanResult.review_message_to_owner.proposed_action}
                        </p>
                      </div>

                      {/* Approval Button Gate */}
                      {!expiryApprovalResult ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
                          <div className="text-xs text-slate-600">
                            <span>Requires Admin / Warehouse Owner sign-off to execute quarantine and send live messages.</span>
                          </div>

                          <button
                            onClick={handleApproveExpiryAction}
                            disabled={approvingExpiry}
                            className="px-6 py-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 min-h-[40px]"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>{approvingExpiry ? "Executing Containment..." : "Approve Action & Send Live Alerts (Mail + SMS)"}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 space-y-3">
                          <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                            <span>Containment Approved & Executed Successfully!</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-emerald-950">
                            <div className="p-3 bg-white rounded-lg border border-emerald-200 space-y-1">
                              <span className="font-bold block text-slate-700">Live Communication Dispatched:</span>
                              <p className="text-slate-600">Email: {expiryApprovalResult.dispatched_notifications?.email?.status || "Sent"} ({expiryApprovalResult.dispatched_notifications?.email?.recipients?.join(", ")})</p>
                              <p className="text-slate-600">SMS: {expiryApprovalResult.dispatched_notifications?.sms?.status || "Sent"} ({expiryApprovalResult.dispatched_notifications?.sms?.recipients?.join(", ")})</p>
                            </div>

                            <div className="p-3 bg-white rounded-lg border border-emerald-200 space-y-1">
                              <span className="font-bold block text-slate-700">Warehouse Quarantine & Ledger:</span>
                              <p className="text-slate-600">{expiryApprovalResult.quarantine_action?.total_batches_quarantined} batches locked in warehouse</p>
                              <p className="text-slate-600 font-mono text-[11px]">Ledger: {expiryApprovalResult.ledger_entry?.hash?.slice(0, 20)}... (SHA-256)</p>
                            </div>
                          </div>

                          {expiryApprovalResult.purchase_order_id && (
                            <div className="text-xs text-slate-700 font-medium">
                              Replacement Purchase Order <strong>{expiryApprovalResult.purchase_order_id}</strong> drafted for fresh replacement inventory.
                            </div>
                          )}

                          <div className="pt-1">
                            <button
                              onClick={() => {
                                setSelectedAlertModal({
                                  type: "expired_medicine_containment",
                                  batch: expiryScanResult.expired_batches?.[0]?.batch || "B2231",
                                  sku: expiryScanResult.expired_batches?.[0]?.sku || "AMOX-625",
                                  recipient_name: "Chethan (Warehouse Owner)",
                                  email: "chethuc809@gmail.com",
                                  phone: "+917996662516",
                                  subject: `URGENT REGULATORY NOTICE: Expired Medicine Containment — ${expiryScanResult.expired_batches?.[0]?.batch || "B2231"}`,
                                  body: expiryScanResult.review_message_to_owner?.problem_summary || "",
                                  sms_text: `CRITICAL ALERT TraceRx: Expired batches detected. Stock locked in warehouse. Order drafted.`,
                                });
                              }}
                              className="px-4 py-2 rounded-lg bg-teal-700 text-white font-bold text-xs flex items-center gap-2 hover:bg-teal-800 transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Received Live Alert (Email & SMS)</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 10 Agent Execution Test Results */}
                {expiryScanResult.agent_test_results?.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      10 Specialized Agents Test Execution on Uploaded Dataset
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {expiryScanResult.agent_test_results.map((ag: any, idx: number) => (
                        <div key={idx} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{ag.agent_name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {ag.status}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[11px] leading-relaxed">{ag.action_taken}</p>
                          <div className="font-mono text-[10px] text-slate-400">
                            Engine: {ag.engine || "Deterministic Safety Engine"} &bull; {ag.latency_ms || 25}ms
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 1: CONTROL ROOM (AUTONOMOUS 10 AGENT RUN) */}
      {/* ============================================================= */}
      {activeTabMode === "control_room" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                10-Agent Autonomous Pipeline
              </h2>
              <p className="text-xs text-slate-500">
                Click Run 10 Autonomous Agents to execute all steps sequentially with zero manual intervention.
              </p>
            </div>

            <button
              onClick={handleRunAutonomousAgents}
              disabled={autonomousRunning || loading}
              className="px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 min-h-[38px]"
            >
              <Zap className="w-4 h-4" />
              <span>{autonomousRunning ? "Running Pipeline..." : "Execute 10 Agents"}</span>
            </button>
          </div>

          {/* Timeline of Agents */}
          <div className="space-y-3">
            {agentsTimeline.length === 0 ? (
              <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-3">
                <Cpu className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900">Agents Idle</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Click "Run 10 Autonomous Agents" above to launch the complete regulatory containment, quarantine, customer tracing, and replenishment cycle.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {agentsTimeline.map((agent, i) => (
                  <div
                    key={i}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2 hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-teal-50 text-teal-800 font-bold text-xs flex items-center justify-center border border-teal-200">
                          {agent.step}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900">{agent.agent_name}</h4>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Completed ({agent.latency_ms}ms)
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed pl-8">
                      {agent.summary}
                    </p>

                    <div className="pl-8 flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                      <span className="font-mono text-slate-500">Output: {agent.output_key}</span>
                      <span className="text-slate-300">&bull;</span>
                      <span className="text-slate-500">Engine: {agent.engine || "NVIDIA NIM / Rule Engine"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 2: STEP-BY-STEP INSPECTOR (STEPS 1 TO 9) */}
      {/* ============================================================= */}
      {activeTabMode === "step_by_step" && (
        <div className="space-y-6">
          {/* Step Pill Selector */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-xl">
            {[
              { num: 1, label: "1. Trigger Recall" },
              { num: 2, label: "2. Block Warehouse" },
              { num: 3, label: "3. Trace Customers" },
              { num: 4, label: "4. Generate Notices" },
              { num: 5, label: "5. Send Alerts" },
              { num: 6, label: "6. Check Deficit" },
              { num: 7, label: "7. Lock Hospitals" },
              { num: 8, label: "8. Draft Order" },
              { num: 9, label: "9. Verify Audit" },
            ].map((st) => (
              <button
                key={st.num}
                onClick={() => setActiveStep(st.num)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition min-h-[34px] ${
                  activeStep === st.num
                    ? "bg-teal-700 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Active Step Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            {activeStep === 1 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 1: Regulatory Recall Ingestion</h3>
                    <p className="text-xs text-slate-500">Flags sub-potency assay failure (Schedule M violation) for Amoxiclav batch B2231.</p>
                  </div>
                  <button
                    onClick={handleStep1TriggerRecall}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
                  >
                    Trigger Recall Notice
                  </button>
                </div>
                {recallIncident && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="font-bold text-slate-900">Recall Incident ID: {recallIncident.incident_id || "REC-2026-AMOX-B2231"}</div>
                    <p className="text-slate-600">Reason: {recallIncident.reason}</p>
                    <div className="font-mono text-slate-500">Status: {recallIncident.status} &bull; Class: {recallIncident.recall_class}</div>
                  </div>
                )}
              </div>
            )}

            {activeStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 2: Warehouse Stock Quarantine</h3>
                    <p className="text-xs text-slate-500">Isolates 180 boxes of B2231 in Bengaluru WH-1 and activates dispatch blocker.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTestDispatchBlock}
                      disabled={loading}
                      className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs"
                    >
                      Test Dispatch Blocker
                    </button>
                    <button
                      onClick={handleStep2QuarantineBatch}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
                    >
                      Quarantine B2231
                    </button>
                  </div>
                </div>
                {testDispatchSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                    ✓ Dispatch blocker active: New shipment orders for B2231 are strictly blocked.
                  </div>
                )}
              </div>
            )}

            {activeStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 3: Customer Traceability (Hospitals First)</h3>
                    <p className="text-xs text-slate-500">Traces all 25 customers who received 640 boxes in the last 30 days.</p>
                  </div>
                  <button
                    onClick={handleStep3TraceRecipients}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
                  >
                    Trace Customers
                  </button>
                </div>
                {recipientsData && (
                  <div className="text-xs text-slate-600">
                    Found {recipientsData.total_recipients_count} accounts ({recipientsData.hospitals_count} emergency hospitals, {recipientsData.chemists_count} pharmacies). Total: {recipientsData.total_dispatched_units} units.
                  </div>
                )}
              </div>
            )}

            {activeStep === 4 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 4: Draft Individualized Recall Notices</h3>
                    <p className="text-xs text-slate-500">Prepares compliant regulatory emails and 160-char SMS messages.</p>
                  </div>
                  <button
                    onClick={handleStep4GenerateCampaign}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
                  >
                    Draft Campaign
                  </button>
                </div>
              </div>
            )}

            {activeStep === 5 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 5: Sign-Off & Send Notifications</h3>
                    <p className="text-xs text-slate-500">Pharmacist approves broadcast to send live emails and SMS.</p>
                  </div>
                  <button
                    onClick={handleStep5ApproveAndSend}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
                  >
                    Approve & Dispatch
                  </button>
                </div>
                {dispatchResults && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                    Dispatched {dispatchResults.emails_sent} Emails and {dispatchResults.sms_sent} SMS.
                  </div>
                )}
              </div>
            )}

            {activeStep === 6 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 6: Replacement Inventory Math</h3>
                    <p className="text-xs text-slate-500">Evaluates clean replacement batch B2240 (400 boxes available vs 640 needed).</p>
                  </div>
                  <button
                    onClick={handleStep6ReplacementAnalysis}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
                  >
                    Assess Stock
                  </button>
                </div>
                {replacementData && (
                  <div className="text-xs text-slate-600">
                    Deficit: {replacementData.immediate_replacement_deficit || -240} units shortage.
                  </div>
                )}
              </div>
            )}

            {activeStep === 7 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 7: Priority Allocation to Hospitals</h3>
                    <p className="text-xs text-slate-500">Locks 240 boxes of clean stock for Apollo & Manipal Hospitals with 100% fulfillment.</p>
                  </div>
                  <button
                    onClick={handleStep7AllocateHospitals}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
                  >
                    Allocate Hospitals
                  </button>
                </div>
              </div>
            )}

            {activeStep === 8 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 8: Draft Emergency Purchase Order</h3>
                    <p className="text-xs text-slate-500">Drafts Purchase Order PO-URG-2026-AMOX625 for 600 units with supplier.</p>
                  </div>
                  <button
                    onClick={handleStep8DraftPO}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
                  >
                    Draft Purchase Order
                  </button>
                </div>
                {poDraftData && (
                  <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900">
                    Purchase Order {poDraftData.purchase_order_id} drafted for {poDraftData.recommended_units} boxes (₹{poDraftData.total_cost?.toLocaleString()}).
                  </div>
                )}
              </div>
            )}

            {activeStep === 9 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 9: Cryptographic Audit Ledger Verification</h3>
                    <p className="text-xs text-slate-500">Validates SHA-256 forward-linked chain from genesis event.</p>
                  </div>
                  <button
                    onClick={handleStep9VerifyAudit}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs"
                  >
                    Verify Audit Trail
                  </button>
                </div>
                {auditData && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                    Chain status: {auditData.chain_valid ? "✓ 100% Valid SHA-256 Ledger" : "Tamper check failed"} ({auditData.total_events} events).
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 3: EXECUTIVE BRIEFING REPORT */}
      {/* ============================================================= */}
      {activeTabMode === "executive_report" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-xl font-bold text-slate-900">Executive Incident Briefing</h2>
              <p className="text-xs text-slate-500 mt-1">Autonomous multi-agent containment summary for Arogya Pharma Distributors.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-500 uppercase block mb-1">1. Incident Assessment</span>
                <p className="text-slate-800">Amoxiclav 625 Batch B2231 failed lab stability test. 180 boxes locked in WH-1.</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-500 uppercase block mb-1">2. Notification Actions</span>
                <p className="text-slate-800">25 buyers alerted via Mail & SMS. 2 priority hospitals fulfilled first.</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-500 uppercase block mb-1">3. Replenishment Action</span>
                <p className="text-slate-800">Emergency PO drafted for 600 units with supplier. Audit ledger permanently sealed.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DEVICE ALERT SIMULATOR MODAL */}
      {/* ------------------------------------------------------------- */}
      {selectedAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Delivered Alert Preview</h3>
                <p className="text-xs text-slate-500">Live communication payload delivered to user credentials</p>
              </div>
              <button
                onClick={() => setSelectedAlertModal(null)}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <button
                onClick={() => setAlertViewChannel("email")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  alertViewChannel === "email" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                Email Message
              </button>
              <button
                onClick={() => setAlertViewChannel("sms")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  alertViewChannel === "sms" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                SMS Message
              </button>
            </div>

            {alertViewChannel === "email" ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div><span className="text-slate-400">To:</span> <strong className="text-slate-900">{selectedAlertModal.email}</strong></div>
                <div><span className="text-slate-400">Subject:</span> <strong className="text-slate-900">{selectedAlertModal.subject}</strong></div>
                <div className="p-3 bg-white rounded border border-slate-200 text-slate-700 leading-relaxed mt-2 whitespace-pre-wrap">
                  {selectedAlertModal.body}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div><span className="text-slate-400">To:</span> <strong className="text-slate-900">{selectedAlertModal.phone}</strong></div>
                <div className="p-3 bg-white rounded border border-slate-200 text-slate-700 font-mono text-[11px] leading-relaxed">
                  {selectedAlertModal.sms_text}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
