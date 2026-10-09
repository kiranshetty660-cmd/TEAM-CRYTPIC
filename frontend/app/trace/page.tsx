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
} from "lucide-react";
import { api } from "../../lib/api";
import { BatchTraceResponse } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/Table";
import { Skeleton, ErrorState } from "../../components/ui/FeedbackStates";

const DEMO_BATCH_CHIPS = [
  { batch: "B2231", label: "S1 Recall: Amoxiclav B2231", desc: "180 in WH, 640 dispatched (2 Hosp + 23 Chem)" },
  { batch: "CR-B101", label: "S2 Cold Excursion: Insulin", desc: "WH-2 Cold Room 1 (9.4°C breach)" },
  { batch: "NE-881", label: "S3 Near-Expiry: Omeprazole", desc: "70d expiry, RMA closes in 6d" },
  { batch: "FEFO-NEW", label: "S4 FEFO Violation: Azithromycin", desc: "Dispatched ahead of FEFO-OLD" },
  { batch: "ADR-BATCH1", label: "S5 Critical Shortage: Adrenaline", desc: "4 days cover, 9d lead time" },
  { batch: "DECOY-999", label: "S6 Clean Decoy: Paracetamol", desc: "20 months expiry, compliant" },
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
      setError(err.message || `No records found for batch ${batchId}`);
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          End-to-End Batch Traceability
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Trace forward to dispensing accounts (hospitals first) and backward to active pharmaceutical manufacturers.
        </p>
      </div>

      {/* Search Input & Demo Quick Chips */}
      <Card className="p-4 bg-white border-slate-200 shadow-sm space-y-3.5">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search batch number (e.g. B2231, CR-B101, NE-881)..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 min-h-[44px]"
            />
          </div>
          <Button type="submit" variant="primary" isLoading={loading}>
            Trace Batch
          </Button>
        </form>

        {/* Demo Scenario Chips */}
        <div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
            One-Click Scenario Presets:
          </span>
          <div className="flex flex-wrap gap-2">
            {DEMO_BATCH_CHIPS.map((chip) => (
              <button
                key={chip.batch}
                onClick={() => {
                  setSearchTerm(chip.batch);
                  fetchTrace(chip.batch);
                }}
                className={`text-xs px-3 py-1.5 rounded-lg border transition text-left min-h-[38px] ${
                  searchTerm === chip.batch
                    ? "bg-slate-900 border-slate-900 text-white font-semibold"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                }`}
              >
                <span className="font-bold mr-1">{chip.batch}</span>
                <span className={searchTerm === chip.batch ? "text-slate-300" : "text-slate-500"}>
                  ({chip.label.split(":")[0]})
                </span>
              </button>
            ))}
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
            <Card className="p-4 bg-white border-slate-200">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Product & Molecule</span>
              <div className="text-base font-bold text-slate-900 mt-1">{trace.product_name}</div>
              <div className="text-xs text-blue-700 font-mono mt-0.5">{trace.sku}</div>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Warehouse Stock</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{trace.total_stock_in_wh} units</div>
              <div className="text-xs text-slate-500 mt-0.5">Across current warehouse nodes</div>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Dispatched (30d)</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{trace.total_dispatched} units</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {trace.customers_count} accounts ({trace.hospitals_count} Hospitals, {trace.chemists_count} Chemists)
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Storage & Critical</span>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={trace.storage === "2-8C" ? "info" : "neutral"} size="sm">
                  {trace.storage}
                </Badge>
                {trace.critical_drug && (
                  <Badge variant="danger" size="sm">
                    CRITICAL DRUG
                  </Badge>
                )}
              </div>
            </Card>
          </div>

          {/* Current Warehouse Inventory */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-slate-600" />
              Current Warehouse Inventory Locations
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Warehouse Node</TableHead>
                  <TableHead>Cold Room / Zone</TableHead>
                  <TableHead>Available Qty</TableHead>
                  <TableHead>Mfg Date</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.current_locations.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-slate-400 italic" colSpan={6}>
                      No current stock in warehouse (fully dispatched or zero stock)
                    </TableCell>
                  </TableRow>
                ) : (
                  trace.current_locations.map((loc, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-bold text-slate-900">{loc.warehouse}</TableCell>
                      <TableCell>{loc.cold_room || "Ambient Bin"}</TableCell>
                      <TableCell className="font-mono font-bold text-slate-900">{loc.qty}</TableCell>
                      <TableCell className="text-xs">{loc.mfg_date}</TableCell>
                      <TableCell className="text-xs">{loc.expiry_date}</TableCell>
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

          {/* Forward Customer Distribution (Hospitals First) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-slate-600" />
                Forward Distribution Ledger ({trace.customers_count} Dispensing Accounts)
              </h2>
              <span className="text-xs text-slate-500 font-medium">Hospitals automatically prioritized at top</span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Units Received</TableHead>
                  <TableHead>Orders Count</TableHead>
                  <TableHead>Last Dispatch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.forward_customers.map((c) => (
                  <TableRow
                    key={c.customer_id}
                    className={c.type === "hospital" ? "bg-blue-50/40 font-medium" : ""}
                  >
                    <TableCell className="text-slate-900 flex items-center gap-2">
                      {c.type === "hospital" ? (
                        <Hospital className="w-4 h-4 text-blue-700 shrink-0" />
                      ) : (
                        <Store className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span>{c.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.type === "hospital" ? "info" : "neutral"} size="sm">
                        {c.type.toUpperCase()}
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

          {/* Backward Manufacturer Details */}
          {trace.backward_manufacturer && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Factory className="w-4 h-4 text-slate-600" />
                Backward Manufacturer & Supply Contract
              </h2>
              <Card className="p-4 bg-white border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Manufacturer:</span>
                  <span className="font-semibold text-slate-900 text-sm mt-0.5 block">
                    {trace.backward_manufacturer.manufacturer}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Lead Time:</span>
                  <span className="font-semibold text-slate-900 text-sm mt-0.5 block">
                    {trace.backward_manufacturer.lead_time_days} Days
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Return Window:</span>
                  <span className="font-semibold text-slate-900 text-sm mt-0.5 block">
                    {trace.backward_manufacturer.return_window_days} Days ({Math.round(trace.backward_manufacturer.credit_pct * 100)}% Credit)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Inbound Orders:</span>
                  <span className="font-semibold text-slate-900 text-sm mt-0.5 block">
                    {trace.backward_manufacturer.purchase_orders.length} Active POs
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
