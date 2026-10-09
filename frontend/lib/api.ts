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
};
