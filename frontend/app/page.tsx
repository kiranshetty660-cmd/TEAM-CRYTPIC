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
  FileCheck2,
  DollarSign,
  TrendingDown,
  Layers,
  Sparkles,
} from "lucide-react";
import { api } from "../lib/api";
import { BoardResponse, Finding } from "../lib/types";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { CardSkeleton, ErrorState } from "../components/ui/FeedbackStates";
import { useToast } from "../components/ui/Toast";

export default function BoardPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  const loadBoard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getBoard();
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load compliance board");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, []);

  const handleRunScan = async () => {
    try {
      setScanning(true);
      const res = await api.triggerScan();
      setData(res);
      showToast("Full compliance risk scan completed successfully", "success");
    } catch (err: any) {
      showToast(err.message || "Scan failed", "error");
    } finally {
      setScanning(false);
    }
  };

  const handleReplayB2231 = async () => {
    try {
      setReplaying(true);
      await api.replayB2231Recall();
      showToast("S1 Recall Event Replayed: Amoxiclav 625 Batch B2231", "success");
      await loadBoard();
    } catch (err: any) {
      showToast(err.message || "Replay failed", "error");
    } finally {
      setReplaying(false);
    }
  };

  const filteredFindings = data?.findings.filter((f) => {
    if (activeTab === "all") return true;
    if (activeTab === "recall") return f.type === "recall";
    if (activeTab === "coldchain") return f.type === "coldchain";
    if (activeTab === "expiry") return f.type === "expiry" || f.type === "returnwindow";
    if (activeTab === "shortage") return f.type === "critical";
    if (activeTab === "fefo") return f.type === "fefo";
    return true;
  }) || [];

  const getSeverityBadgeVariant = (severity: number) => {
    if (severity >= 90) return "danger";
    if (severity >= 70) return "warning";
    return "info";
  };

  const getFindingIcon = (type: string) => {
    switch (type) {
      case "recall":
        return <ShieldAlert className="w-5 h-5 text-red-400" />;
      case "coldchain":
        return <ThermometerSnowflake className="w-5 h-5 text-cyan-400" />;
      case "critical":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case "returnwindow":
      case "expiry":
        return <Clock className="w-5 h-5 text-purple-400" />;
      case "fefo":
        return <Layers className="w-5 h-5 text-blue-400" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-slate-400" />;
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={loadBoard} />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Compliance Intelligence Desk
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              Live Network
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitoring 3 warehouses, 400 chemists, and 20 hospital supply lines.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReplayB2231}
            isLoading={replaying}
            leftIcon={<PlayCircle className="w-4 h-4 text-amber-400" />}
          >
            Replay B2231 Recall
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleRunScan}
            isLoading={scanning}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Run Agent Scan
          </Button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <Card className="p-4 bg-slate-900/90 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Open Recalls</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{data?.kpis.open_recalls ?? 0}</div>
          <p className="text-[11px] text-red-400/80 mt-0.5">Statutory Class I/II alerts</p>
        </Card>

        <Card className="p-4 bg-slate-900/90 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cold Breaches</span>
            <ThermometerSnowflake className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{data?.kpis.cold_breaches ?? 0}</div>
          <p className="text-[11px] text-cyan-400/80 mt-0.5">&gt;30m 2-8°C excursions</p>
        </Card>

        <Card className="p-4 bg-slate-900/90 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Value At Risk</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            ₹{((data?.kpis.value_at_risk_inr ?? 0) / 1000).toFixed(1)}k
          </div>
          <p className="text-[11px] text-amber-400/80 mt-0.5">Expiring / at-risk stock</p>
        </Card>

        <Card className="p-4 bg-slate-900/90 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pending Approvals</span>
            <FileCheck2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{data?.kpis.pending_approvals ?? 0}</div>
          <p className="text-[11px] text-blue-400/80 mt-0.5">Gated compliance actions</p>
        </Card>

        <Card className="p-4 bg-slate-900/90 border-slate-800 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Quarantined</span>
            <TrendingDown className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{data?.kpis.quarantined_batches ?? 0}</div>
          <p className="text-[11px] text-purple-400/80 mt-0.5">Batches locked for QA</p>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800/80 scrollbar-none">
        {[
          { id: "all", label: "All Risk Findings" },
          { id: "recall", label: "Recalls" },
          { id: "coldchain", label: "Cold Chain" },
          { id: "expiry", label: "Near-Expiry / RMA" },
          { id: "shortage", label: "Critical Shortage" },
          { id: "fefo", label: "FEFO Violations" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap min-h-[38px] ${
              activeTab === tab.id
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ranked Risk Finding Cards */}
      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : filteredFindings.length === 0 ? (
        <Card className="p-12 text-center text-slate-400">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-slate-500" />
          <h3 className="text-base font-semibold text-slate-200">No active compliance alerts in this category</h3>
          <p className="text-sm mt-1 text-slate-400">All distribution nodes meet statutory compliance parameters.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredFindings.map((finding) => (
            <Card
              key={finding.id}
              hoverEffect
              className="p-5 border-slate-800 hover:border-slate-700 bg-slate-900/90 transition-all"
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                {/* Left Finding Information */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/50">
                      {getFindingIcon(finding.type)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100 tracking-tight">
                        {finding.title}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="capitalize font-medium text-slate-300">{finding.type} Risk</span>
                        <span>•</span>
                        {finding.deadline && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            Target resolution: {new Date(finding.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 leading-relaxed pt-1">
                    {finding.description}
                  </p>

                  {/* Evidence Telemetry Pills */}
                  <div className="flex items-center gap-3 pt-2 flex-wrap">
                    {Object.entries(finding.metrics).slice(0, 4).map(([k, v]) => (
                      <div
                        key={k}
                        className="px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-700/40 text-[11px] text-slate-300"
                      >
                        <span className="text-slate-400 mr-1.5">{k.replace(/_/g, " ")}:</span>
                        <span className="font-semibold text-slate-200">
                          {typeof v === "number" ? (v > 1000 ? `₹${v.toLocaleString()}` : v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Agent Recommended Action Draft Notice */}
                  {finding.recommended_action && (
                    <div className="mt-3 p-3 rounded-lg bg-blue-950/20 border border-blue-900/40 flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                      <div className="text-xs">
                        <span className="font-semibold text-blue-300">Agent Recommendation ({finding.recommended_action.chosen_option}): </span>
                        <span className="text-slate-300">{finding.recommended_action.rationale}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Action & Severity Strip */}
                <div className="flex lg:flex-col items-center lg:items-end justify-between lg:justify-start gap-3 shrink-0 pt-2 lg:pt-0">
                  <div className="flex items-center gap-2">
                    {finding.explanation?.is_pinned && (
                      <Badge variant="danger" size="sm">
                        PINNED PRIORITY
                      </Badge>
                    )}
                    <Badge variant={getSeverityBadgeVariant(finding.severity)} size="lg">
                      Severity: {finding.severity}
                    </Badge>
                  </div>

                  <Link href={`/findings/${finding.id}`}>
                    <Button variant="primary" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
                      Evaluate & Decide
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
