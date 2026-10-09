import {
  BoardResponse,
  Finding,
  BatchTraceResponse,
  ActionItem,
  LedgerEntry,
  AnchorItem,
  LedgerVerifyResult,
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
};
