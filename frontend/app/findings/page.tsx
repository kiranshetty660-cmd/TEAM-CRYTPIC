"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ShieldAlert,
  ThermometerSnowflake,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
  Filter,
  Search,
  RefreshCw,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { api } from "../../lib/api";
import { Finding, BoardResponse } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Skeleton, ErrorState, EmptyState } from "../../components/ui/FeedbackStates";
import { useToast } from "../../components/ui/Toast";

export default function FindingsPage() {
  const { showToast } = useToast();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadFindings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getBoard();
      setFindings(res.findings || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load compliance findings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFindings();
  }, []);

  const getFindingIcon = (type: string) => {
    switch (type) {
      case "recall":
        return <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />;
      case "coldchain":
        return <ThermometerSnowflake className="w-5 h-5 text-blue-600 shrink-0" />;
      case "critical":
        return <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />;
      case "returnwindow":
      case "expiry":
        return <Clock className="w-5 h-5 text-purple-600 shrink-0" />;
      case "fefo":
        return <Layers className="w-5 h-5 text-teal-600 shrink-0" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-slate-500 shrink-0" />;
    }
  };

  const getSeverityBadgeVariant = (severity: number) => {
    if (severity >= 90) return "danger";
    if (severity >= 70) return "warning";
    return "info";
  };

  const filteredFindings = findings.filter((f) => {
    const sku = f.entities?.sku || f.entities?.product_code || "";
    const batch = f.entities?.batch || f.entities?.batch_id || "";
    const matchesSearch =
      !searchQuery ||
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      batch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (activeCategory === "all") return true;
    if (activeCategory === "recall") return f.type === "recall";
    if (activeCategory === "coldchain") return f.type === "coldchain";
    if (activeCategory === "expiry") return f.type === "expiry" || f.type === "returnwindow";
    if (activeCategory === "shortage") return f.type === "critical";
    if (activeCategory === "fefo") return f.type === "fefo";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Findings & Recommendations
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                TraceRx Intelligence
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Plain-English summaries of inventory anomalies, regulatory risks, and recommended actions.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadFindings}
          isLoading={loading}
          leftIcon={<RefreshCw className="w-4 h-4 text-slate-600" />}
        >
          Refresh Scan
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="p-4 bg-blue-50/40 border border-blue-200 hover:border-blue-300 hover:bg-blue-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Total Findings</span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-blue-950 mt-2">{findings.length}</div>
          <p className="text-[11px] text-blue-700 mt-1 font-medium">Anomalies detected</p>
        </Card>

        <Card className="p-4 bg-rose-50/40 border border-rose-200 hover:border-rose-300 hover:bg-rose-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Urgent Recalls</span>
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-rose-950 mt-2">
            {findings.filter((f) => f.type === "recall").length}
          </div>
          <p className="text-[11px] text-rose-700 mt-1 font-medium">Critical safety violations</p>
        </Card>

        <Card className="p-4 bg-sky-50/40 border border-sky-200 hover:border-sky-300 hover:bg-sky-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-800">Storage Excursions</span>
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              <ThermometerSnowflake className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-sky-950 mt-2">
            {findings.filter((f) => f.type === "coldchain").length}
          </div>
          <p className="text-[11px] text-sky-700 mt-1 font-medium">Temperature threshold breaches</p>
        </Card>

        <Card className="p-4 bg-purple-50/40 border border-purple-200 hover:border-purple-300 hover:bg-purple-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-800">Expiry &amp; FEFO</span>
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-purple-950 mt-2">
            {findings.filter((f) => f.type === "expiry" || f.type === "fefo" || f.type === "returnwindow").length}
          </div>
          <p className="text-[11px] text-purple-700 mt-1 font-medium">Shelf-life & dispatch order</p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search findings by medicine, batch, or issue..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 min-h-[38px]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "All", activeClass: "bg-indigo-600 text-white" },
            { id: "recall", label: "Recalls", activeClass: "bg-rose-600 text-white" },
            { id: "coldchain", label: "Temperature", activeClass: "bg-blue-600 text-white" },
            { id: "expiry", label: "Expiry", activeClass: "bg-purple-600 text-white" },
            { id: "shortage", label: "Shortages", activeClass: "bg-amber-600 text-white" },
            { id: "fefo", label: "Dispatch Order", activeClass: "bg-emerald-600 text-white" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 min-h-[34px] ${
                activeCategory === cat.id
                  ? `${cat.activeClass} shadow-xs`
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Findings List */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadFindings} />
      ) : filteredFindings.length === 0 ? (
        <EmptyState
          title="No compliance issues found"
          message="No findings match your current search and filter settings."
          action={<Button variant="secondary" onClick={() => { setActiveCategory("all"); setSearchQuery(""); }}>Reset Filters</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredFindings.map((f) => {
            const itemSku = f.entities?.sku || f.entities?.product_code || "";
            const itemBatch = f.entities?.batch || f.entities?.batch_id || "";
            return (
              <Card
                key={f.id}
                className="p-5 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 mt-0.5">
                      {getFindingIcon(f.type)}
                    </div>

                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                          {f.title}
                        </h3>
                        <Badge variant={getSeverityBadgeVariant(f.severity)} size="sm">
                          Risk Score: {f.severity} / 100
                        </Badge>
                        {itemSku && (
                          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {itemSku}
                          </span>
                        )}
                        {itemBatch && (
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                            Batch: {itemBatch}
                          </span>
                        )}
                      </div>

                      {/* What Happened / Why it Matters / Next Action structure */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wide">
                            1. What happened?
                          </span>
                          <p className="text-slate-600 mt-0.5 line-clamp-2">{f.description}</p>
                        </div>

                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wide">
                            2. Why does it matter?
                          </span>
                          <p className="text-slate-600 mt-0.5 line-clamp-2">
                            {f.root_cause_analysis?.confirmed_facts?.[0]?.fact || "Regulatory standard violation or inventory risk."}
                          </p>
                        </div>

                        <div className={`p-2.5 rounded-lg border ${
                          f.type === "recall"
                            ? "bg-rose-50/60 border-rose-200"
                            : f.type === "coldchain"
                            ? "bg-blue-50/60 border-blue-200"
                            : f.type === "expiry"
                            ? "bg-purple-50/60 border-purple-200"
                            : "bg-indigo-50/60 border-indigo-200"
                        }`}>
                          <span className={`font-bold block text-[11px] uppercase tracking-wide ${
                            f.type === "recall"
                              ? "text-rose-800"
                              : f.type === "coldchain"
                              ? "text-blue-800"
                              : f.type === "expiry"
                              ? "text-purple-800"
                              : "text-indigo-800"
                          }`}>
                            3. Recommended next step
                          </span>
                          <p className={`mt-0.5 line-clamp-2 ${
                            f.type === "recall"
                              ? "text-rose-900"
                              : f.type === "coldchain"
                              ? "text-blue-900"
                              : f.type === "expiry"
                              ? "text-purple-900"
                              : "text-indigo-900"
                          }`}>
                            {f.recommended_action?.chosen_option || f.recommended_action?.rationale || "Review issue and take containment action."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Link */}
                  <div className="shrink-0 pt-1">
                    <Link href={`/findings/${f.id}`}>
                      <Button variant="indigo" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                        View Details & Action
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
