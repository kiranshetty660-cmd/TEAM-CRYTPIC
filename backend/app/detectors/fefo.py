from datetime import timedelta
from typing import List
from sqlalchemy.orm import Session
from app.models import Dispatch, BatchInventory, Product
from app.schemas import Finding, FindingOption
from app.config import settings

def detect_fefo_violations(db: Session) -> List[Finding]:
    findings = []
    today = settings.today
    fourteen_days_ago = today - timedelta(days=14)

    # Pre-fetch lookup tables to eliminate N+1 network queries
    products = {p.sku: p for p in db.query(Product).all()}
    all_batches = db.query(BatchInventory).all()
    batch_by_key = {(b.sku, b.batch, b.warehouse): b for b in all_batches}
    active_by_wh_sku = {}
    for b in all_batches:
        if b.status == "active" and b.qty > 0:
            active_by_wh_sku.setdefault((b.warehouse, b.sku), []).append(b)

    # Dispatches in last 14 days
    recent_dispatches = db.query(Dispatch).filter(
        Dispatch.date >= fourteen_days_ago
    ).order_by(Dispatch.date.desc()).all()

    processed_pairs = set()

    for disp in recent_dispatches:
        # Get the dispatched batch's expiry
        disp_batch = batch_by_key.get((disp.sku, disp.batch, disp.from_warehouse))
        if not disp_batch:
            continue

        # Look for older-expiry batches of same SKU in the same warehouse with qty > 0
        candidate_batches = active_by_wh_sku.get((disp.from_warehouse, disp.sku), [])
        older_batches = [
            b for b in candidate_batches
            if b.expiry_date < disp_batch.expiry_date
        ]

        for older in older_batches:
            pair_key = (disp.sku, older.batch, disp.batch)
            if pair_key in processed_pairs:
                continue
            processed_pairs.add(pair_key)

            prod = products.get(disp.sku)
            brand_name = prod.brand if prod else disp.sku

            options = [
                FindingOption(
                    id="OPT-ENFORCE-FEFO",
                    name="Issue Priority Pick Instruction for Older Batch",
                    description=f"Pin older batch {older.batch} as mandatory next-pick in WMS/ERP for all outbound dispatches from {disp.from_warehouse}.",
                    metrics={
                        "older_batch": older.batch,
                        "older_batch_qty": older.qty,
                        "expiry_difference_days": (disp_batch.expiry_date - older.expiry_date).days,
                    },
                    projected_outcome=f"Liquidates {older.qty} units of earlier-expiring batch first, restoring strict FEFO compliance.",
                ),
                FindingOption(
                    id="OPT-AUDIT-BIN",
                    name="Warehouse Bin Audit & Reroute",
                    description=f"Conduct physical bin inspection in {disp.from_warehouse} to check if older batch {older.batch} was blocked by physical obstruction.",
                    metrics={
                        "warehouse": disp.from_warehouse,
                        "older_batch": older.batch,
                    },
                    projected_outcome="Resolves root-cause bin accessibility issue in warehouse.",
                )
            ]

            findings.append(Finding(
                id=f"FIND-FEFO-{older.batch}-{disp.batch}",
                type="fefo",
                severity=70.0,
                title=f"FEFO Violation: {brand_name} ({disp.from_warehouse})",
                description=f"Batch {disp.batch} (exp: {disp_batch.expiry_date.isoformat()}) was dispatched on {disp.date.isoformat()} while earlier-expiring batch {older.batch} (exp: {older.expiry_date.isoformat()}, qty: {older.qty}) remained in {disp.from_warehouse}.",
                entities={
                    "sku": disp.sku,
                    "brand": brand_name,
                    "warehouse": disp.from_warehouse,
                    "dispatched_batch": disp.batch,
                    "dispatched_expiry": disp_batch.expiry_date.isoformat(),
                    "unpicked_older_batch": older.batch,
                    "older_expiry": older.expiry_date.isoformat(),
                    "older_qty_remaining": older.qty,
                    "last_violating_dispatch_id": disp.id,
                },
                metrics={
                    "dispatched_qty": disp.qty,
                    "older_batch_stock": older.qty,
                    "days_expiry_delta": (disp_batch.expiry_date - older.expiry_date).days,
                    "customer_id": disp.customer_id,
                },
                deadline=(today + timedelta(days=2)).isoformat(),
                options=options,
                source_rows=[
                    {"type": "violating_dispatch", "id": disp.id, "batch": disp.batch, "date": disp.date.isoformat(), "qty": disp.qty},
                    {"type": "unsold_older_batch", "batch": older.batch, "qty": older.qty, "expiry": older.expiry_date.isoformat()}
                ],
                evidence_sources=[
                    {
                        "source_table": "dispatches",
                        "record_id": f"DISPATCH:{disp.id}",
                        "timestamp": disp.date.isoformat(),
                        "evidence_type": "INVERTED_PICK_EVENT",
                        "details": {"dispatch_id": disp.id, "customer_id": disp.customer_id, "dispatched_batch": disp.batch, "qty": disp.qty}
                    },
                    {
                        "source_table": "batch_inventory",
                        "record_id": f"BYPASSED_LOT:{older.batch}",
                        "timestamp": today.isoformat(),
                        "evidence_type": "OLDER_RESIDUAL_LOT",
                        "details": {"batch": older.batch, "older_expiry": older.expiry_date.isoformat(), "residual_qty": older.qty, "warehouse": older.warehouse}
                    }
                ],
                rule_metadata={
                    "rule_id": "RULE-FEFO-005",
                    "rule_name": "First-Expiry-First-Out (FEFO) Dispatch Inversion Control",
                    "regulatory_reference": "WHO GDP Guidelines for Pharmaceutical Products Section 12",
                    "violation_condition": "Dispatched lot expiration date > Active on-hand lot expiration date in same depot",
                },
                calculation_steps=[
                    {"step": 1, "description": "Verify date sequence inversion", "formula": "dispatched_expiry > older_expiry", "value": True},
                    {"step": 2, "description": "Compute expiration gap delta", "formula": "(dispatched_expiry - older_expiry).days", "value": (disp_batch.expiry_date - older.expiry_date).days},
                    {"step": 3, "description": "Identify unpicked residual inventory", "formula": "older.qty", "value": older.qty},
                ],
                data_quality_warnings=["Depot lacks automated WMS barcode-directed pick verification."] if older.warehouse == "WH-1" else [],
            ))

    return findings
