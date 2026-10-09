import json
from datetime import timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import Recall, BatchInventory, Dispatch, Customer, Product, Supplier
from app.schemas import Finding, FindingOption
from app.config import settings

def detect_recalls(db: Session) -> List[Finding]:
    findings = []
    today = settings.today
    thirty_days_ago = today - timedelta(days=30)
    sixty_days_ago = today - timedelta(days=60)

    recalls = db.query(Recall).all()
    for rec in recalls:
        try:
            batch_list = json.loads(rec.batches) if isinstance(rec.batches, str) else rec.batches
        except Exception:
            batch_list = [rec.batches]

        product = db.query(Product).filter(Product.sku == rec.sku).first()
        brand_name = product.brand if product else rec.sku

        # 1. Stock currently in warehouse for recalled batches
        wh_inventory = db.query(BatchInventory).filter(
            BatchInventory.sku == rec.sku,
            BatchInventory.batch.in_(batch_list)
        ).all()
        stock_in_wh = sum(b.qty for b in wh_inventory)
        wh_locations = [{"warehouse": b.warehouse, "qty": b.qty, "status": b.status} for b in wh_inventory]

        # 2. Dispatches in last 30 days for recalled batches
        dispatches_30d = db.query(Dispatch).filter(
            Dispatch.sku == rec.sku,
            Dispatch.batch.in_(batch_list),
            Dispatch.date >= thirty_days_ago
        ).all()
        dispatched_total = sum(d.qty for d in dispatches_30d)

        # Per customer aggregation (hospitals first)
        cust_map = {}
        for d in dispatches_30d:
            if d.customer_id not in cust_map:
                cust = db.query(Customer).filter(Customer.customer_id == d.customer_id).first()
                cust_map[d.customer_id] = {
                    "customer_id": d.customer_id,
                    "name": cust.name if cust else d.customer_id,
                    "type": cust.type if cust else "chemist",
                    "location": cust.location if cust else "Unknown",
                    "dispatched_qty": 0,
                }
            cust_map[d.customer_id]["dispatched_qty"] += d.qty

        customer_list = sorted(
            cust_map.values(),
            key=lambda c: (0 if c["type"] == "hospital" else 1, -c["dispatched_qty"])
        )
        hospitals_count = sum(1 for c in customer_list if c["type"] == "hospital")
        chemists_count = sum(1 for c in customer_list if c["type"] == "chemist")

        # 3. Normal daily demand (last 60 days total dispatched / 60)
        disp_60d_qty = db.query(func.sum(Dispatch.qty)).filter(
            Dispatch.sku == rec.sku,
            Dispatch.date >= sixty_days_ago
        ).scalar() or 0
        normal_daily_demand = max(1.0, round(disp_60d_qty / 60.0, 1))

        # 4. Supplier lead time
        supplier = db.query(Supplier).filter(Supplier.sku == rec.sku).first()
        lead_time_days = supplier.lead_time_days if supplier else 8

        # 5. Replacement need = dispatched_total + normal_daily_demand * lead_time_days
        replacement_need = int(dispatched_total + round(normal_daily_demand * lead_time_days))

        # 6. Clean stock (active inventory not in recalled batches)
        clean_inventory = db.query(BatchInventory).filter(
            BatchInventory.sku == rec.sku,
            ~BatchInventory.batch.in_(batch_list),
            BatchInventory.status == "active"
        ).all()
        clean_qty = sum(b.qty for b in clean_inventory)

        # 7. Coverage and shortfall
        coverage = round(clean_qty / replacement_need, 2) if replacement_need > 0 else 1.0
        shortfall = max(0, replacement_need - clean_qty)

        # Severity
        base_sev = 95.0 if rec.recall_class == "II" else (100.0 if rec.recall_class == "I" else 80.0)

        # Options for replacement: A, B, C
        hospital_clean_allocation = min(clean_qty, sum(c["dispatched_qty"] for c in customer_list if c["type"] == "hospital"))
        hospital_fill_rate_a = round((hospital_clean_allocation / max(1, sum(c["dispatched_qty"] for c in customer_list if c["type"] == "hospital"))) * 100, 1)

        options = [
            FindingOption(
                id="OPT-A",
                name="A: Clean Batch Only (Priority to Hospitals)",
                description=f"Allocate {clean_qty} units of clean stock immediately, prioritising all {hospitals_count} hospitals.",
                metrics={
                    "shortfall": shortfall,
                    "hospital_fill_rate_pct": hospital_fill_rate_a,
                    "cost_inr": 0,
                    "eta_days": 1,
                    "clean_qty_allocated": min(clean_qty, replacement_need),
                },
                projected_outcome=f"Covers {min(clean_qty, replacement_need)} units immediately. Shortfall of {shortfall} units remains for chemist replenishment.",
            ),
            FindingOption(
                id="OPT-B",
                name="B: Clean Batch + Urgent Manufacturer PO",
                description=f"Allocate clean stock immediately and place expedited PO for {shortfall} units with manufacturer.",
                metrics={
                    "shortfall": 0,
                    "hospital_fill_rate_pct": 100.0,
                    "cost_inr": shortfall * (supplier.unit_cost if supplier else 120.0),
                    "eta_days": lead_time_days,
                    "clean_qty_allocated": min(clean_qty, replacement_need),
                },
                projected_outcome=f"Full replenishment achieved within {lead_time_days} days. Zero persistent hospital shortage.",
            ),
            FindingOption(
                id="OPT-C",
                name="C: Clean Batch + Urgent PO + Inter-Warehouse Transfer",
                description="Combine local clean stock with emergency inter-warehouse transit and expedited PO.",
                metrics={
                    "shortfall": 0,
                    "hospital_fill_rate_pct": 100.0,
                    "cost_inr": (shortfall * (supplier.unit_cost if supplier else 120.0)) + 3500.0,
                    "eta_days": 2,
                    "clean_qty_allocated": min(clean_qty, replacement_need),
                },
                projected_outcome="Rapid 48-hour gap closure across all regional nodes at minor inter-warehouse courier surcharge.",
            ),
        ]

        # Data quality checks
        data_quality_warnings = []
        if any(c["location"] == "Unknown" for c in customer_list):
            data_quality_warnings.append("Some customer accounts lack geo-location data.")
        if any(w["warehouse"] == "UNASSIGNED" for w in wh_locations):
            data_quality_warnings.append("Inventory exists in an UNASSIGNED warehouse location.")

        findings.append(Finding(
            id=f"FIND-REC-{rec.id}",
            type="recall",
            severity=base_sev,
            title=f"Class {rec.recall_class} Recall: {brand_name} ({', '.join(batch_list)})",
            description=f"Official regulatory recall for {brand_name}. {stock_in_wh} units in warehouse, {dispatched_total} units dispatched in last 30d across {len(customer_list)} accounts.",
            entities={
                "sku": rec.sku,
                "product_name": brand_name,
                "batches": batch_list,
                "recall_id": rec.id,
                "recall_class": rec.recall_class,
                "reason": rec.reason,
                "warehouses": [w["warehouse"] for w in wh_locations],
            },
            metrics={
                "stock_in_wh": stock_in_wh,
                "dispatched_total_30d": dispatched_total,
                "clean_qty": clean_qty,
                "replacement_need": replacement_need,
                "normal_daily_demand": normal_daily_demand,
                "lead_time_days": lead_time_days,
                "coverage_ratio": coverage,
                "shortfall": shortfall,
                "hospitals_affected": hospitals_count,
                "chemists_affected": chemists_count,
                "total_customers": len(customer_list),
            },
            deadline=(today + timedelta(hours=24)).isoformat(),
            options=options,
            source_rows=[
                {"type": "recall_record", "id": rec.id, "class": rec.recall_class, "reason": rec.reason},
                {"type": "wh_inventory", "locations": wh_locations},
                {"type": "clean_inventory", "clean_batches": [b.batch for b in clean_inventory], "clean_qty": clean_qty},
            ],
            evidence_sources=[
                {
                    "source_table": "recalls",
                    "record_id": rec.id,
                    "timestamp": rec.date.isoformat(),
                    "evidence_type": "REGULATORY_NOTICE",
                    "details": {"sku": rec.sku, "batches": batch_list, "recall_class": rec.recall_class, "reason": rec.reason}
                },
                {
                    "source_table": "batch_inventory",
                    "record_id": f"SKU:{rec.sku}",
                    "timestamp": today.isoformat(),
                    "evidence_type": "WAREHOUSE_ON_HAND",
                    "details": {"quarantinable_stock": stock_in_wh, "locations": wh_locations}
                },
                {
                    "source_table": "dispatches",
                    "record_id": f"30D_HISTORY:{rec.sku}",
                    "timestamp": f"{thirty_days_ago.isoformat()} - {today.isoformat()}",
                    "evidence_type": "DISPATCH_EXPOSURE",
                    "details": {"dispatched_units": dispatched_total, "accounts_count": len(customer_list), "hospitals": hospitals_count}
                }
            ],
            rule_metadata={
                "rule_id": "RULE-REC-001",
                "rule_name": "CDSCO Regulatory Batch Quarantine & Trace",
                "regulatory_reference": "CDSCO Drugs & Cosmetics Rules Section 28B / FDA Class Recall Protocol",
                "statutory_response_limit_hours": 24,
                "threshold_applied": "Active stock > 0 OR Dispatched units in 30d > 0",
            },
            calculation_steps=[
                {"step": 1, "description": "Sum warehouse inventory for recalled batches", "formula": "sum(b.qty for b in wh_inventory)", "value": stock_in_wh},
                {"step": 2, "description": "Compute 30-day outbound exposure across accounts", "formula": "sum(d.qty for d in dispatches_30d)", "value": dispatched_total},
                {"step": 3, "description": "Determine clean replacement stock", "formula": "sum(clean_inventory.qty)", "value": clean_qty},
                {"step": 4, "description": "Calculate stock shortfall", "formula": "max(0, replacement_need - clean_qty)", "value": shortfall},
            ],
            data_quality_warnings=data_quality_warnings,
        ))

    return findings
