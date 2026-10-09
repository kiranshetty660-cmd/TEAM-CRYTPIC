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
        showToast(`Action ${finding.action_id} authorized and executed into audit ledger`, "success");
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
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Compliance Board
        </Link>

        <button
          onClick={() => setExplainOpen(!explainOpen)}
          className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 font-medium min-h-[38px]"
        >
          <HelpCircle className="w-4 h-4" />
          Why this finding? (Explain Panel)
        </button>
      </div>

      {/* Header Banner */}
      <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-4">
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
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{finding.title}</h1>
            <p className="text-xs text-slate-600 leading-relaxed">{finding.description}</p>
          </div>

          {finding.deadline && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs shrink-0 flex items-center gap-1.5 font-medium">
              <Clock className="w-4 h-4" />
              <span>Target Deadline: {new Date(finding.deadline).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Deterministic Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          {Object.entries(finding.metrics).map(([key, val]) => (
            <div key={key} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{key.replace(/_/g, " ")}</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {typeof val === "number" ? val.toLocaleString() : String(val)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Explain Panel (Collapsible) */}
      {explainOpen && finding.explanation && (
        <Card className="p-5 border-blue-200 bg-blue-50/50 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase tracking-wider">
            <HelpCircle className="w-4 h-4" />
            Decision Engine Explanation & Mathematical Lineage
          </div>
          <div className="text-xs text-slate-800 font-mono bg-white p-3 rounded-lg border border-blue-200">
            Formula: {finding.explanation.formula}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(finding.explanation.sub_scores).map(([k, v]) => (
              <div key={k} className="p-2.5 rounded bg-white border border-slate-200 text-slate-700">
                <span className="text-slate-500 capitalize">{k}: </span>
                <span className="font-bold text-slate-900">{v} / 100</span>
              </div>
            ))}
          </div>
          {finding.source_rows && finding.source_rows.length > 0 && (
            <div className="text-[11px] text-slate-600 pt-1 font-mono">
              <strong className="text-slate-800">Source Records: </strong>
              {JSON.stringify(finding.source_rows)}
            </div>
          )}
        </Card>
      )}

      {/* Options Comparator Matrix */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-600" />
          Deterministic Options Comparison Matrix
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate Strategy</TableHead>
              <TableHead>Operational Details</TableHead>
              <TableHead>Computed Trade-offs</TableHead>
              <TableHead>Projected Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {finding.options.map((opt) => {
              const isRecommended = finding.recommended_action?.chosen_option === opt.id;
              return (
                <TableRow key={opt.id} className={isRecommended ? "bg-blue-50/60 border-l-4 border-blue-600" : ""}>
                  <TableCell className="font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      {opt.name}
                      {isRecommended && (
                        <Badge variant="info" size="sm">
                          CHOSEN
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{opt.description}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-800">
                    {Object.entries(opt.metrics).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-slate-500">{k}: </span>
                        <span className="font-semibold">{String(v)}</span>
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{opt.projected_outcome}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Agent Step Trace */}
      {finding.agent_trace && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            Agentic Execution Trace (Observe → Reason → Evaluate → Decide → Act → Explain)
          </h2>
          <div className="space-y-2.5">
            {finding.agent_trace.map((step) => (
              <Card key={step.step} className="p-4 bg-white border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-[11px]">
                      {step.step}
                    </span>
                    <span className="font-bold text-slate-900">{step.phase}:</span>
                    <span className="text-slate-600">{step.action}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono text-slate-800 overflow-x-auto text-[11px]">
                  <span className="text-slate-500 font-semibold">Output: </span>
                  {typeof step.output === "object" ? JSON.stringify(step.output) : String(step.output)}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Action Approval Card */}
      {finding.recommended_action && (
        <Card className="p-6 bg-white border-slate-200 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-slate-800" />
                <h3 className="text-base font-bold text-slate-900">
                  Draft Action: {finding.recommended_action.type} ({finding.action_id})
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Required Role Gate:{" "}
                <span className="text-slate-900 font-bold uppercase">{finding.recommended_action.required_role}</span>
              </p>
            </div>

            <div className="flex items-center gap-2.5">
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
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>
                Your current role is <strong className="uppercase">{currentUser.role}</strong>. Approving this action requires{" "}
                <strong className="uppercase">{requiredRole}</strong> or <strong>COMPLIANCE</strong>. Switch persona via the top navigation bar.
              </span>
            </div>
          )}

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div>
              <span className="font-semibold text-slate-900">Agent Rationale: </span>
              <span className="text-slate-700">{finding.recommended_action.rationale}</span>
            </div>
            {finding.recommended_action.assumptions && finding.recommended_action.assumptions.length > 0 && (
              <div>
                <span className="font-semibold text-slate-800">Explicit Assumptions: </span>
                <ul className="list-disc list-inside text-slate-600 mt-1 space-y-0.5">
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
        title={decisionType === "approve" ? "Authorize Compliance Action" : "Reject Compliance Action"}
        description={`Signing Persona: ${currentUser.name} (${currentUser.roleTitle})`}
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
        <div className="space-y-4 text-xs text-slate-700">
          {decisionType === "approve" ? (
            <div className="space-y-3">
              <p>
                You are about to authorize <strong>{finding.recommended_action?.type}</strong> for Action{" "}
                <code className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-bold">{finding.action_id}</code>.
              </p>
              <p className="text-slate-500">
                This execution updates inventory status and commits an <code>ACTION_APPROVED</code> event to the SHA-256 hash-chained ledger.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-semibold text-slate-900">Document the compliance reason for rejecting this drafted action:</p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="State clinical or operational justification (e.g. alternate stock identified)..."
                rows={4}
                className="w-full p-3 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
