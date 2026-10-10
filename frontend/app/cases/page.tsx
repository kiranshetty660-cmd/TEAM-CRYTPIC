"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  FileCheck2,
  Activity,
  ArrowRight,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api } from "../../lib/api";
import { Case } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/Table";
import { Skeleton, ErrorState, EmptyState } from "../../components/ui/FeedbackStates";
import { useToast } from "../../components/ui/Toast";

export default function CasesPage() {
  const { showToast } = useToast();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [updatingCaseId, setUpdatingCaseId] = useState<string | null>(null);

  const fetchCases = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getCases(statusFilter || undefined);
      setCases(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load recall cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [statusFilter]);

  const handleSyncCases = async () => {
    try {
      setActionLoading(true);
      await api.syncCases();
      showToast("Cases synchronized with latest safety findings", "success");
      await fetchCases();
    } catch (err: any) {
      showToast(err?.message || "Failed to sync cases", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerify = async (caseId: string, status: string) => {
    try {
      setUpdatingCaseId(caseId);
      await api.verifyCase(caseId, status, `Human verification (${status}) confirmed in Case Management`, "Compliance Officer");
      showToast(`Case marked as ${status}`, "success");
      await fetchCases();
    } catch (err: any) {
      showToast(err?.message || "Verification failed", "error");
    } finally {
      setUpdatingCaseId(null);
    }
  };

  const filteredCases = cases.filter((c) => {
    if (typeFilter) {
      if (typeFilter === "recall" && !(c.type === "recall" || c.id.includes("REC"))) return false;
      if (typeFilter !== "recall" && c.type !== typeFilter) return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      (c.title && c.title.toLowerCase().includes(q)) ||
      (c.batch_id && c.batch_id.toLowerCase().includes(q)) ||
      (c.sku && c.sku.toLowerCase().includes(q)) ||
      (c.type && c.type.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Recall Cases & Incidents
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                TraceRx Desk
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Track reported quality issues, confirm verified incidents, and coordinate safety actions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncCases}
            isLoading={actionLoading}
            leftIcon={<RefreshCw className="w-4 h-4 text-slate-600" />}
          >
            Sync from Findings
          </Button>
          <Link href="/recall-demo">
            <Button variant="primary" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
              B2231 Recall Workflow
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-blue-50/40 border border-blue-200 hover:border-blue-300 hover:bg-blue-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Total Cases</span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-blue-950 mt-2">{cases.length}</div>
          <p className="text-[11px] text-blue-700 mt-1 font-medium">Logged in compliance system</p>
        </Card>

        <Card className="p-4 bg-amber-50/40 border border-amber-200 hover:border-amber-300 hover:bg-amber-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Waiting for Review</span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-950 mt-2">
            {cases.filter((c) => c.status === "detected" || c.status === "investigating").length}
          </div>
          <p className="text-[11px] text-amber-700 mt-1 font-medium">Needs officer verification</p>
        </Card>

        <Card className="p-4 bg-rose-50/40 border border-rose-200 hover:border-rose-300 hover:bg-rose-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Regulatory Recalls</span>
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-rose-950 mt-2">
            {cases.filter((c) => c.type === "recall" || c.id.includes("REC")).length}
          </div>
          <p className="text-[11px] text-rose-700 mt-1 font-medium">Critical mandatory actions</p>
        </Card>

        <Card className="p-4 bg-emerald-50/40 border border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Resolved & Closed</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-950 mt-2">
            {cases.filter((c) => c.status === "closed").length}
          </div>
          <p className="text-[11px] text-emerald-700 mt-1 font-medium">Actioned & archived</p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Case ID, Batch, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 min-h-[38px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs sm:text-sm py-1.5 px-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 min-h-[38px]"
          >
            <option value="">All Incident Types</option>
            <option value="recall">🚨 Regulatory Recalls</option>
            <option value="coldchain">❄️ Cold Chain Excursions</option>
            <option value="critical">⚠️ Critical Shortages</option>
            <option value="expiry">⏳ Near-Expiry Risks</option>
            <option value="returnwindow">🔄 Return Window Closing</option>
            <option value="fefo">📦 FEFO Violations</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs sm:text-sm py-1.5 px-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 min-h-[38px]"
          >
            <option value="">All Statuses</option>
            <option value="detected">Detected</option>
            <option value="investigating">Investigating</option>
            <option value="verified">Verified</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchCases} />
      ) : filteredCases.length === 0 ? (
        <EmptyState
          title="No cases found"
          message="No recall cases match your search. Sync from findings or run a scan to detect new issues."
          action={<Button variant="secondary" onClick={handleSyncCases}>Sync Cases Now</Button>}
        />
      ) : (
        <>
          {/* Mobile Card List (< md) */}
          <div className="md:hidden space-y-3">
            {filteredCases.map((c) => {
              const isRecall = c.type === "recall" || c.id.includes("REC");
              const vStatus = c.verification_status || c.verification_state || "unverified";
              const isBusy = actionLoading || updatingCaseId === c.id;

              return (
                <div
                  key={c.id}
                  className={`p-4 rounded-xl border transition ${
                    isRecall ? "bg-rose-50/30 border-rose-200 shadow-xs" : "bg-white border-slate-200 shadow-2xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-bold text-slate-900 block truncate">{c.id}</span>
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-900 mt-0.5">{c.title || "Quality Incident"}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={c.status === "closed" ? "success" : c.status === "detected" ? "danger" : "warning"} size="sm">
                        {c.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mt-2.5 pt-2 border-t border-slate-100 text-xs">
                    {c.batch_id && (
                      <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold">
                        Batch: {c.batch_id}
                      </span>
                    )}
                    {c.sku && (
                      <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] font-semibold border border-blue-100">
                        SKU: {c.sku}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        vStatus === "verified"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : vStatus === "disputed"
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                    >
                      {vStatus}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
                    {isRecall && (
                      <Link href="/recall-demo" className="flex-1">
                        <Button size="sm" variant="outline" className="w-full text-xs border-rose-200 text-rose-700 hover:bg-rose-50">
                          Workflow
                        </Button>
                      </Link>
                    )}
                    {vStatus !== "verified" && (
                      <Button
                        size="sm"
                        variant="emerald"
                        onClick={() => handleVerify(c.id, "verified")}
                        disabled={isBusy}
                        className="flex-1 text-xs"
                      >
                        Verify
                      </Button>
                    )}
                    {vStatus !== "disputed" && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleVerify(c.id, "disputed")}
                        disabled={isBusy}
                        className="flex-1 text-xs"
                      >
                        Dispute
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Case ID</TableHead>
                  <TableHead>Incident & Description</TableHead>
                  <TableHead>Batch / SKU</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {filteredCases.map((c) => {
                  const isRecall = c.type === "recall" || c.id.includes("REC");
                  return (
                  <TableRow key={c.id} className={isRecall ? "bg-rose-50/20 hover:bg-rose-50/40" : ""}>
                    <TableCell className="font-mono text-xs font-semibold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        {c.id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 text-xs sm:text-sm">{c.title || "Quality Incident"}</span>
                        {isRecall && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
                            Recall Notice
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Linked Finding: {c.finding_id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-mono font-semibold text-slate-900">{c.batch_id || "—"}</div>
                      {c.sku ? (
                        <div className="mt-0.5">
                          <span className="text-[11px] font-mono text-blue-700 font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 inline-block">
                            {c.sku}
                          </span>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "closed" ? "success" : c.status === "detected" ? "danger" : "warning"} size="sm">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const vStatus = c.verification_status || c.verification_state || "unverified";
                        return (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              vStatus === "verified"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : vStatus === "disputed"
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                            }`}
                          >
                            {vStatus}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const vStatus = c.verification_status || c.verification_state || "unverified";
                        const isBusy = actionLoading || updatingCaseId === c.id;
                        return (
                          <div className="flex items-center justify-end gap-1.5">
                            {isRecall && (
                              <Link href="/recall-demo">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-rose-200 text-rose-700 hover:bg-rose-50 text-xs"
                                >
                                  Workflow
                                </Button>
                              </Link>
                            )}
                            {vStatus !== "verified" && (
                              <Button
                                size="sm"
                                variant="emerald"
                                onClick={() => handleVerify(c.id, "verified")}
                                disabled={isBusy}
                              >
                                Verify
                              </Button>
                            )}
                            {vStatus !== "disputed" && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleVerify(c.id, "disputed")}
                                disabled={isBusy}
                              >
                                Dispute
                              </Button>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
