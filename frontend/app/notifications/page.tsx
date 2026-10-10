"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Send,
  Mail,
  MessageSquare,
  Building2,
  Store,
  RotateCcw,
  Plus,
  Search,
  Users,
  Eye,
  AlertOctagon,
  ArrowRight,
  ShieldAlert,
  Clock,
  Sparkles,
  Phone,
  RefreshCw,
  Lock,
} from "lucide-react";
import { api } from "../../lib/api";
import { useUser } from "../../lib/UserContext";

export default function NotificationsPage() {
  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<"incidents" | "campaigns" | "new_incident">("incidents");
  const [loading, setLoading] = useState<boolean>(false);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [incidentDetail, setIncidentDetail] = useState<any | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Filter state
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // New incident form state
  const [newSource, setNewSource] = useState<"website_complaint" | "owner_quality_issue">("owner_quality_issue");
  const [newCallerName, setNewCallerName] = useState("Chethan (Warehouse Owner)");
  const [newCallerPhone, setNewCallerPhone] = useState("+917996662516");
  const [newCallerEmail, setNewCallerEmail] = useState("chethuc809@gmail.com");
  const [newSku, setNewSku] = useState("AMOX-625");
  const [newBatch, setNewBatch] = useState("B2231");
  const [newIsBatchMissing, setNewIsBatchMissing] = useState(false);
  const [newCategory, setNewCategory] = useState("stability_failure");
  const [newUrgency, setNewUrgency] = useState<"routine" | "high" | "urgent" | "critical">("urgent");
  const [newPotentialHarm, setNewPotentialHarm] = useState<"low" | "medium" | "high" | "severe">("high");
  const [newDescription, setNewDescription] = useState("Sub-potency assay failure detected at routine stability test. Potency 84.2% is below the Schedule M specification of 90.0%.");

  // Approval Modal State
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject" | "escalate">("approve");
  const [approvalReason, setApprovalReason] = useState("Regulatory recall verification approved under GMP Schedule M protocol.");
  const [targetCampaignId, setTargetCampaignId] = useState<string | null>(null);

  // Acknowledgment Modal State
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [ackPharmacistName, setAckPharmacistName] = useState("Lead Pharmacist");
  const [ackIsolatedQty, setAckIsolatedQty] = useState<number>(20);
  const [ackNotes, setAckNotes] = useState("Stock verified and physically segregated in red quarantine storage bin.");

  useEffect(() => {
    loadData();
  }, [activeTab, sourceFilter, statusFilter]);

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      if (activeTab === "incidents") {
        const res = await api.listIncidents({
          source: sourceFilter || undefined,
          status: statusFilter || undefined,
          search: searchQuery || undefined,
        });
        setIncidents(res.incidents || []);
      } else if (activeTab === "campaigns") {
        const camps = await api.listNotificationCampaigns();
        setCampaigns(camps || []);
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to load data" });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectIncident = async (inc: any) => {
    setSelectedIncident(inc);
    try {
      const detail = await api.getIncidentDetail(inc.id);
      setIncidentDetail(detail);
    } catch (err: any) {
      setFeedback({ type: "error", message: `Failed to load details: ${err.message}` });
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const payload: any = {
        incident_source: newSource,
        caller_name: newCallerName,
        caller_phone: newCallerPhone,
        caller_email: newCallerEmail,
        sku: newSku,
        batch: newIsBatchMissing ? null : newBatch,
        complaint_category: newCategory,
        urgency: newUrgency,
        potential_harm: newPotentialHarm,
        complaint_description: newDescription,
        prevent_duplicate: true,
      };

      const res = await api.createIncident(payload);
      setFeedback({
        type: "success",
        message: res.message || `Incident ${res.case_id} recorded successfully.`,
      });
      setActiveTab("incidents");
      await loadData();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to create incident." });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCampaign = async (incidentId: string) => {
    setLoading(true);
    try {
      const res = await api.createIncidentCampaign(incidentId, {
        title: `Regulatory Recall Notification - Batch ${incidentDetail?.incident?.batch || "B2231"}`,
      });
      setFeedback({ type: "success", message: `Campaign ${res.campaign_id} generated. Awaiting human approval.` });
      const detail = await api.getIncidentDetail(incidentId);
      setIncidentDetail(detail);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to generate campaign" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenApproval = (campaignId: string, action: "approve" | "reject" | "escalate") => {
    setTargetCampaignId(campaignId);
    setApprovalAction(action);
    setApprovalReason(
      action === "approve"
        ? "Verified against Certificate of Analysis failure. Approved for immediate dispatch."
        : action === "reject"
        ? "Insufficient laboratory evidence. Returned for re-testing."
        : "Escalated to State Drug Controller & Managing Director."
    );
    setApprovalModalOpen(true);
  };

  const handleSubmitApproval = async () => {
    if (!targetCampaignId) return;
    setLoading(true);
    try {
      if (approvalAction === "approve") {
        await api.approveNotificationCampaign(targetCampaignId, {
          approved_by: currentUser.name,
          role: currentUser.roleTitle || "Quality Safety Officer",
          reason: approvalReason,
        });
        setFeedback({ type: "success", message: "Campaign successfully authorized for notification dispatch." });
      } else if (approvalAction === "reject") {
        await api.rejectNotificationCampaign(targetCampaignId, {
          rejected_by: currentUser.name,
          role: currentUser.roleTitle || "Quality Safety Officer",
          reason: approvalReason,
        });
        setFeedback({ type: "info", message: "Campaign rejected. Notifications will not be sent." });
      } else {
        await api.escalateNotificationCampaign(targetCampaignId, {
          escalated_by: currentUser.name,
          escalate_to: "chethuc809@gmail.com (Warehouse Owner & Admin)",
          reason: approvalReason,
        });
        setFeedback({ type: "info", message: "Campaign escalated to owner (chethuc809@gmail.com) for executive authorization." });
      }
      setApprovalModalOpen(false);
      if (selectedIncident) {
        const detail = await api.getIncidentDetail(selectedIncident.id);
        setIncidentDetail(detail);
      }
      await loadData();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Approval action failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleSendCampaign = async (campaignId: string) => {
    setLoading(true);
    try {
      const res = await api.sendNotificationCampaign(campaignId);
      setFeedback({
        type: "success",
        message: `Notifications dispatched! ${res.emails_sent} emails and ${res.sms_sent} SMS sent via ${res.is_simulation ? "Simulation Engine" : "Live Gateways"}.`,
      });
      if (selectedIncident) {
        const detail = await api.getIncidentDetail(selectedIncident.id);
        setIncidentDetail(detail);
      }
      await loadData();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to send notifications" });
    } finally {
      setLoading(false);
    }
  };

  const handleRetryFailed = async (campaignId: string) => {
    setLoading(true);
    try {
      const res = await api.retryFailedNotificationCampaign(campaignId);
      setFeedback({
        type: "success",
        message: `Retry completed. Retried ${res.retried_email} emails and ${res.retried_sms} SMS channels.`,
      });
      if (selectedIncident) {
        const detail = await api.getIncidentDetail(selectedIncident.id);
        setIncidentDetail(detail);
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Retry failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAckModal = (recipientId: string) => {
    setSelectedRecipientId(recipientId);
    setAckModalOpen(true);
  };

  const handleSubmitAcknowledgment = async () => {
    if (!selectedRecipientId) return;
    setLoading(true);
    try {
      await api.acknowledgeRecipient(selectedRecipientId, {
        pharmacist_name: ackPharmacistName,
        isolated_stock_qty: ackIsolatedQty,
        notes: ackNotes,
      });
      setFeedback({ type: "success", message: `Acknowledgment recorded for recipient: ${ackIsolatedQty} units isolated.` });
      setAckModalOpen(false);
      if (selectedIncident) {
        const detail = await api.getIncidentDetail(selectedIncident.id);
        setIncidentDetail(detail);
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to record acknowledgment" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Banner: Direct Link to CYPHER 2026 Judge Demo */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-orange-700 text-white px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="w-4 h-4 text-amber-200 animate-pulse shrink-0" />
            <span>
              <strong>CYPHER 2026 Challenge 07:</strong> Arogya Pharma Batch B2231 Recall Demonstration is ready.
            </span>
          </div>
          <Link
            href="/recall-demo"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white text-amber-900 font-semibold hover:bg-amber-50 shadow-sm transition text-xs shrink-0"
          >
            Launch Judge-Ready Demo
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Regulatory Complaints & Recall Notifications
              </h1>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                Email + SMS Multi-Channel
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Patient portal intake, warehouse quality reports, batch recipient tracing, and human-authorized recall alerts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              Simulation Mode Active (Safe Test Mode)
            </span>
            <button
              onClick={() => {
                setActiveTab("new_incident");
                setSelectedIncident(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Log Incident
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`mb-6 p-4 rounded-xl border text-sm flex items-start justify-between gap-3 ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : feedback.type === "error"
                ? "bg-red-50 border-red-200 text-red-900"
                : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : feedback.type === "error" ? (
                <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 mb-6 gap-2">
          <button
            onClick={() => {
              setActiveTab("incidents");
              setSelectedIncident(null);
            }}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === "incidents"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileText className="w-4 h-4" />
            Active Incidents & Complaints
          </button>
          <button
            onClick={() => {
              setActiveTab("campaigns");
              setSelectedIncident(null);
            }}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === "campaigns"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Mail className="w-4 h-4" />
            Recall Notification Campaigns
          </button>
          <button
            onClick={() => {
              setActiveTab("new_incident");
              setSelectedIncident(null);
            }}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === "new_incident"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Plus className="w-4 h-4" />
            File New Incident Report
          </button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* Tab 1: Incident Queue & Detail Drawer */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "incidents" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Incident List */}
            <div className={`${selectedIncident ? "lg:col-span-5" : "lg:col-span-12"} space-y-4`}>
              {/* Filter Bar */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-2 items-center">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by case ID, SKU, batch, or reporter..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700"
                >
                  <option value="">All Sources</option>
                  <option value="website_complaint">Website Patient Complaint</option>
                  <option value="owner_quality_issue">Warehouse Owner Quality Issue</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700"
                >
                  <option value="">All Statuses</option>
                  <option value="new">New</option>
                  <option value="investigating">Investigating</option>
                  <option value="quarantine_recommended">Quarantine Recommended</option>
                  <option value="resolved">Resolved</option>
                </select>
                <button
                  onClick={loadData}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                  title="Refresh list"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Incidents Table / Cards */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {incidents.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No incidents matching your filters.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {incidents.map((inc) => {
                      const isSelected = selectedIncident?.id === inc.id;
                      return (
                        <div
                          key={inc.id}
                          onClick={() => handleSelectIncident(inc)}
                          className={`p-4 cursor-pointer transition hover:bg-slate-50 ${
                            isSelected ? "bg-blue-50/70 border-l-4 border-blue-600" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-slate-900">
                                {inc.id}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  inc.incident_source === "owner_quality_issue"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {inc.incident_source === "owner_quality_issue" ? "Warehouse Owner" : "Patient Portal"}
                              </span>
                              {inc.is_batch_missing && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                  Missing Batch
                                </span>
                              )}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                inc.urgency === "critical"
                                  ? "bg-red-100 text-red-800"
                                  : inc.urgency === "urgent"
                                  ? "bg-orange-100 text-orange-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {inc.urgency}
                            </span>
                          </div>

                          <div className="text-xs font-semibold text-slate-800 mb-1">
                            {inc.sku || "Unknown SKU"} {inc.batch ? `• Batch: ${inc.batch}` : "• [Batch Not Provided]"}
                          </div>

                          <p className="text-xs text-slate-600 line-clamp-2 mb-2">
                            {inc.complaint_description}
                          </p>

                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>Reporter: {inc.caller_name || "Anonymous"}</span>
                            <span>{new Date(inc.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Selected Incident Detail Drawer */}
            {selectedIncident && (
              <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900 font-mono">
                        {selectedIncident.id}
                      </h2>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {selectedIncident.investigation_status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Reported via {selectedIncident.incident_source} on {new Date(selectedIncident.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedIncident(null)}
                    className="text-xs text-slate-400 hover:text-slate-600 p-1"
                  >
                    Close
                  </button>
                </div>

                {/* Case Particulars */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-100 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">SKU</div>
                    <div className="font-semibold text-slate-800">{selectedIncident.sku || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Batch</div>
                    <div className="font-semibold text-slate-800">
                      {selectedIncident.batch ? (
                        <span className="font-mono">{selectedIncident.batch}</span>
                      ) : (
                        <span className="text-amber-600 font-medium">Flagged Missing</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Urgency</div>
                    <div className="font-semibold capitalize text-slate-800">{selectedIncident.urgency}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Assigned Reviewer</div>
                    <div className="font-semibold text-slate-800">{selectedIncident.assigned_reviewer || "Unassigned"}</div>
                  </div>
                </div>

                {/* Clinical / Quality Description */}
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Incident Description & Symptoms
                  </h3>
                  <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-700 border border-slate-100 leading-relaxed">
                    {selectedIncident.complaint_description}
                  </div>
                </div>

                {/* Warehouse Stock Check (if batch known) */}
                {incidentDetail?.warehouse_inventory && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Warehouse Stock Inventory ({selectedIncident.batch})
                    </h3>
                    {incidentDetail.warehouse_inventory.length === 0 ? (
                      <p className="text-xs text-slate-400">No warehouse stock records found for this batch.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {incidentDetail.warehouse_inventory.map((inv: any, idx: number) => (
                          <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs">
                            <div className="text-slate-500 font-medium">{inv.warehouse}</div>
                            <div className="text-base font-bold text-slate-900">{inv.qty} units</div>
                            <div className="text-[10px] text-slate-400">Status: {inv.status}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Affected Recipients from Dispatches */}
                {incidentDetail?.affected_recipients && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Affected Customer Recipients ({incidentDetail.affected_recipients.length})
                      </h3>
                      <span className="text-xs font-semibold text-slate-600">
                        Total Dispatched: {incidentDetail.affected_recipients.reduce((sum: number, r: any) => sum + r.quantity_dispatched, 0)} units
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                      {incidentDetail.affected_recipients.map((recip: any, idx: number) => (
                        <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <div className="font-semibold text-slate-800">{recip.name}</div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2">
                              <span>{recip.customer_type}</span>
                              <span>• {recip.email || "No email"}</span>
                              <span>• {recip.phone || "No phone"}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-900">{recip.quantity_dispatched} units</span>
                            <div className="text-[10px] text-slate-400">{recip.last_dispatch_date}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Campaign Link or Generation */}
                <div className="pt-4 border-t border-slate-100">
                  {incidentDetail?.campaign ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <div>
                          <div className="text-xs font-bold text-blue-950 font-mono">
                            Campaign: {incidentDetail.campaign.id}
                          </div>
                          <div className="text-[11px] text-blue-700 mt-0.5">
                            Status: <span className="font-bold uppercase">{incidentDetail.campaign.status}</span>
                            {incidentDetail.campaign.approved_by && ` • Authorized by ${incidentDetail.campaign.approved_by}`}
                          </div>
                        </div>

                        {/* Action buttons based on campaign status */}
                        <div className="flex items-center gap-2">
                          {incidentDetail.campaign.status === "draft" && (
                            <>
                              <button
                                onClick={() => handleOpenApproval(incidentDetail.campaign.id, "approve")}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
                              >
                                Authorize Recall
                              </button>
                              <button
                                onClick={() => handleOpenApproval(incidentDetail.campaign.id, "reject")}
                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-sm transition"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {incidentDetail.campaign.status === "approved" && (
                            <button
                              onClick={() => handleSendCampaign(incidentDetail.campaign.id)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Send Notifications
                            </button>
                          )}

                          {incidentDetail.campaign.status === "partially_sent" && (
                            <button
                              onClick={() => handleRetryFailed(incidentDetail.campaign.id)}
                              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Retry Failed Recipients
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Recipient Outcomes Table */}
                      {incidentDetail.recipient_tasks && incidentDetail.recipient_tasks.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                            Per-Recipient Notification Outcomes ({incidentDetail.recipient_tasks.length})
                          </h4>
                          <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                            {incidentDetail.recipient_tasks.map((task: any) => (
                              <div key={task.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                                <div>
                                  <div className="font-semibold text-slate-900">{task.recipient_name}</div>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                    <span>{task.customer_type}</span>
                                    <span>• Email: <strong className="text-slate-700">{task.email_status}</strong></span>
                                    <span>• SMS: <strong className="text-slate-700">{task.sms_status}</strong></span>
                                  </div>
                                  {task.acknowledgement_status === "acknowledged" && (
                                    <div className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      Acknowledged by {task.acknowledged_by} ({task.isolated_stock_qty || 0} units quarantined)
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  {task.acknowledgement_status !== "acknowledged" && (
                                    <button
                                      onClick={() => handleOpenAckModal(task.id)}
                                      className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-semibold"
                                    >
                                      Record Ack
                                    </button>
                                  )}
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      task.email_status === "simulated_sent" || task.email_status === "sent"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : task.email_status === "failed"
                                        ? "bg-red-100 text-red-800"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {task.email_status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {selectedIncident.is_batch_missing ? (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                          <strong>Batch Unidentified:</strong> Cannot generate customer recall campaign until the batch is confirmed through investigation.
                        </div>
                      ) : (
                        <button
                          onClick={() => handleGenerateCampaign(selectedIncident.id)}
                          className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-2"
                        >
                          <Mail className="w-4 h-4" />
                          Generate Recall Email & SMS Campaign for Batch {selectedIncident.batch}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* Tab 2: Campaign Manager */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "campaigns" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Regulatory Recall Campaigns
            </h2>
            <p className="text-xs text-slate-500">
              Active and past multi-channel notifications sent to hospital and chemist distribution networks.
            </p>

            {campaigns.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                No notification campaigns recorded yet. Create an incident or launch the CYPHER B2231 recall demo.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {campaigns.map((camp) => (
                  <div key={camp.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900">{camp.id}</span>
                        <span className="text-xs font-semibold text-slate-800">{camp.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            camp.status === "completed" || camp.status === "approved"
                              ? "bg-emerald-100 text-emerald-800"
                              : camp.status === "draft"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {camp.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-3">
                        <span>Recipients: <strong>{camp.total_recipients}</strong></span>
                        <span>Emails Sent: <strong>{camp.emails_sent}</strong></span>
                        <span>SMS Sent: <strong>{camp.sms_sent}</strong></span>
                        <span>Acknowledged: <strong>{camp.acknowledged_count}</strong></span>
                        {camp.approved_by && <span>Authorized: <strong>{camp.approved_by}</strong></span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {camp.status === "draft" && (
                        <button
                          onClick={() => handleOpenApproval(camp.id, "approve")}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
                        >
                          Review & Authorize
                        </button>
                      )}
                      {camp.status === "approved" && (
                        <button
                          onClick={() => handleSendCampaign(camp.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Send Campaign
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* Tab 3: Submit New Incident Form */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "new_incident" && (
          <div className="max-w-3xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              File Regulatory Incident / Complaint
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Captures customer complaints and warehouse quality issues with mandatory audit logging and batch validation.
            </p>

            <form onSubmit={handleCreateIncident} className="space-y-4">
              {/* Incident Source Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Incident Source
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewSource("website_complaint")}
                    className={`p-3 rounded-lg border text-left transition text-xs ${
                      newSource === "website_complaint"
                        ? "border-blue-600 bg-blue-50/50 text-blue-900 font-semibold ring-1 ring-blue-600"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="font-bold">1. Patient / Chemist Portal</div>
                    <div className="text-[11px] text-slate-500 font-normal">
                      Submitted externally by patient or retail dispenser
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSource("owner_quality_issue")}
                    className={`p-3 rounded-lg border text-left transition text-xs ${
                      newSource === "owner_quality_issue"
                        ? "border-blue-600 bg-blue-50/50 text-blue-900 font-semibold ring-1 ring-blue-600"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="font-bold">2. Warehouse Quality Alert</div>
                    <div className="text-[11px] text-slate-500 font-normal">
                      Reported internally by warehouse owner or QA lab
                    </div>
                  </button>
                </div>
              </div>

              {/* Reporter Information */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reporter Name</label>
                  <input
                    type="text"
                    required
                    value={newCallerName}
                    onChange={(e) => setNewCallerName(e.target.value)}
                    placeholder="e.g. Dr. Ramesh / QA Inspector"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={newCallerPhone}
                    onChange={(e) => setNewCallerPhone(e.target.value)}
                    placeholder="+91-XXXXXXXXXX"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newCallerEmail}
                    onChange={(e) => setNewCallerEmail(e.target.value)}
                    placeholder="reporter@pharmacy.com"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Medicine & Batch Identification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Medicine SKU</label>
                  <input
                    type="text"
                    required
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value.toUpperCase())}
                    placeholder="e.g. AMOX-625"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Batch Number</label>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newIsBatchMissing}
                        onChange={(e) => setNewIsBatchMissing(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Batch Unknown/Missing</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    disabled={newIsBatchMissing}
                    value={newIsBatchMissing ? "" : newBatch}
                    onChange={(e) => setNewBatch(e.target.value)}
                    placeholder={newIsBatchMissing ? "Flagged missing in intake report" : "e.g. B2231"}
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>

              {/* Category, Urgency, Potential Harm */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="stability_failure">Stability Assay Failure</option>
                    <option value="particulate_matter">Particulate Contamination</option>
                    <option value="packaging_defect">Packaging Defect / Seal Break</option>
                    <option value="adverse_reaction">Adverse Patient Reaction</option>
                    <option value="labeling_error">Labeling / Expiry Mismatch</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Urgency</label>
                  <select
                    value={newUrgency}
                    onChange={(e) => setNewUrgency(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-medium"
                  >
                    <option value="routine">Routine</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                    <option value="critical">Critical (Immediate Quarantine)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Potential Harm</label>
                  <select
                    value={newPotentialHarm}
                    onChange={(e) => setNewPotentialHarm(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-medium"
                  >
                    <option value="low">Low Risk</option>
                    <option value="medium">Medium Risk</option>
                    <option value="high">High Risk</option>
                    <option value="severe">Severe Risk</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical / Technical Observation
                </label>
                <textarea
                  rows={4}
                  required
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Detailed description of defect, test results, or patient complaint..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("incidents")}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {loading ? "Recording Incident..." : "Submit Incident & Append to Ledger"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Modal: Human Approval Gate */}
      {/* ------------------------------------------------------------- */}
      {approvalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  approvalAction === "approve"
                    ? "bg-emerald-100 text-emerald-700"
                    : approvalAction === "reject"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {approvalAction === "approve"
                    ? "Authorize Recall Notification Dispatch"
                    : approvalAction === "reject"
                    ? "Reject Recall Campaign"
                    : "Escalate Recall Campaign"}
                </h3>
                <p className="text-xs text-slate-500">
                  Mandatory human authorization step before broadcast to healthcare facilities.
                </p>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Approver Persona:</span>
                <span className="font-semibold text-slate-900">{currentUser.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Regulatory Role:</span>
                <span className="font-semibold text-slate-900">{currentUser.roleTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Audit Ledger:</span>
                <span className="font-mono text-emerald-700">SHA-256 Event Chain Enabled</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Formal Regulatory Justification (Recorded in Audit Ledger)
              </label>
              <textarea
                rows={3}
                required
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApprovalModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitApproval}
                disabled={loading}
                className={`px-5 py-2 rounded-lg text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 ${
                  approvalAction === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : approvalAction === "reject"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                Confirm Decision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modal: Record Customer Acknowledgment */}
      {/* ------------------------------------------------------------- */}
      {ackModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Record Pharmacy Acknowledgment
                </h3>
                <p className="text-xs text-slate-500">
                  Verify customer received recall alert and physically quarantined remaining stock.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Responding Pharmacist / Officer Name
                </label>
                <input
                  type="text"
                  value={ackPharmacistName}
                  onChange={(e) => setAckPharmacistName(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Units Physically Quarantined at Facility
                </label>
                <input
                  type="number"
                  value={ackIsolatedQty}
                  onChange={(e) => setAckIsolatedQty(Number(e.target.value))}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pharmacist Notes & Verification
                </label>
                <textarea
                  rows={2}
                  value={ackNotes}
                  onChange={(e) => setAckNotes(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAckModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitAcknowledgment}
                disabled={loading}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                Record Verified Acknowledgment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
