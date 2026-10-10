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
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

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
      setActionLoading(true);
      await api.verifyCase(caseId, status, "Human verification confirmed in Case Management", "Compliance Officer");
      showToast(`Case marked as ${status}`, "success");
      await fetchCases();
    } catch (err: any) {
      showToast(err?.message || "Verification failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredCases = cases.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      (c.title && c.title.toLowerCase().includes(q)) ||
      (c.batch_id && c.batch_id.toLowerCase().includes(q)) ||
      (c.sku && c.sku.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Recall Cases & Incidents
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
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
            <Button variant="rose" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
              B2231 Recall Workflow
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-200 border-t-4 border-t-slate-500 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Cases</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{cases.length}</div>
        </Card>
        <Card className="p-4 bg-white border border-amber-200 border-t-4 border-t-amber-500 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">Waiting for Review</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">
            {cases.filter((c) => c.status === "detected" || c.status === "investigating").length}
          </div>
        </Card>
        <Card className="p-4 bg-white border border-rose-200 border-t-4 border-t-rose-500 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-600">Verified Recalls</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">
            {cases.filter((c) => c.verification_status === "verified").length}
          </div>
        </Card>
        <Card className="p-4 bg-white border border-emerald-200 border-t-4 border-t-emerald-500 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Resolved & Closed</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {cases.filter((c) => c.status === "closed").length}
          </div>
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
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[38px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs sm:text-sm py-1.5 px-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[38px]"
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
            {filteredCases.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs font-semibold text-slate-900">
                  {c.id}
                </TableCell>
                <TableCell>
                  <div className="font-semibold text-slate-900 text-xs sm:text-sm">{c.title || "Quality Incident"}</div>
                  <div className="text-[11px] text-slate-500">Linked Finding: {c.finding_id}</div>
                </TableCell>
                <TableCell>
                  <div className="text-xs font-mono font-semibold text-slate-900">{c.batch_id || "—"}</div>
                  <div className="text-[11px] font-mono text-rose-600 font-medium">{c.sku}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={c.status === "closed" ? "success" : c.status === "detected" ? "danger" : "warning"} size="sm">
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      c.verification_status === "verified"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : c.verification_status === "disputed"
                        ? "bg-rose-50 text-rose-800 border-rose-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    {c.verification_status || "unverified"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {c.verification_status !== "verified" && (
                      <Button
                        size="sm"
                        variant="emerald"
                        onClick={() => handleVerify(c.id, "verified")}
                        disabled={actionLoading}
                      >
                        Verify
                      </Button>
                    )}
                    {c.verification_status !== "disputed" && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleVerify(c.id, "disputed")}
                        disabled={actionLoading}
                      >
                        Dispute
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
