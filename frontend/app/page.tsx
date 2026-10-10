"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  PlayCircle,
  CheckCircle2,
  CheckSquare,
  Boxes,
  Lock,
  Users,
  Upload,
  ShoppingCart,
  RotateCcw,
  Search,
  FileText,
  Activity,
  Layers,
  ChevronRight,
  Warehouse,
  ExternalLink,
} from "lucide-react";
import { api } from "../lib/api";
import { BoardResponse, Finding, LedgerEntry } from "../lib/types";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { CardSkeleton, ErrorState } from "../components/ui/FeedbackStates";
import { useToast } from "../components/ui/Toast";

type TabType = "all" | "shortages" | "expiry" | "ledger";

export default function DashboardPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<BoardResponse | null>(null);
  const [ledgerRecent, setLedgerRecent] = useState<LedgerEntry[]>([]);
  const [pendingExpiryCase, setPendingExpiryCase] = useState<any | null>(null);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const [boardRes, ledgerRes, expiryRes, invRes] = await Promise.all([
        api.getBoard(),
        api.getLedger(8, 0).catch(() => []),
        api.demoGetPendingExpiryCases().catch(() => ({ count: 0, cases: [], latest_case: null })),
        api.getInventory("active").catch(() => null),
      ]);
      setData(boardRes);
      setLedgerRecent(ledgerRes || []);
      setPendingExpiryCase(expiryRes?.latest_case || null);
      setInventoryItems(invRes?.items || []);
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
      showToast("Medicine compliance scan completed", "success");
      const ledgerRes = await api.getLedger(8, 0).catch(() => []);
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

  // Critical Shortages
  const criticalShortages = useMemo(
    () => (data?.findings || []).filter((f) => f.type === "critical"),
    [data]
  );

  // Near Expiry Findings & Batches
  const nearExpiryFindings = useMemo(
    () => (data?.findings || []).filter((f) => f.type === "expiry" || f.type === "returnwindow"),
    [data]
  );

  const nearExpiryBatches = useMemo(
    () =>
      inventoryItems
        .filter((i) => i.days_to_expiry <= 120 && i.qty > 0)
        .sort((a, b) => a.days_to_expiry - b.days_to_expiry),
    [inventoryItems]
  );

  const displayNearExpiryList = useMemo(() => {
    if (nearExpiryBatches.length > 0) {
      return nearExpiryBatches.map((b) => {
        const matchingExp = nearExpiryFindings.find(
          (f) => f.entities?.batch === b.batch && f.type === "expiry"
        );
        const matchingRet = nearExpiryFindings.find(
          (f) => f.entities?.batch === b.batch && f.type === "returnwindow"
        );
        return { ...b, matchingExp, matchingRet };
      });
    }
    return nearExpiryFindings.map((f) => ({
      batch: f.entities?.batch || "N/A",
      brand: f.entities?.brand || f.title,
      sku: f.entities?.sku || "N/A",
      molecule: f.entities?.molecule || "Pharmaceutical Formulation",
      warehouse: f.entities?.warehouse || "WH-1",
      qty: f.metrics?.qty_total || f.metrics?.units || 0,
      expiry_date: f.entities?.expiry_date || "2026-12-15",
      days_to_expiry: f.metrics?.days_to_expiry ?? 60,
      matchingExp: f.type === "expiry" ? f : undefined,
      matchingRet: f.type === "returnwindow" ? f : undefined,
    }));
  }, [nearExpiryBatches, nearExpiryFindings]);

  // Counts
  const activeRecallsCount = data?.findings.filter((f) => f.type === "recall").length || 0;
  const awaitingApprovalCount = data?.findings.filter((f) => f.action_id).length || 0;
  const stockShortagesCount = criticalShortages.length;
  const nearExpiryCount = Math.max(nearExpiryBatches.length, nearExpiryFindings.length);

  // Filtered Findings for the Main View
  const filteredFindings = useMemo(() => {
    let list = data?.findings || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) =>
          f.title?.toLowerCase().includes(q) ||
          f.description?.toLowerCase().includes(q) ||
          f.entities?.sku?.toLowerCase().includes(q) ||
          f.entities?.batch?.toLowerCase().includes(q) ||
          f.entities?.molecule?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, searchQuery]);

  if (error) {
    return <ErrorState message={error} onRetry={loadDashboard} />;
  }

  return (
    <div className="space-y-5 pb-8 max-w-7xl mx-auto">
      {/* 1. CLEAN TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Operations Desk
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Surveillance
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Surveillance across Bengaluru, Hubballi, and Mysuru distribution hubs.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/inventory">
            <Button
              variant="secondary"
              size="sm"
              className="text-xs text-slate-700 border-slate-200 bg-white hover:bg-slate-50"
              leftIcon={<Upload className="w-3.5 h-3.5 text-slate-500" />}
            >
              Upload CSV
            </Button>
          </Link>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleReplayB2231}
            isLoading={replaying}
            className="text-xs text-slate-700 border-slate-200 bg-white hover:bg-slate-50"
            leftIcon={<PlayCircle className="w-3.5 h-3.5 text-amber-600" />}
          >
            Replay B2231
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleRunScan}
            isLoading={scanning}
            className="text-xs font-semibold shadow-xs"
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Run Scan
          </Button>
        </div>
      </div>

      {/* 2. MINIMAL PRIORITY INCIDENT BANNER (Only when urgent action is needed) */}
      {activeRecallFinding && (
        <div className="bg-rose-50/90 border border-rose-200 rounded-xl p-3.5 sm:p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-600 text-white shrink-0 mt-0.5 shadow-2xs">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">
                  Critical Recall Active
                </span>
                <span className="text-xs font-mono font-bold text-rose-950">
                  Batch B2231 • Augmentin 625 (Amoxiclav)
                </span>
              </div>
              <p className="text-xs text-rose-900 mt-1">
                180 units in warehouse quarantine. 640 units dispatched across 25 accounts (including 2 emergency hospitals).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 sm:self-auto">
            <Link href="/trace?batch=B2231">
              <Button variant="secondary" size="sm" className="text-xs bg-white border-rose-200 text-rose-900 hover:bg-rose-100/50">
                Trace Batch
              </Button>
            </Link>
            <Link href="/recall-demo">
              <Button variant="danger" size="sm" className="text-xs font-semibold" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Containment Desk
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Pending Expiry Review Alert (if uploaded dataset awaiting owner sign-off) */}
      {pendingExpiryCase && pendingExpiryCase.status === "pending_owner_approval" && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 sm:p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-600 text-white shrink-0 mt-0.5 shadow-2xs">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                  Dataset Expiry Review
                </span>
                <span className="text-xs font-bold text-amber-950 font-mono">
                  {pendingExpiryCase.case_id}
                </span>
              </div>
              <p className="text-xs text-amber-900 mt-1">
                {pendingExpiryCase.expired_batches?.length || 0} expired batches ({pendingExpiryCase.total_expired_units || 0} units) identified. Ready for owner quarantine sign-off.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <Link href="/inventory">
              <Button variant="amber" size="sm" className="text-xs font-semibold" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Sign-off Action
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 3. SLEEK, MINIMAL 4-KPI METRIC STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1 */}
        <Link href="/cases" className="group">
          <Card className="p-3.5 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Active Recalls
              </span>
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {loading ? "..." : activeRecallsCount}
              </span>
              <span className="text-[11px] text-rose-600 font-medium group-hover:underline flex items-center gap-0.5">
                Cases <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </Card>
        </Link>

        {/* Metric 2 */}
        <Link href="/approvals" className="group">
          <Card className="p-3.5 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Awaiting Sign-off
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {loading ? "..." : awaitingApprovalCount}
              </span>
              <span className="text-[11px] text-emerald-600 font-medium group-hover:underline flex items-center gap-0.5">
                Review <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </Card>
        </Link>

        {/* Metric 3 */}
        <button
          onClick={() => setActiveTab("shortages")}
          className="text-left group w-full"
        >
          <Card
            className={`p-3.5 bg-white border transition rounded-xl ${
              activeTab === "shortages"
                ? "border-blue-500 ring-1 ring-blue-500 shadow-xs"
                : "border-slate-200 hover:border-slate-300 hover:shadow-xs"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Stockout Risks
              </span>
              <span className="w-2 h-2 rounded-full bg-blue-500" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {loading ? "..." : stockShortagesCount}
              </span>
              <span className="text-[11px] text-blue-600 font-medium group-hover:underline flex items-center gap-0.5">
                Filter <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </Card>
        </button>

        {/* Metric 4 */}
        <button
          onClick={() => setActiveTab("expiry")}
          className="text-left group w-full"
        >
          <Card
            className={`p-3.5 bg-white border transition rounded-xl ${
              activeTab === "expiry"
                ? "border-amber-500 ring-1 ring-amber-500 shadow-xs"
                : "border-slate-200 hover:border-slate-300 hover:shadow-xs"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Near Expiry (&lt;120d)
              </span>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {loading ? "..." : nearExpiryCount}
              </span>
              <span className="text-[11px] text-amber-600 font-medium group-hover:underline flex items-center gap-0.5">
                Filter <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </Card>
        </button>
      </div>

      {/* 4. MAIN WORKSPACE: TABBED QUEUE + RIGHT-HAND SYSTEM STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* LEFT 3 COLUMNS: UNIFIED WORK QUEUE WITH TABS & SEARCH */}
        <div className="lg:col-span-3 space-y-3">
          {/* Controls: Segmented Tabs + Clean Search Box */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2 rounded-xl border border-slate-200">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs font-medium">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  activeTab === "all"
                    ? "bg-slate-900 text-white font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                All Issues ({data?.findings.length || 0})
              </button>

              <button
                onClick={() => setActiveTab("shortages")}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  activeTab === "shortages"
                    ? "bg-slate-900 text-white font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Stockout Risks ({criticalShortages.length})
              </button>

              <button
                onClick={() => setActiveTab("expiry")}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  activeTab === "expiry"
                    ? "bg-slate-900 text-white font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Near Expiry ({displayNearExpiryList.length})
              </button>

              <button
                onClick={() => setActiveTab("ledger")}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  activeTab === "ledger"
                    ? "bg-slate-900 text-white font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Ledger ({ledgerRecent.length})
              </button>
            </div>

            {activeTab !== "ledger" && (
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by medicine, SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:bg-white text-slate-800 placeholder-slate-400 transition"
                />
              </div>
            )}
          </div>

          {/* TAB CONTENT 1: ALL ISSUES (Clean, Scannable Rows) */}
          {activeTab === "all" && (
            <Card className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              {loading ? (
                <div className="p-4 space-y-3">
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : filteredFindings.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">No issues found</p>
                  <p className="text-xs text-slate-400">All inventory batches meet safety compliance.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredFindings.map((item) => {
                    const isRecall = item.type === "recall";
                    const isCritical = item.type === "critical";
                    const isCold = item.type === "coldchain";

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 hover:bg-slate-50/70 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                              isRecall
                                ? "bg-rose-100 text-rose-700"
                                : isCritical
                                ? "bg-blue-100 text-blue-700"
                                : isCold
                                ? "bg-cyan-100 text-cyan-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {isRecall ? (
                              <ShieldAlert className="w-4 h-4" />
                            ) : isCritical ? (
                              <AlertTriangle className="w-4 h-4" />
                            ) : (
                              <Clock className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900 truncate">
                                {item.entities?.brand || item.title}
                              </span>
                              {(item.entities?.batch || item.entities?.sku) && (
                                <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {item.entities?.batch || item.entities?.sku}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  item.severity >= 90
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : item.severity >= 70
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-blue-50 text-blue-700 border border-blue-200"
                                }`}
                              >
                                Risk {item.severity}
                              </span>
                            </div>

                            <p className="text-xs text-slate-500 line-clamp-1">
                              {item.description}
                            </p>

                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 pt-0.5">
                              <span className="text-slate-400 font-medium">Proposed:</span>
                              <span className="font-semibold text-slate-800">
                                {item.recommended_action?.chosen_option || item.recommended_action?.type || "Review Details"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 sm:self-center">
                          <Link href={`/findings/${item.id}`}>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="text-xs font-medium text-slate-700 bg-white border-slate-200 hover:bg-slate-50"
                              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                            >
                              Review
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* TAB CONTENT 2: STOCKOUT RISKS (Compact Table) */}
          {activeTab === "shortages" && (
            <Card className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              {loading ? (
                <div className="p-4 space-y-3">
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : criticalShortages.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">Stock Levels Optimal</p>
                  <p className="text-xs text-slate-400">All critical medications have sufficient cover days.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {criticalShortages.map((item) => {
                    const coverDays = Number(item.metrics?.cover_days ?? 0);
                    const leadTime = Number(item.metrics?.supplier_lead_time_days ?? item.metrics?.lead_time_days ?? 7);
                    const reorderQty = Number(item.metrics?.recommended_order_qty ?? item.metrics?.reorder_qty ?? 600);
                    const totalStock = Number(item.metrics?.total_stock ?? item.metrics?.stock_units ?? 0);

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 hover:bg-slate-50/70 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">
                              {item.entities?.brand || item.title}
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {item.entities?.sku || "SKU-CRIT"}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                              Cover: {coverDays}d vs {leadTime}d lead
                            </span>
                          </div>

                          <div className="text-xs text-slate-500 flex items-center gap-3">
                            <span>Stock: <strong className="text-slate-800 font-mono">{totalStock.toLocaleString()}</strong> units</span>
                            <span>Reorder: <strong className="text-blue-700 font-mono">{reorderQty.toLocaleString()}</strong> units</span>
                            <span>Supplier: <strong className="text-slate-700">{item.entities?.supplier || "Authorized"}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Link href="/purchase-orders">
                            <Button
                              variant="primary"
                              size="sm"
                              className="text-xs font-semibold"
                              leftIcon={<ShoppingCart className="w-3.5 h-3.5" />}
                            >
                              Draft PO
                            </Button>
                          </Link>
                          <Link href={`/findings/${item.id}`}>
                            <Button variant="secondary" size="sm" className="text-xs">
                              Details
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* TAB CONTENT 3: NEAR EXPIRY (Clean Scannable Rows) */}
          {activeTab === "expiry" && (
            <Card className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              {loading ? (
                <div className="p-4 space-y-3">
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : displayNearExpiryList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">No Near-Expiry Stock</p>
                  <p className="text-xs text-slate-400">All current inventory has &gt;120 days shelf stability.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {displayNearExpiryList.map((item) => {
                    const daysToExpiry = item.days_to_expiry;
                    const targetFindingId = item.matchingRet?.id || item.matchingExp?.id;

                    return (
                      <div
                        key={item.batch}
                        className="p-3.5 hover:bg-slate-50/70 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">
                              {item.brand}
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Batch: {item.batch}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {item.sku}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                daysToExpiry <= 60
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {daysToExpiry <= 0 ? "Expired" : `${daysToExpiry}d left`}
                            </span>
                          </div>

                          <div className="text-xs text-slate-500 flex items-center gap-3">
                            <span>Warehouse: <strong className="text-slate-700">{item.warehouse}</strong></span>
                            <span>Stock: <strong className="text-slate-800 font-mono">{item.qty?.toLocaleString()}</strong> units</span>
                            <span>Expiry: <strong className="text-slate-700 font-mono">{item.expiry_date}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {targetFindingId ? (
                            <Link href={`/findings/${targetFindingId}`}>
                              <Button variant="secondary" size="sm" className="text-xs">
                                Return / Discount
                              </Button>
                            </Link>
                          ) : (
                            <Link href="/inventory">
                              <Button variant="secondary" size="sm" className="text-xs">
                                View Stock
                              </Button>
                            </Link>
                          )}
                          <Link href={`/trace?batch=${item.batch}`}>
                            <Button variant="secondary" size="sm" className="text-xs">
                              Trace
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* TAB CONTENT 4: AUDIT LEDGER TIMELINE */}
          {activeTab === "ledger" && (
            <Card className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              {ledgerRecent.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-xs">No audit events recorded yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ledgerRecent.map((entry) => (
                    <div
                      key={entry.seq}
                      className="p-3.5 hover:bg-slate-50/70 transition flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">
                            {entry.event_type.replace(/_/g, " ")}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                            Seq #{entry.seq}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-slate-400 truncate max-w-md">
                          {(entry.curr_hash || entry.hash) ? `${(entry.curr_hash || entry.hash).slice(0, 32)}...` : "Genesis"}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block">
                          {entry.ts ? new Date(entry.ts).toLocaleTimeString() : "Just now"}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-600">
                          ✓ SHA-256
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <Link
                  href="/verify"
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Verify Full Cryptographic Chain in Audit Ledger &rarr;</span>
                </Link>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT 1 COLUMN: QUICK TOOLS & HUB COVERAGE */}
        <div className="space-y-4">
          {/* Quick Access Card */}
          <Card className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Direct Portals
            </h2>

            <div className="space-y-1.5">
              <Link
                href="/recall-demo"
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 text-xs font-medium text-slate-700 transition"
              >
                <span className="flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Recall Containment Flow</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>

              <Link
                href="/trace"
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 text-xs font-medium text-slate-700 transition"
              >
                <span className="flex items-center gap-2">
                  <Boxes className="w-3.5 h-3.5 text-blue-600" />
                  <span>Forward Batch Trace</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>

              <Link
                href="/approvals"
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 text-xs font-medium text-slate-700 transition"
              >
                <span className="flex items-center gap-2">
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Approvals Queue ({awaitingApprovalCount})</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>

              <Link
                href="/verify"
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 text-xs font-medium text-slate-700 transition"
              >
                <span className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-slate-600" />
                  <span>Audit Verification</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            </div>
          </Card>

          {/* Network Infrastructure Node Status */}
          <Card className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Distribution Hubs
            </h2>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-700 font-medium flex items-center gap-1.5">
                  <Warehouse className="w-3.5 h-3.5 text-slate-400" />
                  WH-1 Bengaluru
                </span>
                <span className="text-[11px] font-semibold text-emerald-600">Online</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-700 font-medium flex items-center gap-1.5">
                  <Warehouse className="w-3.5 h-3.5 text-slate-400" />
                  WH-2 Hubballi
                </span>
                <span className="text-[11px] font-semibold text-emerald-600">Online</span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-slate-700 font-medium flex items-center gap-1.5">
                  <Warehouse className="w-3.5 h-3.5 text-slate-400" />
                  WH-3 Mysuru
                </span>
                <span className="text-[11px] font-semibold text-emerald-600">Online</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
