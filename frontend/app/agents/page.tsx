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
            <AlertTriangle className="w-3 h-3 text-amber-600" /> FALLBACK
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" /> RUNNING
          </span>
        );
    }
  };

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case "AGENT_STARTED":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "TOOL_REQUESTED":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "TOOL_COMPLETED":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "AGENT_COMPLETED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "AGENT_FAILED":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "AGENT_SKIPPED":
        return "bg-slate-100 text-slate-700 border-slate-300";
      case "FALLBACK_USED":
        return "bg-amber-50 text-amber-800 border-amber-300";
      case "RUN_COMPLETED":
        return "bg-emerald-100 text-emerald-900 border-emerald-300";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 py-8 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                <Cpu className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Multi-Agent Execution Monitor
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  TraceRx Cognitive Desks &bull; Telemetry &bull; Tool Calling &bull; Independent Review Audit
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Traces
            </button>
          </div>
        </div>

        {/* Executive KPI Metric Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Runs</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total_runs}</p>
              <span className="text-[10px] text-slate-400">All orchestrated cases</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Live LLM</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{stats.live_llm_runs}</p>
              <span className="text-[10px] text-slate-400">NVIDIA NIM / GLM-5.3</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Fallback Runs</span>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.fallback_runs}</p>
              <span className="text-[10px] text-slate-400">Deterministic Guardrail</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Latency</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.avg_latency_ms.toFixed(0)} <span className="text-xs font-normal text-slate-400">ms</span></p>
              <span className="text-[10px] text-slate-400">End-to-end execution</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Review Pass Rate</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.review_pass_rate_pct}%</p>
              <span className="text-[10px] text-slate-400">Independent audit passed</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending Approvals</span>
              <p className="text-2xl font-bold text-purple-600 mt-1">{stats.pending_human_approvals}</p>
              <span className="text-[10px] text-slate-400">Awaiting human gate</span>
            </div>
          </div>
        )}

        {/* Main Content Layout: Run List (Left) + Detailed Inspector (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Filterable Runs Table */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[780px]">
            {/* Filter Bar */}
            <div className="p-3.5 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"
                >
                  <option value="all">All States</option>
                  <option value="completed">Completed</option>
                  <option value="fallback">Fallback</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Provider:</span>
                <select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"
                >
                  <option value="all">All Providers</option>
                  <option value="nvidia_nim">NVIDIA NIM</option>
                  <option value="deterministic">Deterministic</option>
                </select>
              </div>
            </div>

            {/* Run List Items */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {loading && runs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">Loading execution runs...</div>
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
                          ? "bg-blue-50/60 border-l-4 border-l-blue-600 pl-2.5"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-xs font-bold text-slate-800">{r.run_id}</span>
                        {getStatusBadge(r.status)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">{r.finding_id}</span>
                        {r.batch && <span className="text-slate-400 font-mono text-[11px]">&bull; Batch {r.batch}</span>}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-slate-400" />
                          {r.provider} {r.model ? `(${r.model})` : ""}
                        </span>
                        <span>{r.total_latency_ms.toFixed(0)} ms &bull; {r.events_count} events</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-1.5 mt-0.5">
                        <span>Human: <strong className="text-slate-700 font-medium">{r.human_approval_status}</strong></span>
                        <span>{new Date(r.created_at).toLocaleTimeString()}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Deep Execution Inspector */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs p-6 h-[780px] overflow-y-auto space-y-6">
            {loadingDetail ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Loading trace detail...
              </div>
            ) : !selectedRunDetail ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Select an execution run on the left to inspect its multi-agent trace.
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Run Header & Meta */}
                <div className="border-b border-slate-200 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-slate-900">{selectedRunDetail.run_id}</span>
                      {getStatusBadge(selectedRunDetail.status)}
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        Corr: {selectedRunDetail.correlation_id}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">
                      {new Date(selectedRunDetail.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 bg-slate-50 p-3 rounded-lg border border-slate-200/60 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Finding Target</span>
                      <strong className="text-slate-800">{selectedRunDetail.finding_id}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Batch & SKU</span>
                      <strong className="text-slate-800 font-mono">{selectedRunDetail.batch || "N/A"} ({selectedRunDetail.sku || "N/A"})</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Provider / Model</span>
                      <strong className="text-slate-800">{selectedRunDetail.provider} {selectedRunDetail.model ? `/ ${selectedRunDetail.model}` : ""}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Latency</span>
                      <strong className="text-slate-800">{selectedRunDetail.total_latency_ms.toFixed(1)} ms</strong>
                    </div>
                  </div>

                  {selectedRunDetail.fallback_reason && (
                    <div className="mt-3 p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Fallback Rationale:</strong> {selectedRunDetail.fallback_reason}
                      </div>
                    </div>
                  )}
                </div>

                {/* Synthesis & Recommendation Assembly Panel */}
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      Recommendation Assembly & Separation of Controls
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                      Uncertainty: {selectedRunDetail.uncertainty_score}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-3 rounded border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        1. Observed Ground Facts
                      </span>
                      <p className="text-slate-700 leading-relaxed text-[11px]">
                        Extracted directly via SQL batch and dispatch queries. Pallet stock, customer lists, and expiration dates are verified without hallucination.
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        2. Model Decision
                      </span>
                      <div className="space-y-1 text-[11px]">
                        <p><strong className="text-slate-900">{selectedRunDetail.recommended_action || "None"}</strong> ({selectedRunDetail.chosen_option})</p>
                        <p className="text-slate-600">Required Role: <strong className="text-slate-800">{selectedRunDetail.required_role}</strong></p>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        3. Human Approval Gate
                      </span>
                      <div className="space-y-1 text-[11px]">
                        <p>Status: <strong className="text-purple-700 uppercase">{selectedRunDetail.human_approval_status}</strong></p>
                        <p className="text-slate-500 text-[10px]">Strictly separated from model output. No automated physical execution permitted.</p>
                      </div>
                    </div>
                  </div>

                  {selectedRunDetail.review_verdict && (
                    <div className="bg-white p-3 rounded border border-emerald-200 text-xs">
                      <span className="text-[10px] font-bold uppercase text-emerald-700 block mb-0.5">
                        Independent Review Agent Verdict:
                      </span>
                      <p className="text-slate-800 text-[11px]">{selectedRunDetail.review_verdict}</p>
                    </div>
                  )}
                </div>

                {/* Granular Execution Lifecycle Timeline */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-slate-500" />
                      Execution Lifecycle Timeline ({selectedRunDetail.events.length} Events)
                    </h3>
                    <span className="text-[11px] text-slate-400">Click any step to inspect I/O</span>
                  </div>

                  <div className="space-y-2.5">
                    {selectedRunDetail.events.map((ev, idx) => {
                      const isExpanded = expandedEvents[ev.id] ?? false;
                      return (
                        <div
                          key={ev.id}
                          className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs"
                        >
                          <button
                            onClick={() => toggleEventExpand(ev.id)}
                            className="w-full text-left p-3 flex items-center justify-between hover:bg-slate-50 transition"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-mono font-bold text-slate-600">
                                {ev.event_seq}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getEventBadge(ev.event_type)}`}>
                                {ev.event_type}
                              </span>
                              <span className="text-xs font-bold text-slate-800">{ev.agent_name}</span>
                              {ev.tool_name && (
                                <span className="font-mono text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                  tool: {ev.tool_name}
                                </span>
                              )}
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

                          {/* Expandable Step Detail */}
                          {isExpanded && (
                            <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 space-y-3 text-xs">
                              {ev.invocation_reason && (
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Invocation Reason:</span>
                                  <p className="text-slate-800 text-[11px]">{ev.invocation_reason}</p>
                                </div>
                              )}

                              {ev.input_summary && (
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Input Summary:</span>
                                  <pre className="bg-white p-2.5 rounded border border-slate-200 text-[11px] font-mono text-slate-700 overflow-x-auto">
                                    {JSON.stringify(ev.input_summary, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {ev.tool_arguments && (
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Validated Tool Arguments:</span>
                                  <pre className="bg-white p-2.5 rounded border border-slate-200 text-[11px] font-mono text-purple-800 overflow-x-auto">
                                    {JSON.stringify(ev.tool_arguments, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {ev.tool_result && (
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Tool Execution Result:</span>
                                  <pre className="bg-white p-2.5 rounded border border-slate-200 text-[11px] font-mono text-emerald-800 overflow-x-auto">
                                    {JSON.stringify(ev.tool_result, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {ev.tool_error && (
                                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-900">
                                  <span className="text-[10px] uppercase font-bold block mb-0.5">Error:</span>
                                  <p className="font-mono text-[11px]">{ev.tool_error}</p>
                                </div>
                              )}

                              {ev.output_summary && (
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Structured Agent Output:</span>
                                  <pre className="bg-white p-2.5 rounded border border-slate-200 text-[11px] font-mono text-slate-800 overflow-x-auto">
                                    {JSON.stringify(ev.output_summary, null, 2)}
                                  </pre>
                                </div>
                              )}

                              <div className="text-[10px] text-slate-400 text-right pt-1">
                                Event logged at {new Date(ev.timestamp).toLocaleTimeString()}
                              </div>
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
    </div>
  );
}
