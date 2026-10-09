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

    # All critical products
    critical_prods = db.query(Product).filter(Product.critical_drug == True).all()

    for prod in critical_prods:
        # Sum active stock across warehouses
        total_stock = db.query(func.sum(BatchInventory.qty)).filter(
            BatchInventory.sku == prod.sku,
            BatchInventory.status == "active"
        ).scalar() or 0

        # Calculate average daily demand over 60 days
        disp_60d = db.query(func.sum(Dispatch.qty)).filter(
            Dispatch.sku == prod.sku,
            Dispatch.date >= sixty_days_ago
        ).scalar() or 0
        avg_daily_demand = max(1.0, round(disp_60d / 60.0, 1))

        cover_days = round(total_stock / avg_daily_demand, 1)

        supp = db.query(Supplier).filter(Supplier.sku == prod.sku).first()
        lead_time = supp.lead_time_days if supp else 7
        threshold_days = lead_time + 3

        if cover_days < threshold_days:
            # Check if there is an open PO arriving within lead_time + 1 days
            po_arriving = db.query(PurchaseOrder).filter(
                PurchaseOrder.sku == prod.sku,
                PurchaseOrder.status.in_(["ordered", "draft"]),
                PurchaseOrder.expected_date <= today + timedelta(days=lead_time + 1)
            ).first()

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
                    ]
                ))

    return findings
