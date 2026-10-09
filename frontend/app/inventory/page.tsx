"use client";

import React, { useEffect, useState } from "react";
import {
  Boxes,
  Upload,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Download,
} from "lucide-react";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/Table";
import { Skeleton, ErrorState } from "../../components/ui/FeedbackStates";
import { useToast } from "../../components/ui/Toast";

export default function InventoryPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<{ today: string; total_batches: number; total_units: number; items: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("");

  // CSV Upload State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState("batch_inventory");
  const [uploadMode, setUploadMode] = useState("upsert");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getInventory(statusFilter || undefined, warehouseFilter || undefined);
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load inventory records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [statusFilter, warehouseFilter]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      showToast("Please choose a CSV file to upload", "error");
      return;
    }
    try {
      setUploading(true);
      const res = await api.uploadData(selectedTable, uploadMode, selectedFile);
      showToast(`Uploaded ${res.rows_processed} rows successfully. Rescanned compliance risk.`, "success");
      setUploadModalOpen(false);
      setSelectedFile(null);
      await loadInventory();
    } catch (err: any) {
      showToast(err.message || "CSV upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const downloadSampleCsv = () => {
    const csvContent =
      "sku,batch,warehouse,qty,mfg_date,expiry_date,status\n" +
      "OMEP-20,NE-881,WH-1,900,2026-01-01,2027-08-05,active\n" +
      "AMOX-625,B2240,WH-1,400,2026-09-01,2027-09-01,active\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sample_inventory_update.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            Batch Inventory & Shelf-Life Radar
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tracking {data?.total_batches ?? 0} batches across distribution nodes with color-coded shelf-life heat classification.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadSampleCsv}
            leftIcon={<Download className="w-4 h-4 text-slate-500" />}
          >
            Sample CSV
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setUploadModalOpen(true)}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            Upload Data CSV
          </Button>
        </div>
      </div>

      {/* Filter Strip */}
      <Card className="p-4 bg-white border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Filters:</span>
          </div>

          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none min-h-[38px]"
          >
            <option value="">All Warehouses</option>
            <option value="WH-1">WH-1 Bengaluru</option>
            <option value="WH-2">WH-2 Hubballi</option>
            <option value="WH-3">WH-3 Mysuru</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none min-h-[38px]"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="quarantine">Quarantine</option>
            <option value="blocked">Blocked</option>
            <option value="returned">Returned</option>
          </select>
        </div>

        {/* Heat Legend */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-red-700 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> ≤ 60d Expiry
          </span>
          <span className="flex items-center gap-1.5 text-amber-800 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> 61-120d Expiry
          </span>
          <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> &gt; 120d Safe
          </span>
        </div>
      </Card>

      {/* Batch Table */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadInventory} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch ID</TableHead>
              <TableHead>Product / Molecule</TableHead>
              <TableHead>Warehouse Node</TableHead>
              <TableHead>Units In Stock</TableHead>
              <TableHead>Days to Expiry</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono font-bold text-slate-900 flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      item.heat_color === "red"
                        ? "bg-red-500"
                        : item.heat_color === "amber"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  {item.batch}
                </TableCell>
                <TableCell>
                  <div className="font-semibold text-slate-900">{item.brand}</div>
                  <div className="text-[11px] text-slate-500">{item.molecule}</div>
                </TableCell>
                <TableCell>
                  <span className="text-slate-800 font-medium">{item.warehouse}</span>
                  {item.cold_room && (
                    <span className="text-[11px] text-blue-700 block font-medium">{item.cold_room}</span>
                  )}
                </TableCell>
                <TableCell className="font-mono font-bold text-slate-900">{item.qty}</TableCell>
                <TableCell>
                  <span
                    className={`font-semibold text-xs px-2 py-0.5 rounded ${
                      item.heat_color === "red"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : item.heat_color === "amber"
                        ? "bg-amber-50 text-amber-800 border border-amber-200"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    {item.days_to_expiry} days
                  </span>
                </TableCell>
                <TableCell className="text-xs text-slate-600">{item.expiry_date}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.status === "active"
                        ? "success"
                        : item.status === "quarantine"
                        ? "warning"
                        : "danger"
                    }
                    size="sm"
                  >
                    {item.status.toUpperCase()}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* CSV Upload Modal */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload Data (CSV Replace / Append)"
        description="Updates database rows and automatically triggers a compliance rescan."
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUploadSubmit} isLoading={uploading}>
              Upload & Rescan
            </Button>
          </>
        }
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs text-slate-700">
          <div>
            <label className="block text-slate-600 mb-1 font-semibold">Target Table</label>
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="w-full p-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs focus:outline-none"
            >
              <option value="batch_inventory">batch_inventory (Batches & Expiry Dates)</option>
              <option value="products">products (Product Catalog & Molecules)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-600 mb-1 font-semibold">Update Mode</label>
            <select
              value={uploadMode}
              onChange={(e) => setUploadMode(e.target.value)}
              className="w-full p-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs focus:outline-none"
            >
              <option value="upsert">Upsert (Update existing by SKU/Batch or Insert new)</option>
              <option value="append">Append (Insert all as new records)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-600 mb-1 font-semibold">Select CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="w-full p-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
            />
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
            <strong>Expected Columns for batch_inventory:</strong>
            <p className="font-mono mt-0.5 text-slate-800">sku, batch, warehouse, qty, mfg_date, expiry_date, status</p>
          </div>
        </form>
      </Modal>
    </div>
  );
}
