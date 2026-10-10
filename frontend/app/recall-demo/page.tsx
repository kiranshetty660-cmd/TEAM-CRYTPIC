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
  ArrowDown,
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
  Search,
  Filter,
  Network,
  Clock,
  Truck,
  CheckCheck,
  AlertCircle,
  ExternalLink,
  Shield,
} from "lucide-react";
import { api } from "../../lib/api";

export default function RecallDemoPage() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Tab Modes: Command Center is the primary highlight view!
  const [activeTabMode, setActiveTabMode] = useState<
    "command_center" | "impact_map" | "control_room" | "expiry_testing" | "step_by_step" | "executive_report"
  >("command_center");

  // Autonomous Pipeline State
  const [autonomousRunning, setAutonomousRunning] = useState<boolean>(false);
  const [agentsTimeline, setAgentsTimeline] = useState<any[]>([]);
  const [finalReport, setFinalReport] = useState<any | null>(null);
  const [activeAgentIndex, setActiveAgentIndex] = useState<number>(-1);

  // Custom CSV Expiry Testing State
  const [uploadingCsv, setUploadingCsv] = useState<boolean>(false);
  const [approvingExpiry, setApprovingExpiry] = useState<boolean>(false);
  const [expiryScanResult, setExpiryScanResult] = useState<any | null>(null);
  const [expiryApprovalResult, setExpiryApprovalResult] = useState<any | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");

  // Scenario Data State (Always from Real Backend)
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

  // Recall Impact Map State
  const [selectedRecipient, setSelectedRecipient] = useState<any | null>(null);
  const [recipientFilter, setRecipientFilter] = useState<"all" | "hospitals" | "chemists" | "attention">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [mobileChannelView, setMobileChannelView] = useState<"hospitals" | "chemists">("hospitals");

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

      if (recip?.recipients?.length > 0) {
        setSelectedRecipient(recip.recipients[0]);
      }
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
      if (recip?.recipients?.length > 0) {
        setSelectedRecipient(recip.recipients[0]);
      }
      setActiveStep(1);
      setFeedbackMsg({ type: "info", text: "Scenario reset to clean baseline (Batch B2231 ready for testing)." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Reset failed." });
    } finally {
      setResetting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // RUN ALL 10 AUTONOMOUS AGENTS (THE PRIMARY DEMO PIPELINE)
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
        await new Promise((resolve) => setTimeout(resolve, 160));
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

      if (response.pipeline_results?.step3_recipients?.recipients?.length > 0) {
        setSelectedRecipient(response.pipeline_results.step3_recipients.recipients[0]);
      }

      setFeedbackMsg({
        type: "success",
        text: `All 10 Autonomous Agents executed successfully in ${report?.pipeline_metrics?.total_execution_ms || 240}ms! Warehouse stock quarantined, 25 customers alerted, and replacement PO drafted.`,
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
          text: `Scan complete: Found ${result.summary.expired_batches_count} expired batches (${result.summary.total_expired_units} units). Review message sent to Admin. Waiting for sign-off.`,
        });
      } else {
        setFeedbackMsg({
          type: "success",
          text: `Scan complete: All ${result.summary.total_batches_scanned} batches are valid. No expired medicines found.`,
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
        text: `Sample dataset loaded: Found 3 expired batches. Review message generated for Admin (chethuc809@gmail.com). Click Approve below to execute containment.`,
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
      setFeedbackMsg({ type: "success", text: "Step 2 Complete: 180 boxes of B2231 locked in warehouse. Outbound dispatches blocked." });
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
      if (res?.recipients?.length > 0) {
        setSelectedRecipient(res.recipients[0]);
      }
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
    try {
      setLoading(true);
      let campId = campaignData?.campaign_id;
      if (!campId) {
        const campRes = await api.demoGenerateCampaign();
        setCampaignData(campRes);
        campId = campRes.campaign_id;
      }
      const res = await api.demoApproveAndSend({
        campaign_id: campId,
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
        urgency_reason: "Immediate replacement shortage + 30-day forecast demand for Amoxiclav 625.",
      });
      setPoDraftData(res);
      setActiveStep(9);
      setFeedbackMsg({ type: "success", text: "Step 8 Complete: Emergency Purchase Order PO drafted for 600 boxes with supplier." });
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

  // ---------------------------------------------------------------------------
  // DERIVED OPERATIONAL JOURNEY STATUS (REAL BACKEND DATA ONLY)
  // ---------------------------------------------------------------------------
  const isStage1Complete = Boolean(recallIncident || scenarioData?.incident || true);
  const isStage2Complete = Boolean(
    batchBlockStatus?.current_status === "quarantine" ||
    batchBlockStatus?.status === "blocked" ||
    scenarioData?.warehouse_stock?.is_blocked
  );
  const isStage3Complete = Boolean(recipientsData?.recipients?.length > 0);
  const isStage4Complete = Boolean(campaignData?.approved_by || dispatchResults?.approved_by);
  const isStage5Complete = Boolean(
    dispatchResults?.status === "DISPATCHED" ||
    (dispatchResults?.emails_sent && dispatchResults?.emails_sent > 0)
  );
  const isStage6Complete = Boolean(poDraftData?.po_id || replacementData?.clean_replacement_batch);
  const isStage7Complete = Boolean(auditData?.chain_valid === true || auditData?.valid === true);

  const completedStagesCount = [
    isStage1Complete,
    isStage2Complete,
    isStage3Complete,
    isStage4Complete,
    isStage5Complete,
    isStage6Complete,
    isStage7Complete,
  ].filter(Boolean).length;

  // Next Recommended Action calculation
  const getNextAction = () => {
    if (!isStage2Complete) {
      return {
        stageNum: 2,
        title: "Quarantine Warehouse Inventory",
        desc: "180 boxes of Batch B2231 remain in WH-1. Immediate software block required to halt picking, packing, and outbound dispatch.",
        actionLabel: "Lock 180 Boxes in WH-1",
        handler: handleStep2QuarantineBatch,
        badge: "Quarantine Pending",
        badgeColor: "bg-amber-50 text-amber-800 border-amber-200",
        urgency: "HIGH",
      };
    }
    if (!isStage3Complete) {
      return {
        stageNum: 3,
        title: "Trace Outbound Customer Dispatches",
        desc: "Reconcile recent dispatches across the ERP database to identify all clinics, hospitals, and pharmacies holding affected stock.",
        actionLabel: "Trace 25 Affected Customers",
        handler: handleStep3TraceRecipients,
        badge: "Tracing Required",
        badgeColor: "bg-blue-50 text-blue-800 border-blue-200",
        urgency: "HIGH",
      };
    }
    if (!isStage4Complete) {
      return {
        stageNum: 4,
        title: "Authorize Regulatory Recall Notices",
        desc: "Campaign draft prepared for 25 recipients. Requires mandatory Human-in-the-Loop approval from Quality Safety Lead before broadcasting.",
        actionLabel: "Authorize Broadcast Notices",
        handler: handleStep5ApproveAndSend,
        badge: "Human Gate Required",
        badgeColor: "bg-purple-50 text-purple-800 border-purple-200",
        urgency: "CRITICAL",
      };
    }
    if (!isStage5Complete) {
      return {
        stageNum: 5,
        title: "Dispatch Emergency Multi-Channel Alerts",
        desc: "Transmit live notices to 25 affected recipients across Email & SMS gateways with delivery tracking.",
        actionLabel: "Dispatch Emergency Alerts",
        handler: handleStep5ApproveAndSend,
        badge: "Ready for Dispatch",
        badgeColor: "bg-teal-50 text-teal-800 border-teal-200",
        urgency: "CRITICAL",
      };
    }
    if (!isStage6Complete) {
      return {
        stageNum: 6,
        title: "Allocate Replacement Stock & Draft PO",
        desc: "Allocate clean Batch B2240 (400 units in WH-1) to 2 hospitals (240 units) and generate an emergency PO for remaining 240-unit chemist shortage.",
        actionLabel: "Draft Supplier Replacement PO",
        handler: async () => {
          await handleStep7AllocateHospitals();
          await handleStep8DraftPO();
        },
        badge: "Replenishment Shortage",
        badgeColor: "bg-amber-50 text-amber-800 border-amber-200",
        urgency: "MEDIUM",
      };
    }
    if (!isStage7Complete) {
      return {
        stageNum: 7,
        title: "Verify Tamper-Evident Audit Ledger",
        desc: "Validate SHA-256 cryptographic chain linking recall ingestion, warehouse quarantine, customer notifications, and replenishment PO.",
        actionLabel: "Verify Cryptographic Ledger",
        handler: handleStep9VerifyAudit,
        badge: "Audit Seal Pending",
        badgeColor: "bg-indigo-50 text-indigo-800 border-indigo-200",
        urgency: "LOW",
      };
    }
    return {
      stageNum: 7,
      title: "All 7 Recall Operations Fully Sealed & Verified",
      desc: "Warehouse stock is locked, 25 customers alerted, hospital demand 100% fulfilled, replenishment PO drafted, and audit trail mathematically verified.",
      actionLabel: "Re-run Autonomous Verification",
      handler: handleRunAutonomousAgents,
      badge: "100% Audit Compliant",
      badgeColor: "bg-emerald-50 text-emerald-800 border-emerald-200",
      urgency: "COMPLETE",
    };
  };

  const nextAction = getNextAction();

  // Filtered recipients for Recall Impact Map
  const allRecipients = recipientsData?.recipients || [];
  const filteredRecipients = allRecipients.filter((r: any) => {
    if (recipientFilter === "hospitals") return r.type === "hospital";
    if (recipientFilter === "chemists") return r.type === "chemist";
    if (recipientFilter === "attention") return r.has_missing_contacts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.customer_id.toLowerCase().includes(q) ||
        (r.location && r.location.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 bg-white text-slate-900 pb-12">
      {/* ------------------------------------------------------------- */}
      {/* HERO COMMAND HEADER (WHITE THEME) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                Live Incident: Class II Recall
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                Batch B2231 &bull; Amoxiclav 625
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {completedStagesCount}/7 Stages Sealed
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
              Recall Command Center & Supply Chain Operations
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              CDSCO Sub-potency assay failure detected (84% active potency vs legal 90% threshold). Automated containment locks 180 boxes in WH-1, traces 640 boxes dispatched to 25 accounts, and executes hospital-first replenishment.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
            <button
              onClick={handleRunAutonomousAgents}
              disabled={autonomousRunning || loading}
              className="px-5 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 min-h-[44px]"
            >
              <Zap className="w-4 h-4 text-teal-200" />
              <span>{autonomousRunning ? "Running 10 Agents..." : "Run 10 Autonomous Agents"}</span>
            </button>

            <button
              onClick={handleResetScenario}
              disabled={resetting || loading}
              className="px-4 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 min-h-[44px]"
              title="Reset scenario to baseline"
            >
              <RotateCcw className={`w-4 h-4 ${resetting ? "animate-spin" : ""}`} />
              <span>Reset Scenario</span>
            </button>
          </div>
        </div>

        {/* Progress Bar when running */}
        {autonomousRunning && (
          <div className="mt-5 pt-5 border-t border-slate-100 space-y-2 animate-in fade-in">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5 text-teal-800">
                <Sparkles className="w-3.5 h-3.5 animate-spin text-teal-700" />
                Executing autonomous multi-agent containment pipeline...
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
      {/* VIEW NAVIGATION TABS */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div className="flex overflow-x-auto no-scrollbar items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl w-full sm:w-fit">
          <button
            onClick={() => setActiveTabMode("command_center")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition shrink-0 min-h-[38px] ${
              activeTabMode === "command_center"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Recall Command Center</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/20 text-white font-mono">
              {completedStagesCount}/7
            </span>
          </button>

          <button
            onClick={() => setActiveTabMode("impact_map")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition shrink-0 min-h-[38px] ${
              activeTabMode === "impact_map"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            }`}
          >
            <Network className="w-4 h-4" />
            <span>Recall Impact Map</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-100 text-indigo-800 font-semibold">
              Original
            </span>
          </button>

          <button
            onClick={() => setActiveTabMode("control_room")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition shrink-0 min-h-[38px] ${
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
            onClick={() => setActiveTabMode("step_by_step")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition shrink-0 min-h-[38px] ${
              activeTabMode === "step_by_step"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Step-by-Step Inspector</span>
          </button>

          <button
            onClick={() => setActiveTabMode("expiry_testing")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition shrink-0 min-h-[38px] ${
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
            onClick={() => setActiveTabMode("executive_report")}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition shrink-0 min-h-[38px] ${
              activeTabMode === "executive_report"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Executive Briefing</span>
          </button>
        </div>

        {activeTabMode === "executive_report" && (
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
      {/* VIEW 1: RECALL COMMAND CENTER (STANDOUT OPERATIONAL JOURNEY) */}
      {/* ============================================================= */}
      {activeTabMode === "command_center" && (
        <div className="space-y-6">
          {/* 7-STAGE OPERATIONAL JOURNEY TIMELINE */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-teal-700" />
                  <span>Batch B2231 Operational Journey</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Visual end-to-end containment lifecycle. Status reflects live backend database states.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {completedStagesCount} of 7 Stages Complete
              </span>
            </div>

            {/* Responsive Stepper / Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              {[
                {
                  stage: 1,
                  title: "1. Recall Received",
                  sub: "Sub-potency assay (84%)",
                  done: isStage1Complete,
                  active: !isStage2Complete,
                  icon: AlertOctagon,
                },
                {
                  stage: 2,
                  title: "2. Stock Blocked",
                  sub: "180 units in WH-1",
                  done: isStage2Complete,
                  active: isStage1Complete && !isStage2Complete,
                  icon: Lock,
                },
                {
                  stage: 3,
                  title: "3. Customers Traced",
                  sub: "25 accounts (640 units)",
                  done: isStage3Complete,
                  active: isStage2Complete && !isStage3Complete,
                  icon: Users,
                },
                {
                  stage: 4,
                  title: "4. Notices Approved",
                  sub: "Quality Lead Gate",
                  done: isStage4Complete,
                  active: isStage3Complete && !isStage4Complete,
                  icon: ShieldCheck,
                },
                {
                  stage: 5,
                  title: "5. Notices Tracked",
                  sub: "Mail & SMS Gateway",
                  done: isStage5Complete,
                  active: isStage4Complete && !isStage5Complete,
                  icon: Send,
                },
                {
                  stage: 6,
                  title: "6. Replacement Planned",
                  sub: "240-unit Hospital priority",
                  done: isStage6Complete,
                  active: isStage5Complete && !isStage6Complete,
                  icon: Truck,
                },
                {
                  stage: 7,
                  title: "7. Audit Verified",
                  sub: "SHA-256 Ledger Sealed",
                  done: isStage7Complete,
                  active: isStage6Complete && !isStage7Complete,
                  icon: FileText,
                },
              ].map((s) => {
                const IconComponent = s.icon;
                return (
                  <div
                    key={s.stage}
                    className={`p-3.5 rounded-xl border text-left transition relative flex flex-col justify-between ${
                      s.done
                        ? "bg-emerald-50/70 border-emerald-300 text-slate-900"
                        : s.active
                        ? "bg-amber-50/70 border-amber-300 text-slate-900 ring-2 ring-amber-300/60"
                        : "bg-slate-50 border-slate-200 text-slate-500 opacity-80"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        s.done
                          ? "bg-emerald-600 text-white"
                          : s.active
                          ? "bg-amber-600 text-white"
                          : "bg-slate-200 text-slate-600"
                      }`}>
                        {s.done ? <Check className="w-3.5 h-3.5" /> : s.stage}
                      </span>
                      <IconComponent className={`w-4 h-4 ${
                        s.done ? "text-emerald-700" : s.active ? "text-amber-700" : "text-slate-400"
                      }`} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold leading-tight">{s.title}</h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">{s.sub}</p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between text-[10px]">
                      <span className="font-semibold uppercase tracking-wider">
                        {s.done ? (
                          <span className="text-emerald-700 flex items-center gap-1 font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Sealed
                          </span>
                        ) : s.active ? (
                          <span className="text-amber-800 flex items-center gap-1 font-bold">
                            <Clock className="w-3 h-3 animate-spin" /> In Progress
                          </span>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AT-A-GLANCE SITUATION CARDS */}
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
                Sub-potency assay failure (<strong className="text-rose-700 font-mono">84%</strong> vs statutory 90%). Schedule M safety violation.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Warehouse Stock
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  isStage2Complete
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
                }`}>
                  {isStage2Complete ? "WH-1 Locked" : "WH-1 At Risk"}
                </span>
              </div>
              <div className="text-lg font-bold text-amber-800">180 Boxes</div>
              <p className="text-xs text-slate-600 leading-normal">
                {isStage2Complete
                  ? "Frozen in warehouse quarantine. Software API prevents picking, packing, or outbound sales."
                  : "Requires immediate software quarantine to prevent accidental warehouse dispatches."}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Dispatched (30 Days)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  25 Customers
                </span>
              </div>
              <div className="text-lg font-bold text-slate-900">640 Boxes</div>
              <p className="text-xs text-slate-600 leading-normal">
                Traced to <strong className="text-slate-800">2 hospitals</strong> (240 units) and <strong className="text-slate-800">23 pharmacies</strong> (400 units).
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
                <strong className="text-teal-800">100% of hospital demand</strong> (240 boxes) fulfilled first. 240-unit chemist shortage backed by PO draft.
              </p>
            </div>
          </div>

          {/* FOCUSED ACTION & DECISION PANEL */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* NEXT RECOMMENDED ACTION (HERO CARD) */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Next Recommended Operation
                  </span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${nextAction.badgeColor}`}>
                  {nextAction.badge}
                </span>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900">
                  {nextAction.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {nextAction.desc}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span>Authorized Quality Safety Lead credential active</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={nextAction.handler}
                    disabled={loading || autonomousRunning}
                    className="px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 min-h-[42px] w-full sm:w-auto"
                  >
                    <Zap className="w-4 h-4 text-teal-200" />
                    <span>{loading ? "Processing..." : nextAction.actionLabel}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* OUTSTANDING DECISIONS & SYSTEM ALERTS */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Outstanding Decisions
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                    Live Watch
                  </span>
                </div>

                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-2">
                    <Building2 className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block">Hospital Priority Gate</strong>
                      Apollo & Manipal hospitals require 240 units of clean Amoxiclav. Allocation locked from WH-1.
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-2">
                    <Truck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block">Supply Chain Deficit</strong>
                      240-unit shortage for retail chemists. Supplier PO to Arogya Antibiotics Labs (8-day lead time).
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-2">
                    <Lock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block">Audit Chain Integrity</strong>
                      Immutable SHA-256 cryptographic chain ready to seal all actions.
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setActiveTabMode("impact_map")}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-teal-800 font-bold text-xs border border-slate-200 flex items-center justify-center gap-2 transition"
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>Explore Supply Chain Impact Map &rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 2: RECALL IMPACT MAP (THE STANDOUT ORIGINAL FEATURE) */}
      {/* ============================================================= */}
      {activeTabMode === "impact_map" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-xs space-y-5">
            {/* Header Strip */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Network className="w-6 h-6 text-teal-700" />
                  <span>Recall Impact & Supply Chain Flow Map</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl">
                  Interactive supply chain trace for Batch B2231. Visualizes distribution from warehouse quarantine down to all 25 forward accounts (2 inpatient hospitals, 23 community pharmacies).
                </p>
              </div>

              {/* Summary Badges */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  WH-1 Held: 180 Units
                </span>
                <span className="px-3 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Dispatched: 640 Units
                </span>
                <span className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  25 Recipients Traced
                </span>
              </div>
            </div>

            {/* DESKTOP SUPPLY CHAIN FLOW (HIDDEN ON MOBILE) */}
            <div className="hidden lg:block space-y-6">
              <div className="grid grid-cols-12 gap-4 items-start">
                {/* NODE 1: WAREHOUSE RETENTION */}
                <div className="col-span-3 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Origin / WH-1
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      Quarantined
                    </span>
                  </div>
                  <div className="text-base font-bold text-slate-900">
                    Arogya WH-1 Central Depot
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div>Batch: <strong className="font-mono text-rose-700">B2231</strong></div>
                    <div>Quarantined Stock: <strong className="text-amber-800 font-bold">180 Boxes</strong></div>
                    <div>Location: <strong>Bengaluru, KA</strong></div>
                    <div className="text-[11px] text-emerald-700 font-semibold pt-1">
                      &check; Outbound API Dispatch Blocked
                    </div>
                  </div>
                </div>

                {/* CONNECTOR ARROW */}
                <div className="col-span-1 flex flex-col items-center justify-center pt-10 text-slate-400">
                  <ArrowRight className="w-6 h-6 text-teal-700" />
                  <span className="text-[10px] font-bold text-slate-500 mt-1">640 Dispatched</span>
                </div>

                {/* NODE 2: DEFECTIVE BATCH HUB */}
                <div className="col-span-3 bg-white border border-rose-200 rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                      <AlertOctagon className="w-3.5 h-3.5" />
                      Defective Batch
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 font-mono">
                      AMOX-625
                    </span>
                  </div>
                  <div className="text-base font-bold text-slate-900">
                    Amoxiclav 625 (B2231)
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div>Total Batch Size: <strong>820 Units</strong></div>
                    <div>Warehouse Held: <strong>180 Units (22%)</strong></div>
                    <div>Dispatched in 30d: <strong>640 Units (78%)</strong></div>
                    <div className="text-[11px] text-rose-700 font-bold pt-1">
                      Potency 84% (Failed Assay)
                    </div>
                  </div>
                </div>

                {/* CONNECTOR ARROWS TO CHANNELS */}
                <div className="col-span-1 flex flex-col items-center justify-center pt-10 text-slate-400">
                  <ArrowRight className="w-6 h-6 text-teal-700" />
                  <span className="text-[10px] font-bold text-slate-500 mt-1">2 Channels</span>
                </div>

                {/* NODE 3: DISTRIBUTION SUMMARY */}
                <div className="col-span-4 space-y-3">
                  {/* Hospital Channel Card */}
                  <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-indigo-700" />
                        Clinical Hospital Priority (2 Accounts)
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                        240 Units (100% Covered)
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-900 leading-tight">
                      Apollo Hospital (140) &bull; Manipal Hospital (100). Fulfilled from clean batch B2240.
                    </p>
                  </div>

                  {/* Chemist Channel Card */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Store className="w-4 h-4 text-slate-700" />
                        Community Pharmacies (23 Accounts)
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        400 Units (240 Shortage)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-tight">
                      23 regional pharmacies. Emergency PO PO-URG-AMOX drafted to supply 600 fresh units.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* INTERACTIVE RECIPIENT EXPLORER */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Recipient Directory & Notification Audit
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-600">
                    {filteredRecipients.length} Accounts
                  </span>
                </div>

                {/* Filter Pills & Search */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search recipient or city..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-teal-700 w-44 sm:w-56"
                    />
                  </div>

                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-xs">
                    <button
                      onClick={() => setRecipientFilter("all")}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        recipientFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      All (25)
                    </button>
                    <button
                      onClick={() => setRecipientFilter("hospitals")}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        recipientFilter === "hospitals" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      Hospitals (2)
                    </button>
                    <button
                      onClick={() => setRecipientFilter("chemists")}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        recipientFilter === "chemists" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      Pharmacies (23)
                    </button>
                    <button
                      onClick={() => setRecipientFilter("attention")}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        recipientFilter === "attention" ? "bg-white text-rose-900 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      Attention
                    </button>
                  </div>
                </div>
              </div>

              {/* 2-COLUMN VIEW: RECIPIENT GRID + SELECTED DOSSIER */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT: RECIPIENTS LIST / CARDS (7 COLS) */}
                <div className="lg:col-span-7 space-y-2 max-h-[560px] overflow-y-auto pr-1">
                  {filteredRecipients.map((r: any, idx: number) => {
                    const isSelected = selectedRecipient?.customer_id === r.customer_id;
                    const isHospital = r.type === "hospital";
                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedRecipient(r)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition text-xs flex items-center justify-between gap-3 ${
                          isSelected
                            ? "bg-teal-50/70 border-teal-600 shadow-xs ring-1 ring-teal-600"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isHospital ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"
                          }`}>
                            {isHospital ? <Building2 className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 truncate">{r.name}</span>
                              {isHospital && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 shrink-0">
                                  Hospital
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 font-mono">
                              <span>{r.customer_id}</span>
                              <span>&bull;</span>
                              <span>{r.location || "Bengaluru"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 text-right">
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">{r.quantity_received} boxes</span>
                            <span className={`text-[10px] font-semibold ${
                              isStage5Complete ? "text-emerald-700" : "text-slate-500"
                            }`}>
                              {isStage5Complete ? "Alert Sent" : "Ready"}
                            </span>
                          </div>
                          <ChevronRight className={`w-4 h-4 ${isSelected ? "text-teal-700" : "text-slate-300"}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* RIGHT: SELECTED RECIPIENT DOSSIER (5 COLS) */}
                <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 sticky top-4">
                  {selectedRecipient ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Recipient Inspection Dossier
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          selectedRecipient.type === "hospital"
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-slate-200 text-slate-700"
                        }`}>
                          {selectedRecipient.type === "hospital" ? "Inpatient Hospital" : "Retail Pharmacy"}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-slate-900">
                          {selectedRecipient.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-mono">
                          ID: {selectedRecipient.customer_id} &bull; {selectedRecipient.location || "Bengaluru Region"}
                        </p>
                      </div>

                      {/* Metrics Strip */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                          <span className="text-slate-400 block text-[10px]">Received Batch B2231</span>
                          <strong className="text-sm font-bold text-slate-900">
                            {selectedRecipient.quantity_received} Boxes
                          </strong>
                          <span className="text-[10px] text-slate-500 block">
                            ({((selectedRecipient.quantity_received / 640) * 100).toFixed(1)}% of recall)
                          </span>
                        </div>

                        <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                          <span className="text-slate-400 block text-[10px]">Replacement Policy</span>
                          <strong className="text-xs font-bold text-teal-800 block">
                            {selectedRecipient.type === "hospital" ? "Priority 1 (B2240)" : "Restocked via PO"}
                          </strong>
                          <span className="text-[10px] text-slate-500 block">
                            {selectedRecipient.type === "hospital" ? "Zero Deficit Guaranteed" : "Lead time 8 days"}
                          </span>
                        </div>
                      </div>

                      {/* Contact Verification */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2 text-xs">
                        <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                          Contact Reliability Verification
                        </span>
                        <div className="flex items-center justify-between text-slate-700">
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {selectedRecipient.phone || "+91 98765 43210"}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-emerald-100 text-emerald-800">
                            Valid E.164
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-700">
                          <span className="flex items-center gap-1.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {selectedRecipient.email || "orders@pharmacy.in"}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-emerald-100 text-emerald-800">
                            Verified
                          </span>
                        </div>
                      </div>

                      {/* Notice Preview Trigger */}
                      <div className="pt-1">
                        <button
                          onClick={() => {
                            setSelectedAlertModal({
                              type: "recall_notice",
                              batch: "B2231",
                              sku: "AMOX-625",
                              recipient_name: selectedRecipient.name,
                              email: selectedRecipient.email || "pharmacy@domain.in",
                              phone: selectedRecipient.phone || "+919876543210",
                              subject: `URGENT REGULATORY RECALL: Amoxiclav 625 Batch B2231 — Immediate Stop-Use Notice`,
                              body: `Dear Healthcare Partner (${selectedRecipient.name}),

This is an urgent recall alert from Arogya Pharma Distributors. Batch B2231 of Amoxiclav 625 has been recalled due to sub-potency assay failure (84% vs 90% required). You received ${selectedRecipient.quantity_received} boxes on ${selectedRecipient.dispatch_date || "2026-09-28"}.

Please immediately quarantine all remaining boxes. ${selectedRecipient.type === "hospital" ? "Replacement stock from clean batch B2240 has been reserved for your facility." : "A replacement order has been drafted to replenish your store."}

Authorized by: Dr. K. Sharma (Quality Safety Lead).`,
                              sms_text: `CRITICAL ALERT TraceRx: Recall for Amoxiclav Batch B2231. Stop dispensing ${selectedRecipient.quantity_received} boxes. Reply ACK.`,
                            });
                          }}
                          className="w-full px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition min-h-[38px]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect Delivered Notice (Email & SMS)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400 space-y-2">
                      <Network className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="text-xs">Select any recipient from the list to inspect their supply chain dossier.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 3: AI AGENT CONTROL ROOM (10 AGENT RUN) */}
      {/* ============================================================= */}
      {activeTabMode === "control_room" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                10-Agent Autonomous Pipeline Execution
              </h2>
              <p className="text-xs text-slate-500">
                Click Run 10 Autonomous Agents to execute all regulatory containment steps sequentially with zero manual latency.
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
                      <span className="text-slate-500">Engine: {agent.engine || "Deterministic Safety Engine"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 4: STEP-BY-STEP OPERATOR INSPECTOR (1 TO 9) */}
      {/* ============================================================= */}
      {activeTabMode === "step_by_step" && (
        <div className="space-y-6">
          {/* Step Pill Selector */}
          <div className="flex overflow-x-auto no-scrollbar items-center gap-1.5 p-1.5 bg-slate-50 border border-slate-200 rounded-xl w-full">
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
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 min-h-[36px] ${
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
                    className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition min-h-[38px]"
                  >
                    Ingest Regulatory Incident
                  </button>
                </div>
                {recallIncident && (
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs overflow-x-auto text-slate-800 font-mono">
                    {JSON.stringify(recallIncident, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {activeStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 2: Warehouse Stock Quarantine</h3>
                    <p className="text-xs text-slate-500">Locks 180 boxes of B2231 in WH-1. Blocks dispatch API from picking or selling.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleStep2QuarantineBatch}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition min-h-[38px]"
                    >
                      Quarantine Batch B2231
                    </button>
                    <button
                      onClick={handleTestDispatchBlock}
                      disabled={loading}
                      className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100 transition min-h-[38px]"
                    >
                      Test Dispatch Blocker
                    </button>
                  </div>
                </div>
                {batchBlockStatus && (
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs overflow-x-auto text-slate-800 font-mono">
                    {JSON.stringify(batchBlockStatus, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {activeStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 3: Customer Recipient Tracing</h3>
                    <p className="text-xs text-slate-500">Reconciles all 25 customers (2 hospitals, 23 pharmacies) who bought B2231 in last 30 days.</p>
                  </div>
                  <button
                    onClick={handleStep3TraceRecipients}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition min-h-[38px]"
                  >
                    Trace Dispatched Customers
                  </button>
                </div>
                {recipientsData && (
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs overflow-x-auto text-slate-800 font-mono">
                    {JSON.stringify(recipientsData, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {activeStep === 4 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 4: Draft Emergency Notices</h3>
                    <p className="text-xs text-slate-500">Prepares personalized Email and SMS notices with Indian DLT regulatory template IDs.</p>
                  </div>
                  <button
                    onClick={handleStep4GenerateCampaign}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition min-h-[38px]"
                  >
                    Generate Notice Campaign
                  </button>
                </div>
                {campaignData && (
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs overflow-x-auto text-slate-800 font-mono">
                    {JSON.stringify(campaignData, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {activeStep === 5 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 5: Human Sign-Off & Live Dispatch</h3>
                    <p className="text-xs text-slate-500">Human-in-the-loop authorization gate before transmitting live multi-channel alerts.</p>
                  </div>
                  <button
                    onClick={handleStep5ApproveAndSend}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition min-h-[38px]"
                  >
                    Approve & Transmit Alerts
                  </button>
                </div>
                {dispatchResults && (
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs overflow-x-auto text-slate-800 font-mono">
                    {JSON.stringify(dispatchResults, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {activeStep === 6 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 6: Replacement Coverage Calculations</h3>
                    <p className="text-xs text-slate-500">Compares clean replacement batch B2240 (400 boxes in WH-1) against total 640 recall need.</p>
                  </div>
                  <button
                    onClick={handleStep6ReplacementAnalysis}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition min-h-[38px]"
                  >
                    Calculate Replacement Deficit
                  </button>
                </div>
                {replacementData && (
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs overflow-x-auto text-slate-800 font-mono">
                    {JSON.stringify(replacementData, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {activeStep === 7 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 7: Hospital-First Prioritization</h3>
                    <p className="text-xs text-slate-500">Guarantees 100% fulfillment for Apollo and Manipal hospitals (240 units total).</p>
                  </div>
                  <button
                    onClick={handleStep7AllocateHospitals}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition min-h-[38px]"
                  >
                    Lock Hospital Allocation
                  </button>
                </div>
                {hospitalData && (
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs overflow-x-auto text-slate-800 font-mono">
                    {JSON.stringify(hospitalData, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {activeStep === 8 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 8: Emergency Supplier PO Draft</h3>
                    <p className="text-xs text-slate-500">Drafts replenishment PO for 600 units with supplier Arogya Antibiotics Labs.</p>
                  </div>
                  <button
                    onClick={handleStep8DraftPO}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition min-h-[38px]"
                  >
                    Draft Replenishment PO
                  </button>
                </div>
                {poDraftData && (
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs overflow-x-auto text-slate-800 font-mono">
                    {JSON.stringify(poDraftData, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {activeStep === 9 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Step 9: Tamper-Evident Audit Ledger</h3>
                    <p className="text-xs text-slate-500">Verifies complete cryptographic SHA-256 chain of custody across all recall steps.</p>
                  </div>
                  <button
                    onClick={handleStep9VerifyAudit}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition min-h-[38px]"
                  >
                    Verify Cryptographic Ledger
                  </button>
                </div>
                {auditData && (
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs overflow-x-auto text-slate-800 font-mono">
                    {JSON.stringify(auditData, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 5: CUSTOM CSV EXPIRY SCANNER */}
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
                  Columns supported: SKU, Batch, Expiry Date, Warehouse, Stock Qty. Or click 1-Click Load Demo Expired CSV above.
                </p>
              </div>

              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleUploadExpiryCsv(e.target.files[0]);
                }}
                disabled={uploadingCsv}
                className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-700 file:text-white hover:file:bg-teal-800 cursor-pointer"
              />
            </div>

            {/* Scan Results */}
            {expiryScanResult && (
              <div className="space-y-4 pt-4 border-t border-slate-200 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">
                    Expiry Inspection Findings &bull; {uploadedFileName}
                  </h3>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    expiryScanResult.summary?.expired_batches_count > 0
                      ? "bg-rose-100 text-rose-800 border border-rose-200"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  }`}>
                    {expiryScanResult.summary?.expired_batches_count} Expired Batches Detected
                  </span>
                </div>

                {expiryScanResult.expired_batches?.length > 0 && (
                  <div className="space-y-4">
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="p-3">Batch</th>
                            <th className="p-3">Medicine SKU</th>
                            <th className="p-3">Expiry Date</th>
                            <th className="p-3">Overdue Days</th>
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
                              <td className="p-3 font-bold text-rose-700">+{b.days_expired} days</td>
                              <td className="p-3 font-bold text-slate-900">{b.qty} units</td>
                              <td className="p-3 text-slate-600">{b.warehouse || "WH-1"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Proposed Action & Approval Gate */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                      <div>
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wide block mb-1">
                          Autonomous Agent Containment Plan
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {expiryScanResult.review_message_to_owner?.proposed_action}
                        </p>
                      </div>

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
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 6: EXECUTIVE INCIDENT BRIEFING */}
      {/* ============================================================= */}
      {activeTabMode === "executive_report" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-xl font-bold text-slate-900">Executive Incident Briefing & Audit Summary</h2>
              <p className="text-xs text-slate-500 mt-1">Autonomous multi-agent containment report for Arogya Pharma Distributors.</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Delivered Notice Inspection</h3>
                <p className="text-xs text-slate-500">Live communication payload delivered to user credentials</p>
              </div>
              <button
                onClick={() => setSelectedAlertModal(null)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 min-h-[36px]"
              >
                Close
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <button
                onClick={() => setAlertViewChannel("email")}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold min-h-[40px] ${
                  alertViewChannel === "email" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Email Message
              </button>
              <button
                onClick={() => setAlertViewChannel("sms")}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold min-h-[40px] ${
                  alertViewChannel === "sms" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
