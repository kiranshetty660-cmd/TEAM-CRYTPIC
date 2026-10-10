"use client";

import React, { useEffect, useState } from "react";
import {
  Boxes,
  Upload,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Download,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  XCircle,
  RotateCcw,
  Sparkles,
  Info,
  Zap,
  Mail,
  MessageSquare,
  Lock,
  AlertOctagon,
  Eye,
  FileText,
  Bell,
  Send,
  Settings,
  Calendar,
} from "lucide-react";
import { api } from "../../lib/api";
import { REQUIRED_SCHEMAS, ENTITY_CONFIG } from "../../lib/canonical-schemas";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/Table";
import { Skeleton, ErrorState } from "../../components/ui/FeedbackStates";
import { useToast } from "../../components/ui/Toast";

export default function InventoryPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<{ today: string; total_batches: number; total_units: number; items: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("");

  // Expired Medicine Testing Modal & State
  const [expiryModalOpen, setExpiryModalOpen] = useState(false);
  const [expiryFile, setExpiryFile] = useState<File | null>(null);
  const [scanningExpiry, setScanningExpiry] = useState(false);
  const [expiryScanResult, setExpiryScanResult] = useState<any | null>(null);
  const [approvingExpiry, setApprovingExpiry] = useState(false);
  const [expiryApprovalResult, setExpiryApprovalResult] = useState<any | null>(null);
  const [pendingCase, setPendingCase] = useState<any | null>(null);
  const [activeAgentIndex, setActiveAgentIndex] = useState<number>(-1);
  const [agentsTimeline, setAgentsTimeline] = useState<any[]>([]);

  // 3-Day Automated Expiry Notification State
  const [expirySchedule, setExpirySchedule] = useState<any | null>(null);
  const [triggeringAlert, setTriggeringAlert] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [configCadence, setConfigCadence] = useState<number>(3);
  const [configEmail, setConfigEmail] = useState<string>("chethuc809@gmail.com");
  const [configPhone, setConfigPhone] = useState<string>("+917996662516");
  const [configEnabled, setConfigEnabled] = useState<boolean>(true);

  // Adaptation Wizard State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedTable, setSelectedTable] = useState("batch_inventory");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Profiler state
  const [profiling, setProfiling] = useState(false);
  const [profileResult, setProfileResult] = useState<any>(null);
  const [confirmedMapping, setConfirmedMapping] = useState<Record<string, string>>({});

  // Validation state
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  // Commit & Rollback state
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const loadExpirySchedule = async () => {
    try {
      const sched = await api.getExpirySchedule();
      setExpirySchedule(sched);
      if (sched) {
        setConfigCadence(sched.cadence_days || 3);
        setConfigEmail(sched.admin_email || "chethuc809@gmail.com");
        setConfigPhone(sched.admin_phone || "+917996662516");
        setConfigEnabled(sched.enabled ?? true);
      }
    } catch (_) {}
  };

  const handleTriggerExpiryNotification = async () => {
    try {
      setTriggeringAlert(true);
      const res = await api.triggerExpiryNotification();
      showToast(
        `3-Day Notification delivered! Alerted Admin at ${res.email_delivery?.provider_message_id ? "chethuc809@gmail.com (Email)" : "Email"} & ${res.sms_delivery?.status ? "+917996662516 (SMS)" : "SMS"}. Logged to Ledger #${res.ledger_sequence}.`,
        "success"
      );
      await loadExpirySchedule();
      await loadInventory();
    } catch (err: any) {
      showToast(err?.message || "Failed to trigger 3-day notification", "error");
    } finally {
      setTriggeringAlert(false);
    }
  };

  const handleSaveScheduleConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSchedule(true);
      const updated = await api.updateExpiryScheduleConfig({
        cadence_days: configCadence,
        admin_email: configEmail,
        admin_phone: configPhone,
        enabled: configEnabled,
      });
      setExpirySchedule(updated);
      setScheduleModalOpen(false);
      showToast(`Expiry notification schedule updated to every ${configCadence} days!`, "success");
    } catch (err: any) {
      showToast(err?.message || "Failed to update schedule config", "error");
    } finally {
      setSavingSchedule(false);
    }
  };

  const formatScheduleDate = (dateStr?: string) => {
    if (!dateStr) return "Pending calculation";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getInventory(statusFilter || undefined, warehouseFilter || undefined);
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load inventory records");
    } finally {
      setLoading(false);
    }
  };

  const checkPendingCases = async () => {
    try {
      const res = await api.demoGetPendingExpiryCases();
      if (res.latest_case) {
        setPendingCase(res.latest_case);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadInventory();
    checkPendingCases();
    loadExpirySchedule();
  }, [statusFilter, warehouseFilter]);

  // Step 1 -> Step 2: Profile Dataset
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      showToast("Please choose a CSV or XLSX file", "error");
      return;
    }
    try {
      setProfiling(true);
      const res = await api.profileData(selectedFile, selectedTable);
      setProfileResult(res);
      const effectiveTable = res.target_table || selectedTable;
      if (effectiveTable !== selectedTable) {
        setSelectedTable(effectiveTable);
        showToast(`Auto-detected table: ${effectiveTable}`, "info");
      }

      if (res.is_rejected || (res.missing_mandatory_fields && res.missing_mandatory_fields.length > 0)) {
        showToast(`Upload rejected: Missing mandatory fields for ${effectiveTable}`, "error");
        return;
      }

      setConfirmedMapping(res.mapping_analysis?.mapping || {});
      setWizardStep(2);
      showToast(`Detected ${res.total_rows} rows and ${res.columns.length} columns.`, "success");
    } catch (err: any) {
      showToast(err.message || "Profiling failed", "error");
    } finally {
      setProfiling(false);
    }
  };

  // Step 2 -> Step 3: Validate with Confirmed Mapping
  const handleValidateSubmit = async () => {
    if (!selectedFile) return;
    try {
      setValidating(true);
      const res = await api.validateData(selectedFile, selectedTable, confirmedMapping);
      setValidationResult(res);
      setWizardStep(3);
      if (res.invalid_rows_count > 0) {
        showToast(`Validated: ${res.valid_rows_count} valid, ${res.invalid_rows_count} errors.`, "info");
      } else {
        showToast(`Validation passed! Ready to commit ${res.valid_rows_count} rows.`, "success");
      }
    } catch (err: any) {
      showToast(err.message || "Validation failed", "error");
    } finally {
      setValidating(false);
    }
  };

  // Step 3 -> Step 4: Transactional Commit
  const handleCommitSubmit = async () => {
    if (!validationResult?.import_id) return;
    try {
      setCommitting(true);
      const res = await api.commitData(validationResult.import_id, "Chief Pharmacist");
      setCommitResult(res);
      setWizardStep(4);
      showToast(`Committed ${res.rows_committed} rows transactionally. Rescanned findings.`, "success");
      await loadInventory();
    } catch (err: any) {
      showToast(err.message || "Commit failed", "error");
    } finally {
      setCommitting(false);
    }
  };

  // Rollback Action
  const handleRollback = async () => {
    if (!commitResult?.import_id) return;
    try {
      setRollingBack(true);
      await api.rollbackData(commitResult.import_id, "Quality Head");
      showToast(`Import ${commitResult.import_id} rolled back successfully.`, "info");
      setWizardOpen(false);
      resetWizard();
      await loadInventory();
    } catch (err: any) {
      showToast(err.message || "Rollback failed", "error");
    } finally {
      setRollingBack(false);
    }
  };

  const handleUploadAndRunExpiryAgents = async (fileToUpload?: File) => {
    const targetFile = fileToUpload || expiryFile;
    if (!targetFile) {
      showToast("Please select a CSV file first", "error");
      return;
    }
    try {
      setScanningExpiry(true);
      setExpiryScanResult(null);
      setExpiryApprovalResult(null);
      setAgentsTimeline([]);
      setActiveAgentIndex(0);

      const res = await api.demoUploadExpiryDataset(targetFile);

      const timeline = res.agents_timeline || [];
      for (let i = 0; i < timeline.length; i++) {
        setActiveAgentIndex(i);
        setAgentsTimeline(timeline.slice(0, i + 1));
        await new Promise((r) => setTimeout(r, 160));
      }

      setExpiryScanResult(res);
      setPendingCase({
        case_id: res.case_id,
        filename: res.filename,
        expired_batches: res.review_message?.expired_batches || [],
        total_expired_units: res.summary?.total_expired_units || 0,
        review_message: res.review_message,
        agents_timeline: res.agents_timeline,
        status: "pending_owner_approval",
      });

      if (res.summary?.expired_batches_count > 0) {
        showToast(`Agents detected ${res.summary.expired_batches_count} expired batches! Review alert prepared for Admin/Owner.`, "error");
      } else {
        showToast("All batches passed! No expired medicines detected.", "success");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to scan dataset", "error");
    } finally {
      setScanningExpiry(false);
    }
  };

  const handleDownloadTestExpiredCsv = async () => {
    try {
      const res = await api.demoGetSampleExpiredCsv();
      const blob = new Blob([res.csv_text], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", res.filename || "sample_expired_medicines.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Sample expired medicine dataset downloaded!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to download sample CSV", "error");
    }
  };

  const handleTestWithSampleCsv = async () => {
    try {
      setScanningExpiry(true);
      setExpiryScanResult(null);
      setExpiryApprovalResult(null);
      setAgentsTimeline([]);
      setActiveAgentIndex(0);

      const sample = await api.demoGetSampleExpiredCsv();
      const res = await api.demoUploadExpiryDataset({
        csv_text: sample.csv_text,
        filename: sample.filename,
      });

      const timeline = res.agents_timeline || [];
      for (let i = 0; i < timeline.length; i++) {
        setActiveAgentIndex(i);
        setAgentsTimeline(timeline.slice(0, i + 1));
        await new Promise((r) => setTimeout(r, 160));
      }

      setExpiryScanResult(res);
      setPendingCase({
        case_id: res.case_id,
        filename: res.filename,
        expired_batches: res.review_message?.expired_batches || [],
        total_expired_units: res.summary?.total_expired_units || 0,
        review_message: res.review_message,
        agents_timeline: res.agents_timeline,
        status: "pending_owner_approval",
      });

      showToast(`Agents detected ${res.summary.expired_batches_count} expired batches! Review alert prepared for Admin/Owner.`, "error");
    } catch (err: any) {
      showToast(err.message || "Failed to scan dataset", "error");
    } finally {
      setScanningExpiry(false);
    }
  };

  const handleApproveExpiryAction = async (caseId?: string) => {
    try {
      setApprovingExpiry(true);
      const res = await api.demoApproveExpiryAction({
        case_id: caseId || expiryScanResult?.case_id || pendingCase?.case_id,
        approver_name: "Chethan (Admin / Warehouse Owner)",
        approver_role: "Warehouse Owner & Quality Director",
        notes: "Approved emergency containment of expired medicine dataset. Quarantine stock, dispatch live email/sms notices, and draft replacement PO.",
      });

      setExpiryApprovalResult(res);
      setPendingCase(null);
      showToast(`Action Approved! Quarantined stock in warehouse, live Email sent to chethuc809@gmail.com, live SMS sent to +917996662516, PO drafted.`, "success");

      setStatusFilter("quarantine");
      await loadInventory();
    } catch (err: any) {
      showToast(err.message || "Failed to execute approval", "error");
    } finally {
      setApprovingExpiry(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setSelectedFile(null);
    setProfileResult(null);
    setConfirmedMapping({});
    setValidationResult(null);
    setCommitResult(null);
  };

  const downloadSampleCsv = () => {
    const csvContent =
      "Lot_Number,Product_Code,Depot,Quantity,Mfg_Date,Exp_Date,Condition\n" +
      "NE-881,OMEP-20,WH-1,900,2026-01-01,2027-08-05,active\n" +
      "B2240,AMOX-625,WH-1,400,2026-09-01,2027-09-01,active\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sample_diverse_headers.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
            <Boxes className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Batch Inventory &amp; Shelf-Life Radar
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                TraceRx Radar
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Tracking {data?.total_batches ?? 0} batches across distribution nodes with color-coded shelf-life heat classification.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setExpiryScanResult(null);
              setExpiryApprovalResult(null);
              setExpiryFile(null);
              setExpiryModalOpen(true);
            }}
            leftIcon={<Zap className="w-4 h-4" />}
          >
            Upload &amp; Test Expired Medicines (10 Agents)
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadTestExpiredCsv}
            leftIcon={<Download className="w-4 h-4 text-slate-500" />}
          >
            Download Test Expired CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetWizard();
              setWizardOpen(true);
            }}
            leftIcon={<FileSpreadsheet className="w-4 h-4 text-slate-500" />}
          >
            Schema Ingestion Wizard
          </Button>
        </div>
      </div>

      {/* PENDING EXPIRY REVIEW BANNER (If agents found expired stock) */}
      {pendingCase && pendingCase.status === "pending_owner_approval" && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Review Required by Admin / Owner</span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-rose-200/80 text-rose-900 font-semibold">{pendingCase.case_id}</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                Expired Medicines Detected in Uploaded Dataset: {pendingCase.expired_batches?.length || 0} Batches ({pendingCase.total_expired_units || 0} Units)
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                10 specialized agents evaluated the dataset and prepared an immediate containment plan. Dispensing is blocked. Awaiting your authorization to quarantine warehouse stock and send email &amp; SMS alerts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setExpiryModalOpen(true);
              }}
              leftIcon={<ShieldAlert className="w-4 h-4" />}
            >
              Review Problem &amp; Approve Action
            </Button>
          </div>
        </div>
      )}

      {/* 3-Day Automated Expiry Notification Service Banner */}
      <Card className="p-4 sm:p-5 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border border-blue-200 shadow-xs rounded-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-900">
                  Automated Admin Expiry Alerts
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Every {expirySchedule?.cadence_days || 3} Days Active
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-medium">
                  In-App + Email ({expirySchedule?.admin_email || "chethuc809@gmail.com"}) + SMS ({expirySchedule?.admin_phone || "+917996662516"})
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-3xl">
                Every {expirySchedule?.cadence_days || 3} days, the automated compliance engine scans all warehouse stock and notifies the Admin with a breakdown of expired and near-expiry medicine batches.
                {expirySchedule?.current_audit?.expired_batches_count > 0 && (
                  <strong className="text-rose-600 ml-1">
                    Currently {expirySchedule.current_audit.expired_batches_count} expired batches ({expirySchedule.current_audit.expired_total_units} units) detected in distribution hubs!
                  </strong>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[11px] text-slate-500 mt-2 font-medium">
                <span>Last Dispatched: <strong className="text-slate-800">{formatScheduleDate(expirySchedule?.last_run_at)}</strong></span>
                <span>•</span>
                <span>Next Scheduled: <strong className="text-slate-800">{formatScheduleDate(expirySchedule?.next_run_due)}</strong></span>
                {expirySchedule?.current_audit && (
                  <>
                    <span>•</span>
                    <span>Monitoring: <strong className="text-slate-800">{data?.total_batches || 0} Batches</strong> across 3 hubs</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScheduleModalOpen(true)}
              leftIcon={<Clock className="w-4 h-4 text-slate-600" />}
            >
              Configure Schedule
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleTriggerExpiryNotification}
              isLoading={triggeringAlert}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Trigger 3-Day Alert Now
            </Button>
          </div>
        </div>
      </Card>

      {/* Filter Strip */}
      <Card className="p-4 bg-white border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Filters:</span>
          </div>

          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 min-h-[38px]"
          >
            <option value="">All Warehouses</option>
            <option value="WH-1">WH-1 Bengaluru</option>
            <option value="WH-2">WH-2 Hubballi</option>
            <option value="WH-3">WH-3 Mysuru</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 min-h-[38px]"
          >
            <option value="">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="quarantine">Quarantine</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          Total Inventory: <strong className="text-slate-900">{data?.total_units?.toLocaleString() ?? 0}</strong> Units
        </div>
      </Card>

      {/* Table Data */}
      {loading ? (
        <Card className="p-6 bg-white border-slate-200 space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : error ? (
        <ErrorState message={error} onRetry={loadInventory} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch Number</TableHead>
              <TableHead>SKU & Molecule</TableHead>
              <TableHead>Warehouse / Zone</TableHead>
              <TableHead>Units in Stock</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead>Shelf Life Remaining</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono font-bold text-slate-900">{item.batch}</TableCell>
                <TableCell>
                  <div className="font-semibold text-slate-900">{item.sku}</div>
                  <div className="text-[11px] text-slate-500">{item.molecule || item.brand}</div>
                </TableCell>
                <TableCell className="text-xs text-slate-700">
                  {item.warehouse}
                  {item.cold_room && <span className="text-blue-600 block text-[10px]">({item.cold_room})</span>}
                </TableCell>
                <TableCell className="font-semibold text-slate-900">{item.qty?.toLocaleString()}</TableCell>
                <TableCell className="text-xs text-slate-600">{item.expiry_date}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.days_to_expiry <= 60
                        ? "danger"
                        : item.days_to_expiry <= 120
                        ? "warning"
                        : "success"
                    }
                    size="sm"
                  >
                    {item.days_to_expiry} Days
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.status === "active"
                        ? "success"
                        : item.status === "quarantine"
                        ? "warning"
                        : "danger"
                    }
                    size="sm"
                  >
                    {item.status.toUpperCase()}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* 4-Step Dataset Ingestion Wizard Modal */}
      <Modal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title="Dataset Ingestion & Validation Wizard (CSV / XLSX)"
        description="Adapt, map, validate, and transactionally import partner datasets with zero data loss or value fabrication."
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {wizardStep > 1 && wizardStep < 4 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setWizardStep((prev) => (prev - 1) as any)}
                  leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                >
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setWizardOpen(false)}>
                {wizardStep === 4 ? "Close" : "Cancel"}
              </Button>
              {wizardStep === 1 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleProfileSubmit}
                  isLoading={profiling}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Analyze & Profile
                </Button>
              )}
              {wizardStep === 2 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleValidateSubmit}
                  isLoading={validating}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Validate Dataset
                </Button>
              )}
              {wizardStep === 3 && (
                <Button
                  variant="emerald"
                  size="sm"
                  onClick={handleCommitSubmit}
                  isLoading={committing}
                  disabled={!validationResult?.is_valid_for_commit || (validationResult?.invalid_rows_count || 0) > 0 || (validationResult?.valid_rows_count || 0) === 0}
                  leftIcon={<Check className="w-3.5 h-3.5" />}
                >
                  {(validationResult?.invalid_rows_count || 0) > 0
                    ? `Import Blocked (${validationResult?.invalid_rows_count} Errors Must Be Fixed)`
                    : `Commit Dataset (${validationResult?.valid_rows_count || 0} Rows)`}
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-slate-700">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            {[
              { num: 1, title: "1. File Selection" },
              { num: 2, title: "2. Schema Mapping" },
              { num: 3, title: "3. Validation & Report" },
              { num: 4, title: "4. Audit Result" },
            ].map((s) => (
              <div
                key={s.num}
                className={`flex items-center gap-1.5 font-bold ${
                  wizardStep === s.num ? "text-slate-900" : wizardStep > s.num ? "text-emerald-700" : "text-slate-400"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    wizardStep === s.num
                      ? "bg-slate-900 text-white"
                      : wizardStep > s.num
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {s.num}
                </span>
                <span className="text-[11px] hidden sm:inline">{s.title}</span>
              </div>
            ))}
          </div>

          {/* STEP 1: Upload File & Select Table */}
          {wizardStep === 1 && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Target Entity / Table</label>
                <select
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs focus:outline-none"
                >
                  <option value="batch_inventory">batch_inventory (Warehouse Batches & Expiry Dates)</option>
                  <option value="products">products (Product Master Catalog & Molecules)</option>
                  <option value="dispatches">dispatches (Historical Customer Shipments)</option>
                  <option value="customers">customers (Hospitals & Retail Chemists)</option>
                  <option value="suppliers">suppliers (Manufacturer Lead Times & Return Terms)</option>
                  <option value="temp_logs">temp_logs (Cold Storage IoT Sensor Streams)</option>
                  <option value="purchase_orders">purchase_orders (Purchase Orders & Inbound Shipments)</option>
                  <option value="recalls">recalls (CDSCO Regulatory Recalls)</option>
                </select>
              </div>

              {/* Mandatory Schema Tags & Template Download Link */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    Mandatory Columns for {ENTITY_CONFIG[selectedTable]?.title || selectedTable}:
                  </span>
                  <a
                    href={api.getTemplateUrl(selectedTable)}
                    download={`${selectedTable}_template.csv`}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV Template
                  </a>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(REQUIRED_SCHEMAS[selectedTable] || []).map((col) => (
                    <span
                      key={col}
                      className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 font-mono text-[10px] font-semibold"
                    >
                      {col} *
                    </span>
                  ))}
                </div>
              </div>

              {/* Prominent Upload Rejection Card if Missing Mandatory Columns */}
              {profileResult?.is_rejected && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-2">
                  <div className="font-bold text-xs flex items-center gap-1.5 text-rose-700">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    Upload Rejected: {ENTITY_CONFIG[selectedTable]?.title || selectedTable}
                  </div>
                  <div className="font-semibold text-rose-800 text-[11px]">Missing mandatory fields:</div>
                  <ul className="list-disc list-inside space-y-0.5 font-mono text-[11px] text-rose-700">
                    {profileResult.missing_mandatory_fields?.map((f: string) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-rose-600 pt-1">
                    Please correct the file and upload it again. No records were imported.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Select Dataset (CSV or XLSX)</label>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedFile(file);
                    setProfileResult(null);
                    if (file) {
                      const lower = file.name.toLowerCase();
                      if (lower.includes("dispatch") || lower.includes("shipment") || lower.includes("sale")) {
                        setSelectedTable("dispatches");
                      } else if (lower.includes("product") || lower.includes("catalog") || lower.includes("molecule")) {
                        setSelectedTable("products");
                      } else if (lower.includes("customer") || lower.includes("client") || lower.includes("chemist") || lower.includes("hospital")) {
                        setSelectedTable("customers");
                      } else if (lower.includes("supplier") || lower.includes("vendor") || lower.includes("manu")) {
                        setSelectedTable("suppliers");
                      } else if (lower.includes("temp") || lower.includes("sensor") || lower.includes("cold")) {
                        setSelectedTable("temp_logs");
                      } else if (lower.includes("po") || lower.includes("purchase")) {
                        setSelectedTable("purchase_orders");
                      } else if (lower.includes("recall")) {
                        setSelectedTable("recalls");
                      } else if (lower.includes("batch") || lower.includes("inventory")) {
                        setSelectedTable("batch_inventory");
                      }
                    }
                  }}
                  className="w-full p-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <strong>Strict Compliance Enforcement:</strong>
                <p>
                  Every uploaded file must contain 100% of the mandatory fields for the entity. Files with missing columns
                  or uncorrected validation errors are automatically blocked from database ingestion.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: Interactive Schema Mapping */}
          {wizardStep === 2 && profileResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  Detected {profileResult.columns.length} columns in file. Review and confirm mapping:
                </span>
                <Badge variant="info" size="sm">
                  {profileResult.total_rows} Rows Detected
                </Badge>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-2.5 bg-slate-50">
                {profileResult.mapping_analysis?.details?.map((det: any) => (
                  <div key={det.canonical_field} className="flex items-center justify-between p-2 rounded bg-white border border-slate-200 text-xs">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        {det.canonical_field}
                        {det.is_required && <span className="text-red-500 font-bold">*</span>}
                        <Badge variant={det.confidence >= 0.8 ? "success" : "warning"} size="sm">
                          {Math.round(det.confidence * 100)}% match
                        </Badge>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Source Column: <span className="font-mono text-slate-800">{det.mapped_source_column}</span>
                      </div>
                    </div>

                    <select
                      value={confirmedMapping[det.canonical_field] || ""}
                      onChange={(e) =>
                        setConfirmedMapping({
                          ...confirmedMapping,
                          [det.canonical_field]: e.target.value,
                        })
                      }
                      className="p-1 rounded border border-slate-300 text-xs bg-white text-slate-800"
                    >
                      <option value="">-- Do Not Map --</option>
                      {profileResult.columns.map((c: string) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {profileResult.mapping_analysis?.missing_required_fields?.length > 0 && (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                  <strong>Warning:</strong> Missing required fields: {profileResult.mapping_analysis.missing_required_fields.join(", ")}.
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Validation Preview & Analysis Capability Report */}
          {wizardStep === 3 && validationResult && (
            <div className="space-y-3.5">
              {/* Validation Summary Strip */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                  <div className="text-emerald-600 text-[10px] uppercase font-bold">Valid Rows</div>
                  <div className="text-base font-bold text-emerald-800">{validationResult.valid_rows_count}</div>
                </div>
                <div className="p-2 rounded bg-rose-50 border border-rose-200">
                  <div className="text-rose-600 text-[10px] uppercase font-bold">Errors</div>
                  <div className="text-base font-bold text-rose-800">{validationResult.invalid_rows_count}</div>
                </div>
                <div className="p-2 rounded bg-amber-50 border border-amber-200">
                  <div className="text-amber-600 text-[10px] uppercase font-bold">Warnings</div>
                  <div className="text-base font-bold text-amber-800">{validationResult.warning_count}</div>
                </div>
              </div>

              {/* Analysis Capability Report */}
              <div className="space-y-1.5">
                <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Analysis Capability Report (Supported Analytics)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(validationResult.capability_report || {}).map(([key, val]: any) => (
                    <div
                      key={key}
                      className={`p-2 rounded border flex items-start gap-1.5 ${
                        val.supported ? "bg-emerald-50/70 border-emerald-200 text-emerald-900" : "bg-slate-50 border-slate-200 text-slate-600"
                      }`}
                    >
                      {val.supported ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold capitalize">{key.replace(/_/g, " ")}: {val.supported ? "ENABLED" : "DISABLED"}</div>
                        <div className="text-[10px] text-slate-500">{val.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Row Errors if any */}
              {validationResult.errors?.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-900 max-h-44 overflow-y-auto space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-rose-800">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Import status: Blocked</span>
                  </div>
                  <div className="text-[11px] text-rose-700">
                    Reason: Validation errors must be corrected. ({validationResult.invalid_rows_count} invalid rows detected)
                  </div>
                  <div className="font-semibold text-rose-800 text-[11px] pt-1">Errors:</div>
                  <ul className="list-disc list-inside space-y-0.5 font-mono text-[10px] text-rose-700">
                    {validationResult.errors.map((err: any, i: number) => (
                      <li key={i}>
                        Row {err.row_number}: {err.error || (Array.isArray(err.errors) ? err.errors.join("; ") : "Invalid row data")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {validationResult.preview_rows?.length > 0 && (
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-[11px] uppercase tracking-wider">
                    Sanitized Preview (First 5 Rows)
                  </div>
                  <div className="max-h-32 overflow-x-auto border border-slate-200 rounded-lg bg-slate-50 p-2 font-mono text-[10px]">
                    <pre>{JSON.stringify(validationResult.preview_rows, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Success, Ledger Event & Rollback */}
          {wizardStep === 4 && commitResult && (
            <div className="space-y-3.5 text-center py-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Dataset Committed Successfully!</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Transaction completed, audit record appended to SHA-256 ledger, and compliance findings recomputed.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-left space-y-1">
                <div>Import Reference: <strong className="font-mono">{commitResult.import_id}</strong></div>
                <div>Rows Committed: <strong>{commitResult.rows_committed}</strong></div>
                <div>Updated Findings Count: <strong>{commitResult.new_findings_count}</strong></div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRollback}
                  isLoading={rollingBack}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5 text-rose-600" />}
                >
                  Rollback This Import
                </Button>
                <Button variant="primary" size="sm" onClick={() => setWizardOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ============================================================= */}
      {/* EXPIRED MEDICINE TESTING & AUTONOMOUS ACTION MODAL */}
      {/* ============================================================= */}
      <Modal
        isOpen={expiryModalOpen}
        onClose={() => setExpiryModalOpen(false)}
        title="Autonomous Medicine Expiry Testing & Containment Suite"
        maxWidth="2xl"
      >
        <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
          {/* Header Explanation */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-800">
              <Zap className="w-4 h-4 text-teal-700" />
              <span>Multi-Agent Quality Assurance Protocol</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Upload any medicine dataset in CSV format. 10 specialized AI agents will inspect all rows for expiry dates, calculate Schedule M compliance, present an immediate review alert to the Admin/Owner, and upon approval, execute warehouse quarantine and transmit live Email &amp; SMS alerts.
            </p>
          </div>

          {/* Action Execution Success Receipts */}
          {expiryApprovalResult ? (
            <div className="space-y-4 p-5 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-emerald-950">
                    Emergency Containment Approved &amp; Executed!
                  </h3>
                  <p className="text-xs text-emerald-800 mt-1">
                    All containment actions were executed successfully. Quarantined {expiryApprovalResult.total_units_quarantined || 0} expired units in WH-1. Dispatch locks are strictly active.
                  </p>
                </div>
              </div>

              {/* Delivery Telemetry Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-white border border-emerald-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Mail className="w-4 h-4 text-teal-700" />
                    <span>Owner Email Dispatch</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    <div>Recipient: <strong className="font-mono text-slate-900">chethuc809@gmail.com</strong></div>
                    <div>Status: <span className="font-bold text-emerald-700">Delivered / Active</span></div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-emerald-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <MessageSquare className="w-4 h-4 text-teal-700" />
                    <span>Owner SMS Dispatch</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    <div>Phone: <strong className="font-mono text-slate-900">+917996662516</strong></div>
                    <div>Status: <span className="font-bold text-emerald-700">Delivered / Active</span></div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-emerald-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Boxes className="w-4 h-4 text-teal-700" />
                    <span>Warehouse Locks</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    <div>Batches: <strong className="font-bold text-slate-900">{expiryApprovalResult.quarantined_batches?.length || 0} batches quarantined</strong></div>
                    <div>Outbound Dispatches: <span className="font-bold text-rose-700">Blocked (HTTP 400)</span></div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-emerald-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <FileText className="w-4 h-4 text-teal-700" />
                    <span>Restock Purchase Order</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    <div>PO Number: <strong className="font-mono text-slate-900">{expiryApprovalResult.purchase_order_id}</strong></div>
                    <div>Status: <span className="font-bold text-amber-700">Drafted for Restock</span></div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-emerald-200 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setExpiryModalOpen(false);
                    setStatusFilter("quarantine");
                    loadInventory();
                  }}
                >
                  View Quarantined Stock in Inventory Table
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* UPLOAD & TEST INPUT BOX */}
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-slate-50 transition">
                  <Upload className="w-8 h-8 text-teal-700 mx-auto mb-2" />
                  <div className="text-xs sm:text-sm font-semibold text-slate-900">
                    {expiryFile ? expiryFile.name : "Select or drag & drop medicine CSV file"}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    CSV should contain columns like sku, batch, qty, mfg_date, expiry_date
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <label className="cursor-pointer px-4 py-2 rounded-xl bg-white border border-slate-300 hover:border-teal-500 text-slate-800 text-xs font-semibold shadow-2xs transition">
                      <span>Choose Local CSV File</span>
                      <input
                        type="file"
                        accept=".csv,.txt"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setExpiryFile(e.target.files[0]);
                          }
                        }}
                      />
                    </label>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleTestWithSampleCsv}
                      disabled={scanningExpiry || approvingExpiry}
                      leftIcon={<Sparkles className="w-3.5 h-3.5 text-teal-700" />}
                    >
                      Test with Sample Expired Medicine Dataset
                    </Button>
                  </div>
                </div>

                {expiryFile && (
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleUploadAndRunExpiryAgents()}
                      isLoading={scanningExpiry}
                      leftIcon={<Zap className="w-4 h-4" />}
                    >
                      Run 10 Autonomous Agents on This Dataset
                    </Button>
                  </div>
                )}
              </div>

              {/* AGENT SCANNING TIMELINE ANIMATION */}
              {scanningExpiry && (
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5 text-teal-800">
                      <Sparkles className="w-3.5 h-3.5 animate-spin text-teal-700" />
                      10 Specialized AI Agents Executing Safety Analysis...
                    </span>
                    <span>Agent {Math.min(activeAgentIndex + 1, 10)} of 10</span>
                  </div>

                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-700 transition-all duration-300 rounded-full"
                      style={{ width: `${Math.min((activeAgentIndex + 1) * 10, 100)}%` }}
                    />
                  </div>

                  <div className="space-y-1.5 pt-2 max-h-48 overflow-y-auto">
                    {agentsTimeline.map((agent, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-slate-800">{agent.name}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">{agent.duration_ms}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* EXECUTIVE REVIEW ALERT FOR ADMIN / OWNER (When Expired Medicines are Found) */}
              {(expiryScanResult?.review_message || (pendingCase && !scanningExpiry)) && (
                <div className="space-y-4">
                  {(() => {
                    const rev = expiryScanResult?.review_message || pendingCase?.review_message;
                    const expiredBatches = rev?.expired_batches || pendingCase?.expired_batches || [];
                    const caseId = rev?.case_id || pendingCase?.case_id;

                    if (!expiredBatches || expiredBatches.length === 0) {
                      return (
                        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                          <div className="font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            All Batches Compliant!
                          </div>
                          <p>All scanned medicine batches have valid future expiry dates. No quarantine required.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="border border-rose-300 bg-rose-50/70 rounded-2xl p-5 space-y-4 shadow-2xs">
                        {/* Urgent Alert Banner */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-200 pb-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
                              <AlertOctagon className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-rose-950 uppercase tracking-wide">
                                Urgent Medicine Expiry Review Required
                              </h4>
                              <div className="text-[11px] text-rose-800">
                                Case ID: <span className="font-mono font-bold">{caseId}</span> • Evaluated by 10 Specialized Agents
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-200 text-rose-900 border border-rose-300">
                              {expiredBatches.length} Expired Batches Detected
                            </span>
                          </div>
                        </div>

                        {/* Problem Summary (Plain English) */}
                        <div className="p-3.5 rounded-xl bg-white border border-rose-200 space-y-1.5 text-xs">
                          <div className="font-bold text-rose-900">What Happened &amp; Why It Matters:</div>
                          <p className="text-slate-700 leading-relaxed">
                            {rev?.problem_summary ||
                              `Autonomous multi-agent scan detected ${expiredBatches.length} batches of expired medicines in the uploaded dataset. Under Drugs & Cosmetics Act Schedule M, holding or dispensing expired medicines is strictly prohibited and carries regulatory penalties. Immediate quarantine is mandated.`}
                          </p>

                          <div className="flex flex-wrap items-center gap-4 pt-2 text-[11px] text-slate-600 border-t border-slate-100">
                            <div>Admin / Owner: <strong className="text-slate-900">Chethan (Warehouse Owner)</strong></div>
                            <div>Target Email: <strong className="font-mono text-slate-900">chethuc809@gmail.com</strong></div>
                            <div>Target Phone: <strong className="font-mono text-slate-900">+917996662516</strong></div>
                          </div>
                        </div>

                        {/* Expired Batches Table */}
                        <div className="space-y-1.5">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
                            Expired Medicine Inventory to be Quarantined:
                          </div>
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs max-h-48 overflow-y-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                <tr>
                                  <th className="p-2.5">Batch</th>
                                  <th className="p-2.5">Medicine / Molecule</th>
                                  <th className="p-2.5">Warehouse</th>
                                  <th className="p-2.5 text-right">Units</th>
                                  <th className="p-2.5">Expiry Date</th>
                                  <th className="p-2.5 text-rose-700">Days Expired</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {expiredBatches.map((b: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-rose-50/40">
                                    <td className="p-2.5 font-mono font-bold text-slate-900">{b.batch}</td>
                                    <td className="p-2.5 text-slate-800">{b.medicine_name || b.sku}</td>
                                    <td className="p-2.5 text-slate-600">{b.warehouse || "WH-1"}</td>
                                    <td className="p-2.5 text-right font-bold text-slate-900">{b.qty}</td>
                                    <td className="p-2.5 font-mono text-slate-600">{b.expiry_date}</td>
                                    <td className="p-2.5 font-bold text-rose-700">
                                      {b.days_expired ? `${b.days_expired} days ago` : "Expired"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Proposed Agent Actions */}
                        <div className="p-3.5 rounded-xl bg-white border border-rose-200 space-y-1.5 text-xs text-slate-700">
                          <div className="font-bold text-slate-900">Automated Actions Ready to Execute Upon Your Sign-Off:</div>
                          <ol className="list-decimal list-inside space-y-0.5 text-slate-600 text-[11px]">
                            <li>Lock warehouse stock: Block all outbound dispatches with HTTP 400 enforcement.</li>
                            <li>Send live urgent Email notification to chethuc809@gmail.com and quality leads.</li>
                            <li>Send live urgent SMS notice to +917996662516 with incident reference.</li>
                            <li>Draft emergency replacement Purchase Order for fresh replacement stock.</li>
                            <li>Permanently seal containment record in SHA-256 cryptographic audit ledger.</li>
                          </ol>
                        </div>

                        {/* Action Approval Button */}
                        <div className="pt-3 border-t border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-[11px] text-slate-500">
                            By clicking approve, all 10 agents will execute warehouse quarantine and trigger live Email &amp; SMS dispatches.
                          </div>

                          <Button
                            variant="danger"
                            size="md"
                            onClick={() => handleApproveExpiryAction(caseId)}
                            isLoading={approvingExpiry}
                            leftIcon={<ShieldAlert className="w-4 h-4" />}
                          >
                            Approve Quarantine &amp; Alert Owner (Email + SMS)
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* 3-Day Expiry Notification Schedule Settings Modal */}
      <Modal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        title="Admin Expiry Notification Schedule"
        description="Configure automated periodic alerts to notify the admin about expired and near-expiry warehouse medicines."
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="secondary" size="sm" onClick={() => setScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveScheduleConfig} isLoading={savingSchedule}>
              Save Schedule Settings
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveScheduleConfig} className="space-y-4 py-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notification Cadence (Interval in Days)
            </label>
            <select
              value={configCadence}
              onChange={(e) => setConfigCadence(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>Every 1 Day (Daily Audit)</option>
              <option value={3}>Every 3 Days (Standard Safety Cadence - Recommended)</option>
              <option value={7}>Every 7 Days (Weekly Summary)</option>
              <option value={14}>Every 14 Days (Bi-Weekly Digest)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              The compliance engine will automatically evaluate all active batches every {configCadence} days and alert the Admin.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Admin Recipient Email (Gmail SMTP)
            </label>
            <input
              type="email"
              value={configEmail}
              onChange={(e) => setConfigEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin@example.com"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Live pharmaceutical email with batch tables & quarantine direct action links.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Admin Mobile Number (SMS Gateway)
            </label>
            <input
              type="text"
              value={configPhone}
              onChange={(e) => setConfigPhone(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+91XXXXXXXXXX"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Indian 10-digit mobile number with standard +91 country prefix.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
            <input
              type="checkbox"
              id="enableScheduleToggle"
              checked={configEnabled}
              onChange={(e) => setConfigEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
            />
            <label htmlFor="enableScheduleToggle" className="text-xs font-semibold text-slate-700 select-none">
              Enable automated background scheduler for periodic alerts
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
