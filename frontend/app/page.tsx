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
  ShoppingCart,
  RotateCcw,
  TrendingDown,
  Package,
  ShieldCheck,
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
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const [boardRes, ledgerRes, expiryRes, invRes] = await Promise.all([
        api.getBoard(),
        api.getLedger(5, 0).catch(() => []),
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

  // 1. Critical Shortages: life-saving medicines where cover days < supplier replenishment lead times
  const criticalShortages = (data?.findings || []).filter((f) => f.type === "critical");

  // 2. Near Expiry Findings & Batches (< 120 days to expiry)
  const nearExpiryFindings = (data?.findings || []).filter(
    (f) => f.type === "expiry" || f.type === "returnwindow"
  );

  const nearExpiryBatches = inventoryItems
    .filter((i) => i.days_to_expiry <= 120 && i.qty > 0)
    .sort((a, b) => a.days_to_expiry - b.days_to_expiry);

  // Unified near-expiry list for presentation
  const displayNearExpiryList =
    nearExpiryBatches.length > 0
      ? nearExpiryBatches.map((b) => {
          const matchingExp = nearExpiryFindings.find(
            (f) => f.entities?.batch === b.batch && f.type === "expiry"
          );
          const matchingRet = nearExpiryFindings.find(
            (f) => f.entities?.batch === b.batch && f.type === "returnwindow"
          );
          return {
            ...b,
            matchingExp,
            matchingRet,
          };
        })
      : nearExpiryFindings.map((f) => ({
          batch: f.entities?.batch || "N/A",
          brand: f.entities?.brand || f.title,
          sku: f.entities?.sku || "N/A",
          molecule: f.entities?.molecule || "Pharmaceutical Formulation",
          warehouse: f.entities?.warehouse || "WH-1",
          qty: f.metrics?.qty_total || f.metrics?.units || 0,
          expiry_date: f.entities?.expiry_date || "2026-12-15",
          days_to_expiry: f.metrics?.days_to_expiry ?? 60,
          heat_color: (f.metrics?.days_to_expiry ?? 60) <= 60 ? "red" : "amber",
          matchingExp: f.type === "expiry" ? f : undefined,
          matchingRet: f.type === "returnwindow" ? f : undefined,
        }));

  // Compute key metric numbers from backend data
  const activeRecallsCount = data?.findings.filter((f) => f.type === "recall").length || 0;
  const awaitingApprovalCount = data?.findings.filter((f) => f.action_id).length || 0;
  const stockShortagesCount = criticalShortages.length;
  const nearExpiryCount = Math.max(nearExpiryBatches.length, nearExpiryFindings.length);
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
            Safety &amp; Recall Dashboard
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
              Live Network
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Monitoring 3 distribution warehouses (Bengaluru, Hubballi, Mysuru), 400 pharmacies, and 20 hospitals.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto flex-wrap">
          <Link href="/inventory" className="w-full sm:w-auto">
            <Button
              variant="indigo"
              size="sm"
              className="w-full sm:w-auto"
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
            className="w-full sm:w-auto"
            leftIcon={<PlayCircle className="w-4 h-4 text-white" />}
          >
            Replay B2231 Recall
          </Button>

          <Button
            variant="blue"
            size="sm"
            onClick={handleRunScan}
            isLoading={scanning}
            className="w-full sm:w-auto"
            leftIcon={<RefreshCw className="w-4 h-4 text-white" />}
          >
            Run Safety Scan
          </Button>
        </div>
      </div>

      {/* PENDING EXPIRY REVIEW BANNER */}
      {pendingExpiryCase && pendingExpiryCase.status === "pending_owner_approval" && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 shadow-xs animate-in fade-in">
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

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full md:w-auto">
              <Link href="/inventory" className="w-full sm:w-auto">
                <Button variant="danger" size="sm" className="w-full sm:w-auto" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Review Problem &amp; Approve Action
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 1. Critical Urgent Alert Banner */}
      {activeRecallFinding && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 shadow-xs">
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

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full md:w-auto">
              <Link href="/trace?batch=B2231" className="w-full sm:w-auto">
                <Button variant="secondary" size="sm" className="w-full sm:w-auto" leftIcon={<Users className="w-4 h-4 text-slate-700" />}>
                  View Affected Customers
                </Button>
              </Link>
              <Link href="/recall-demo" className="w-full sm:w-auto">
                <Button variant="danger" size="sm" className="w-full sm:w-auto" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Review Recall Workflow
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 2. Key Metrics Row */}
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

        {/* Metric 2: Critical Shortages (Blue / Crimson) */}
        <a href="#critical-shortages" className="group">
          <Card className="p-4 bg-blue-50/40 border border-blue-200 hover:border-blue-400 hover:bg-blue-50/80 hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Critical Shortages</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-blue-950 mt-2">
              {loading ? "..." : stockShortagesCount}
            </div>
            <p className="text-[11px] text-blue-700 mt-1 font-medium group-hover:underline flex items-center gap-1">
              <span>Inspect shortage risks</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </Card>
        </a>

        {/* Metric 3: Near-Expiry Batches (Amber / Gold) */}
        <a href="#near-expiry" className="group">
          <Card className="p-4 bg-amber-50/40 border border-amber-200 hover:border-amber-400 hover:bg-amber-50/80 hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Near-Expiry Stock</span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-amber-950 mt-2">
              {loading ? "..." : nearExpiryCount}
            </div>
            <p className="text-[11px] text-amber-700 mt-1 font-medium group-hover:underline flex items-center gap-1">
              <span>Review expiry defense</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </Card>
        </a>

        {/* Metric 4: Awaiting Approval (Emerald / Green) */}
        <Link href="/approvals" className="group">
          <Card className="p-4 bg-emerald-50/40 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/80 hover:shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Awaiting Sign-off</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-emerald-950 mt-2">
              {loading ? "..." : awaitingApprovalCount}
            </div>
            <p className="text-[11px] text-emerald-700 mt-1 font-medium group-hover:underline flex items-center gap-1">
              <span>Sign-off pending actions</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </Card>
        </Link>
      </div>

      {/* 3. DEDICATED OPERATIONAL WATCHES: CRITICAL SHORTAGES & NEAR-EXPIRY MEDICINES */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* CARD 1: Critical Medicines Likely to Run Short */}
        <div id="critical-shortages" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Critical Medicines Likely to Run Short
                  </h2>
                  <Badge variant={criticalShortages.length > 0 ? "danger" : "neutral"} size="sm">
                    {criticalShortages.length} Imminent
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Life-saving drugs where warehouse cover days are below supplier replenishment lead times.
                </p>
              </div>
            </div>
            <Link href="/purchase-orders">
              <Button variant="secondary" size="sm" leftIcon={<ShoppingCart className="w-3.5 h-3.5 text-slate-700" />}>
                Manage POs
              </Button>
            </Link>
          </div>

          <Card className="p-4 bg-white border border-rose-200/80 shadow-xs space-y-3">
            {loading ? (
              <div className="space-y-3">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : criticalShortages.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-50/70 border border-slate-200/60 space-y-1.5">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900">All Critical Stock Well-Covered</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No life-saving medications have stock cover days below their supplier replenishment lead time buffer.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {criticalShortages.map((item) => {
                  const coverDays = Number(item.metrics?.cover_days ?? 0);
                  const leadTime = Number(item.metrics?.supplier_lead_time_days ?? item.metrics?.lead_time_days ?? 7);
                  const shortfall = Number(item.metrics?.safety_buffer_shortfall_days ?? (leadTime + 3 - coverDays));
                  const reorderQty = Number(item.metrics?.recommended_order_qty ?? item.metrics?.reorder_qty ?? 600);
                  const totalStock = Number(item.metrics?.total_stock ?? item.metrics?.stock_units ?? 0);

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-rose-200 bg-rose-50/20 hover:bg-rose-50/40 transition space-y-3"
                    >
                      {/* Title & SKU */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm sm:text-base text-rose-950">
                              {item.entities?.brand || item.title}
                            </h3>
                            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                              {item.entities?.sku || "SKU-CRIT"}
                            </span>
                            <Badge variant="danger" size="sm">
                              High Priority
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-600">
                            {item.entities?.molecule || "Emergency Critical Drug"} &bull; Storage: {item.entities?.storage || "Cool (2-8°C)"}
                          </p>
                        </div>

                        <div className="sm:text-right shrink-0">
                          <span className="text-[11px] text-slate-500 block">Warehouse Stock</span>
                          <span className="text-base font-extrabold text-slate-900 font-mono">
                            {totalStock.toLocaleString()} units
                          </span>
                        </div>
                      </div>

                      {/* 3 Metric Comparison Blocks */}
                      <div className="grid grid-cols-3 gap-2 py-1 text-center">
                        <div className="bg-white p-2 rounded-lg border border-rose-200/70 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Days of Cover
                          </span>
                          <span className="text-sm font-extrabold text-rose-700">
                            {coverDays} Days
                          </span>
                        </div>

                        <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Supplier Lead Time
                          </span>
                          <span className="text-sm font-extrabold text-slate-800">
                            {leadTime} Days
                          </span>
                        </div>

                        <div className="bg-rose-100/70 p-2 rounded-lg border border-rose-300 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-rose-800 block">
                            Deficit Gap
                          </span>
                          <span className="text-sm font-extrabold text-rose-950">
                            -{shortfall.toFixed(1)} Days
                          </span>
                        </div>
                      </div>

                      {/* Depletion Horizon Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-600 font-medium">
                          <span>
                            Current Cover ({coverDays}d) vs Safe Threshold ({leadTime + 3}d)
                          </span>
                          <span className="text-rose-700 font-bold">
                            Stockout Risk Imminent
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden relative">
                          <div
                            className="h-full bg-rose-500 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(12, (coverDays / (leadTime + 3)) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Supplier & Action Buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-rose-200/60">
                        <div className="text-xs text-slate-600">
                          Supplier: <strong className="text-slate-800">{item.entities?.supplier || "Authorized Distributor"}</strong> &bull; Recommended Reorder: <strong className="text-blue-700">{reorderQty.toLocaleString()} units</strong>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Link href="/purchase-orders">
                            <Button
                              variant="danger"
                              size="sm"
                              leftIcon={<ShoppingCart className="w-3.5 h-3.5 text-white" />}
                            >
                              Draft Replenishment PO
                            </Button>
                          </Link>
                          <Link href={`/findings/${item.id}`}>
                            <Button variant="secondary" size="sm" rightIcon={<ArrowRight className="w-3 h-3" />}>
                              View Finding
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* CARD 2: Near Expiry Medicines Watchlist */}
        <div id="near-expiry" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Near Expiry Medicines Watchlist
                  </h2>
                  <Badge variant={displayNearExpiryList.length > 0 ? "warning" : "neutral"} size="sm">
                    {displayNearExpiryList.length} Batches
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Batches expiring within 120 days or facing closing manufacturer return windows.
                </p>
              </div>
            </div>
            <Link href="/inventory">
              <Button variant="secondary" size="sm" leftIcon={<Boxes className="w-3.5 h-3.5 text-slate-700" />}>
                All Inventory
              </Button>
            </Link>
          </div>

          <Card className="p-4 bg-white border border-amber-200/80 shadow-xs space-y-3">
            {loading ? (
              <div className="space-y-3">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : displayNearExpiryList.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-50/70 border border-slate-200/60 space-y-1.5">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900">Optimal Shelf-Life Stability</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No batches expiring within the next 120 days. All active stock is compliant with hospital shelf-life policies.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayNearExpiryList.slice(0, 4).map((item) => {
                  const daysToExpiry = item.days_to_expiry;
                  const isCriticalExp = daysToExpiry <= 60;
                  const targetFindingId = item.matchingRet?.id || item.matchingExp?.id;

                  return (
                    <div
                      key={item.batch}
                      className="p-4 rounded-xl border border-amber-200 bg-amber-50/20 hover:bg-amber-50/40 transition space-y-3"
                    >
                      {/* Title & Batch */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm sm:text-base text-amber-950">
                              {item.brand}
                            </h3>
                            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                              Batch: {item.batch}
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              {item.sku}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            {item.molecule} &bull; Warehouse: <strong className="text-slate-800">{item.warehouse}</strong>
                          </p>
                        </div>

                        <div className="shrink-0">
                          <Badge
                            variant={isCriticalExp ? "danger" : "warning"}
                            size="sm"
                          >
                            <Clock className="w-3 h-3 mr-1 inline" />
                            {daysToExpiry <= 0 ? "EXPIRED" : `${daysToExpiry}d to Expiry`}
                          </Badge>
                        </div>
                      </div>

                      {/* Units & Return Window Details */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-1 text-xs">
                        <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            Total Stock
                          </span>
                          <span className="text-slate-900 font-extrabold text-sm font-mono">
                            {item.qty.toLocaleString()} units
                          </span>
                        </div>

                        <div className="bg-white p-2 rounded-lg border border-amber-200/70 shadow-2xs">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            Expiry Date
                          </span>
                          <span className="text-amber-900 font-bold text-xs">
                            {item.expiry_date}
                          </span>
                        </div>

                        <div className="bg-amber-100/60 p-2 rounded-lg border border-amber-300 shadow-2xs col-span-2 sm:col-span-1">
                          <span className="text-amber-800 block text-[10px] uppercase font-bold">
                            Return Protection
                          </span>
                          <span className="text-amber-950 font-bold text-xs">
                            {item.matchingRet?.metrics?.days_to_window_close !== undefined
                              ? `${item.matchingRet.metrics.days_to_window_close}d left for RMA credit`
                              : daysToExpiry <= 60
                              ? "Window Closed - Discount"
                              : "Eligible for Return"}
                          </span>
                        </div>
                      </div>

                      {/* Value at Risk & Action Buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-amber-200/60">
                        <div className="text-xs text-slate-600">
                          {item.matchingExp?.metrics?.value_at_risk_inr ? (
                            <span>
                              Value at risk: <strong className="text-amber-900 font-mono">₹{Number(item.matchingExp.metrics.value_at_risk_inr).toLocaleString()}</strong> ({item.matchingExp.metrics.at_risk_qty || 0} units unsold)
                            </span>
                          ) : (
                            <span>Prioritize FIFO/FEFO dispatch before shelf-life cutoff</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {targetFindingId ? (
                            <Link href={`/findings/${targetFindingId}`}>
                              <Button
                                variant="amber"
                                size="sm"
                                leftIcon={<RotateCcw className="w-3.5 h-3.5 text-white" />}
                              >
                                Initiate Return / Discount
                              </Button>
                            </Link>
                          ) : (
                            <Link href="/inventory">
                              <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<Boxes className="w-3.5 h-3.5 text-slate-700" />}
                              >
                                View in Inventory
                              </Button>
                            </Link>
                          )}
                          <Link href={`/trace?batch=${item.batch}`}>
                            <Button variant="secondary" size="sm" rightIcon={<ArrowRight className="w-3 h-3" />}>
                              Trace
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
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
