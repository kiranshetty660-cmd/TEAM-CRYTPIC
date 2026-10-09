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
      showToast(err.message || "Failed to load ledger records", "error");
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
        showToast(`Cryptographic verification passed: ${res.checked} entries verified`, "success");
      } else {
        showToast(`Tampering detected at seq #${res.first_bad_seq}!`, "error");
      }
    } catch (err: any) {
      showToast(err.message || "Verification failed", "error");
    } finally {
      setVerifying(false);
    }
  };

  const handleSimulateTamper = async () => {
    try {
      setTampering(true);
      const res = await api.simulateTamper(5);
      showToast(`Tampering simulated at seq #${res.tampered_seq}. Recomputing verification...`, "info");
      // Re-verify immediately to show red state
      const vRes = await api.verifyLedger();
      setVerifyResult(vRes);
      const lRes = await api.getLedger(30, 0);
      setLedgerEntries(lRes);
    } catch (err: any) {
      showToast(err.message || "Tamper simulation failed", "error");
    } finally {
      setTampering(false);
    }
  };

  const handleRestoreClean = async () => {
    try {
      setRestoring(true);
      await api.resetDatabase();
      showToast("Database restored to clean deterministic seed", "success");
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Restore failed", "error");
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
      showToast(err.message || "Anchor failed", "error");
    } finally {
      setAnchoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Verification Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Tamper-Evident Audit Ledger & EVM Anchors
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Every state change is strictly hash-chained via SHA-256 with periodic Merkle root anchoring to Polygon Amoy testnet.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="danger"
            size="sm"
            onClick={handleSimulateTamper}
            isLoading={tampering}
            leftIcon={<PlayCircle className="w-4 h-4 text-red-200" />}
          >
            Simulate Tampering (Demo)
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRestoreClean}
            isLoading={restoring}
            leftIcon={<RotateCcw className="w-4 h-4" />}
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
            Recompute Chain
          </Button>
        </div>
      </div>

      {/* Verification Status Banner */}
      {loading ? (
        <Skeleton className="h-28 w-full" />
      ) : verifyResult?.ok ? (
        <Card className="p-5 bg-emerald-950/20 border-emerald-500/40 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-emerald-300">
                  Cryptographic Chain Integrity Confirmed (100% Valid)
                </h3>
                <p className="text-xs text-slate-300">
                  All {verifyResult.checked} consecutive events pass SHA-256 forward-link validation from Genesis block.
                </p>
              </div>
            </div>
            <Badge variant="success" size="lg">
              AUDIT PASS
            </Badge>
          </div>
        </Card>
      ) : (
        <Card className="p-5 bg-red-950/30 border-red-500/60 space-y-3 animate-in shake duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-red-300">
                  Database Tampering Detected at Sequence #{verifyResult?.first_bad_seq}!
                </h3>
                <p className="text-xs text-slate-300">
                  Hash pointer mismatch detected. The event payload or hash was maliciously altered outside the protocol.
                </p>
              </div>
            </div>
            <Badge variant="danger" size="lg">
              TAMPER DETECTED
            </Badge>
          </div>

          {verifyResult?.diff && (
            <div className="p-3 rounded-lg bg-slate-950 border border-red-900/60 text-xs font-mono text-red-300">
              <div>Reason: {verifyResult.diff.reason}</div>
              <div>Corrupted Sequence: #{verifyResult.diff.seq}</div>
              {verifyResult.diff.expected_hash && (
                <div>Expected Hash: {verifyResult.diff.expected_hash}</div>
              )}
              {verifyResult.diff.stored_hash && (
                <div>Stored Tampered Hash: {verifyResult.diff.stored_hash}</div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Merkle Root Anchors to EVM */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-purple-400" />
            EVM Blockchain Anchors (Polygon Amoy / Fallback)
          </h2>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualAnchor}
            isLoading={anchoring}
          >
            Trigger New Anchor
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Anchor ID</TableHead>
              <TableHead>Ledger Range</TableHead>
              <TableHead>Merkle Root Hash</TableHead>
              <TableHead>Target Chain</TableHead>
              <TableHead>Transaction Hash</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {anchors.length === 0 ? (
              <TableRow>
                <TableCell className="text-slate-500 italic" colSpan={6}>
                  No anchors committed yet. Click 'Trigger New Anchor' above.
                </TableCell>
              </TableRow>
            ) : (
              anchors.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono font-bold text-white">#{a.id}</TableCell>
                  <TableCell className="text-xs text-slate-300">
                    Seq {a.from_seq} → {a.to_seq}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-blue-300 truncate max-w-xs">
                    {a.merkle_root}
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.chain === "amoy" ? "purple" : "neutral"} size="sm">
                      {a.chain === "amoy" ? "POLYGON AMOY" : "SIMULATED ANCHOR"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-400 truncate max-w-xs">
                    {a.tx_hash}
                  </TableCell>
                  <TableCell>
                    <Badge variant="success" size="sm">
                      {a.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Live Hash-Chained Audit Ledger Explorer */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-400" />
          Sequential Audit Ledger Stream (Latest Events)
        </h2>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seq</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Canonical Payload</TableHead>
              <TableHead>Previous Hash</TableHead>
              <TableHead>Current Event Hash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledgerEntries.map((e) => (
              <TableRow key={e.seq}>
                <TableCell className="font-mono font-bold text-blue-400">#{e.seq}</TableCell>
                <TableCell className="text-xs text-slate-400">{new Date(e.ts).toLocaleTimeString()}</TableCell>
                <TableCell>
                  <Badge variant="info" size="sm">
                    {e.event_type}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-300 max-w-md truncate">
                  {JSON.stringify(e.payload)}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-slate-500 truncate max-w-[120px]">
                  {e.prev_hash}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-emerald-400 truncate max-w-[120px]">
                  {e.hash}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
