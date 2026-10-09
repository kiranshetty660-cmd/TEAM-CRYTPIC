import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import BatchInventory, Dispatch, Customer, Product, Supplier, PurchaseOrder
from app.engine.allocation import allocate_clean_stock
from app.engine.options import compare_near_expiry_options, compare_recall_replacement_options

def tool_trace_batch(db: Session, batch: str) -> Dict[str, Any]:
    """
    Deterministic forward and backward trace of a batch.
    """
    inventory_rows = db.query(BatchInventory).filter(BatchInventory.batch == batch).all()
    sku = inventory_rows[0].sku if inventory_rows else None
    prod = db.query(Product).filter(Product.sku == sku).first() if sku else None

    # Current locations
    locations = [
        {
            "warehouse": b.warehouse,
            "cold_room": b.cold_room,
            "qty": b.qty,
            "status": b.status,
            "mfg_date": b.mfg_date.isoformat(),
            "expiry_date": b.expiry_date.isoformat(),
        }
        for b in inventory_rows
    ]
    total_stock = sum(b.qty for b in inventory_rows)

    # Forward customers
    dispatches = db.query(Dispatch).filter(Dispatch.batch == batch).all()
    cust_map = {}
    for d in dispatches:
        if d.customer_id not in cust_map:
            c = db.query(Customer).filter(Customer.customer_id == d.customer_id).first()
            cust_map[d.customer_id] = {
                "customer_id": d.customer_id,
                "name": c.name if c else d.customer_id,
                "type": c.type if c else "chemist",
                "location": c.location if c else "Unknown",
                "dispatched_qty": 0,
                "dispatches_count": 0,
                "last_dispatch_date": d.date.isoformat(),
            }
        cust_map[d.customer_id]["dispatched_qty"] += d.qty
        cust_map[d.customer_id]["dispatches_count"] += 1
        if d.date.isoformat() > cust_map[d.customer_id]["last_dispatch_date"]:
            cust_map[d.customer_id]["last_dispatch_date"] = d.date.isoformat()

    forward_customers = sorted(
        cust_map.values(),
        key=lambda x: (0 if x["type"] == "hospital" else 1, -x["dispatched_qty"])
    )
    total_dispatched = sum(d["dispatched_qty"] for d in forward_customers)
    hosp_count = sum(1 for d in forward_customers if d["type"] == "hospital")
    chem_count = sum(1 for d in forward_customers if d["type"] == "chemist")

    # Backward manufacturer
    supp = db.query(Supplier).filter(Supplier.sku == sku).first() if sku else None
    pos = db.query(PurchaseOrder).filter(PurchaseOrder.sku == sku).all() if sku else []
    backward = None
    if supp:
        backward = {
            "manufacturer": supp.manufacturer,
            "lead_time_days": supp.lead_time_days,
            "moq": supp.moq,
            "return_window_days": supp.return_window_days,
            "credit_pct": supp.credit_pct,
            "purchase_orders": [
                {
                    "po": p.po,
                    "qty": p.qty,
                    "expected_date": p.expected_date.isoformat(),
                    "status": p.status,
                }
                for p in pos
            ]
        }

    return {
        "batch": batch,
        "sku": sku or "Unknown",
        "product_name": prod.brand if prod else "Unknown",
        "molecule": prod.molecule if prod else "Unknown",
        "storage": prod.storage if prod else "ambient",
        "critical_drug": prod.critical_drug if prod else False,
        "current_locations": locations,
        "forward_customers": forward_customers,
        "backward_manufacturer": backward,
        "total_stock_in_wh": total_stock,
        "total_dispatched": total_dispatched,
        "customers_count": len(forward_customers),
        "hospitals_count": hosp_count,
        "chemists_count": chem_count,
    }

def tool_coverage_check(db: Session, sku: str, needed_qty: int, exclude_batches: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Checks clean stock coverage and shortfall for a SKU.
    """
    exclude_batches = exclude_batches or []
    clean_batches = db.query(BatchInventory).filter(
        BatchInventory.sku == sku,
        ~BatchInventory.batch.in_(exclude_batches),
        BatchInventory.status == "active"
    ).all()

    clean_qty = sum(b.qty for b in clean_batches)
    shortfall = max(0, needed_qty - clean_qty)
    coverage = round(clean_qty / max(1, needed_qty), 2)

    return {
        "sku": sku,
        "clean_batches": [{"batch": b.batch, "warehouse": b.warehouse, "qty": b.qty, "expiry": b.expiry_date.isoformat()} for b in clean_batches],
        "clean_qty_available": clean_qty,
        "needed_qty": needed_qty,
        "coverage_ratio": coverage,
        "shortfall": shortfall,
    }

def tool_allocate(clean_qty: int, customers: List[Dict[str, Any]], is_critical_drug: bool = False) -> Dict[str, Any]:
    """
    Executes bounded allocation of stock across customer list.
    """
    return allocate_clean_stock(clean_qty, customers, is_critical_drug)

def tool_compare_options(finding_type: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Computes mathematical comparison matrix for finding options.
    """
    if finding_type in ["expiry", "returnwindow"]:
        return compare_near_expiry_options(
            qty_at_risk=params.get("at_risk_qty", 0),
            days_to_expiry=params.get("days_to_expiry", 60),
            daily_velocity=params.get("daily_velocity", 5.0),
            unit_cost=params.get("unit_cost", 100.0),
            selling_price=params.get("selling_price", 125.0),
            days_to_window_close=params.get("days_to_window_close", 14),
            credit_pct=params.get("credit_pct", 0.60),
        )
    elif finding_type == "recall":
        return compare_recall_replacement_options(
            clean_stock_available=params.get("clean_qty", 0),
            dispatched_recalled_qty=params.get("dispatched_total_30d", 0),
            hospitals_qty_needed=params.get("hospitals_needed", 0),
            chemists_qty_needed=params.get("chemists_needed", 0),
            lead_time_days=params.get("lead_time_days", 8),
            unit_cost=params.get("unit_cost", 120.0),
        )
    return []
