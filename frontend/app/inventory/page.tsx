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
} from "lucide-react";
import { api } from "../../lib/api";
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

  useEffect(() => {
    loadInventory();
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            Batch Inventory & Shelf-Life Radar
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tracking {data?.total_batches ?? 0} batches across distribution nodes with color-coded shelf-life heat classification.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadSampleCsv}
            leftIcon={<Download className="w-4 h-4 text-slate-500" />}
          >
            Sample Dataset
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              resetWizard();
              setWizardOpen(true);
            }}
            leftIcon={<FileSpreadsheet className="w-4 h-4" />}
          >
            Dataset Ingestion Wizard (CSV / XLSX)
          </Button>
        </div>
      </div>

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
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none min-h-[38px]"
          >
            <option value="">All Warehouses</option>
            <option value="WH-1">WH-1 Bengaluru</option>
            <option value="WH-2">WH-2 Hubballi</option>
            <option value="WH-3">WH-3 Mysuru</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none min-h-[38px]"
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
                  disabled={!validationResult?.is_valid_for_commit}
                  leftIcon={<Check className="w-3.5 h-3.5" />}
                >
                  Commit Dataset (Atomic)
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
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Select Dataset (CSV or XLSX)</label>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full p-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <strong>Adaptation Guarantee:</strong>
                <p>
                  TraceRx handles varying vendor column names (e.g. <code>Lot#</code>, <code>Item_Code</code>, <code>Units</code>, <code>EXP_DATE</code>)
                  and parses Excel files natively without requiring pre-formatting.
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
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-800 max-h-32 overflow-y-auto space-y-1">
                  <strong>Blocking Row Errors (Commit Prohibited):</strong>
                  <ul className="list-disc list-inside space-y-0.5">
                    {validationResult.errors.map((err: any, i: number) => (
                      <li key={i}>
                        Row {err.row_number}: {err.errors.join("; ")}
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
    </div>
  );
}
