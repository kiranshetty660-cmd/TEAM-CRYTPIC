"use client";

import React, { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Layers,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PlayCircle,
  RotateCcw,
} from "lucide-react";
import { api } from "../../lib/api";
import { LedgerEntry, AnchorItem, LedgerVerifyResult } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/Table";
import { Skeleton, ErrorState } from "../../components/ui/FeedbackStates";
import { useToast } from "../../components/ui/Toast";

export default function VerifyPage() {
  const { showToast } = useToast();

  const [verifyResult, setVerifyResult] = useState<LedgerVerifyResult | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [anchors, setAnchors] = useState<AnchorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [tampering, setTampering] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [anchoring, setAnchoring] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [vRes, lRes, aRes] = await Promise.all([
        api.verifyLedger(),
        api.getLedger(30, 0),
        api.getAnchors(),
      ]);
      setVerifyResult(vRes);
      setLedgerEntries(lRes);
      setAnchors(aRes);
    } catch (err: any) {
      showToast(err?.message || "Failed to load audit records", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRecomputeVerification = async () => {
    try {
      setVerifying(true);
      const res = await api.verifyLedger();
      setVerifyResult(res);
      if (res.ok) {
        showToast(`Verification passed: ${res.checked} entries checked and verified`, "success");
      } else {
        showToast(`Tampering detected at seq #${res.first_bad_seq}!`, "error");
      }
    } catch (err: any) {
      showToast(err?.message || "Verification failed", "error");
    } finally {
      setVerifying(false);
    }
  };

  const handleSimulateTamper = async () => {
    try {
      setTampering(true);
      const res = await api.simulateTamper(5);
      showToast(`Tampering simulated at seq #${res.tampered_seq}. Recomputing verification...`, "info");
      const vRes = await api.verifyLedger();
      setVerifyResult(vRes);
      const lRes = await api.getLedger(30, 0);
      setLedgerEntries(lRes);
    } catch (err: any) {
      showToast(err?.message || "Tamper simulation failed", "error");
    } finally {
      setTampering(false);
    }
  };

  const handleRestoreClean = async () => {
    try {
      setRestoring(true);
      await api.resetDatabase();
      showToast("Database restored to clean verified state", "success");
      await loadData();
    } catch (err: any) {
      showToast(err?.message || "Restore failed", "error");
    } finally {
      setRestoring(false);
    }
  };

  const handleManualAnchor = async () => {
    try {
      setAnchoring(true);
      const res = await api.triggerAnchor();
      showToast(`Merkle root anchored: ${res.merkle_root.slice(0, 16)}...`, "success");
      await loadData();
    } catch (err: any) {
      showToast(err?.message || "Anchor failed", "error");
    } finally {
      setAnchoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Verification Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
            <Lock className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Audit & Verification Ledger
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                Immutable Ledger
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Permanent, tamper-evident record of every medicine movement, recall decision, and human approval.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="danger"
            size="sm"
            onClick={handleSimulateTamper}
            isLoading={tampering}
            leftIcon={<PlayCircle className="w-4 h-4 text-white" />}
          >
            Simulate Tampering (Test)
          </Button>

          <Button
            variant="emerald"
            size="sm"
            onClick={handleRestoreClean}
            isLoading={restoring}
            leftIcon={<RotateCcw className="w-4 h-4 text-white" />}
          >
            Restore Clean State
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleRecomputeVerification}
            isLoading={verifying}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Verify Integrity
          </Button>
        </div>
      </div>

      {/* Verification Status Banner */}
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : verifyResult?.ok ? (
        <Card className="p-5 bg-emerald-50/70 border border-emerald-300 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  Cryptographic Chain Integrity Confirmed (100% Valid)
                </h3>
                <p className="text-xs text-emerald-800 mt-0.5">
                  All {verifyResult.checked} recorded events match their SHA-256 forward-link hash. No data has been modified or forged.
                </p>
              </div>
            </div>
            <Badge variant="success" size="lg">
              AUDIT PASSED
            </Badge>
          </div>
        </Card>
      ) : (
        <Card className="p-5 bg-rose-50 border-2 border-rose-300 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950">
                  Data Tampering Detected at Sequence #{verifyResult?.first_bad_seq}!
                </h3>
                <p className="text-xs text-rose-800 mt-0.5">
                  Hash pointer mismatch detected. A database record was altered outside the approved compliance workflow.
                </p>
              </div>
            </div>
            <Badge variant="danger" size="lg">
              TAMPER DETECTED
            </Badge>
          </div>

          {verifyResult?.diff && (
            <div className="p-3 rounded-lg bg-white border border-rose-200 text-xs font-mono text-rose-900 space-y-1">
              <div>Reason: {verifyResult.diff.reason}</div>
              <div>Corrupted Event: #{verifyResult.diff.seq}</div>
              {verifyResult.diff.expected_hash && (
                <div className="truncate">Expected Hash: {verifyResult.diff.expected_hash}</div>
              )}
              {verifyResult.diff.stored_hash && (
                <div className="truncate">Stored Altered Hash: {verifyResult.diff.stored_hash}</div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Merkle Root Anchors */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                External Blockchain Anchors (Polygon Testnet)
              </h2>
              <p className="text-xs text-slate-500">Periodic root hashes permanently stamped to an external ledger.</p>
            </div>
          </div>

          <Button
            variant="purple"
            size="sm"
            onClick={handleManualAnchor}
            isLoading={anchoring}
          >
            Create Anchor Snapshot
          </Button>
        </div>

        <Table>
          <TableHeader>
            <tr>
              <TableHead>Snapshot ID</TableHead>
              <TableHead>Network / Chain</TableHead>
              <TableHead>Ledger Range</TableHead>
              <TableHead>Merkle Root Hash</TableHead>
              <TableHead>Anchor Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {anchors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                  No external anchors created yet. Click "Create Anchor Snapshot" to create the first root.
                </TableCell>
              </TableRow>
            ) : (
              anchors.map((anc) => (
                <TableRow key={anc.id}>
                  <TableCell className="font-mono text-xs font-semibold text-slate-900">
                    ANCHOR-{anc.id}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 font-medium">
                    {anc.chain || "Polygon Amoy"}
                  </TableCell>
                  <TableCell className="text-xs font-medium text-slate-700">
                    Seq #{anc.from_seq} – #{anc.to_seq} ({Math.max(1, anc.to_seq - anc.from_seq + 1)} events)
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-teal-800">
                    {anc.merkle_root ? `${anc.merkle_root.slice(0, 24)}...` : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={anc.status === "confirmed" ? "success" : "neutral"} size="sm">
                        {anc.status.toUpperCase()}
                      </Badge>
                      {anc.tx_hash && (
                        <span className="font-mono text-[10px] text-slate-400 truncate max-w-[100px]" title={anc.tx_hash}>
                          {anc.tx_hash.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Raw Audit Ledger Event Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Recent Audit Log Entries (Last 30 Events)
              </h2>
              <p className="text-xs text-slate-500">Immutable SHA-256 forward-linked chain.</p>
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <tr>
              <TableHead>Sequence</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Current SHA-256 Hash</TableHead>
              <TableHead>Previous Hash Link</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {ledgerEntries.map((e) => {
              const type = e.event_type.toLowerCase();
              let badgeColor = "bg-slate-100 text-slate-700 border-slate-200";
              if (type.includes("recall")) badgeColor = "bg-rose-50 text-rose-700 border-rose-200";
              else if (type.includes("quarantine")) badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
              else if (type.includes("po") || type.includes("order")) badgeColor = "bg-indigo-50 text-indigo-700 border-indigo-200";
              else if (type.includes("anchor") || type.includes("merkle")) badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
              else if (type.includes("verify") || type.includes("stock") || type.includes("batch")) badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";

              return (
                <TableRow key={e.seq}>
                  <TableCell className="font-mono font-bold text-slate-900">
                    #{e.seq}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${badgeColor}`}>
                      {e.event_type.replace(/_/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {e.ts ? new Date(e.ts).toLocaleTimeString() : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-700">
                    {(e.curr_hash || e.hash) ? `${(e.curr_hash || e.hash).slice(0, 18)}...` : "Genesis"}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-400">
                    {e.prev_hash ? `${e.prev_hash.slice(0, 18)}...` : "0000000000000000"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
