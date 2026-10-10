import {
  BoardResponse,
  Finding,
  BatchTraceResponse,
  ActionItem,
  LedgerEntry,
  AnchorItem,
  LedgerVerifyResult,
  Case,
  DemandForecast,
  Shipment,
  WarehouseTransfer,
  AgentRunSummary,
  AgentRunDetail,
  AgentMonitorStats,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let errMsg = `Request failed: ${res.statusText}`;
    try {
      const errBody = await res.json();
      errMsg = errBody.detail || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return res.json();
}

export const api = {
  getBoard: () => fetchJson<BoardResponse>("/api/board"),
  triggerScan: () => fetchJson<BoardResponse>("/api/scan", { method: "POST" }),
  getFinding: (id: string) => fetchJson<Finding>(`/api/findings/${id}`),
  traceBatch: (batch: string) => fetchJson<BatchTraceResponse>(`/api/batch/${batch}/trace`),
  getInventory: (status?: string, warehouse?: string) => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (warehouse) params.append("warehouse", warehouse);
    return fetchJson<{ today: string; total_batches: number; total_units: number; items: any[] }>(
      `/api/inventory?${params.toString()}`
    );
  },
  getActions: (status?: string) => {
    const q = status ? `?status=${status}` : "";
    return fetchJson<ActionItem[]>(`/api/actions${q}`);
  },
  approveAction: (id: string, role: string, userName: string, reason?: string) =>
    fetchJson<any>(`/api/actions/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ role, user_name: userName, reason }),
    }),
  rejectAction: (id: string, role: string, userName: string, reason: string) =>
    fetchJson<any>(`/api/actions/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ role, user_name: userName, reason }),
    }),
  replayB2231Recall: () => fetchJson<any>("/api/recalls/replay-b2231", { method: "POST" }),
  getLedger: (limit = 100, offset = 0) =>
    fetchJson<LedgerEntry[]>(`/api/ledger?limit=${limit}&offset=${offset}`),
  verifyLedger: () => fetchJson<LedgerVerifyResult>("/api/ledger/verify"),
  getAnchors: () => fetchJson<AnchorItem[]>("/api/ledger/anchors"),
  triggerAnchor: (fromSeq?: number, toSeq?: number) => {
    const params = new URLSearchParams();
    if (fromSeq) params.append("from_seq", String(fromSeq));
    if (toSeq) params.append("to_seq", String(toSeq));
    return fetchJson<AnchorItem>(`/api/ledger/anchor?${params.toString()}`, { method: "POST" });
  },
  simulateTamper: (seq = 10) =>
    fetchJson<{ status: string; tampered_seq: number; message: string }>(`/api/dev/tamper?seq=${seq}`, {
      method: "POST",
    }),
  resetDatabase: () => fetchJson<{ status: string }>("/api/dev/reset-db", { method: "POST" }),
  uploadData: async (table: string, mode: string, file: File) => {
    const formData = new FormData();
    formData.append("table", table);
    formData.append("mode", mode);
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/api/data/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  },
  profileData: async (file: File, targetTable = "batch_inventory") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("target_table", targetTable);

    const res = await fetch(`${API_BASE}/api/data/profile`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Profiling failed" }));
      throw new Error(err.detail || "Profiling failed");
    }
    return res.json();
  },
  validateData: async (file: File, targetTable: string, mapping: Record<string, string>) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("target_table", targetTable);
    formData.append("mapping_json", JSON.stringify(mapping));

    const res = await fetch(`${API_BASE}/api/data/validate`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Validation failed" }));
      throw new Error(err.detail || "Validation failed");
    }
    return res.json();
  },
  commitData: async (importId: string, importedBy: string) => {
    const formData = new FormData();
    formData.append("import_id", importId);
    formData.append("imported_by", importedBy);

    const res = await fetch(`${API_BASE}/api/data/commit`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Commit failed" }));
      throw new Error(err.detail || "Commit failed");
    }
    return res.json();
  },
  rollbackData: async (importId: string, rolledBackBy: string) => {
    const formData = new FormData();
    formData.append("import_id", importId);
    formData.append("rolled_back_by", rolledBackBy);

    const res = await fetch(`${API_BASE}/api/data/rollback`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Rollback failed" }));
      throw new Error(err.detail || "Rollback failed");
    }
    return res.json();
  },
  getSchemas: async () => {
    const res = await fetch(`${API_BASE}/api/data/schemas`);
    if (!res.ok) {
      throw new Error("Failed to fetch authoritative schemas");
    }
    return res.json();
  },
  getTemplateUrl: (table: string) => {
    return `${API_BASE}/api/data/templates/${table}`;
  },

  // Closed-Loop Supply Chain Intelligence APIs
  getCases: (status?: string, verificationStatus?: string) => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (verificationStatus) params.append("verification_status", verificationStatus);
    const q = params.toString() ? `?${params.toString()}` : "";
    return fetchJson<Case[]>(`/api/cases${q}`);
  },
  syncCases: () => fetchJson<{ synced: number; cases: Case[] }>("/api/cases/sync", { method: "POST" }),
  getCase: (id: string) => fetchJson<Case>(`/api/cases/${id}`),
  verifyCase: (id: string, verification_status: string, reason: string, verified_by: string) =>
    fetchJson<Case>(`/api/cases/${id}/verify`, {
      method: "POST",
      body: JSON.stringify({ verification_status, reason, verified_by }),
    }),
  investigateCase: (id: string) =>
    fetchJson<Case>(`/api/cases/${id}/investigate`, { method: "POST" }),
  outcomeCheckCase: (id: string, notes?: string) =>
    fetchJson<Case>(`/api/cases/${id}/outcome-check`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  closeCase: (id: string, reason: string, closed_by: string) =>
    fetchJson<Case>(`/api/cases/${id}/close`, {
      method: "POST",
      body: JSON.stringify({ reason, closed_by }),
    }),
  reopenCase: (id: string, reason: string) =>
    fetchJson<Case>(`/api/cases/${id}/reopen`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  getDemandForecast: (sku: string, horizonDays = 30) =>
    fetchJson<DemandForecast>(`/api/supply-chain/forecast/${sku}?horizon_days=${horizonDays}`),
  getShipments: (status?: string) => {
    const q = status ? `?status=${status}` : "";
    return fetchJson<Shipment[]>(`/api/supply-chain/shipments${q}`);
  },
  createShipment: (data: Partial<Shipment>) =>
    fetchJson<Shipment>("/api/supply-chain/shipments", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getTransfers: (status?: string) => {
    const q = status ? `?status=${status}` : "";
    return fetchJson<WarehouseTransfer[]>(`/api/supply-chain/transfers${q}`);
  },
  createTransfer: (data: Partial<WarehouseTransfer>) =>
    fetchJson<WarehouseTransfer>("/api/supply-chain/transfers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getAgentRuns: (params?: { limit?: number; offset?: number; status?: string; provider?: string; finding_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.append("limit", params.limit.toString());
    if (params?.offset) q.append("offset", params.offset.toString());
    if (params?.status) q.append("status", params.status);
    if (params?.provider) q.append("provider", params.provider);
    if (params?.finding_id) q.append("finding_id", params.finding_id);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return fetchJson<AgentRunSummary[]>(`/api/agent-monitor/runs${qs}`);
  },
  getAgentRunDetail: (runId: string) =>
    fetchJson<AgentRunDetail>(`/api/agent-monitor/runs/${runId}`),
  getAgentMonitorStats: () =>
    fetchJson<AgentMonitorStats>("/api/agent-monitor/stats"),

  // ---------------------------------------------------------------------------
  // Autonomous AI Calling Agent Endpoints
  // ---------------------------------------------------------------------------
  createComplaint: (data: {
    caller_name?: string;
    caller_phone?: string;
    caller_organization?: string;
    sku?: string;
    medicine_name?: string;
    batch?: string;
    complaint_category?: string;
    complaint_description: string;
    reported_quantity?: number;
    potential_harm?: boolean;
    potential_harm_details?: string;
  }) => fetchJson<any>("/api/calling/complaints", { method: "POST", body: JSON.stringify(data) }),

  getComplaints: (params?: { urgency?: string; verification?: string; sku?: string; batch?: string }) => {
    const q = new URLSearchParams();
    if (params?.urgency) q.append("urgency", params.urgency);
    if (params?.verification) q.append("verification", params.verification);
    if (params?.sku) q.append("sku", params.sku);
    if (params?.batch) q.append("batch", params.batch);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return fetchJson<any[]>(`/api/calling/complaints${qs}`);
  },

  getComplaintDetail: (id: string) => fetchJson<any>(`/api/calling/complaints/${id}`),

  linkComplaint: (id: string, target_incident_id: string) =>
    fetchJson<any>(`/api/calling/complaints/${id}/link`, {
      method: "POST",
      body: JSON.stringify({ target_incident_id }),
    }),

  escalateComplaint: (id: string) =>
    fetchJson<any>(`/api/calling/complaints/${id}/escalate`, { method: "POST" }),

  createCampaign: (data: { sku: string; batches: string[]; reason: string; owner_message: string }) =>
    fetchJson<any>("/api/calling/campaigns", { method: "POST", body: JSON.stringify(data) }),

  getCampaigns: () => fetchJson<any[]>("/api/calling/campaigns"),

  getCampaign: (id: string) => fetchJson<any>(`/api/calling/campaigns/${id}`),

  previewCampaign: (id: string) =>
    fetchJson<any>(`/api/calling/campaigns/${id}/preview`, { method: "POST" }),

  approveCampaign: (id: string, approved_by = "Authorized Quality Owner") =>
    fetchJson<any>(`/api/calling/campaigns/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approved_by }),
    }),

  startCampaign: (id: string) =>
    fetchJson<any>(`/api/calling/campaigns/${id}/start`, { method: "POST" }),

  pauseCampaign: (id: string) =>
    fetchJson<any>(`/api/calling/campaigns/${id}/pause`, { method: "POST" }),

  resumeCampaign: (id: string) =>
    fetchJson<any>(`/api/calling/campaigns/${id}/resume`, { method: "POST" }),

  cancelCampaign: (id: string) =>
    fetchJson<any>(`/api/calling/campaigns/${id}/cancel`, { method: "POST" }),

  getCampaignTasks: (id: string, status?: string) => {
    const q = status ? `?status=${status}` : "";
    return fetchJson<any[]>(`/api/calling/campaigns/${id}/tasks${q}`);
  },

  getCampaignReport: (id: string) =>
    fetchJson<any>(`/api/calling/campaigns/${id}/report`),

  simulateInboundTurn: (data: {
    call_id?: string;
    caller_message: string;
    caller_phone?: string;
    conversation_history?: Array<{ role: string; text: string }>;
  }) => fetchJson<any>("/api/calling/simulate/inbound", { method: "POST", body: JSON.stringify(data) }),

  simulateOutboundTurn: (data: { task_id: string; recipient_message: string }) =>
    fetchJson<any>("/api/calling/simulate/outbound", { method: "POST", body: JSON.stringify(data) }),

  getCallRecords: (params?: { direction?: string; campaign_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.direction) q.append("direction", params.direction);
    if (params?.campaign_id) q.append("campaign_id", params.campaign_id);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return fetchJson<any[]>(`/api/calling/records${qs}`);
  },

  getCallRecord: (id: string) => fetchJson<any>(`/api/calling/records/${id}`),

  getOwnerNotifications: (params?: { urgency?: string }) => {
    const q = params?.urgency ? `?urgency=${params.urgency}` : "";
    return fetchJson<any[]>(`/api/calling/notifications${q}`);
  },

  getLiveKitToken: (data: {
    room_name?: string;
    participant_identity?: string;
    participant_name?: string;
    mode?: string;
    metadata?: any;
  }) => fetchJson<any>("/api/calling/livekit/token", { method: "POST", body: JSON.stringify(data) }),

  sendLiveKitTurn: (data: {
    room_name: string;
    user_transcript: string;
    operating_mode?: string;
    session_history?: Array<{ role: string; text: string }>;
    task_id?: string;
    campaign_id?: string;
  }) => fetchJson<any>("/api/calling/livekit/agent-turn", { method: "POST", body: JSON.stringify(data) }),

  getLiveKitConfig: () => fetchJson<any>("/api/calling/livekit/config"),

  // ---------------------------------------------------------------------------
  // CYPHER 2026 Challenge 07 - B2231 Recall Demonstration
  // ---------------------------------------------------------------------------
  demoResetScenario: () => fetchJson<any>("/api/demo/reset-scenario", { method: "POST" }),
  demoTriggerRecall: (data?: any) => fetchJson<any>("/api/demo/trigger-recall", { method: "POST", body: JSON.stringify(data || {}) }),
  demoBlockBatch: (data?: any) => fetchJson<any>("/api/demo/block-batch", { method: "POST", body: JSON.stringify(data || {}) }),
  demoAttemptDispatch: (data: any) => fetchJson<any>("/api/demo/dispatches", { method: "POST", body: JSON.stringify(data) }),
  demoTraceRecipients: () => fetchJson<any>("/api/demo/trace-recipients"),
  demoGenerateCampaign: (data?: any) => fetchJson<any>("/api/demo/generate-campaign", { method: "POST", body: JSON.stringify(data || {}) }),
  demoApproveAndSend: (data?: any) => fetchJson<any>("/api/demo/approve-and-send", { method: "POST", body: JSON.stringify(data || {}) }),
  demoGetReplacementAnalysis: () => fetchJson<any>("/api/demo/replacement-analysis"),
  demoGetHospitalPrioritization: () => fetchJson<any>("/api/demo/hospital-prioritization"),
  demoDraftUrgentPO: (data?: any) => fetchJson<any>("/api/demo/draft-urgent-po", { method: "POST", body: JSON.stringify(data || {}) }),
  demoGetAuditVerification: () => fetchJson<any>("/api/demo/audit-verification"),
  demoRunAutonomousAgents: (data?: any) => fetchJson<any>("/api/demo/run-autonomous-agents", { method: "POST", body: JSON.stringify(data || {}) }),
  demoGetSampleExpiredCsv: () => fetchJson<any>("/api/demo/sample-expired-csv"),
  demoUploadExpiryDataset: async (fileOrData: File | { csv_text?: string; rows?: any[]; filename?: string }) => {
    if (typeof window !== "undefined" && fileOrData instanceof File) {
      const formData = new FormData();
      formData.append("file", fileOrData);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/demo/upload-expiry-dataset`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        let err = await res.text();
        try { err = JSON.parse(err).detail || err; } catch(_) {}
        throw new Error(err || "Failed to upload expiry dataset");
      }
      return res.json();
    }
    return fetchJson<any>("/api/demo/upload-expiry-dataset", {
      method: "POST",
      body: JSON.stringify(fileOrData),
    });
  },
  demoApproveExpiryAction: (data: any) => fetchJson<any>("/api/demo/approve-expiry-action", { method: "POST", body: JSON.stringify(data) }),
  demoGetPendingExpiryCases: () => fetchJson<{ count: number; cases: any[]; latest_case: any }>("/api/demo/pending-expiry-cases"),

  // ---------------------------------------------------------------------------
  // Email & SMS Complaints / Recall Notifications
  // ---------------------------------------------------------------------------
  createIncident: (data: any) => fetchJson<any>("/api/incidents", { method: "POST", body: JSON.stringify(data) }),
  listIncidents: (params?: any) => {
    const q = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") q.append(k, String(v)); });
    }
    const qs = q.toString() ? `?${q.toString()}` : "";
    return fetchJson<any>(`/api/incidents${qs}`);
  },
  getIncidentDetail: (id: string) => fetchJson<any>(`/api/incidents/${id}`),
  updateIncident: (id: string, data: any) => fetchJson<any>(`/api/incidents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  previewIncidentRecipients: (id: string) => fetchJson<any>(`/api/incidents/${id}/preview-recipients`, { method: "POST" }),
  createIncidentCampaign: (id: string, data?: any) => fetchJson<any>(`/api/incidents/${id}/campaigns`, { method: "POST", body: JSON.stringify(data || {}) }),
  listNotificationCampaigns: (params?: any) => {
    const q = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") q.append(k, String(v)); });
    }
    const qs = q.toString() ? `?${q.toString()}` : "";
    return fetchJson<any[]>(`/api/notifications/campaigns${qs}`);
  },
  getNotificationCampaignDetail: (id: string) => fetchJson<any>(`/api/notifications/campaigns/${id}`),
  approveNotificationCampaign: (id: string, data: any) => fetchJson<any>(`/api/notifications/campaigns/${id}/approve`, { method: "POST", body: JSON.stringify(data) }),
  rejectNotificationCampaign: (id: string, data: any) => fetchJson<any>(`/api/notifications/campaigns/${id}/reject`, { method: "POST", body: JSON.stringify(data) }),
  escalateNotificationCampaign: (id: string, data: any) => fetchJson<any>(`/api/notifications/campaigns/${id}/escalate`, { method: "POST", body: JSON.stringify(data) }),
  sendNotificationCampaign: (id: string, idempotencyKey?: string) => fetchJson<any>(`/api/notifications/campaigns/${id}/send`, {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  }),
  retryFailedNotificationCampaign: (id: string) => fetchJson<any>(`/api/notifications/campaigns/${id}/retry-failed`, { method: "POST" }),
  acknowledgeRecipient: (id: string, data: any) => fetchJson<any>(`/api/notifications/recipients/${id}/acknowledge`, { method: "POST", body: JSON.stringify(data) }),

  // ---------------------------------------------------------------------------
  // Purchase Orders & Supply Chain
  // ---------------------------------------------------------------------------
  listPurchaseOrders: (params?: { status?: string; sku?: string }) => {
    const q = new URLSearchParams();
    if (params?.status && params.status !== "all") q.append("status", params.status);
    if (params?.sku) q.append("sku", params.sku);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return fetchJson<{ total: number; drafts_count: number; purchase_orders: any[] }>(`/api/supply-chain/purchase-orders${qs}`);
  },
  createPurchaseOrder: (data: any) => fetchJson<any>("/api/supply-chain/purchase-orders", { method: "POST", body: JSON.stringify(data) }),
  approvePurchaseOrder: (po: string, approvedBy?: string) => {
    const qs = approvedBy ? `?approved_by=${encodeURIComponent(approvedBy)}` : "";
    return fetchJson<any>(`/api/supply-chain/purchase-orders/${po}/approve${qs}`, { method: "POST" });
  },

  // ---------------------------------------------------------------------------
  // 3-Day Automated Medicine Expiry Notifications
  // ---------------------------------------------------------------------------
  getExpirySchedule: () => fetchJson<any>("/api/inventory/expiry-schedule"),
  triggerExpiryNotification: () => fetchJson<any>("/api/inventory/expiry-schedule/trigger", { method: "POST" }),
  updateExpiryScheduleConfig: (data: { cadence_days?: number; admin_email?: string; admin_phone?: string; enabled?: boolean }) =>
    fetchJson<any>("/api/inventory/expiry-schedule/config", { method: "POST", body: JSON.stringify(data) }),
};


