"use client";

import React, { useState, useEffect } from "react";
import {
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Terminal,
  Layers,
  Database,
  ArrowRight,
  ExternalLink,
  Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { AgentRunSummary, AgentRunDetail, AgentMonitorStats, AgentTraceEvent } from "@/lib/types";

export default function AgentMonitorPage() {
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [stats, setStats] = useState<AgentMonitorStats | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<AgentRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [expandedEvents, setExpandedEvents] = useState<Record<number, boolean>>({});

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [runsData, statsData] = await Promise.all([
        api.getAgentRuns({
          status: statusFilter === "all" ? undefined : statusFilter,
          provider: providerFilter === "all" ? undefined : providerFilter,
        }),
        api.getAgentMonitorStats(),
      ]);
      setRuns(runsData);
      setStats(statsData);
      if (runsData.length > 0 && !selectedRunId) {
        setSelectedRunId(runsData[0].run_id);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load agent execution data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, providerFilter]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRunDetail(null);
      return;
    }
    const loadDetail = async () => {
      setLoadingDetail(true);
      try {
        const detail = await api.getAgentRunDetail(selectedRunId);
        setSelectedRunDetail(detail);
      } catch (err: any) {
        console.error("Failed to load run detail:", err);
      } finally {
        setLoadingDetail(false);
      }
    };
    loadDetail();
  }, [selectedRunId]);

  const toggleEventExpand = (eventId: number) => {
    setExpandedEvents((prev) => ({
      ...prev,
      [eventId]: !prev[eventId],
    }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> COMPLETED
          </span>
        );
      case "fallback":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> RULE ENGINE
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" /> FAILED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <Clock className="w-3 h-3 text-teal-600" /> RUNNING
          </span>
        );
    }
  };

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case "AGENT_STARTED":
        return "bg-teal-50 text-teal-800 border-teal-200";
      case "TOOL_REQUESTED":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "TOOL_COMPLETED":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "AGENT_COMPLETED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "AGENT_FAILED":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "FALLBACK_USED":
        return "bg-amber-50 text-amber-800 border-amber-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
            <Cpu className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              AI Agents Monitor
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                Autonomous NIM Mesh
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Track automated safety checks, stock calculations, and recommendations across all 10 specialized agents.
            </p>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition shadow-xs disabled:opacity-50 min-h-[38px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Traces
        </button>
      </div>

      {/* KPI Metric Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl bg-indigo-50/40 border border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50/70 hover:shadow-xs transition">
            <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">Total Scans</span>
            <p className="text-2xl font-extrabold text-indigo-950 mt-1">{stats.total_runs}</p>
            <span className="text-[10px] text-indigo-700 font-medium">All cases inspected</span>
          </div>
          <div className="p-3.5 rounded-xl bg-purple-50/40 border border-purple-200 hover:border-purple-300 hover:bg-purple-50/70 hover:shadow-xs transition">
            <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">Live AI Model</span>
            <p className="text-2xl font-extrabold text-purple-950 mt-1">{stats.live_llm_runs}</p>
            <span className="text-[10px] text-purple-700 font-medium">NVIDIA NIM Cloud</span>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50/40 border border-amber-200 hover:border-amber-300 hover:bg-amber-50/70 hover:shadow-xs transition">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Rule Engine</span>
            <p className="text-2xl font-extrabold text-amber-950 mt-1">{stats.fallback_runs}</p>
            <span className="text-[10px] text-amber-700 font-medium">Deterministic Safety</span>
          </div>
          <div className="p-3.5 rounded-xl bg-sky-50/40 border border-sky-200 hover:border-sky-300 hover:bg-sky-50/70 hover:shadow-xs transition">
            <span className="text-[11px] font-bold text-sky-800 uppercase tracking-wider">Speed</span>
            <p className="text-2xl font-extrabold text-sky-950 mt-1">{stats.avg_latency_ms.toFixed(0)} <span className="text-xs font-normal text-sky-700">ms</span></p>
            <span className="text-[10px] text-sky-700 font-medium">Average response time</span>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/40 border border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/70 hover:shadow-xs transition">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Review Pass Rate</span>
            <p className="text-2xl font-extrabold text-emerald-950 mt-1">{stats.review_pass_rate_pct}%</p>
            <span className="text-[10px] text-emerald-700 font-medium">Audit checks passed</span>
          </div>
          <div className="p-3.5 rounded-xl bg-rose-50/40 border border-rose-200 hover:border-rose-300 hover:bg-rose-50/70 hover:shadow-xs transition">
            <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">Pending Approvals</span>
            <p className="text-2xl font-extrabold text-rose-950 mt-1">{stats.pending_human_approvals}</p>
            <span className="text-[10px] text-rose-700 font-medium">Awaiting human sign-off</span>
          </div>
        </div>
      )}

      {/* Main Content Layout: Runs List + Deep Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Filterable Runs Table */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[700px]">
          {/* Filter Bar */}
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1 text-slate-700 font-medium"
              >
                <option value="all">All States</option>
                <option value="completed">Completed</option>
                <option value="fallback">Rule Engine</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Engine:</span>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1 text-slate-700 font-medium"
              >
                <option value="all">All Engines</option>
                <option value="nvidia_nim">NVIDIA NIM</option>
                <option value="deterministic">Rule Engine</option>
              </select>
            </div>
          </div>

          {/* Run List Items */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {loading && runs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">Loading agent execution runs...</div>
            ) : runs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">No execution runs found.</div>
            ) : (
              runs.map((r) => {
                const isSelected = selectedRunId === r.run_id;
                return (
                  <button
                    key={r.run_id}
                    onClick={() => setSelectedRunId(r.run_id)}
                    className={`w-full text-left p-3.5 transition flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-purple-50/70 border-l-4 border-l-purple-600 pl-3"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-mono text-xs font-bold text-slate-900">{r.run_id}</span>
                      {getStatusBadge(r.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">{r.finding_id}</span>
                      {r.batch && <span className="text-slate-500 font-mono text-[11px]">&bull; Batch {r.batch}</span>}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-slate-400" />
                        {r.provider === "deterministic" ? "Rule Engine" : "NVIDIA NIM"}
                      </span>
                      <span>{r.total_latency_ms.toFixed(0)} ms &bull; {r.events_count} steps</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Deep Execution Inspector */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs p-5 h-[700px] overflow-y-auto space-y-5">
          {loadingDetail ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">
              Loading trace detail...
            </div>
          ) : !selectedRunDetail ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">
              Select an execution run on the left to inspect its multi-agent trace.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Run Header */}
              <div className="border-b border-slate-200 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-slate-900">{selectedRunDetail.run_id}</span>
                    {getStatusBadge(selectedRunDetail.status)}
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(selectedRunDetail.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Target Finding</span>
                    <strong className="text-slate-900">{selectedRunDetail.finding_id}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Batch & SKU</span>
                    <strong className="text-slate-900 font-mono">{selectedRunDetail.batch || "N/A"} ({selectedRunDetail.sku || "N/A"})</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Engine</span>
                    <strong className="text-slate-900">{selectedRunDetail.provider === "deterministic" ? "Deterministic Rule Engine" : "NVIDIA NIM Cloud"}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Execution Time</span>
                    <strong className="text-slate-900">{selectedRunDetail.total_latency_ms.toFixed(1)} ms</strong>
                  </div>
                </div>
              </div>

              {/* Simple English Explanation: What was checked / What was found / Recommended action */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  Agent Summary in Plain English
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      1. What was checked?
                    </span>
                    <p className="text-slate-700 text-[11px] leading-relaxed">
                      Scanned batch database records, expiry dates, dispatch recipients, and warehouse stock units.
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      2. What was found?
                    </span>
                    <p className="text-slate-700 text-[11px] leading-relaxed">
                      {selectedRunDetail.finding_id} detected with risk score. Recommended action: <strong>{selectedRunDetail.recommended_action || "Review issue"}</strong>.
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      3. Human Approval Status
                    </span>
                    <p className="text-purple-800 font-semibold text-[11px] uppercase">
                      {selectedRunDetail.human_approval_status}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Requires {selectedRunDetail.required_role} sign-off before physical stock is moved.
                    </p>
                  </div>
                </div>
              </div>

              {/* Expandable Lifecycle Events */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-slate-500" />
                    Agent Step Details ({selectedRunDetail.events.length} Steps)
                  </h3>
                  <span className="text-[11px] text-slate-400">Click to expand technical parameters</span>
                </div>

                <div className="space-y-2">
                  {selectedRunDetail.events.map((ev) => {
                    const isExpanded = expandedEvents[ev.id] ?? false;
                    return (
                      <div key={ev.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                        <button
                          onClick={() => toggleEventExpand(ev.id)}
                          className="w-full text-left p-3 flex items-center justify-between hover:bg-slate-50 transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-mono font-bold text-slate-700">
                              {ev.event_seq}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getEventBadge(ev.event_type)}`}>
                              {ev.event_type}
                            </span>
                            <span className="text-xs font-bold text-slate-900">{ev.agent_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {ev.latency_ms !== null && ev.latency_ms !== undefined && (
                              <span className="text-[10px] font-mono text-slate-500">{ev.latency_ms.toFixed(1)} ms</span>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="p-3 border-t border-slate-100 bg-slate-50 text-xs space-y-2">
                            {ev.invocation_reason && (
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">Reason:</span>
                                <p className="text-slate-800 text-[11px]">{ev.invocation_reason}</p>
                              </div>
                            )}
                            {ev.tool_arguments && (
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-500 block">Tool Arguments:</span>
                                <pre className="bg-white p-2 rounded border border-slate-200 text-[11px] font-mono text-slate-800 overflow-x-auto">
                                  {JSON.stringify(ev.tool_arguments, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
