"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Sparkles,
  Layers,
  FileCheck2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  CheckCircle,
  Info,
} from "lucide-react";
import { api } from "../../../lib/api";
import { Finding } from "../../../lib/types";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { Modal } from "../../../components/ui/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/Table";
import { Skeleton, ErrorState } from "../../../components/ui/FeedbackStates";
import { useUser } from "../../../lib/UserContext";
import { useToast } from "../../../components/ui/Toast";

export default function FindingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useUser();
  const { showToast } = useToast();

  const findingId = params.id as string;
  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decision Modal State
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<"approve" | "reject">("approve");
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);

  useEffect(() => {
    async function loadFinding() {
      try {
        setLoading(true);
        const res = await api.getFinding(findingId);
        setFinding(res);
      } catch (err: any) {
        setError(err.message || "Failed to load finding details");
      } finally {
        setLoading(false);
      }
    }
    loadFinding();
  }, [findingId]);

  const handleDecision = async () => {
    if (!finding?.action_id) return;
    setSubmitting(true);
    try {
      if (decisionType === "approve") {
        await api.approveAction(
          finding.action_id,
          currentUser.role,
          currentUser.name,
          `Approved by ${currentUser.name} (${currentUser.roleTitle})`
        );
        showToast(`Action ${finding.action_id} approved and executed into tamper-evident ledger`, "success");
      } else {
        if (!rejectionReason.trim()) {
          showToast("A rejection reason is required", "error");
          setSubmitting(false);
          return;
        }
        await api.rejectAction(finding.action_id, currentUser.role, currentUser.name, rejectionReason);
        showToast(`Action ${finding.action_id} rejected and logged to ledger`, "info");
      }
      setDecisionModalOpen(false);
      router.push("/approvals");
    } catch (err: any) {
      showToast(err.message || "Decision submission failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (error || !finding) {
    return <ErrorState message={error || "Finding not found"} />;
  }

  // Check role authorization for this action
  const requiredRole = finding.recommended_action?.required_role;
  const isAuthorizedRole =
    currentUser.role === "compliance" ||
    (requiredRole && currentUser.role === requiredRole);

  return (
    <div className="space-y-6">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Compliance Board
        </Link>

        <button
          onClick={() => setExplainOpen(!explainOpen)}
          className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 min-h-[38px]"
        >
          <HelpCircle className="w-4 h-4" />
          Why this finding? (Explain Panel)
        </button>
      </div>

      {/* Header Banner */}
      <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="purple" size="sm">
                {finding.type.toUpperCase()} ALERT
              </Badge>
              <Badge variant={finding.severity >= 90 ? "danger" : "warning"} size="sm">
                Severity Score: {finding.severity}
              </Badge>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">{finding.title}</h1>
            <p className="text-sm text-slate-300">{finding.description}</p>
          </div>

          {finding.deadline && (
            <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs shrink-0 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Statutory Deadline: {new Date(finding.deadline).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Deterministic Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800">
          {Object.entries(finding.metrics).map(([key, val]) => (
            <div key={key} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">{key.replace(/_/g, " ")}</div>
              <div className="text-base font-semibold text-slate-100 mt-1">
                {typeof val === "number" ? val.toLocaleString() : String(val)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Explain Panel (Collapsible) */}
      {explainOpen && finding.explanation && (
        <Card className="p-5 border-blue-500/30 bg-blue-950/20 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
            <HelpCircle className="w-4 h-4" />
            Decision Engine Explanation & Formula Lineage
          </div>
          <div className="text-xs text-slate-300 font-mono bg-slate-950/80 p-3 rounded-lg border border-slate-800">
            Formula: {finding.explanation.formula}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(finding.explanation.sub_scores).map(([k, v]) => (
              <div key={k} className="p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                <span className="text-slate-400 capitalize">{k}: </span>
                <span className="font-bold text-white">{v} / 100</span>
              </div>
            ))}
          </div>
          {finding.source_rows && finding.source_rows.length > 0 && (
            <div className="text-xs text-slate-400 pt-2">
              <span className="font-semibold text-slate-300">Source Database Records: </span>
              {JSON.stringify(finding.source_rows)}
            </div>
          )}
        </Card>
      )}

      {/* Options Comparator Matrix */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-400" />
          Deterministic Options Comparison Matrix
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate Strategy</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Key Computed Trade-offs</TableHead>
              <TableHead>Projected Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {finding.options.map((opt) => {
              const isRecommended = finding.recommended_action?.chosen_option === opt.id;
              return (
                <TableRow key={opt.id} className={isRecommended ? "bg-blue-950/30 border-l-4 border-blue-500" : ""}>
                  <TableCell className="font-semibold text-slate-100">
                    <div className="flex items-center gap-2">
                      {opt.name}
                      {isRecommended && (
                        <Badge variant="info" size="sm">
                          CHOSEN DRAFT
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-300">{opt.description}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-300">
                    {Object.entries(opt.metrics).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-slate-500">{k}: </span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">{opt.projected_outcome}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Agent Step Trace */}
      {finding.agent_trace && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Agentic Execution Trace (Observe → Reason → Evaluate → Decide → Act → Explain)
          </h2>
          <div className="space-y-2.5">
            {finding.agent_trace.map((step) => (
              <Card key={step.step} className="p-4 bg-slate-900/60 border-slate-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold">
                      {step.step}
                    </span>
                    <span className="font-semibold text-slate-200">{step.phase}:</span>
                    <span className="text-slate-400">{step.action}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 font-mono text-slate-300 overflow-x-auto">
                  <span className="text-slate-500">Result: </span>
                  {typeof step.output === "object" ? JSON.stringify(step.output) : String(step.output)}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Action Approval Card */}
      {finding.recommended_action && (
        <Card className="p-6 bg-slate-900 border-blue-500/30 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">
                  Drafted Action: {finding.recommended_action.type} ({finding.action_id})
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Required Authorization Role:{" "}
                <span className="text-blue-400 font-semibold uppercase">{finding.recommended_action.required_role}</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="danger"
                size="md"
                onClick={() => {
                  setDecisionType("reject");
                  setDecisionModalOpen(true);
                }}
              >
                Reject Action
              </Button>

              <Button
                variant="emerald"
                size="md"
                onClick={() => {
                  setDecisionType("approve");
                  setDecisionModalOpen(true);
                }}
                disabled={!isAuthorizedRole}
              >
                Authorize & Execute
              </Button>
            </div>
          </div>

          {!isAuthorizedRole && (
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>
                Your current role is <strong className="uppercase">{currentUser.role}</strong>. Approving this action requires{" "}
                <strong className="uppercase">{requiredRole}</strong> or <strong>COMPLIANCE</strong>. Use the Role Switcher in the top navigation bar to test this gate.
              </span>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-2">
            <div>
              <span className="font-semibold text-slate-300">Agent Rationale: </span>
              <span className="text-slate-300">{finding.recommended_action.rationale}</span>
            </div>
            {finding.recommended_action.assumptions && finding.recommended_action.assumptions.length > 0 && (
              <div>
                <span className="font-semibold text-slate-400">Explicit Assumptions: </span>
                <ul className="list-disc list-inside text-slate-400 mt-1 space-y-0.5">
                  {finding.recommended_action.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Decision Confirmation Modal */}
      <Modal
        isOpen={decisionModalOpen}
        onClose={() => setDecisionModalOpen(false)}
        title={decisionType === "approve" ? "Authorize Gated Compliance Action" : "Reject Compliance Action"}
        description={`Active Persona: ${currentUser.name} (${currentUser.roleTitle})`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecisionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={decisionType === "approve" ? "emerald" : "danger"}
              onClick={handleDecision}
              isLoading={submitting}
            >
              {decisionType === "approve" ? "Confirm & Commit to Ledger" : "Reject & Record Reason"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-slate-300">
          {decisionType === "approve" ? (
            <div className="space-y-3">
              <p>
                You are about to authorize <strong>{finding.recommended_action?.type}</strong> for Action{" "}
                <code>{finding.action_id}</code>.
              </p>
              <p className="text-xs text-slate-400">
                This execution will update ERP inventory state and write a tamper-evident event{" "}
                <code>ACTION_APPROVED</code> to the SHA-256 hash-chained ledger.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p>Please document the formal compliance reason for rejecting this drafted action:</p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Document reason for rejection (e.g. batch released under secondary QA variance protocol)..."
                rows={4}
                className="w-full p-3 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
