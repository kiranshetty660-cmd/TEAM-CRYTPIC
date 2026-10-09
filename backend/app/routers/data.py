import csv
import io
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import BatchInventory, Product, Customer, Dispatch, Supplier
from app.ledger.chain import append_ledger_event
from app.routers.board import execute_full_scan

router = APIRouter(prefix="/api/data", tags=["Data Upload & Integration"])

@router.post("/upload")
async def upload_csv_data(
    table: str = Form(..., description="Target table: batch_inventory, products, dispatches, suppliers"),
    mode: str = Form("upsert", description="Mode: upsert, replace, append"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload CSV data to update or append database records, then automatically rescan risk compliance.
    """
    contents = await file.read()
    text = contents.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    rows_processed = 0

    if table == "batch_inventory":
        for row in reader:
            batch_num = row.get("batch")
            sku = row.get("sku")
            if not batch_num or not sku:
                continue

            existing = db.query(BatchInventory).filter(
                BatchInventory.batch == batch_num,
                BatchInventory.sku == sku
            ).first()

            exp_date = date.fromisoformat(row["expiry_date"]) if "expiry_date" in row else None
            mfg_date = date.fromisoformat(row["mfg_date"]) if "mfg_date" in row else None
            qty = int(row["qty"]) if "qty" in row else None
            wh = row.get("warehouse")
            room = row.get("cold_room")
            status = row.get("status", "active")

            if existing and mode == "upsert":
                if exp_date:
                    existing.expiry_date = exp_date
                if qty is not None:
                    existing.qty = qty
                if wh:
                    existing.warehouse = wh
                if room:
                    existing.cold_room = room
                if status:
                    existing.status = status
            else:
                new_b = BatchInventory(
                    sku=sku,
                    batch=batch_num,
                    warehouse=wh or "WH-1",
                    cold_room=room,
                    qty=qty or 100,
                    mfg_date=mfg_date or date(2026, 1, 1),
                    expiry_date=exp_date or date(2027, 1, 1),
                    status=status,
                )
                db.add(new_b)
            rows_processed += 1

    elif table == "products":
        for row in reader:
            sku = row.get("sku")
            if not sku:
                continue
            existing = db.query(Product).filter(Product.sku == sku).first()
            if existing and mode == "upsert":
                existing.brand = row.get("brand", existing.brand)
                existing.molecule = row.get("molecule", existing.molecule)
                existing.category = row.get("category", existing.category)
            else:
                db.add(Product(
                    sku=sku,
                    molecule=row.get("molecule", "Generic Molecule"),
                    brand=row.get("brand", "Generic Brand"),
                    category=row.get("category", "General"),
                    storage=row.get("storage", "ambient"),
                    critical_drug=row.get("critical_drug", "false").lower() == "true",
                ))
            rows_processed += 1
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported table '{table}'")

    db.commit()

    # Append to Ledger
    append_ledger_event(
        db=db,
        event_type="BATCH_RECEIVED",
        payload={
            "table": table,
            "mode": mode,
            "rows_processed": rows_processed,
            "filename": file.filename,
        },
        trigger_auto_anchor=True,
    )

    # Re-scan to reflect updated state
    scan_result = execute_full_scan(db)

    return {
        "status": "success",
        "table": table,
        "rows_processed": rows_processed,
        "new_findings_count": len(scan_result.findings),
    }
