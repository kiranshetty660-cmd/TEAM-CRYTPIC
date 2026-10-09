from datetime import date
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import BatchInventory, Product
from app.schemas import BatchTraceResponse
from app.agent.tools import tool_trace_batch
from app.config import settings

router = APIRouter(prefix="/api", tags=["Batches & Inventory"])

@router.get("/batch/{batch}/trace", response_model=BatchTraceResponse)
def trace_batch_endpoint(batch: str, db: Session = Depends(get_db)):
    """
    Returns forward customers (hospitals first), backward manufacturer/PO,
    and current warehouse inventory locations for a batch.
    """
    trace_data = tool_trace_batch(db, batch)
    if trace_data["total_stock_in_wh"] == 0 and trace_data["total_dispatched"] == 0:
        raise HTTPException(status_code=404, detail=f"No records found for batch '{batch}'")
    return trace_data

@router.get("/inventory")
def get_inventory_list(
    status: Optional[str] = Query(None, description="Filter by status: active, blocked, quarantine, returned"),
    warehouse: Optional[str] = Query(None, description="Filter by warehouse: WH-1, WH-2, WH-3"),
    db: Session = Depends(get_db)
):
    """
    Returns complete batch inventory with expiration heat calculations and product taxonomy.
    """
    query = db.query(BatchInventory, Product).join(Product, BatchInventory.sku == Product.sku)

    if status:
        query = query.filter(BatchInventory.status == status)
    if warehouse:
        query = query.filter(BatchInventory.warehouse == warehouse)

    results = query.order_by(BatchInventory.expiry_date.asc()).all()

    today = settings.today
    inventory_items = []
    for b, p in results:
        days_to_exp = (b.expiry_date - today).days

        # Expiry heat color classification
        if days_to_exp <= 60:
            heat_color = "red"  # Critical risk
        elif days_to_exp <= 120:
            heat_color = "amber"  # Moderate risk
        else:
            heat_color = "green"  # Safe

        inventory_items.append({
            "id": b.id,
            "sku": b.sku,
            "brand": p.brand,
            "molecule": p.molecule,
            "category": p.category,
            "storage": p.storage,
            "critical_drug": p.critical_drug,
            "batch": b.batch,
            "warehouse": b.warehouse,
            "cold_room": b.cold_room,
            "qty": b.qty,
            "mfg_date": b.mfg_date.isoformat(),
            "expiry_date": b.expiry_date.isoformat(),
            "status": b.status,
            "days_to_expiry": days_to_exp,
            "heat_color": heat_color,
        })

    return {
        "today": today.isoformat(),
        "total_batches": len(inventory_items),
        "total_units": sum(i["qty"] for i in inventory_items),
        "items": inventory_items,
    }
