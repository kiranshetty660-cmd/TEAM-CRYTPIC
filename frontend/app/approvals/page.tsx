"use client";

import React, { useEffect, useState } from "react";
import {
  CheckSquare,
  ShieldCheck,
  UserCheck,
  Clock,
  CheckCircle2,
  XCircle,
  FileCheck2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { api } from "../../lib/api";
import { ActionItem } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Skeleton, ErrorState, EmptyState } from "../../components/ui/FeedbackStates";
import { useUser } from "../../lib/UserContext";
import { useToast } from "../../components/ui/Toast";

export default function ApprovalsPage() {
  const { currentUser, users, setCurrentUser } = useUser();
  const { showToast } = useToast();

  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("pending_approval");

  // Approval / Rejection Modal
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const [actionTypeDecision, setActionTypeDecision] = useState<"approve" | "reject">("approve");
  const [reasonText, setReasonText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadActions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getActions(statusFilter === "all" ? undefined : statusFilter);
      setActions(res);
    } catch (err: any) {
      setError(err.message || "Failed to load actions queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActions();
  }, [statusFilter]);

  const handleDecisionSubmit = async () => {
    if (!selectedAction) return;
    setSubmitting(true);
    try {
      if (actionTypeDecision === "approve") {
        await api.approveAction(
          selectedAction.id,
          currentUser.role,
          currentUser.name,
          reasonText || `Authorized by ${currentUser.name} (${currentUser.roleTitle})`
        );
        showToast(`Action ${selectedAction.id} authorized & executed to ledger`, "success");
      } else {
        if (!reasonText.trim()) {
          showToast("A rejection reason is required (at least 5 characters)", "error");
          setSubmitting(false);
          return;
        }
        await api.rejectAction(selectedAction.id, currentUser.role, currentUser.name, reasonText);
        showToast(`Action ${selectedAction.id} rejected and logged to audit ledger`, "info");
      }
      setSelectedAction(null);
      setReasonText("");
      await loadActions();
    } catch (err: any) {
      showToast(err.message || "Decision submission failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const isRoleAuthorized = (action: ActionItem) => {
    if (currentUser.role === "compliance") return true;
    return currentUser.role === action.required_role;
  };

  return (
    <div className="space-y-6">
      {/* Role Switcher Banner */}
      <Card className="p-4 bg-slate-900 border-blue-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${currentUser.avatar}`}>
            {currentUser.initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{currentUser.name}</span>
              <Badge variant="info" size="sm">
                ROLE: {currentUser.role.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{currentUser.roleTitle}</p>
          </div>
        </div>

        {/* Quick Role Switch Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs text-slate-400 mr-2 shrink-0">Switch Persona:</span>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => setCurrentUser(u)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition shrink-0 min-h-[38px] ${
                currentUser.id === u.id
                  ? "bg-blue-600 text-white font-bold"
                  : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
              }`}
            >
              {u.role.toUpperCase()}
            </button>
          ))}
        </div>
      </Card>

      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Human-in-the-Loop Approvals Queue
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Zero actions execute autonomously. Pharmacists and compliance officers retain exclusive authorization authority.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {[
            { id: "pending_approval", label: "Pending Approval" },
            { id: "executed", label: "Executed" },
            { id: "rejected", label: "Rejected" },
            { id: "all", label: "All History" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition min-h-[36px] ${
                statusFilter === tab.id
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Items List */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadActions} />
      ) : actions.length === 0 ? (
        <EmptyState
          title={`No ${statusFilter.replace("_", " ")} actions`}
          description="The compliance queue is clear. Run a scan to discover any new operational risks."
        />
      ) : (
        <div className="space-y-4">
          {actions.map((action) => {
            const authorized = isRoleAuthorized(action);
            return (
              <Card
                key={action.id}
                className="p-5 bg-slate-900 border-slate-800 hover:border-slate-700 transition space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          action.status === "executed"
                            ? "success"
                            : action.status === "rejected"
                            ? "danger"
                            : "warning"
                        }
                        size="sm"
                      >
                        {action.status.toUpperCase()}
                      </Badge>
                      <span className="font-mono text-xs text-slate-400">{action.id}</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-slate-400">
                        {new Date(action.created_at).toLocaleString()}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white tracking-tight mt-1">
                      {action.type.replace(/_/g, " ")}: {action.payload?.entities?.brand || action.payload?.entities?.sku || "Operational Mitigation"}
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {action.payload?.rationale}
                    </p>
                  </div>

                  {/* Role Gate & Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Required Role</span>
                      <Badge variant="purple" size="sm">
                        {action.required_role.toUpperCase()}
                      </Badge>
                    </div>

                    {action.status === "pending_approval" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setSelectedAction(action);
                            setActionTypeDecision("reject");
                          }}
                        >
                          Reject
                        </Button>
                        <Button
                          variant="emerald"
                          size="sm"
                          onClick={() => {
                            setSelectedAction(action);
                            setActionTypeDecision("approve");
                          }}
                          disabled={!authorized}
                        >
                          Authorize
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Decision Stamp if Resolved */}
                {action.decided_by && (
                  <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500">Decided by: </span>
                      <span className="font-semibold text-slate-300">{action.decided_by}</span>
                      {action.reason && <span className="text-slate-400 italic"> — "{action.reason}"</span>}
                    </div>
                    {action.decided_at && (
                      <span>{new Date(action.decided_at).toLocaleString()}</span>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Decision Modal */}
      {selectedAction && (
        <Modal
          isOpen={!!selectedAction}
          onClose={() => setSelectedAction(null)}
          title={
            actionTypeDecision === "approve"
              ? `Authorize ${selectedAction.type}`
              : `Reject ${selectedAction.type}`
          }
          description={`Signing as: ${currentUser.name} (${currentUser.roleTitle})`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setSelectedAction(null)}>
                Cancel
              </Button>
              <Button
                variant={actionTypeDecision === "approve" ? "emerald" : "danger"}
                onClick={handleDecisionSubmit}
                isLoading={submitting}
              >
                {actionTypeDecision === "approve" ? "Confirm & Commit to Ledger" : "Reject & Record Reason"}
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-sm text-slate-300">
            {actionTypeDecision === "approve" ? (
              <div className="space-y-3">
                <p>
                  You are about to authorize action <strong>{selectedAction.id}</strong>.
                </p>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
                  <div>Type: {selectedAction.type}</div>
                  <div>Chosen Strategy: {selectedAction.chosen_option}</div>
                  <div>Gated Role: {selectedAction.required_role}</div>
                </div>
                <p className="text-xs text-slate-400">
                  This execution commits directly into the tamper-evident SHA-256 hash-chained ledger and triggers simulated ERP inventory updates.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p>Please enter a compliance reason for rejecting this drafted action:</p>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="State clinical or operational justification (e.g. alternate supplier confirmed)..."
                  rows={4}
                  className="w-full p-3 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
