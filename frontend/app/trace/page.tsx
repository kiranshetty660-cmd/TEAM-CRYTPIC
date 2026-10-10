"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  Building2,
  Truck,
  Boxes,
  Factory,
  CheckCircle2,
  AlertCircle,
  Hospital,
  Store,
  Users,
} from "lucide-react";
import { api } from "../../lib/api";
import { BatchTraceResponse } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/Table";
import { Skeleton, ErrorState } from "../../components/ui/FeedbackStates";

const DEMO_BATCH_CHIPS = [
  { batch: "B2231", label: "Recalled: Amoxiclav B2231", desc: "180 in WH, 640 dispatched (2 Hosp + 23 Chem)" },
  { batch: "CR-B101", label: "Cold Breach: Actrapid Insulin", desc: "WH-2 Cold Room 1 (9.4°C breach)" },
  { batch: "NE-881", label: "Near-Expiry: Omeprazole", desc: "70d expiry, return window closes in 6d" },
  { batch: "FEFO-NEW", label: "Wrong Dispatch: Azithromycin", desc: "Dispatched ahead of older batch" },
  { batch: "ADR-BATCH1", label: "Low Stock: Adrenaline Injection", desc: "4 days cover, 9d supplier lead time" },
  { batch: "DECOY-999", label: "Safe Batch: Paracetamol", desc: "20 months expiry, fully compliant" },
];

export default function BatchTracePage() {
  const [searchTerm, setSearchTerm] = useState("B2231");
  const [trace, setTrace] = useState<BatchTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrace = async (batchId: string) => {
    if (!batchId.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.traceBatch(batchId.trim().toUpperCase());
      setTrace(res);
    } catch (err: any) {
      setError(err?.message || `No records found for batch ${batchId}`);
      setTrace(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrace("B2231");
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTrace(searchTerm);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
            <Search className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Batch Traceability
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                TraceRx Audit
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Trace medicine batches forward to hospitals and pharmacies, and backward to certified manufacturers.
            </p>
          </div>
        </div>
      </div>

      {/* Search Input & Scenario Presets */}
      <Card className="p-4 bg-white border border-slate-200 shadow-xs space-y-3.5">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Enter batch number (e.g. B2231, CR-B101, NE-881)..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 min-h-[40px]"
            />
          </div>
          <Button type="submit" variant="primary" isLoading={loading}>
            Trace Batch
          </Button>
        </form>

        {/* Demo Quick Chips */}
        <div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
            One-Click Test Presets:
          </span>
          <div className="flex flex-wrap gap-2">
            {DEMO_BATCH_CHIPS.map((chip) => {
              const isSelected = searchTerm === chip.batch;
              const colorConfig: Record<string, { active: string; inactive: string }> = {
                B2231: {
                  active: "bg-rose-600 border-rose-600 text-white shadow-xs font-semibold",
                  inactive: "bg-rose-50/70 border-rose-200 text-rose-800 hover:bg-rose-100",
                },
                "CR-B101": {
                  active: "bg-sky-600 border-sky-600 text-white shadow-xs font-semibold",
                  inactive: "bg-sky-50/70 border-sky-200 text-sky-800 hover:bg-sky-100",
                },
                "NE-881": {
                  active: "bg-purple-600 border-purple-600 text-white shadow-xs font-semibold",
                  inactive: "bg-purple-50/70 border-purple-200 text-purple-800 hover:bg-purple-100",
                },
                "FEFO-NEW": {
                  active: "bg-amber-600 border-amber-600 text-white shadow-xs font-semibold",
                  inactive: "bg-amber-50/70 border-amber-200 text-amber-800 hover:bg-amber-100",
                },
                "ADR-BATCH1": {
                  active: "bg-orange-600 border-orange-600 text-white shadow-xs font-semibold",
                  inactive: "bg-orange-50/70 border-orange-200 text-orange-800 hover:bg-orange-100",
                },
                "DECOY-999": {
                  active: "bg-emerald-600 border-emerald-600 text-white shadow-xs font-semibold",
                  inactive: "bg-emerald-50/70 border-emerald-200 text-emerald-800 hover:bg-emerald-100",
                },
              };

              const styling = colorConfig[chip.batch] || {
                active: "bg-blue-600 border-blue-600 text-white shadow-xs font-semibold",
                inactive: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
              };

              return (
                <button
                  key={chip.batch}
                  onClick={() => {
                    setSearchTerm(chip.batch);
                    fetchTrace(chip.batch);
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition text-left min-h-[36px] ${
                    isSelected ? styling.active : styling.inactive
                  }`}
                >
                  <span className="font-bold mr-1">{chip.batch}</span>
                  <span className={isSelected ? "text-white/80" : "opacity-80"}>
                    ({chip.label.split(":")[0]})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Trace Results */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchTrace(searchTerm)} />
      ) : trace ? (
        <div className="space-y-6">
          {/* Summary Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Card className="p-4 bg-white border border-slate-200 border-t-4 border-t-blue-500 shadow-xs">
              <span className="text-[11px] text-blue-700 font-bold uppercase tracking-wider">Medicine Name</span>
              <div className="text-base font-bold text-slate-900 mt-1">{trace.product_name}</div>
              <div className="text-xs text-blue-600 font-mono font-medium mt-0.5">{trace.sku}</div>
            </Card>

            <Card className="p-4 bg-white border border-slate-200 border-t-4 border-t-emerald-500 shadow-xs">
              <span className="text-[11px] text-emerald-700 font-bold uppercase tracking-wider">Remaining Stock</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{trace.total_stock_in_wh} units</div>
              <div className="text-xs text-slate-500 mt-0.5">Inside warehouse bins</div>
            </Card>

            <Card className="p-4 bg-white border border-slate-200 border-t-4 border-t-sky-500 shadow-xs">
              <span className="text-[11px] text-sky-700 font-bold uppercase tracking-wider">Total Dispatched</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{trace.total_dispatched} units</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Sent to {trace.customers_count} accounts ({trace.hospitals_count} Hospitals, {trace.chemists_count} Pharmacies)
              </div>
            </Card>

            <Card className="p-4 bg-white border border-slate-200 border-t-4 border-t-purple-500 shadow-xs">
              <span className="text-[11px] text-purple-700 font-bold uppercase tracking-wider">Storage Requirements</span>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={trace.storage === "2-8C" ? "info" : "neutral"} size="sm">
                  {trace.storage === "2-8C" ? "Cold Chain (2°C – 8°C)" : "Room Temperature"}
                </Badge>
                {trace.critical_drug && (
                  <Badge variant="danger" size="sm">
                    CRITICAL MEDICINE
                  </Badge>
                )}
              </div>
            </Card>
          </div>

          {/* Current Warehouse Inventory */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-sky-600" />
              Current Warehouse Stock Locations
            </h2>

            {/* Mobile View: Warehouse Stock Cards */}
            <div className="md:hidden space-y-2.5">
              {trace.current_locations.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500 italic">
                  No stock currently in warehouse.
                </div>
              ) : (
                trace.current_locations.map((loc, i) => (
                  <div key={i} className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">{loc.warehouse}</span>
                      <Badge
                        variant={
                          loc.status === "active"
                            ? "success"
                            : loc.status === "quarantine"
                            ? "warning"
                            : "danger"
                        }
                        size="sm"
                      >
                        {loc.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                      <div className="bg-slate-50 p-1.5 rounded-lg">
                        <span className="text-[10px] text-slate-500 block uppercase">Zone</span>
                        <span className="font-medium text-slate-800 text-[11px] truncate block">{loc.cold_room || "Ambient"}</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded-lg">
                        <span className="text-[10px] text-slate-500 block uppercase">Quantity</span>
                        <span className="font-mono font-bold text-slate-900">{loc.qty}</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded-lg">
                        <span className="text-[10px] text-slate-500 block uppercase">Expiry</span>
                        <span className="text-[11px] font-medium text-slate-700">{loc.expiry_date}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table: Warehouse Stock */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Zone / Cold Room</TableHead>
                    <TableHead>Available Units</TableHead>
                    <TableHead>Manufacture Date</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Current Status</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {trace.current_locations.length === 0 ? (
                    <TableRow>
                      <TableCell className="text-slate-400 italic" colSpan={6}>
                        No stock currently in warehouse (all units dispatched or returned).
                      </TableCell>
                    </TableRow>
                  ) : (
                    trace.current_locations.map((loc, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-bold text-slate-900">{loc.warehouse}</TableCell>
                        <TableCell>{loc.cold_room || "Ambient Shelves"}</TableCell>
                        <TableCell className="font-mono font-bold text-slate-900">{loc.qty}</TableCell>
                        <TableCell className="text-xs text-slate-600">{loc.mfg_date}</TableCell>
                        <TableCell className="text-xs text-slate-600">{loc.expiry_date}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              loc.status === "active"
                                ? "success"
                                : loc.status === "quarantine"
                                ? "warning"
                                : "danger"
                            }
                            size="sm"
                          >
                            {loc.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Forward Customer Distribution (Hospitals First) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                Customers Who Received This Batch ({trace.customers_count} Accounts)
              </h2>
              <span className="text-xs text-blue-700 font-medium">Hospitals prioritized at the top of the list</span>
            </div>

            {/* Mobile View: Customer Cards for Touchscreens */}
            <div className="md:hidden space-y-2.5">
              {trace.forward_customers.map((c) => (
                <div
                  key={c.customer_id}
                  className={`p-3.5 rounded-xl border transition ${
                    c.type === "hospital"
                      ? "bg-blue-50/50 border-blue-200 shadow-xs"
                      : "bg-white border-slate-200 shadow-2xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {c.type === "hospital" ? (
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                          <Hospital className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                          <Store className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{c.name}</h4>
                        <p className="text-[11px] text-slate-500">{c.location}</p>
                      </div>
                    </div>
                    <Badge variant={c.type === "hospital" ? "indigo" : "neutral"} size="sm">
                      {c.type === "hospital" ? "HOSPITAL" : "PHARMACY"}
                    </Badge>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-slate-50/80 p-1.5 rounded-lg">
                      <span className="text-[10px] text-slate-500 block uppercase font-medium">Quantity</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">{c.dispatched_qty}</span>
                    </div>
                    <div className="bg-slate-50/80 p-1.5 rounded-lg">
                      <span className="text-[10px] text-slate-500 block uppercase font-medium">Shipments</span>
                      <span className="font-bold text-slate-700">{c.dispatches_count}</span>
                    </div>
                    <div className="bg-slate-50/80 p-1.5 rounded-lg">
                      <span className="text-[10px] text-slate-500 block uppercase font-medium">Dispatched</span>
                      <span className="text-[11px] font-medium text-slate-600">{c.last_dispatch_date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table: Forward Customers */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Account Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Units Received</TableHead>
                    <TableHead>Dispatches</TableHead>
                    <TableHead>Last Dispatch Date</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {trace.forward_customers.map((c) => (
                    <TableRow
                      key={c.customer_id}
                      className={c.type === "hospital" ? "bg-blue-50/30 font-medium" : ""}
                    >
                      <TableCell className="text-slate-900 flex items-center gap-2">
                        {c.type === "hospital" ? (
                          <Hospital className="w-4 h-4 text-blue-600 shrink-0" />
                        ) : (
                          <Store className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span>{c.name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.type === "hospital" ? "indigo" : "neutral"} size="sm">
                          {c.type === "hospital" ? "HOSPITAL (HIGH PRIORITY)" : "PHARMACY"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{c.location}</TableCell>
                      <TableCell className="font-mono font-bold text-slate-900">{c.dispatched_qty}</TableCell>
                      <TableCell className="text-xs text-slate-600">{c.dispatches_count}</TableCell>
                      <TableCell className="text-xs text-slate-600">{c.last_dispatch_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Backward Manufacturer Details */}
          {trace.backward_manufacturer && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Factory className="w-4 h-4 text-indigo-600" />
                Manufacturer & Supply Agreement
              </h2>
              <Card className="p-4 bg-white border border-slate-200 shadow-xs grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Manufacturer:</span>
                  <span className="font-semibold text-slate-900 text-sm mt-0.5 block">
                    {trace.backward_manufacturer.manufacturer}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Supplier Lead Time:</span>
                  <span className="font-semibold text-slate-900 text-sm mt-0.5 block">
                    {trace.backward_manufacturer.lead_time_days} Days
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Return Agreement:</span>
                  <span className="font-semibold text-slate-900 text-sm mt-0.5 block">
                    {trace.backward_manufacturer.return_window_days} Days ({Math.round(trace.backward_manufacturer.credit_pct * 100)}% Credit)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Active Purchase Orders:</span>
                  <span className="font-semibold text-slate-900 text-sm mt-0.5 block">
                    {trace.backward_manufacturer.purchase_orders.length} Open POs
                  </span>
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
