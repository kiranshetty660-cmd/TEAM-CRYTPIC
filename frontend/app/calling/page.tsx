"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Plus,
  Search,
  Building,
  User,
  Package,
  Layers,
  FileText,
  AlertOctagon,
  RefreshCw,
  Eye,
  Lock,
  Volume2,
  MessageSquare,
  Sparkles,
  Link as LinkIcon,
  Activity,
  Mic,
  MicOff,
  VolumeX,
  Radio,
  Cpu,
  Server,
} from "lucide-react";
import { api } from "../../lib/api";

export default function CallingAgentPage() {
  const [activeTab, setActiveTab] = useState<"complaints" | "campaigns" | "records" | "notifications">("complaints");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Workflow A & Mode A LiveKit Voice State
  const [complaints, setComplaints] = useState<any[]>([]);
  const [selectedComplaint, setSelectedComplaint] = useState<any | null>(null);
  const [inboundModalOpen, setInboundModalOpen] = useState(false);
  const [simMessage, setSimMessage] = useState("");
  const [simHistory, setSimHistory] = useState<Array<{ role: string; text: string }>>([]);
  const [simCallId, setSimCallId] = useState<string | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitConfig, setLivekitConfig] = useState<any | null>(null);

  // Workflow B State
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<any | null>(null);
  const [campaignTasks, setCampaignTasks] = useState<any[]>([]);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);

  // Campaign Create Form State
  const [formSku, setFormSku] = useState("AMOX-625");
  const [formBatches, setFormBatches] = useState<string[]>(["B2231"]);
  const [formReason, setFormReason] = useState("Suspected particulate discoloration reported in batch");
  const [formMessage, setFormMessage] = useState(
    "A potential quality issue has been reported for Batch B2231 of Augmentin 625. Please stop further dispensing of this batch, isolate remaining units in quarantine, and confirm available quantity. Our logistics team will collect the stock."
  );
  const [previewRecipients, setPreviewRecipients] = useState<any[]>([]);
  const [authorizing, setAuthorizing] = useState(false);
  const [approverName, setApproverName] = useState("Dr. S. Rao (Quality Director)");

  // Call Records & Notifications State
  const [callRecords, setCallRecords] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Task simulation state
  const [simOutboundTask, setSimOutboundTask] = useState<any | null>(null);
  const [simOutboundReply, setSimOutboundReply] = useState("Yes, we received your alert. We have isolated 20 units in our quarantine locker.");

  useEffect(() => {
    loadAllData();
  }, [activeTab]);

  async function loadAllData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (activeTab === "complaints") {
        const data = await api.getComplaints();
        setComplaints(data);
      } else if (activeTab === "campaigns") {
        const camps = await api.getCampaigns();
        setCampaigns(camps);
        if (camps.length > 0 && !activeCampaign) {
          loadCampaignDetail(camps[0].id);
        } else if (activeCampaign) {
          loadCampaignDetail(activeCampaign.id);
        }
        // Load inventory for SKU picker
        const inv = await api.getInventory();
        setInventoryItems(inv.items || []);
      } else if (activeTab === "records") {
        const recs = await api.getCallRecords();
        setCallRecords(recs);
      } else if (activeTab === "notifications") {
        const notifs = await api.getOwnerNotifications();
        setNotifications(notifs);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load calling agent data");
    } finally {
      setLoading(false);
    }
  }

  async function loadCampaignDetail(id: string) {
    try {
      const camp = await api.getCampaign(id);
      setActiveCampaign(camp);
      const tasks = await api.getCampaignTasks(id);
      setCampaignTasks(tasks);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  }

  async function handleCreateCampaign() {
    try {
      setLoading(true);
      const res = await api.createCampaign({
        sku: formSku,
        batches: formBatches,
        reason: formReason,
        owner_message: formMessage,
      });
      setCreateCampaignOpen(false);
      await loadAllData();
      await loadCampaignDetail(res.campaign_id);
    } catch (err: any) {
      alert(`Error creating campaign: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthorizeCampaign(campId: string) {
    try {
      setAuthorizing(true);
      await api.approveCampaign(campId, approverName);
      await loadCampaignDetail(campId);
      await loadAllData();
    } catch (err: any) {
      alert(`Authorization failed: ${err.message}`);
    } finally {
      setAuthorizing(false);
    }
  }

  async function handleStartCampaign(campId: string) {
    try {
      await api.startCampaign(campId);
      await loadCampaignDetail(campId);
      await loadAllData();
    } catch (err: any) {
      alert(`Start failed: ${err.message}`);
    }
  }

  async function handlePauseCampaign(campId: string) {
    try {
      await api.pauseCampaign(campId);
      await loadCampaignDetail(campId);
      await loadAllData();
    } catch (err: any) {
      alert(`Pause failed: ${err.message}`);
    }
  }

  async function handleResumeCampaign(campId: string) {
    try {
      await api.resumeCampaign(campId);
      await loadCampaignDetail(campId);
      await loadAllData();
    } catch (err: any) {
      alert(`Resume failed: ${err.message}`);
    }
  }

  async function handleCancelCampaign(campId: string) {
    if (!confirm("Are you sure you want to cancel this calling campaign? Queued calls will be stopped.")) return;
    try {
      await api.cancelCampaign(campId);
      await loadCampaignDetail(campId);
      await loadAllData();
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`);
    }
  }

  async function initLiveKitSession() {
    try {
      const cfg = await api.getLiveKitConfig();
      setLivekitConfig(cfg);
      const tokenRes = await api.getLiveKitToken({
        room_name: "tracerx-complaint-" + Math.floor(Math.random() * 10000),
        participant_identity: "web-caller-" + Math.floor(Math.random() * 1000),
        mode: "COMPLAINT_INTAKE",
      });
      setLivekitToken(tokenRes.token);
    } catch (e: any) {
      console.warn("LiveKit token initialization:", e);
    }
  }

  function startMicrophoneRecognition() {
    if (typeof window === "undefined") return;
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Microphone speech recognition is not supported in this browser. Please type caller messages directly.");
      return;
    }
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = () => setIsRecording(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSimMessage(transcript);
      };
      recognition.start();
    } catch (err) {
      console.warn("Mic error:", err);
      setIsRecording(false);
    }
  }

  function speakAgentResponse(text: string) {
    if (!audioEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("TTS error:", err);
      setIsSpeaking(false);
    }
  }

  async function handleSimulateInboundTurn() {
    if (!simMessage.trim()) return;
    setSimLoading(true);
    try {
      const userTurn = { role: "caller", text: simMessage };
      const updatedHistory = [...simHistory, userTurn];
      setSimHistory(updatedHistory);
      setSimMessage("");

      const res = await api.simulateInboundTurn({
        call_id: simCallId || undefined,
        caller_message: userTurn.text,
        conversation_history: updatedHistory,
      });

      setSimCallId(res.call_id);
      setSimHistory([...updatedHistory, { role: "agent", text: res.agent_response }]);
      speakAgentResponse(res.agent_response);

      if (res.created_complaint_id) {
        await loadAllData();
      }
    } catch (err: any) {
      alert(`Simulation error: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  }

  async function handleSimulateOutboundTurn() {
    if (!simOutboundTask) return;
    try {
      setSimLoading(true);
      await api.simulateOutboundTurn({
        task_id: simOutboundTask.id,
        recipient_message: simOutboundReply,
      });
      setSimOutboundTask(null);
      if (activeCampaign) {
        await loadCampaignDetail(activeCampaign.id);
      }
    } catch (err: any) {
      alert(`Outbound turn error: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Challenge 07 & Multi-Channel Regulatory Banner */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-orange-700 text-white rounded-2xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/30 border border-amber-300/40 uppercase tracking-wider text-amber-100">
                CYPHER 2026 Challenge 07
              </span>
              <span className="text-xs font-semibold text-amber-200">
                Arogya Pharma Batch B2231 Recall
              </span>
            </div>
            <h2 className="text-base font-bold tracking-tight">
              Judge-Ready Recall Workflow & Multi-Channel Regulatory Notifications
            </h2>
            <p className="text-xs text-amber-100/90 max-w-2xl">
              Per regulatory standards, high-volume emergency drug recalls utilize official Multi-Channel Email & SMS with DLT compliance and cryptographic audit ledger logging.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/recall-demo"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-amber-900 text-xs font-bold shadow hover:bg-amber-50 transition"
            >
              Launch B2231 Demo
            </Link>
            <Link
              href="/notifications"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-800/80 hover:bg-amber-800 text-white text-xs font-semibold border border-amber-500/50 transition"
            >
              Email & SMS Portal
            </Link>
          </div>
        </div>

        {/* Top Header Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md">
              <PhoneCall className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Autonomous AI Calling Agent</h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Voice AI Ready
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Centralized Voice Intelligence: Inbound Complaint Capture (Workflow A) & Owner-Authorized Medicine Alerts (Workflow B)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-600">Telephony:</span>
              <span className="font-semibold text-slate-800">Development Simulator (Interactive)</span>
            </div>
            <button
              onClick={() => {
                setSimCallId(null);
                setSimHistory([{
                  role: "agent",
                  text: "Hello, this is the TraceRx Automated Quality and Safety Assistant on behalf of Arogya Pharma Distributors. This call may be recorded for compliance. How may I assist you with your medicine or batch inquiry today?",
                }]);
                setInboundModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <PhoneIncoming className="w-4 h-4" />
              Simulate Inbound Complaint
            </button>
            <button
              onClick={loadAllData}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 space-x-8">
          <button
            onClick={() => setActiveTab("complaints")}
            className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === "complaints"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <PhoneIncoming className="w-4 h-4" />
            Complaints Inbox (Workflow A)
            {complaints.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">
                {complaints.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("campaigns")}
            className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === "campaigns"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <PhoneOutgoing className="w-4 h-4" />
            Medicine Alert Campaigns (Workflow B)
            {campaigns.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">
                {campaigns.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("records")}
            className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === "records"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText className="w-4 h-4" />
            Call Transcripts & Logs
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === "notifications"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Owner Alerts
          </button>
        </div>

        {/* =================================================================== */}
        {/* TAB 1: WORKFLOW A — COMPLAINTS INBOX                                */}
        {/* =================================================================== */}
        {activeTab === "complaints" && (
          <div className="space-y-6">
            {/* Urgent Escalation Alert Banner */}
            {complaints.some((c) => c.potential_harm || c.urgency === "critical") && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-900 shadow-sm animate-pulse">
                <AlertOctagon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-red-800">
                    Emergency Owner Alert Queue: Critical Incidents Reported
                  </h4>
                  <p className="text-xs text-red-700 mt-0.5">
                    One or more customer complaints indicate potential patient harm or severe adverse reactions. Immediate pharmacovigilance review is required.
                  </p>
                </div>
              </div>
            )}

            {/* Complaints List Card */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Customer Complaints Feed</h2>
                  <p className="text-xs text-slate-500">Real-time structured intake from inbound voice calls</p>
                </div>
              </div>

              {complaints.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No complaints logged yet. Use the "Simulate Inbound Complaint" button above to test real voice capture!
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {complaints.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 hover:bg-slate-50/80 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {c.id}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              c.urgency === "critical"
                                ? "bg-red-100 text-red-800 border border-red-300"
                                : c.urgency === "high"
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {c.urgency} Urgency
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              c.verification_status === "verified_sku_batch"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : c.verification_status === "verified_sku_only"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {c.verification_status.replace(/_/g, " ").toUpperCase()}
                          </span>
                          {c.potential_harm && (
                            <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">
                              HARM REPORTED
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-900 font-semibold">
                          Medicine: {c.medicine_name || c.sku || "Unspecified"} | Batch: {c.batch || "Unverified"}
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-2">
                          "{c.complaint_description}"
                        </p>

                        <div className="flex items-center gap-4 text-[11px] text-slate-400">
                          <span>Caller: {c.caller_name} ({c.caller_organization})</span>
                          <span>Phone: {c.caller_phone}</span>
                          <span>Reported: {new Date(c.created_at).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            const detail = await api.getComplaintDetail(c.id);
                            setSelectedComplaint(detail);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                        >
                          View Details
                        </button>
                        <button
                          onClick={async () => {
                            await api.escalateComplaint(c.id);
                            await loadAllData();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold transition"
                        >
                          Escalate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: WORKFLOW B — OWNER-CONTROLLED ALERT CAMPAIGNS               */}
        {/* =================================================================== */}
        {activeTab === "campaigns" && (
          <div className="space-y-6">
            {/* Top Campaign Bar */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Medicine Alert Outbound Campaigns</h2>
                <p className="text-xs text-slate-500">
                  Targeted, owner-authorized calling to chemist shops and hospitals that received specific batches.
                </p>
              </div>
              <button
                onClick={() => setCreateCampaignOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                Create New Campaign
              </button>
            </div>

            {/* Campaign Selector / Tabs */}
            {campaigns.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {campaigns.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => loadCampaignDetail(c.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-2.5 whitespace-nowrap ${
                      activeCampaign?.id === c.id
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>{c.id}</span>
                    <span className="font-mono text-[10px] opacity-75">{c.sku}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                        c.status === "running"
                          ? "bg-emerald-400 text-slate-950"
                          : c.status === "approved"
                          ? "bg-blue-400 text-slate-950"
                          : c.status === "completed"
                          ? "bg-slate-400 text-slate-950"
                          : "bg-amber-400 text-slate-950"
                      }`}
                    >
                      {c.status}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Active Campaign Detail & Controls */}
            {activeCampaign && (
              <div className="space-y-6">
                {/* Control Panel Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-slate-900">{activeCampaign.id}</h3>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                            activeCampaign.status === "running"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse"
                              : activeCampaign.status === "approved"
                              ? "bg-blue-100 text-blue-800 border border-blue-300"
                              : activeCampaign.status === "paused"
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : activeCampaign.status === "completed"
                              ? "bg-slate-100 text-slate-700 border border-slate-300"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          Status: {activeCampaign.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Scope: SKU <strong className="text-slate-800">{activeCampaign.sku}</strong> | Batches:{" "}
                        <strong className="text-slate-800">{activeCampaign.batches.join(", ")}</strong>
                      </p>
                    </div>

                    {/* Backend Action Controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {activeCampaign.status === "draft" && (
                        <button
                          onClick={() => handleAuthorizeCampaign(activeCampaign.id)}
                          disabled={authorizing}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
                        >
                          <Lock className="w-4 h-4" />
                          Authorize Campaign
                        </button>
                      )}

                      {activeCampaign.status === "approved" && (
                        <button
                          onClick={() => handleStartCampaign(activeCampaign.id)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
                        >
                          <Play className="w-4 h-4" />
                          Start Calling
                        </button>
                      )}

                      {activeCampaign.status === "running" && (
                        <button
                          onClick={() => handlePauseCampaign(activeCampaign.id)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition"
                        >
                          <Pause className="w-4 h-4" />
                          Pause Calls
                        </button>
                      )}

                      {activeCampaign.status === "paused" && (
                        <button
                          onClick={() => handleResumeCampaign(activeCampaign.id)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Resume Calls
                        </button>
                      )}

                      {["draft", "approved", "running", "paused"].includes(activeCampaign.status) && (
                        <button
                          onClick={() => handleCancelCampaign(activeCampaign.id)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 text-xs font-semibold transition"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Owner Approved Message Banner */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        Approved Script Communicated by Voice AI
                      </span>
                      {activeCampaign.approved_by && (
                        <span className="text-[11px] text-emerald-700 font-medium">
                          Authorized by: {activeCampaign.approved_by}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-800 bg-white p-3 rounded-lg border border-slate-200">
                      "{activeCampaign.owner_message}"
                    </p>
                  </div>

                  {/* Real-time KPI Counters */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Total Vendors</div>
                      <div className="text-lg font-bold text-slate-900 mt-1">{activeCampaign.total_recipients}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                      <div className="text-[10px] uppercase font-bold text-blue-600">Queued</div>
                      <div className="text-lg font-bold text-blue-900 mt-1">{activeCampaign.calls_queued}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                      <div className="text-[10px] uppercase font-bold text-indigo-600">In Progress</div>
                      <div className="text-lg font-bold text-indigo-900 mt-1">{activeCampaign.calls_in_progress}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-[10px] uppercase font-bold text-emerald-600">Answered</div>
                      <div className="text-lg font-bold text-emerald-900 mt-1">{activeCampaign.calls_answered}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-teal-50 border border-teal-200">
                      <div className="text-[10px] uppercase font-bold text-teal-600">Acknowledged</div>
                      <div className="text-lg font-bold text-teal-900 mt-1">{activeCampaign.acknowledgments_received}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="text-[10px] uppercase font-bold text-amber-600">Stock Isolated</div>
                      <div className="text-lg font-bold text-amber-900 mt-1">{activeCampaign.stock_isolated_count}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                      <div className="text-[10px] uppercase font-bold text-rose-600">Needs Follow-Up</div>
                      <div className="text-lg font-bold text-rose-900 mt-1">{activeCampaign.requires_follow_up_count + activeCampaign.unresolved_recipients}</div>
                    </div>
                  </div>
                </div>

                {/* Recipient Tasks Table */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Affected Vendors & Call Tasks</h4>
                      <p className="text-xs text-slate-500">Derived from historical dispatch records for this batch</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 uppercase text-[10px]">
                        <tr>
                          <th className="py-3 px-4">Recipient</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">Location</th>
                          <th className="py-3 px-4">Contact Phone</th>
                          <th className="py-3 px-4">Dispatched Units</th>
                          <th className="py-3 px-4">Call Status</th>
                          <th className="py-3 px-4">Acknowledged</th>
                          <th className="py-3 px-4">Stock Isolated</th>
                          <th className="py-3 px-4">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {campaignTasks.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {t.customer_name}
                              <div className="font-mono text-[10px] text-slate-400 font-normal">{t.customer_id}</div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  t.customer_type === "hospital"
                                    ? "bg-purple-50 text-purple-700 border border-purple-200"
                                    : "bg-blue-50 text-blue-700 border border-blue-200"
                                }`}
                              >
                                {t.customer_type}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{t.location}</td>
                            <td className="py-3 px-4 font-mono text-slate-700">
                              {t.phone || <span className="text-rose-500 font-semibold">Missing (Unresolved)</span>}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">{t.total_dispatched_qty} units</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  t.status === "completed"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : t.status === "calling"
                                    ? "bg-blue-100 text-blue-800 animate-pulse"
                                    : t.status === "queued"
                                    ? "bg-indigo-50 text-indigo-700"
                                    : t.status === "needs_follow_up"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {t.status}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {t.acknowledged ? (
                                <span className="text-emerald-600 font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Yes
                                </span>
                              ) : (
                                <span className="text-slate-400">Pending</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {t.confirmed_stock_isolation ? (
                                <span className="text-teal-700 font-semibold">
                                  Isolated ({t.reported_remaining_qty || 0} units)
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => {
                                  setSimOutboundTask(t);
                                  setSimOutboundReply(
                                    `Yes, this is ${t.customer_name}. We received the notification. We have isolated 15 units in quarantine.`
                                  );
                                }}
                                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] transition"
                              >
                                Test Call
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: CALL TRANSCRIPTS & LOGS                                      */}
        {/* =================================================================== */}
        {activeTab === "records" && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Historical Voice AI Call Records</h3>
              <p className="text-xs text-slate-500">Authoritative audit log of all inbound and outbound telephony calls</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Call ID</th>
                    <th className="py-3 px-4">Direction</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4">Recipient / Caller</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Started At</th>
                    <th className="py-3 px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {callRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-blue-700">{r.id}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.direction === "inbound"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-indigo-100 text-indigo-800"
                          }`}
                        >
                          {r.direction}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-600">{r.operating_mode}</td>
                      <td className="py-3 px-4 text-slate-900 font-medium">
                        {r.customer_name || r.recipient_phone || r.caller_phone || "Unknown"}
                      </td>
                      <td className="py-3 px-4 text-slate-500 uppercase text-[10px]">{r.telephony_provider}</td>
                      <td className="py-3 px-4 text-slate-700">{r.duration_seconds}s</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold uppercase text-[10px]">
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{new Date(r.started_at).toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={async () => {
                            const rec = await api.getCallRecord(r.id);
                            setSelectedRecord(rec);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] transition"
                        >
                          View Transcript
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: OWNER ALERTS                                                */}
        {/* =================================================================== */}
        {activeTab === "notifications" && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Owner Alert Notifications</h3>
              <p className="text-xs text-slate-500">Audited alerts delivered to the Responsible Owner queue</p>
            </div>

            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <div key={n.id} className="p-4 hover:bg-slate-50 transition space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{n.title}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        n.urgency === "critical"
                          ? "bg-red-100 text-red-800"
                          : n.urgency === "high"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {n.urgency}
                    </span>
                  </div>
                  <pre className="text-xs font-sans text-slate-600 whitespace-pre-line">{n.message}</pre>
                  <div className="text-[11px] text-slate-400 pt-1 flex items-center gap-3">
                    <span>Channel: {n.channel.toUpperCase()}</span>
                    <span>Delivered: {new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* MODAL: LIVEKIT BROWSER VOICE AGENT (MODE A)                         */}
        {/* =================================================================== */}
        {inboundModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${isSpeaking ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-blue-100 text-blue-700"}`}>
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">LiveKit Browser Voice Agent (Mode A)</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                        No Exotel Required
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Realtime microphone intake, Whisper transcription, Ollama entity extraction, and Piper spoken responses
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (typeof window !== "undefined" && "speechSynthesis" in window) {
                      window.speechSynthesis.cancel();
                    }
                    setInboundModalOpen(false);
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Mode & LiveKit Status Bar */}
              <div className="px-4 py-2 bg-slate-900 text-slate-200 text-[11px] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>LiveKit Room: <strong className="text-white font-mono">{livekitConfig?.livekit_url ? "Connected" : "Local WebRTC Session"}</strong></span>
                </div>
                <div className="flex items-center gap-3">
                  <span>Stack: <strong className="text-emerald-400">Whisper + Piper + Ollama</strong></span>
                  <button
                    onClick={() => setAudioEnabled(!audioEnabled)}
                    className="text-slate-300 hover:text-white flex items-center gap-1 text-[10px]"
                    title="Toggle Spoken Audio Output"
                  >
                    {audioEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-rose-400" />}
                    {audioEnabled ? "Speech ON" : "Speech Muted"}
                  </button>
                </div>
              </div>

              {/* Status Indicator (Speaking / Listening) */}
              {(isRecording || isSpeaking) && (
                <div className={`px-4 py-1.5 text-xs font-semibold flex items-center gap-2 ${
                  isRecording ? "bg-rose-50 text-rose-700 border-b border-rose-200" : "bg-amber-50 text-amber-700 border-b border-amber-200"
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isRecording ? "bg-rose-500 animate-pulse" : "bg-amber-500 animate-bounce"}`} />
                  {isRecording ? "Microphone active: Listening to caller speech..." : "AI Voice Agent speaking response aloud..."}
                </div>
              )}

              {/* Transcript Dialogue */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
                {simHistory.map((turn, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${turn.role === "agent" ? "items-start" : "items-end"}`}
                  >
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1 flex items-center gap-1.5">
                      {turn.role === "agent" ? "🤖 AI Voice Assistant (Whisper / Piper)" : "👤 Caller (Browser Mic / Chemist)"}
                    </span>
                    <div
                      className={`p-3 rounded-2xl max-w-[85%] text-xs ${
                        turn.role === "agent"
                          ? "bg-white text-slate-800 border border-slate-200 shadow-sm"
                          : "bg-blue-600 text-white shadow-sm"
                      }`}
                    >
                      {turn.text}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pre-canned Prompts */}
              <div className="p-3 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto text-[11px]">
                <button
                  onClick={() => setSimMessage("I am calling from Apollo Indiranagar regarding Augmentin 625 Batch B2231. We found sediment in 10 bottles.")}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap"
                >
                  Prompt: Defect in batch B2231
                </button>
                <button
                  onClick={() => setSimMessage("URGENT! A patient had severe anaphylaxis and acute shock after taking Augmentin 625 Batch B2231!")}
                  className="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 whitespace-nowrap border border-red-200"
                >
                  Prompt: Critical Adverse Harm
                </button>
              </div>

              {/* Controls & Input */}
              <div className="p-4 border-t border-slate-100 bg-white flex items-center gap-2">
                <button
                  type="button"
                  onClick={startMicrophoneRecognition}
                  className={`p-2.5 rounded-lg border transition ${
                    isRecording
                      ? "bg-rose-600 text-white border-rose-600 animate-pulse"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"
                  }`}
                  title="Grant Microphone Access & Speak"
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  placeholder={isRecording ? "Listening to microphone speech..." : "Speak into mic or type simulated speech..."}
                  value={simMessage}
                  onChange={(e) => setSimMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSimulateInboundTurn()}
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <button
                  onClick={handleSimulateInboundTurn}
                  disabled={simLoading || !simMessage.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 transition"
                >
                  Send Speech
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* MODAL: CREATE CAMPAIGN                                             */}
        {/* =================================================================== */}
        {createCampaignOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create Outgoing Medicine Alert Campaign</h3>
                  <p className="text-xs text-slate-500">Configure target SKU, batch scope, and author the approved notice</p>
                </div>
                <button onClick={() => setCreateCampaignOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Target Medicine SKU</label>
                  <select
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="AMOX-625">AMOX-625 (Augmentin 625 / Amoxicillin)</option>
                    <option value="INSULIN-R">INSULIN-R (Huminsulin R / Cold Chain 2-8C)</option>
                    <option value="AZITH-500">AZITH-500 (Azee 500)</option>
                    <option value="PARACET-650">PARACET-650 (Dolo 650)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Target Batches (comma separated)</label>
                  <input
                    type="text"
                    value={formBatches.join(", ")}
                    onChange={(e) => setFormBatches(e.target.value.split(",").map((s) => s.trim()))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    Only recipients who actually received dispatches of these exact batches will be included.
                  </span>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Alert Reason</label>
                  <input
                    type="text"
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Owner Approved Message (Source of Truth)
                  </label>
                  <textarea
                    rows={4}
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                  <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                    <span>The Voice AI will faithfully communicate this exact text without adding medical claims.</span>
                    <span>{formMessage.length} characters</span>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setCreateCampaignOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCampaign}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
                >
                  Save Draft & Preview Recipients
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* MODAL: OUTBOUND TASK TEST CALL                                     */}
        {/* =================================================================== */}
        {simOutboundTask && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Simulate Vendor Call</h3>
                  <p className="text-xs text-slate-500">Recipient: {simOutboundTask.customer_name}</p>
                </div>
                <button onClick={() => setSimOutboundTask(null)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
                <strong>AI Calling Agent will speak:</strong>
                <p className="mt-1 font-mono text-[11px]">
                  "Hello, this is the TraceRx Automated Calling Agent on behalf of Arogya Pharma Distributors... Message: '{activeCampaign?.owner_message}'"
                </p>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1 text-xs">Simulated Vendor Reply</label>
                <textarea
                  rows={3}
                  value={simOutboundReply}
                  onChange={(e) => setSimOutboundReply(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setSimOutboundReply("Yes, we received and understood. We have isolated 15 units in our quarantine locker.")}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] text-slate-700"
                >
                  Confirm & Isolate
                </button>
                <button
                  onClick={() => setSimOutboundReply("We refuse to cooperate. Speak to our lawyer, we already sold everything.")}
                  className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-[10px] text-red-700"
                >
                  Refuse / Dispute
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSimOutboundTask(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSimulateOutboundTurn}
                  disabled={simLoading}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  Process Call Turn
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* MODAL: COMPLAINT DETAIL                                            */}
        {/* =================================================================== */}
        {selectedComplaint && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl p-6 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedComplaint.complaint.id}</h3>
                  <span className="text-xs text-slate-500">Incident Details & Audit History</span>
                </div>
                <button onClick={() => setSelectedComplaint(null)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                  <div><strong>Caller:</strong> {selectedComplaint.complaint.caller_name} ({selectedComplaint.complaint.caller_organization})</div>
                  <div><strong>Phone:</strong> {selectedComplaint.complaint.caller_phone}</div>
                  <div><strong>Medicine / SKU:</strong> {selectedComplaint.complaint.medicine_name} ({selectedComplaint.complaint.sku})</div>
                  <div><strong>Batch:</strong> {selectedComplaint.complaint.batch || "Unverified"}</div>
                  <div><strong>Category:</strong> {selectedComplaint.complaint.complaint_category}</div>
                  <div><strong>Potential Harm:</strong> {selectedComplaint.complaint.potential_harm ? "YES" : "No"}</div>
                </div>

                <div>
                  <strong>Description:</strong>
                  <p className="mt-1 p-2 bg-slate-100 rounded text-slate-800">
                    {selectedComplaint.complaint.complaint_description}
                  </p>
                </div>

                {selectedComplaint.audit_events && selectedComplaint.audit_events.length > 0 && (
                  <div>
                    <strong>Audit Trail:</strong>
                    <div className="mt-1 divide-y divide-slate-100 border border-slate-100 rounded-lg">
                      {selectedComplaint.audit_events.map((e: any) => (
                        <div key={e.id} className="p-2 text-[11px] flex justify-between">
                          <span>{e.event_type} by {e.actor}: {e.notes}</span>
                          <span className="text-slate-400">{new Date(e.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* MODAL: CALL RECORD DETAIL & TRANSCRIPT                             */}
        {/* =================================================================== */}
        {selectedRecord && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl p-6 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Call Record: {selectedRecord.id}</h3>
                  <span className="text-xs text-slate-500">Duration: {selectedRecord.duration_seconds}s | Status: {selectedRecord.status}</span>
                </div>
                <button onClick={() => setSelectedRecord(null)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Transcript</h4>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {selectedRecord.transcript && selectedRecord.transcript.length > 0 ? (
                    selectedRecord.transcript.map((t: any, i: number) => (
                      <div key={i} className={`p-2 rounded text-xs ${t.role === "agent" ? "bg-slate-100" : "bg-blue-50 text-blue-900"}`}>
                        <strong>{t.role === "agent" ? "🤖 AI Voice Assistant" : "👤 Recipient / Caller"}:</strong> {t.text}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400 text-xs">No transcript turns captured for this call.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
