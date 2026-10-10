import json
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import BatchInventory, Dispatch, Customer, Product, Supplier, PurchaseOrder
from app.engine.allocation import allocate_clean_stock
from app.engine.options import compare_near_expiry_options, compare_recall_replacement_options

# ---------------------------------------------------------------------------
# Registered Read-Only Backend Tools
# ---------------------------------------------------------------------------

def tool_trace_batch(db: Session, batch: str) -> Dict[str, Any]:
    """
    Deterministic forward and backward trace of a batch.
    Validates input to prevent injection or invalid queries.
    """
    if not batch or not isinstance(batch, str):
        raise ValueError("Batch identifier must be a non-empty string.")
    
    clean_batch = batch.strip().upper()
    if not re.match(r"^[A-Z0-9\-_]{2,32}$", clean_batch):
        raise ValueError(f"Invalid batch identifier format: '{batch}'")

    inventory_rows = db.query(BatchInventory).filter(BatchInventory.batch == clean_batch).all()
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
    dispatches = db.query(Dispatch).filter(Dispatch.batch == clean_batch).all()
    cust_ids = {d.customer_id for d in dispatches}
    customers = {c.customer_id: c for c in db.query(Customer).filter(Customer.customer_id.in_(cust_ids)).all()} if cust_ids else {}
    cust_map = {}
    for d in dispatches:
        if d.customer_id not in cust_map:
            c = customers.get(d.customer_id)
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
            "unit_cost": supp.unit_cost,
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
        "batch": clean_batch,
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
    if not sku or not isinstance(sku, str):
        raise ValueError("SKU must be a non-empty string.")
    if not isinstance(needed_qty, int) or needed_qty < 0:
        raise ValueError("needed_qty must be a non-negative integer.")

    clean_sku = sku.strip().upper()
    exclude_batches = [b.strip().upper() for b in (exclude_batches or []) if isinstance(b, str)]
    
    clean_batches = db.query(BatchInventory).filter(
        BatchInventory.sku == clean_sku,
        ~BatchInventory.batch.in_(exclude_batches),
        BatchInventory.status == "active"
    ).all()

    clean_qty = sum(b.qty for b in clean_batches)
    shortfall = max(0, needed_qty - clean_qty)
    coverage = round(clean_qty / max(1, needed_qty), 2)

    return {
        "sku": clean_sku,
        "clean_batches": [{"batch": b.batch, "warehouse": b.warehouse, "qty": b.qty, "expiry": b.expiry_date.isoformat()} for b in clean_batches],
        "clean_qty_available": clean_qty,
        "needed_qty": needed_qty,
        "coverage_ratio": coverage,
        "shortfall": shortfall,
    }

def tool_get_supplier_terms(db: Session, sku: str) -> Dict[str, Any]:
    """
    Retrieves contractual supplier terms (lead time, return window, credit %, unit cost).
    """
    if not sku or not isinstance(sku, str):
        raise ValueError("SKU must be a non-empty string.")
    
    clean_sku = sku.strip().upper()
    supp = db.query(Supplier).filter(Supplier.sku == clean_sku).first()
    if not supp:
        return {"sku": clean_sku, "found": False, "message": f"No registered supplier found for {clean_sku}"}

    return {
        "sku": clean_sku,
        "found": True,
        "manufacturer": supp.manufacturer,
        "lead_time_days": supp.lead_time_days,
        "moq": supp.moq,
        "return_window_days": supp.return_window_days,
        "credit_pct": supp.credit_pct,
        "unit_cost": supp.unit_cost,
    }

def tool_allocate(clean_qty: int, customers: List[Dict[str, Any]], is_critical_drug: bool = False) -> Dict[str, Any]:
    """
    Executes bounded allocation of stock across customer list.
    """
    if not isinstance(clean_qty, int) or clean_qty < 0:
        raise ValueError("clean_qty must be a non-negative integer.")
    if not isinstance(customers, list):
        raise ValueError("customers must be a list.")
    
    return allocate_clean_stock(clean_qty, customers, is_critical_drug)

def tool_compare_options(finding_type: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Computes mathematical comparison matrix for finding options.
    """
    if not isinstance(params, dict):
        raise ValueError("params must be a dictionary.")

    if finding_type in ["expiry", "returnwindow"]:
        return compare_near_expiry_options(
            qty_at_risk=int(params.get("at_risk_qty", 0)),
            days_to_expiry=int(params.get("days_to_expiry", 60)),
            daily_velocity=float(params.get("daily_velocity", 5.0)),
            unit_cost=float(params.get("unit_cost", 100.0)),
            selling_price=float(params.get("selling_price", 125.0)),
            days_to_window_close=int(params.get("days_to_window_close", 14)),
            credit_pct=float(params.get("credit_pct", 0.60)),
        )
    elif finding_type == "recall":
        return compare_recall_replacement_options(
            clean_stock_available=int(params.get("clean_qty", 0)),
            dispatched_recalled_qty=int(params.get("dispatched_total_30d", 0)),
            hospitals_qty_needed=int(params.get("hospitals_needed", 0)),
            chemists_qty_needed=int(params.get("chemists_needed", 0)),
            lead_time_days=int(params.get("lead_time_days", 8)),
            unit_cost=float(params.get("unit_cost", 120.0)),
        )
    return []

def tool_investigate_root_cause(db: Session, finding_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministic root-cause investigation across inventory, dispatch, supplier, and telemetry records.
    """
    from app.schemas import Finding
    from app.engine.root_cause import investigate_root_cause
    try:
        f = Finding.model_validate(finding_dict)
    except Exception:
        f = Finding(
            id=finding_dict.get("id", "FIND-UNKNOWN"),
            type=finding_dict.get("type", "recall"),
            severity=float(finding_dict.get("severity", 50.0)),
            title=finding_dict.get("title", "Finding"),
            description=finding_dict.get("description", ""),
            entities=finding_dict.get("entities", {}),
            metrics=finding_dict.get("metrics", {}),
        )
    return investigate_root_cause(f, db)

def tool_forecast_demand(db: Session, sku: str, horizon_days: int = 60) -> Dict[str, Any]:
    """
    Statistical demand forecasting and suggested replenishment calculation.
    """
    from app.engine.forecasting import calculate_demand_forecast
    if not sku or not isinstance(sku, str):
        raise ValueError("SKU must be a non-empty string.")
    return calculate_demand_forecast(sku=sku.strip().upper(), db=db, horizon_days=horizon_days)

# ---------------------------------------------------------------------------
# Official Anthropic Tool Calling Definitions (Read-Only Registered Tools)
# ---------------------------------------------------------------------------

ANTHROPIC_TOOLS = [
    {
        "name": "trace_batch",
        "description": "Performs factual forward and backward traceability for a given pharmaceutical batch. Returns warehouse pallet counts, forward healthcare customer dispatches (with hospitals distinguished), and manufacturer terms.",
        "input_schema": {
            "type": "object",
            "properties": {
                "batch": {
                    "type": "string",
                    "description": "The exact batch number to trace, e.g. 'B2231', 'CR-B101', 'NE-881'."
                }
            },
            "required": ["batch"]
        }
    },
    {
        "name": "coverage_check",
        "description": "Calculates clean available replacement stock, coverage ratio, and shortfall for a SKU, excluding any affected or recalled batches.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku": {
                    "type": "string",
                    "description": "Product SKU code, e.g. 'AMOX-625', 'OMEP-20'."
                },
                "needed_qty": {
                    "type": "integer",
                    "description": "Quantity of units required for replacement or customer coverage."
                },
                "exclude_batches": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of batch IDs that are recalled or compromised and must not be used."
                }
            },
            "required": ["sku", "needed_qty"]
        }
    },
    {
        "name": "get_supplier_terms",
        "description": "Retrieves contractual manufacturer terms including RMA return windows, credit percentage, lead time days, and unit cost.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku": {
                    "type": "string",
                    "description": "Product SKU code."
                }
            },
            "required": ["sku"]
        }
    },
    {
        "name": "compare_options",
        "description": "Executes deterministic mathematical comparison of candidate response options (financial impact, recovery, write-offs).",
        "input_schema": {
            "type": "object",
            "properties": {
                "finding_type": {
                    "type": "string",
                    "description": "The compliance finding category, e.g. 'recall', 'expiry', 'returnwindow'."
                },
                "params": {
                    "type": "object",
                    "description": "Key numerical parameters required for calculation."
                }
            },
            "required": ["finding_type", "params"]
        }
    },
    {
        "name": "allocate_stock",
        "description": "Computes deterministic multi-criteria allocation of clean stock across hospital and chemist accounts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "clean_qty": {
                    "type": "integer",
                    "description": "Total units of clean replacement stock available."
                },
                "customers": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "List of affected customer accounts."
                },
                "is_critical_drug": {
                    "type": "boolean",
                    "description": "Flag indicating if the drug is life-saving ICU medicine."
                }
            },
            "required": ["clean_qty", "customers"]
        }
    },
    {
        "name": "investigate_root_cause",
        "description": "Inspects cross-table records (inventory, dispatches, telemetry, suppliers, purchase orders) to isolate confirmed facts from ranked hypotheses.",
        "input_schema": {
            "type": "object",
            "properties": {
                "finding": {
                    "type": "object",
                    "description": "The finding object or finding dictionary containing type, entities, and metrics."
                }
            },
            "required": ["finding"]
        }
    },
    {
        "name": "forecast_demand",
        "description": "Calculates statistical demand forecast, data sufficiency check, safety stock, net inventory position, and suggested replenishment calculation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku": {
                    "type": "string",
                    "description": "Product SKU code."
                },
                "horizon_days": {
                    "type": "integer",
                    "description": "Demand forecast horizon in days (default 60)."
                }
            },
            "required": ["sku"]
        }
    }
]

# ---------------------------------------------------------------------------
# NVIDIA NIM / OpenAI Compatible Tool Calling Definitions
# ---------------------------------------------------------------------------
NVIDIA_NIM_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t["description"],
            "parameters": t.get("input_schema", {}),
        },
    }
    for t in ANTHROPIC_TOOLS
]

def execute_registered_tool(tool_name: str, tool_input: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """
    Safe execution dispatcher. Only registered tools with strict argument validation
    can execute. Rejects arbitrary execution, raw SQL, shell execution, or network calls.
    """
    if tool_name == "trace_batch":
        batch = tool_input.get("batch")
        return tool_trace_batch(db, batch)
    elif tool_name == "coverage_check":
        sku = tool_input.get("sku")
        needed_qty = tool_input.get("needed_qty", 0)
        exclude_batches = tool_input.get("exclude_batches", [])
        return tool_coverage_check(db, sku, needed_qty, exclude_batches)
    elif tool_name == "get_supplier_terms":
        sku = tool_input.get("sku")
        return tool_get_supplier_terms(db, sku)
    elif tool_name == "compare_options":
        finding_type = tool_input.get("finding_type")
        params = tool_input.get("params", {})
        return {"options": tool_compare_options(finding_type, params)}
    elif tool_name == "allocate_stock":
        clean_qty = tool_input.get("clean_qty", 0)
        customers = tool_input.get("customers", [])
        is_crit = tool_input.get("is_critical_drug", False)
        return tool_allocate(clean_qty, customers, is_crit)
    elif tool_name == "investigate_root_cause":
        finding_dict = tool_input.get("finding", {})
        return tool_investigate_root_cause(db, finding_dict)
    elif tool_name == "forecast_demand":
        sku = tool_input.get("sku")
        horizon_days = tool_input.get("horizon_days", 60)
        return tool_forecast_demand(db, sku, horizon_days)
    else:
        raise ValueError(f"Unauthorized or unregistered tool: '{tool_name}'. Execution prohibited.")
