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
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Findings & Recommendations
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
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
        <Card className="p-4 bg-white border border-slate-200 border-t-4 border-t-indigo-500 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Total Findings</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{findings.length}</div>
        </Card>
        <Card className="p-4 bg-white border border-slate-200 border-t-4 border-t-rose-500 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-600">Urgent Recalls</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">
            {findings.filter((f) => f.type === "recall").length}
          </div>
        </Card>
        <Card className="p-4 bg-white border border-slate-200 border-t-4 border-t-blue-500 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Storage Excursions</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {findings.filter((f) => f.type === "coldchain").length}
          </div>
        </Card>
        <Card className="p-4 bg-white border border-slate-200 border-t-4 border-t-purple-500 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-600">Expiry & FEFO</div>
          <div className="text-2xl font-bold text-purple-700 mt-1">
            {findings.filter((f) => f.type === "expiry" || f.type === "fefo" || f.type === "returnwindow").length}
          </div>
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
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[38px]"
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
