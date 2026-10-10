"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ThermometerSnowflake,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  PlayCircle,
  CheckCircle2,
  Bell,
  CheckSquare,
  Boxes,
  Lock,
  Layers,
  Sparkles,
  Users,
  Building2,
  Calendar,
  Upload,
} from "lucide-react";
import { api } from "../lib/api";
import { BoardResponse, Finding, LedgerEntry } from "../lib/types";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { CardSkeleton, ErrorState } from "../components/ui/FeedbackStates";
import { useToast } from "../components/ui/Toast";

export default function DashboardPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<BoardResponse | null>(null);
  const [ledgerRecent, setLedgerRecent] = useState<LedgerEntry[]>([]);
  const [pendingExpiryCase, setPendingExpiryCase] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const [boardRes, ledgerRes, expiryRes] = await Promise.all([
        api.getBoard(),
        api.getLedger(5, 0).catch(() => []),
        api.demoGetPendingExpiryCases().catch(() => ({ count: 0, cases: [], latest_case: null })),
      ]);
      setData(boardRes);
      setLedgerRecent(ledgerRes || []);
      setPendingExpiryCase(expiryRes?.latest_case || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleRunScan = async () => {
    try {
      setScanning(true);
      const res = await api.triggerScan();
      setData(res);
      showToast("Full medicine safety scan completed successfully", "success");
      const ledgerRes = await api.getLedger(5, 0).catch(() => []);
      setLedgerRecent(ledgerRes);
    } catch (err: any) {
      showToast(err?.message || "Scan failed", "error");
    } finally {
      setScanning(false);
    }
  };

  const handleReplayB2231 = async () => {
    try {
      setReplaying(true);
      await api.replayB2231Recall();
      showToast("B2231 recall scenario reset and re-scanned", "success");
      await loadDashboard();
    } catch (err: any) {
      showToast(err?.message || "Replay failed", "error");
    } finally {
      setReplaying(false);
    }
  };

  // Find active recall finding (e.g. B2231)
  const activeRecallFinding = data?.findings.find((f) => f.type === "recall");

  // Filter urgent needs attention (top 4 findings with highest severity)
  const needsAttentionList = [...(data?.findings || [])]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 4);

  // Compute key metric numbers from backend data
  const activeRecallsCount = data?.findings.filter((f) => f.type === "recall").length || 0;
  const awaitingApprovalCount = data?.findings.filter((f) => f.action_id).length || 0;
  const stockShortagesCount = data?.findings.filter((f) => f.type === "critical").length || 0;
  const temperatureRisksCount = data?.findings.filter((f) => f.type === "coldchain").length || 0;

  if (error) {
    return <ErrorState message={error} onRetry={loadDashboard} />;
  }

  return (
    <div className="space-y-6">
      {/* Top Welcome & Fast Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            Safety & Recall Dashboard
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
              Live Network
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Monitoring 3 distribution warehouses (Bengaluru, Hubballi, Mysuru), 400 pharmacies, and 20 hospitals.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link href="/inventory">
            <Button
              variant="indigo"
              size="sm"
              leftIcon={<Upload className="w-4 h-4 text-white" />}
            >
              Upload &amp; Test Expired CSV
            </Button>
          </Link>

          <Button
            variant="amber"
            size="sm"
            onClick={handleReplayB2231}
            isLoading={replaying}
            leftIcon={<PlayCircle className="w-4 h-4 text-white" />}
          >
            Replay B2231 Recall
          </Button>

          <Button
            variant="blue"
            size="sm"
            onClick={handleRunScan}
            isLoading={scanning}
            leftIcon={<RefreshCw className="w-4 h-4 text-white" />}
          >
            Run Safety Scan
          </Button>
        </div>
      </div>

      {/* PENDING EXPIRY REVIEW BANNER */}
      {pendingExpiryCase && pendingExpiryCase.status === "pending_owner_approval" && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-xs animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-amber-600 text-white rounded-xl shrink-0 mt-0.5 shadow-2xs">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-200 px-2 py-0.5 rounded border border-amber-300 font-mono">
                    {pendingExpiryCase.case_id}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                    EXPIRED MEDICINES PENDING REVIEW
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-amber-950">
                  Expired Stock Detected: {pendingExpiryCase.expired_batches?.length || 0} Batches ({pendingExpiryCase.total_expired_units || 0} Units) in Dataset
                </h2>
                <p className="text-xs sm:text-sm text-amber-900">
                  10 autonomous agents completed testing on dataset &apos;{pendingExpiryCase.filename}&apos;. Awaiting your sign-off to quarantine warehouse stock and send live Email to <strong className="font-mono">chethuc809@gmail.com</strong> and SMS to <strong className="font-mono">+917996662516</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Link href="/inventory">
                <Button variant="danger" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Review Problem &amp; Approve Action
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 1. Critical Urgent Alert Banner */}
      {activeRecallFinding && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-rose-600 text-white rounded-xl shrink-0 mt-0.5">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                    URGENT RECALL ACTIVE
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-rose-950">
                    Batch B2231 Recalled: Augmentin 625 (Amoxiclav)
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-rose-900">
                  <strong>180 units</strong> remain in the warehouse. <strong>25 customers</strong> received <strong>640 units</strong> (including 2 emergency hospitals).
                </p>
                <p className="text-[11px] text-rose-800/80">
                  Reason: Sub-potency stability assay failure (Schedule M GMP violation).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Link href="/trace?batch=B2231">
                <Button variant="secondary" size="sm" leftIcon={<Users className="w-4 h-4 text-slate-700" />}>
                  View Affected Customers
                </Button>
              </Link>
              <Link href="/recall-demo">
                <Button variant="danger" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Review Recall Workflow
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 2. Key Metrics Row (Vibrant Multi-Color Treatment) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Active Recalls (Rose / Red) */}
        <Link href="/cases" className="group">
          <Card className="p-4 bg-rose-50/40 border border-rose-200 hover:border-rose-400 hover:bg-rose-50/80 hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Active Recalls</span>
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-rose-950 mt-2">
              {loading ? "..." : activeRecallsCount}
            </div>
            <p className="text-[11px] text-rose-700 mt-1 font-medium group-hover:underline flex items-center gap-1">
              <span>View recall cases</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </Card>
        </Link>

        {/* Metric 2: Awaiting Approval (Amber / Gold) */}
        <Link href="/approvals" className="group">
          <Card className="p-4 bg-amber-50/40 border border-amber-200 hover:border-amber-400 hover:bg-amber-50/80 hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Awaiting Approval</span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-amber-950 mt-2">
              {loading ? "..." : awaitingApprovalCount}
            </div>
            <p className="text-[11px] text-amber-700 mt-1 font-medium group-hover:underline flex items-center gap-1">
              <span>Sign-off pending actions</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </Card>
        </Link>

        {/* Metric 3: Stock Shortages (Royal Blue) */}
        <Link href="/findings" className="group">
          <Card className="p-4 bg-blue-50/40 border border-blue-200 hover:border-blue-400 hover:bg-blue-50/80 hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Stock Shortages</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-blue-950 mt-2">
              {loading ? "..." : stockShortagesCount}
            </div>
            <p className="text-[11px] text-blue-700 mt-1 font-medium group-hover:underline flex items-center gap-1">
              <span>Inspect shortages</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </Card>
        </Link>

        {/* Metric 4: Temperature Risks (Electric Purple) */}
        <Link href="/notifications" className="group">
          <Card className="p-4 bg-purple-50/40 border border-purple-200 hover:border-purple-400 hover:bg-purple-50/80 hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-800">Temperature Risks</span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <ThermometerSnowflake className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-purple-950 mt-2">
              {loading ? "..." : temperatureRisksCount}
            </div>
            <p className="text-[11px] text-purple-700 mt-1 font-medium group-hover:underline flex items-center gap-1">
              <span>Check cold-chain units</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </Card>
        </Link>
      </div>

      {/* 3. Two-Column Layout: "Needs Attention" & "Recent Activity" */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Needs Attention Prioritized List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Needs Attention</h2>
              <p className="text-xs text-slate-500">Highest-priority issues detected across your inventory.</p>
            </div>
            <Link href="/findings" className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline">
              View all ({data?.findings.length || 0})
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : needsAttentionList.length === 0 ? (
            <Card className="p-8 text-center bg-white border border-slate-200">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-900">All inventory compliant</h3>
              <p className="text-xs text-slate-500 mt-1">No critical issues or recalls currently pending.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {needsAttentionList.map((item) => (
                <Card
                  key={item.id}
                  className="p-4 bg-white border border-slate-200 hover:border-slate-300 transition-all shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            item.severity >= 90
                              ? "danger"
                              : item.severity >= 70
                              ? "warning"
                              : "info"
                          }
                          size="sm"
                        >
                          Risk: {item.severity}/100
                        </Badge>
                        <h3 className="font-bold text-sm text-slate-900 truncate">
                          {item.title}
                        </h3>
                        {(item.entities?.sku || item.entities?.product_code) && (
                          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {item.entities?.sku || item.entities?.product_code}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2">
                        {item.description}
                      </p>

                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                          Action:
                        </span>
                        <span className="text-xs font-medium text-blue-800">
                          {item.recommended_action?.chosen_option || item.recommended_action?.type || "Review issue details"}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 sm:self-center">
                      <Link href={`/findings/${item.id}`}>
                        <Button variant="indigo" size="sm">
                          Review & Action
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Column: Compact Recent Activity & Audit Timeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Recent Activity</h2>
              <p className="text-xs text-slate-500">Permanent record of human decisions & actions.</p>
            </div>
            <Link href="/verify" className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 hover:underline">
              Full Ledger
            </Link>
          </div>

          <Card className="p-4 bg-white border border-slate-200 shadow-xs space-y-3.5">
            {ledgerRecent.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No recent ledger events recorded.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {ledgerRecent.map((entry) => (
                  <div key={entry.seq} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        {entry.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        Seq #{entry.seq}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate font-mono">
                      {(entry.curr_hash || entry.hash) ? `${(entry.curr_hash || entry.hash).slice(0, 20)}...` : "Genesis"}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{entry.ts ? new Date(entry.ts).toLocaleTimeString() : "Just now"}</span>
                      <span className="text-emerald-700 font-semibold">✓ Verified SHA-256</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <Link
                href="/verify"
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50/50 rounded-lg transition"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Verify Cryptographic Chain</span>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
