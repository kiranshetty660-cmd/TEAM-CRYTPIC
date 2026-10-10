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
  ArrowRight,
  ShieldAlert,
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

  // Pending Expired Medicine Case
  const [pendingExpiryCase, setPendingExpiryCase] = useState<any | null>(null);
  const [approvingExpiry, setApprovingExpiry] = useState(false);

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
      setError(err?.message || "Failed to load approvals queue");
    } finally {
      setLoading(false);
    }
  };

  const checkPendingExpiryCase = async () => {
    try {
      const res = await api.demoGetPendingExpiryCases();
      if (res.latest_case) {
        setPendingExpiryCase(res.latest_case);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadActions();
    checkPendingExpiryCase();
  }, [statusFilter]);

  const handleApproveExpiryCase = async (caseId: string) => {
    try {
      setApprovingExpiry(true);
      await api.demoApproveExpiryAction({
        case_id: caseId,
        approver_name: currentUser.name || "Chethan (Admin / Warehouse Owner)",
        approver_role: currentUser.roleTitle || "Warehouse Owner & Quality Director",
        notes: "Approved emergency quarantine of expired medicine dataset. Dispatched live email/sms notices and drafted replacement PO.",
      });
      showToast("Quarantine executed! Live Email dispatched to chethuc809@gmail.com and SMS to +917996662516.", "success");
      setPendingExpiryCase(null);
      await loadActions();
    } catch (err: any) {
      showToast(err.message || "Approval execution failed", "error");
    } finally {
      setApprovingExpiry(false);
    }
  };

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
        showToast(`Action ${selectedAction.id} authorized & executed to audit ledger`, "success");
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
      showToast(err?.message || "Decision submission failed", "error");
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
      <Card className="p-4 bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${currentUser.avatar}`}>
            {currentUser.initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{currentUser.name}</span>
              <Badge variant="teal" size="sm">
                ROLE: {currentUser.role.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{currentUser.roleTitle}</p>
          </div>
        </div>

        {/* Quick Role Switch Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs text-slate-500 mr-2 shrink-0 font-medium">Switch Role:</span>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => setCurrentUser(u)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 min-h-[36px] ${
                currentUser.id === u.id
                  ? "bg-teal-700 text-white font-bold shadow-xs"
                  : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {u.role.toUpperCase()}
            </button>
          ))}
        </div>
      </Card>

      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
            <CheckSquare className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Action Approvals
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                Human Governance
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Review and sign off on proposed actions before they are executed. No medicine is moved or recalled without human authorization.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
          {[
            { id: "pending_approval", label: "Waiting for Approval" },
            { id: "executed", label: "Approved & Executed" },
            { id: "rejected", label: "Rejected" },
            { id: "all", label: "All History" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition min-h-[34px] ${
                statusFilter === tab.id
                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* PENDING EXPIRY CASE APPROVAL CARD */}
      {pendingExpiryCase && pendingExpiryCase.status === "pending_owner_approval" && (statusFilter === "pending_approval" || statusFilter === "all") && (
        <Card className="p-6 bg-rose-50/70 border-2 border-rose-300 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-rose-200 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Critical Quality Governance</span>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-bold">{pendingExpiryCase.case_id}</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  Quarantine Authorization: {pendingExpiryCase.expired_batches?.length || 0} Expired Batches in Uploaded Dataset
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="danger" size="md">
                SCHEDULE M COMPLIANCE MANDATE
              </Badge>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-rose-200 text-xs space-y-2">
            <div className="font-bold text-rose-950">Autonomous Agent Investigation Summary:</div>
            <p className="text-slate-700 leading-relaxed">
              {pendingExpiryCase.review_message?.problem_summary ||
                `10 specialized agents completed evaluation of dataset '${pendingExpiryCase.filename}'. Found ${pendingExpiryCase.expired_batches?.length || 0} expired batches totaling ${pendingExpiryCase.total_expired_units || 0} units. Immediate warehouse quarantine and owner notification are required.`}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-[11px] text-slate-600 border-t border-slate-100">
              <div>Owner Target Email: <strong className="font-mono text-slate-900">chethuc809@gmail.com</strong></div>
              <div>Owner Target Phone: <strong className="font-mono text-slate-900">+917996662516</strong></div>
            </div>
          </div>

          {/* Expired items preview table */}
          {pendingExpiryCase.expired_batches?.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-40 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Batch</th>
                    <th className="p-2.5">Medicine</th>
                    <th className="p-2.5">Warehouse</th>
                    <th className="p-2.5 text-right">Units</th>
                    <th className="p-2.5 text-rose-700">Days Expired</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {pendingExpiryCase.expired_batches.map((b: any, idx: number) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-bold text-slate-900">{b.batch}</td>
                      <td className="p-2.5 font-sans text-slate-800">{b.medicine_name || b.sku}</td>
                      <td className="p-2.5 text-slate-600">{b.warehouse || "WH-1"}</td>
                      <td className="p-2.5 text-right font-bold text-slate-900">{b.qty}</td>
                      <td className="p-2.5 font-bold text-rose-700">{b.days_expired ? `${b.days_expired} days ago` : "Expired"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500">
              Approving locks warehouse stock with HTTP 400 dispatch blocker, sends live Email &amp; SMS alerts, and drafts replacement PO.
            </div>

            <Button
              variant="danger"
              size="md"
              onClick={() => handleApproveExpiryCase(pendingExpiryCase.case_id)}
              isLoading={approvingExpiry}
              leftIcon={<ShieldAlert className="w-4 h-4" />}
            >
              Approve Quarantine &amp; Alert Owner (Email + SMS)
            </Button>
          </div>
        </Card>
      )}

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
          title={`No ${statusFilter.replace("_", " ")} items`}
          message="The approval queue is clear. All actions have been processed or no new risks require sign-off."
        />
      ) : (
        <div className="space-y-4">
          {actions.map((action) => {
            const authorized = isRoleAuthorized(action);
            return (
              <Card
                key={action.id}
                className="p-5 bg-white border border-slate-200 hover:border-slate-300 shadow-xs transition space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
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
                        {action.status === "pending_approval" ? "WAITING FOR APPROVAL" : action.status.toUpperCase()}
                      </Badge>
                      <span className="font-mono text-xs text-slate-500 font-bold">{action.id}</span>
                      <span className="text-xs text-slate-300">•</span>
                      <span className="text-xs text-slate-500">
                        {new Date(action.created_at).toLocaleString()}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 tracking-tight mt-1">
                      {action.type.replace(/_/g, " ")}: {action.payload?.entities?.brand || action.payload?.entities?.sku || "Operational Action"}
                    </h3>

                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {action.payload?.rationale}
                    </p>

                    {/* Simple English Impact breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wide">
                          Why is this proposed?
                        </span>
                        <p className="text-slate-600 mt-0.5">
                          Triggered by risk scan findings to prevent non-compliant stock distribution.
                        </p>
                      </div>

                      <div className="p-3 bg-teal-50/50 rounded-lg border border-teal-100">
                        <span className="font-bold text-teal-800 block text-[11px] uppercase tracking-wide">
                          Expected result
                        </span>
                        <p className="text-teal-900 mt-0.5">
                          Stock will be quarantined or ordered, and an entry will be permanently logged in the audit ledger.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Role Gate & Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 shrink-0 pt-1">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Authorized Role</span>
                      <Badge variant="purple" size="sm">
                        {action.required_role.toUpperCase()}
                      </Badge>
                    </div>

                    {action.status === "pending_approval" && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setSelectedAction(action);
                            setActionTypeDecision("reject");
                            setReasonText("");
                          }}
                          disabled={!authorized}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setSelectedAction(action);
                            setActionTypeDecision("approve");
                            setReasonText("");
                          }}
                          disabled={!authorized}
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        >
                          Approve Action
                        </Button>
                      </div>
                    )}

                    {!authorized && action.status === "pending_approval" && (
                      <p className="text-[11px] text-amber-700 font-medium">
                        Switch to {action.required_role.toUpperCase()} persona to sign off
                      </p>
                    )}
                  </div>
                </div>
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
              ? `Confirm Approval: ${selectedAction.id}`
              : `Confirm Rejection: ${selectedAction.id}`
          }
          description="Your decision will be permanently recorded in the SHA-256 audit ledger."
          footer={
            <div className="flex items-center justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setSelectedAction(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant={actionTypeDecision === "approve" ? "primary" : "danger"}
                onClick={handleDecisionSubmit}
                isLoading={submitting}
              >
                {actionTypeDecision === "approve" ? "Authorize & Execute Action" : "Reject Action"}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
              <div className="font-bold text-slate-900">{selectedAction.type.replace(/_/g, " ")}</div>
              <p className="text-xs text-slate-600">{selectedAction.payload?.rationale}</p>
              <div className="text-[11px] text-slate-500 pt-1">
                Authorizer: <strong>{currentUser.name}</strong> ({currentUser.roleTitle})
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {actionTypeDecision === "approve" ? "Approval Notes (Optional):" : "Reason for Rejection (Required):"}
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder={
                  actionTypeDecision === "approve"
                    ? "Verified stability report. Authorized emergency containment."
                    : "Explain why this action cannot be approved..."
                }
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
