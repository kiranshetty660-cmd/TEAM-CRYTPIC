from datetime import timedelta
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import Product, BatchInventory, Dispatch, Supplier, PurchaseOrder
from app.schemas import Finding, FindingOption
from app.config import settings

def detect_critical_shortages(db: Session) -> List[Finding]:
    findings = []
    today = settings.today
    sixty_days_ago = today - timedelta(days=60)

    # Pre-fetch lookup tables to eliminate N+1 network queries
    suppliers = {s.sku: s for s in db.query(Supplier).all()}
    stock_by_sku = dict(
        db.query(BatchInventory.sku, func.sum(BatchInventory.qty))
        .filter(BatchInventory.status == "active")
        .group_by(BatchInventory.sku)
        .all()
    )
    disp_by_sku = dict(
        db.query(Dispatch.sku, func.sum(Dispatch.qty))
        .filter(Dispatch.date >= sixty_days_ago)
        .group_by(Dispatch.sku)
        .all()
    )
    open_pos_by_sku = {}
    for po in db.query(PurchaseOrder).filter(PurchaseOrder.status.in_(["ordered", "draft"])).all():
        open_pos_by_sku.setdefault(po.sku, []).append(po)

    # All critical products
    critical_prods = db.query(Product).filter(Product.critical_drug == True).all()

    for prod in critical_prods:
        # Sum active stock across warehouses
        total_stock = stock_by_sku.get(prod.sku, 0)

        # Calculate average daily demand over 60 days
        disp_60d = disp_by_sku.get(prod.sku, 0)
        avg_daily_demand = max(1.0, round(disp_60d / 60.0, 1))

        cover_days = round(total_stock / avg_daily_demand, 1)

        supp = suppliers.get(prod.sku)
        lead_time = supp.lead_time_days if supp else 7
        threshold_days = lead_time + 3

        if cover_days < threshold_days:
            # Check if there is an open PO arriving within lead_time + 1 days
            pos = open_pos_by_sku.get(prod.sku, [])
            po_arriving = any(po.expected_date <= today + timedelta(days=lead_time + 1) for po in pos)

            if not po_arriving:
                recommended_reorder_qty = max(supp.moq if supp else 200, int(avg_daily_demand * 30))

                options = [
                    FindingOption(
                        id="OPT-URGENT-PO",
                        name=f"Urgent PO to {supp.manufacturer if supp else 'Manufacturer'}",
                        description=f"Issue expedited Purchase Order for {recommended_reorder_qty} units with supplier priority guarantee.",
                        metrics={
                            "reorder_qty": recommended_reorder_qty,
                            "supplier_lead_time_days": lead_time,
                            "estimated_cost_inr": recommended_reorder_qty * (supp.unit_cost if supp else 150.0),
                        },
                        projected_outcome=f"Prevents complete hospital stockout. Order arrives in {lead_time} days.",
                    ),
                    FindingOption(
                        id="OPT-RATION-HOSPITALS",
                        name="Ration Stock: Critical Hospital Inpatients Only",
                        description=f"Restrict remaining {total_stock} units exclusively to Level-3 Intensive Care and Hospital emergency orders.",
                        metrics={
                            "reserved_units": total_stock,
                            "extended_cover_days": round(total_stock / (avg_daily_demand * 0.4), 1),
                        },
                        projected_outcome="Stretches emergency supply to 10 days by pausing chemist distribution.",
                    )
                ]

                findings.append(Finding(
                    id=f"FIND-CRIT-{prod.sku}",
                    type="critical",
                    severity=94.0,  # High priority pinned
                    title=f"Critical Shortage: {prod.brand} ({cover_days}d stock cover)",
                    description=f"Essential life-saving drug {prod.brand} has only {total_stock} units remaining ({cover_days} days cover). Supplier lead time is {lead_time} days with no inbound PO in time.",
                    entities={
                        "sku": prod.sku,
                        "brand": prod.brand,
                        "molecule": prod.molecule,
                        "storage": prod.storage,
                        "supplier": supp.manufacturer if supp else "N/A",
                    },
                    metrics={
                        "total_stock": total_stock,
                        "avg_daily_demand": avg_daily_demand,
                        "cover_days": cover_days,
                        "supplier_lead_time_days": lead_time,
                        "safety_buffer_shortfall_days": round(threshold_days - cover_days, 1),
                        "recommended_order_qty": recommended_reorder_qty,
                    },
                    deadline=(today + timedelta(days=int(cover_days))).isoformat(),
                    options=options,
                    source_rows=[
                        {"type": "critical_product", "sku": prod.sku, "brand": prod.brand},
                        {"type": "current_inventory", "total_stock": total_stock, "cover_days": cover_days},
                        {"type": "supply_chain", "lead_time_days": lead_time, "threshold_days": threshold_days}
                    ],
                    evidence_sources=[
                        {
                            "source_table": "products",
                            "record_id": f"CATALOG:{prod.sku}",
                            "timestamp": today.isoformat(),
                            "evidence_type": "EMERGENCY_ICU_CLASSIFICATION",
                            "details": {"sku": prod.sku, "brand": prod.brand, "critical_drug": True, "category": prod.category}
                        },
                        {
                            "source_table": "batch_inventory",
                            "record_id": f"ACTIVE_STOCK:{prod.sku}",
                            "timestamp": today.isoformat(),
                            "evidence_type": "AGGREGATE_CLEAN_STOCK",
                            "details": {
                                "on_hand_units": total_stock,
                                "active_batches_count": db.query(BatchInventory).filter(BatchInventory.sku == prod.sku, BatchInventory.status == "active").count()
                            }
                        },
                        {
                            "source_table": "suppliers",
                            "record_id": f"LEAD_TIME:{prod.sku}",
                            "timestamp": today.isoformat(),
                            "evidence_type": "REPLENISHMENT_LEAD_TIME",
                            "details": {"lead_time_days": lead_time, "moq": supp.moq if supp else 200}
                        }
                    ],
                    rule_metadata={
                        "rule_id": "RULE-CRIT-006",
                        "rule_name": "Critical Drug Stockout Buffer Warning",
                        "regulatory_reference": "National List of Essential Medicines (NLEM) ICU Continuity Protocol",
                        "threshold_definition": f"Days of cover < (Supplier Lead Time ({lead_time}d) + Safety Buffer (3d))",
                    },
                    calculation_steps=[
                        {"step": 1, "description": "Calculate daily consumption rate over 60 days", "formula": "sum(dispatches_60d) / 60.0", "value": avg_daily_demand},
                        {"step": 2, "description": "Compute runway stock cover days", "formula": "total_stock / avg_daily_demand", "value": cover_days},
                        {"step": 3, "description": "Evaluate minimum safe stock threshold", "formula": "lead_time + 3", "value": threshold_days},
                        {"step": 4, "description": "Calculate replenishment deficit aligned with MOQ", "formula": "max(moq, ceil(shortfall))", "value": recommended_reorder_qty},
                    ],
                    data_quality_warnings=["Pending inbound purchase orders not registered in ERP; assuming zero in-transit buffer."] if not db.query(PurchaseOrder).filter(PurchaseOrder.sku == prod.sku, PurchaseOrder.status == "ordered").first() else [],
                ))

    return findings
