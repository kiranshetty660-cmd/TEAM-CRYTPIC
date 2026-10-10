import uuid
from datetime import datetime, timezone, date
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Shipment, WarehouseTransfer, BatchInventory, Product, PurchaseOrder, Supplier
from app.schemas import ShipmentSchema, ShipmentCreate, WarehouseTransferSchema, WarehouseTransferCreate
from app.engine.forecasting import calculate_demand_forecast
from app.ledger.chain import append_ledger_event

router = APIRouter(prefix="/api/supply-chain", tags=["Supply Chain Operations"])

def _deserialize_shipment(s: Shipment) -> ShipmentSchema:
    return ShipmentSchema(
        id=s.id,
        tracking_number=s.tracking_number,
        carrier=s.carrier,
        type=s.type,
        po_id=s.po_id,
        sku=s.sku,
        batch=s.batch,
        qty=s.qty,
        origin=s.origin,
        destination=s.destination,
        temp_controlled=s.temp_controlled,
        status=s.status,
        dispatched_at=s.dispatched_at.isoformat(),
        expected_delivery=s.expected_delivery.isoformat(),
        actual_delivery=s.actual_delivery.isoformat() if s.actual_delivery else None,
        notes=s.notes,
    )

def _deserialize_transfer(t: WarehouseTransfer) -> WarehouseTransferSchema:
    return WarehouseTransferSchema(
        id=t.id,
        sku=t.sku,
        batch=t.batch,
        from_warehouse=t.from_warehouse,
        to_warehouse=t.to_warehouse,
        qty=t.qty,
        reason=t.reason,
        status=t.status,
        requested_by=t.requested_by,
        approved_by=t.approved_by,
        created_at=t.created_at.isoformat(),
        completed_at=t.completed_at.isoformat() if t.completed_at else None,
    )

@router.get("/forecast/{sku}")
def get_sku_demand_forecast(
    sku: str,
    horizon_days: int = Query(60, ge=7, le=180),
    db: Session = Depends(get_db)
):
    """
    Returns seasonal demand forecast, data sufficiency check,
    safety stock, and suggested replenishment calculation.
    """
    try:
        return calculate_demand_forecast(sku=sku.upper(), db=db, horizon_days=horizon_days)
    except ValueError as ex:
        raise HTTPException(status_code=404, detail=str(ex))

@router.get("/shipments", response_model=List[ShipmentSchema])
def list_shipments(
    status: Optional[str] = Query(None, description="Filter by shipment status"),
    shipment_type: Optional[str] = Query(None, description="Filter inbound / outbound"),
    sku: Optional[str] = Query(None, description="Filter by SKU"),
    db: Session = Depends(get_db)
):
    """
    Lists tracked freight shipments (inbound supplier deliveries and outbound transfer shipments).
    """
    query = db.query(Shipment)
    if status:
        query = query.filter(Shipment.status == status)
    if shipment_type:
        query = query.filter(Shipment.type == shipment_type)
    if sku:
        query = query.filter(Shipment.sku == sku.upper())
    shipments = query.order_by(Shipment.dispatched_at.desc()).all()
    return [_deserialize_shipment(s) for s in shipments]

@router.post("/shipments", response_model=ShipmentSchema)
def create_shipment(req: ShipmentCreate, db: Session = Depends(get_db)):
    """
    Creates a new freight shipment record and appends to audit ledger.
    """
    now = datetime.now(timezone.utc)
    shipment_id = f"SHIP-{uuid.uuid4().hex[:6].upper()}"

    prod = db.query(Product).filter(Product.sku == req.sku.upper()).first()
    if not prod:
        raise HTTPException(status_code=404, detail=f"Product with SKU '{req.sku}' not found")

    new_shipment = Shipment(
        id=shipment_id,
        tracking_number=req.tracking_number,
        carrier=req.carrier,
        type=req.type,
        po_id=req.po_id,
        sku=req.sku.upper(),
        batch=req.batch,
        qty=req.qty,
        origin=req.origin,
        destination=req.destination,
        temp_controlled=req.temp_controlled,
        status="in_transit",
        dispatched_at=datetime.fromisoformat(req.dispatched_at) if req.dispatched_at else now,
        expected_delivery=datetime.fromisoformat(req.expected_delivery),
        notes=req.notes,
    )
    db.add(new_shipment)
    db.commit()

    append_ledger_event(
        db=db,
        event_type="SHIPMENT_DISPATCHED",
        payload={
            "shipment_id": shipment_id,
            "tracking_number": req.tracking_number,
            "carrier": req.carrier,
            "sku": req.sku.upper(),
            "qty": req.qty,
            "origin": req.origin,
            "destination": req.destination,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=True,
    )

    return _deserialize_shipment(new_shipment)

@router.patch("/shipments/{id}", response_model=ShipmentSchema)
def update_shipment_status(
    id: str,
    status: str = Query(..., description="Status: in_transit, delivered, delayed, exception"),
    db: Session = Depends(get_db)
):
    """
    Updates freight status (e.g. marked as delivered or delayed).
    """
    shipment = db.query(Shipment).filter(Shipment.id == id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail=f"Shipment '{id}' not found")

    now = datetime.now(timezone.utc)
    shipment.status = status
    if status == "delivered":
        shipment.actual_delivery = now
    db.commit()

    append_ledger_event(
        db=db,
        event_type="SHIPMENT_UPDATED",
        payload={
            "shipment_id": shipment.id,
            "new_status": status,
            "tracking_number": shipment.tracking_number,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=False,
    )

    return _deserialize_shipment(shipment)

@router.get("/transfers", response_model=List[WarehouseTransferSchema])
def list_warehouse_transfers(
    status: Optional[str] = Query(None, description="Filter transfer status"),
    db: Session = Depends(get_db)
):
    """
    Lists inter-warehouse stock transfer orders.
    """
    query = db.query(WarehouseTransfer)
    if status:
        query = query.filter(WarehouseTransfer.status == status)
    transfers = query.order_by(WarehouseTransfer.created_at.desc()).all()
    return [_deserialize_transfer(t) for t in transfers]

@router.post("/transfers", response_model=WarehouseTransferSchema)
def request_warehouse_transfer(req: WarehouseTransferCreate, db: Session = Depends(get_db)):
    """
    Initiates an inter-warehouse transfer request.
    Verifies source warehouse inventory prior to placement.
    """
    now = datetime.now(timezone.utc)
    transfer_id = f"XFER-{uuid.uuid4().hex[:6].upper()}"

    # Verify batch exists at from_warehouse
    source_stock = db.query(BatchInventory).filter(
        BatchInventory.sku == req.sku.upper(),
        BatchInventory.batch == req.batch,
        BatchInventory.warehouse == req.from_warehouse,
        BatchInventory.status == "active"
    ).first()

    if not source_stock or source_stock.qty < req.qty:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient active stock in {req.from_warehouse} for batch {req.batch}. Available: {source_stock.qty if source_stock else 0}, Requested: {req.qty}"
        )

    new_transfer = WarehouseTransfer(
        id=transfer_id,
        sku=req.sku.upper(),
        batch=req.batch,
        from_warehouse=req.from_warehouse,
        to_warehouse=req.to_warehouse,
        qty=req.qty,
        reason=req.reason,
        status="requested",
        requested_by=req.requested_by,
        created_at=now,
    )
    db.add(new_transfer)
    db.commit()

    append_ledger_event(
        db=db,
        event_type="TRANSFER_REQUESTED",
        payload={
            "transfer_id": transfer_id,
            "sku": req.sku.upper(),
            "batch": req.batch,
            "from_warehouse": req.from_warehouse,
            "to_warehouse": req.to_warehouse,
            "qty": req.qty,
            "requested_by": req.requested_by,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=True,
    )

    return _deserialize_transfer(new_transfer)

@router.post("/transfers/{id}/complete", response_model=WarehouseTransferSchema)
def complete_warehouse_transfer(
    id: str,
    approved_by: str = Query("Chief Pharmacist"),
    db: Session = Depends(get_db)
):
    """
    Completes transfer: deducts stock from source warehouse and credits target warehouse in BatchInventory.
    """
    transfer = db.query(WarehouseTransfer).filter(WarehouseTransfer.id == id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail=f"Transfer '{id}' not found")

    if transfer.status == "completed":
        raise HTTPException(status_code=400, detail="Transfer is already completed")

    now = datetime.now(timezone.utc)

    # Perform physical balance transfer in atomic nested block
    with db.begin_nested():
        source_stock = db.query(BatchInventory).filter(
            BatchInventory.sku == transfer.sku,
            BatchInventory.batch == transfer.batch,
            BatchInventory.warehouse == transfer.from_warehouse
        ).first()

        if not source_stock or source_stock.qty < transfer.qty:
            raise HTTPException(status_code=400, detail="Source inventory unavailable to execute transfer")

        source_stock.qty -= transfer.qty

        # Credit destination warehouse
        dest_stock = db.query(BatchInventory).filter(
            BatchInventory.sku == transfer.sku,
            BatchInventory.batch == transfer.batch,
            BatchInventory.warehouse == transfer.to_warehouse
        ).first()

        if dest_stock:
            dest_stock.qty += transfer.qty
        else:
            dest_stock = BatchInventory(
                sku=transfer.sku,
                batch=transfer.batch,
                warehouse=transfer.to_warehouse,
                qty=transfer.qty,
                mfg_date=source_stock.mfg_date,
                expiry_date=source_stock.expiry_date,
                status=source_stock.status,
            )
            db.add(dest_stock)

        transfer.status = "completed"
        transfer.approved_by = approved_by
        transfer.completed_at = now

    db.commit()

    append_ledger_event(
        db=db,
        event_type="TRANSFER_COMPLETED",
        payload={
            "transfer_id": transfer.id,
            "sku": transfer.sku,
            "batch": transfer.batch,
            "from_warehouse": transfer.from_warehouse,
            "to_warehouse": transfer.to_warehouse,
            "qty": transfer.qty,
            "approved_by": approved_by,
        },
        ts=now.isoformat(),
        trigger_auto_anchor=True,
    )

    return _deserialize_transfer(transfer)


# ---------------------------------------------------------------------------
# Purchase Orders Endpoints
# ---------------------------------------------------------------------------

@router.get("/purchase-orders")
def list_purchase_orders(
    status: Optional[str] = None,
    sku: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Lists real purchase orders from the database.
    Supports filtering by status (draft, ordered, received) and SKU.
    """
    query = db.query(PurchaseOrder)
    if status and status != "all":
        if status == "draft":
            query = query.filter((PurchaseOrder.draft == True) | (PurchaseOrder.status == "draft"))
        else:
            query = query.filter(PurchaseOrder.status == status)
    if sku:
        query = query.filter(PurchaseOrder.sku == sku)

    pos = query.all()
    # Serialize cleanly
    results = []
    for p in pos:
        prod = db.query(Product).filter(Product.sku == p.sku).first()
        supplier = db.query(Supplier).filter(Supplier.sku == p.sku).first()
        prod_title = f"{prod.brand} ({prod.molecule})" if prod else p.sku
        unit_price = supplier.unit_cost if supplier else 120.0
        results.append({
            "po": p.po,
            "manufacturer": p.manufacturer,
            "sku": p.sku,
            "product_name": prod_title,
            "qty": p.qty,
            "expected_date": p.expected_date.isoformat() if p.expected_date else None,
            "status": "draft" if p.draft else p.status,
            "draft": bool(p.draft),
            "estimated_cost": round(unit_price * p.qty, 2),
        })
    # Sort with drafts first, then alphabetically
    results.sort(key=lambda x: (0 if x["draft"] else 1, x["po"]))
    return {
        "total": len(results),
        "drafts_count": sum(1 for r in results if r["draft"]),
        "purchase_orders": results,
    }


@router.post("/purchase-orders")
def create_purchase_order(
    payload: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Creates a new draft or ordered Purchase Order.
    """
    po_num = payload.get("po") or f"PO-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    sku = payload.get("sku")
    manufacturer = payload.get("manufacturer") or "Arogya Certified Supplier"
    qty = int(payload.get("qty", 100))
    exp_date_str = payload.get("expected_date")
    status = payload.get("status", "draft")
    is_draft = payload.get("draft", status == "draft")

    if not sku:
        raise HTTPException(status_code=400, detail="Product SKU is required")

    prod = db.query(Product).filter(Product.sku == sku).first()
    if not prod:
        raise HTTPException(status_code=404, detail=f"Product with SKU '{sku}' not found")

    if exp_date_str:
        exp_date = datetime.strptime(exp_date_str, "%Y-%m-%d").date()
    else:
        exp_date = (datetime.now() + date.resolution * 7).date()

    existing = db.query(PurchaseOrder).filter(PurchaseOrder.po == po_num).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Purchase Order '{po_num}' already exists")

    new_po = PurchaseOrder(
        po=po_num,
        manufacturer=manufacturer,
        sku=sku,
        qty=qty,
        expected_date=exp_date,
        status=status,
        draft=is_draft,
    )
    db.add(new_po)
    db.commit()

    append_ledger_event(
        db=db,
        event_type="PURCHASE_ORDER_CREATED",
        payload={
            "po": po_num,
            "sku": sku,
            "qty": qty,
            "status": status,
            "draft": is_draft,
        },
        ts=datetime.now(timezone.utc).isoformat(),
        trigger_auto_anchor=False,
    )

    return {
        "status": "created",
        "po": po_num,
        "sku": sku,
        "qty": qty,
        "draft": is_draft,
    }


@router.post("/purchase-orders/{po}/approve")
def approve_purchase_order(
    po: str,
    approved_by: str = Query("Procurement Lead"),
    db: Session = Depends(get_db)
):
    """
    Transitions a draft Purchase Order to 'ordered' status and logs to audit ledger.
    """
    po_obj = db.query(PurchaseOrder).filter(PurchaseOrder.po == po).first()
    if not po_obj:
        raise HTTPException(status_code=404, detail=f"Purchase Order '{po}' not found")

    po_obj.draft = False
    po_obj.status = "ordered"
    db.commit()

    append_ledger_event(
        db=db,
        event_type="PURCHASE_ORDER_APPROVED",
        payload={
            "po": po,
            "sku": po_obj.sku,
            "qty": po_obj.qty,
            "approved_by": approved_by,
        },
        ts=datetime.now(timezone.utc).isoformat(),
        trigger_auto_anchor=True,
    )

    return {
        "status": "ordered",
        "po": po,
        "approved_by": approved_by,
        "message": f"Purchase Order {po} approved and placed with manufacturer.",
    }

