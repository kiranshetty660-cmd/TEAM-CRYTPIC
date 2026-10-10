"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Plus,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  RefreshCw,
  Building2,
  Calendar,
  AlertCircle,
  Truck,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/Table";
import { Skeleton, ErrorState, EmptyState } from "../../components/ui/FeedbackStates";
import { useToast } from "../../components/ui/Toast";
import { useUser } from "../../lib/UserContext";

export default function PurchaseOrdersPage() {
  const { showToast } = useToast();
  const { currentUser } = useUser();

  const [orders, setOrders] = useState<any[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [draftsCount, setDraftsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Approval modal
  const [selectedPo, setSelectedPo] = useState<any | null>(null);
  const [approving, setApproving] = useState(false);

  // Create PO modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSku, setNewSku] = useState("AMOX-625");
  const [newQty, setNewQty] = useState(600);
  const [newSupplier, setNewSupplier] = useState("Arogya Antibiotics Labs Pvt Ltd");
  const [newExpDays, setNewExpDays] = useState(8);
  const [creating, setCreating] = useState(false);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listPurchaseOrders({
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setOrders(res.purchase_orders || []);
      setTotalOrders(res.total || 0);
      setDraftsCount(res.drafts_count || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load purchase orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const handleApprovePo = async () => {
    if (!selectedPo) return;
    try {
      setApproving(true);
      await api.approvePurchaseOrder(selectedPo.po, currentUser.name);
      showToast(`Purchase Order ${selectedPo.po} approved and placed with supplier!`, "success");
      setSelectedPo(null);
      await fetchOrders();
    } catch (err: any) {
      showToast(err?.message || "Failed to approve purchase order.", "error");
    } finally {
      setApproving(false);
    }
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + newExpDays);
      const dateStr = targetDate.toISOString().split("T")[0];

      await api.createPurchaseOrder({
        sku: newSku,
        qty: newQty,
        manufacturer: newSupplier,
        expected_date: dateStr,
        draft: true,
      });

      showToast(`Draft Purchase Order for ${newQty} units of ${newSku} created!`, "success");
      setCreateModalOpen(false);
      await fetchOrders();
    } catch (err: any) {
      showToast(err?.message || "Failed to create purchase order.", "error");
    } finally {
      setCreating(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.po.toLowerCase().includes(q) ||
      o.sku.toLowerCase().includes(q) ||
      (o.product_name && o.product_name.toLowerCase().includes(q)) ||
      (o.manufacturer && o.manufacturer.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Purchase Orders & Replenishment
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                TraceRx Supply
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Emergency replacement orders drafted during recalls and routine hospital stock replenishment.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrders}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-4 h-4 text-slate-600" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Draft Purchase Order
          </Button>
        </div>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-blue-50/40 border border-blue-200 hover:border-blue-300 hover:bg-blue-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Total Purchase Orders</span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-blue-950 mt-2">{totalOrders}</div>
          <p className="text-[11px] text-blue-700 mt-1 font-medium">Recorded across all medicine suppliers</p>
        </Card>

        <Card className="p-4 bg-amber-50/40 border border-amber-200 hover:border-amber-300 hover:bg-amber-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Drafts Waiting for Review</span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-950 mt-2">{draftsCount}</div>
          <p className="text-[11px] text-amber-700 mt-1 font-medium">Requires procurement officer sign-off</p>
        </Card>

        <Card className="p-4 bg-emerald-50/40 border border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/70 hover:shadow-xs transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Active Supply Lines</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-950 mt-2">{totalOrders - draftsCount} Orders Placed</div>
          <p className="text-[11px] text-emerald-700 mt-1 font-medium">Dispatched or arriving at distribution hubs</p>
        </Card>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search PO number, medicine, or supplier..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 min-h-[38px]"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-medium text-slate-500 shrink-0">Status:</span>
          {[
            { id: "all", label: "All Orders", activeClass: "bg-slate-900 text-white" },
            { id: "draft", label: "Drafts", activeClass: "bg-amber-600 text-white" },
            { id: "ordered", label: "Ordered", activeClass: "bg-blue-600 text-white" },
            { id: "received", label: "Received", activeClass: "bg-emerald-600 text-white" },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 min-h-[34px] ${
                statusFilter === st.id
                  ? `${st.activeClass} shadow-xs`
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchOrders} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="No purchase orders found"
          message="No purchase orders match your current filter. You can draft an emergency purchase order above."
          action={<Button variant="secondary" onClick={() => setStatusFilter("all")}>View all orders</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>PO Number</TableHead>
              <TableHead>Medicine & SKU</TableHead>
              <TableHead>Manufacturer</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Estimated Cost</TableHead>
              <TableHead>Expected Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {filteredOrders.map((po) => (
              <TableRow key={po.po}>
                <TableCell className="font-mono font-semibold text-slate-900">
                  {po.po}
                </TableCell>
                <TableCell>
                  <div className="font-semibold text-slate-900 text-xs sm:text-sm">{po.product_name}</div>
                  <div className="text-[11px] font-mono text-teal-700">{po.sku}</div>
                </TableCell>
                <TableCell className="text-xs text-slate-600 max-w-[200px] truncate">
                  {po.manufacturer}
                </TableCell>
                <TableCell className="font-semibold text-slate-900">
                  {po.qty.toLocaleString()} units
                </TableCell>
                <TableCell className="text-xs font-medium text-slate-700">
                  ₹{Number(po.estimated_cost).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {po.expected_date || "—"}
                </TableCell>
                <TableCell>
                  {po.draft ? (
                    <Badge variant="warning" size="sm">Draft (Pending)</Badge>
                  ) : po.status === "ordered" ? (
                    <Badge variant="info" size="sm">Ordered</Badge>
                  ) : po.status === "received" ? (
                    <Badge variant="success" size="sm">Received</Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">{po.status}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {po.draft ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setSelectedPo(po)}
                      leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    >
                      Approve & Place
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">Placed</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Approve PO Modal */}
      {selectedPo && (
        <Modal
          isOpen={!!selectedPo}
          onClose={() => setSelectedPo(null)}
          title={`Approve Purchase Order: ${selectedPo.po}`}
          description="Review order quantities and confirm placement with the certified manufacturer."
          footer={
            <div className="flex items-center justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setSelectedPo(null)} disabled={approving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleApprovePo}
                isLoading={approving}
                leftIcon={<ShieldCheck className="w-4 h-4" />}
              >
                Confirm & Place Order
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Medicine:</span>
                <span className="font-semibold text-slate-900">{selectedPo.product_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order Quantity:</span>
                <span className="font-semibold text-slate-900">{selectedPo.qty} units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Manufacturer:</span>
                <span className="font-semibold text-slate-900">{selectedPo.manufacturer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Value:</span>
                <span className="font-semibold text-slate-900">₹{Number(selectedPo.estimated_cost).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expected Delivery:</span>
                <span className="font-semibold text-slate-900">{selectedPo.expected_date || "Within 8 days"}</span>
              </div>
            </div>

            <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-800 text-xs">
              <p className="font-semibold">Audit Ledger Logging:</p>
              <p className="mt-0.5">
                Approving this order will record an immutable entry in the SHA-256 ledger authorized by {currentUser.name} ({currentUser.roleTitle}).
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Draft PO Modal */}
      {createModalOpen && (
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Draft Emergency Purchase Order"
          description="Create a replenishment purchase order for antibiotics or critical healthcare supplies."
          footer={
            <div className="flex items-center justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setCreateModalOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreatePo}
                isLoading={creating}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Create Draft
              </Button>
            </div>
          }
        >
          <form onSubmit={handleCreatePo} className="space-y-4 text-xs sm:text-sm">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Medicine SKU</label>
              <select
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-teal-700"
              >
                <option value="AMOX-625">AMOX-625 — Augmentin 625 (Amoxiclav)</option>
                <option value="INS-REG-100">INS-REG-100 — Human Actrapid Insulin</option>
                <option value="OMEP-20">OMEP-20 — Omez 20mg (Omeprazole)</option>
                <option value="AZITH-500">AZITH-500 — Azee 500mg (Azithromycin)</option>
                <option value="ADREN-01">ADREN-01 — Vasocon 1mg (Adrenaline Injection)</option>
                <option value="PARA-650">PARA-650 — Dolo 650 (Paracetamol)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Manufacturer</label>
              <input
                type="text"
                value={newSupplier}
                onChange={(e) => setNewSupplier(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-teal-700"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Quantity (Units)</label>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={newQty}
                  onChange={(e) => setNewQty(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-teal-700"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lead Time (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={newExpDays}
                  onChange={(e) => setNewExpDays(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-teal-700"
                  required
                />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
