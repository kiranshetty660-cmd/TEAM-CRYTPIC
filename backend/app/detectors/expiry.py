from datetime import timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import BatchInventory, Dispatch, Product, Supplier
from app.schemas import Finding, FindingOption
from app.config import settings

def detect_near_expiry(db: Session) -> List[Finding]:
    findings = []
    today = settings.today
    sixty_days_ago = today - timedelta(days=60)

    # Pre-fetch lookup tables to eliminate N+1 network queries
    products = {p.sku: p for p in db.query(Product).all()}
    suppliers = {s.sku: s for s in db.query(Supplier).all()}
    disp_totals = {
        (row[0], row[1]): row[2]
        for row in db.query(Dispatch.sku, Dispatch.batch, func.sum(Dispatch.qty))
        .filter(Dispatch.date >= sixty_days_ago)
        .group_by(Dispatch.sku, Dispatch.batch)
        .all()
    }

    # Active batches
    batches = db.query(BatchInventory).filter(
        BatchInventory.status == "active",
        BatchInventory.qty > 0
    ).all()

    for b in batches:
        days_to_expiry = (b.expiry_date - today).days

        # Expiry rule: days_to_expiry < 120
        if days_to_expiry >= 120:
            continue

        # Calculate 60-day velocity for this batch & SKU
        disp_qty_60d = disp_totals.get((b.sku, b.batch), 0)

        velocity = round(disp_qty_60d / 60.0, 2)
        projected_sellable = round(velocity * max(0, days_to_expiry), 1)
        at_risk = max(0, int(b.qty - projected_sellable))

        # Flag if at_risk / qty > 0.2
        if b.qty > 0 and (at_risk / b.qty) > 0.2:
            prod = products.get(b.sku)
            supp = suppliers.get(b.sku)

            brand_name = prod.brand if prod else b.sku
            unit_cost = supp.unit_cost if supp else 100.0
            price = round(unit_cost * 1.25, 2)  # 25% margin standard distributor selling price
            value_at_risk = round(at_risk * unit_cost, 2)

            # Option comparator calculations according to Section 6
            return_window_days = supp.return_window_days if supp else 60
            credit_pct = supp.credit_pct if supp else 0.60
            days_to_window_close = days_to_expiry - return_window_days

            # 1. Return option
            can_return = days_to_window_close >= 0
            return_recovery = round(at_risk * unit_cost * credit_pct, 2) if can_return else 0.0

            # 2. Discount options (10%, 20%, 30%)
            discount_scenarios = []
            for disc, uplift in [
                (0.10, settings.VELOCITY_UPLIFT_10),
                (0.20, settings.VELOCITY_UPLIFT_20),
                (0.30, settings.VELOCITY_UPLIFT_30),
            ]:
                exp_sold = min(at_risk, int(round(velocity * uplift * days_to_expiry)))
                recovery = round(exp_sold * price * (1.0 - disc), 2)
                discount_scenarios.append({
                    "discount_pct": int(disc * 100),
                    "uplift": uplift,
                    "expected_sold": exp_sold,
                    "recovery_inr": recovery,
                })

            # Best discount scenario
            best_disc = max(discount_scenarios, key=lambda d: d["recovery_inr"])

            # 3. Inter-warehouse transfer option
            transfer_cost = 1800.0
            dest_velocity = max(1.0, velocity * 1.8)  # higher demand market e.g. WH-1 Bengaluru
            transfer_sold = min(at_risk, int(round(dest_velocity * days_to_expiry)))
            transfer_recovery = max(0.0, round((transfer_sold * price) - transfer_cost, 2))

            options = [
                FindingOption(
                    id="OPT-RETURN",
                    name=f"Manufacturer Return ({int(credit_pct*100)}% Credit)",
                    description=f"Initiate return request of {at_risk} units before return window expires in {days_to_window_close} days." if can_return else "Return window has expired.",
                    metrics={
                        "eligible": can_return,
                        "days_remaining_to_return": days_to_window_close,
                        "credit_pct": credit_pct,
                        "recovery_inr": return_recovery,
                        "write_off_inr": round(value_at_risk - return_recovery, 2),
                    },
                    projected_outcome=f"Guaranteed credit note of ₹{return_recovery:,.2f} from manufacturer." if can_return else "Manufacturer return rejected due to elapsed return window.",
                ),
                FindingOption(
                    id="OPT-DISCOUNT",
                    name=f"Promotional Clearance Discount ({best_disc['discount_pct']}%)",
                    description=f"Offer {best_disc['discount_pct']}% volume discount to high-velocity hospital/chemist network.",
                    metrics={
                        "discount_pct": best_disc["discount_pct"],
                        "velocity_uplift": best_disc["uplift"],
                        "expected_sold_units": best_disc["expected_sold"],
                        "recovery_inr": best_disc["recovery_inr"],
                    },
                    projected_outcome=f"Liquidates {best_disc['expected_sold']} units, recovering ₹{best_disc['recovery_inr']:,.2f} gross revenue.",
                ),
                FindingOption(
                    id="OPT-TRANSFER",
                    name="Inter-Warehouse Transfer to High-Demand Region",
                    description="Transfer inventory from current warehouse to high-turnover metro hub.",
                    metrics={
                        "destination": "WH-1 (Bengaluru Hub)",
                        "transfer_cost_inr": transfer_cost,
                        "projected_units_sold": transfer_sold,
                        "net_recovery_inr": transfer_recovery,
                    },
                    projected_outcome=f"Recovers net ₹{transfer_recovery:,.2f} after transit freight costs.",
                ),
            ]

            sev = round(min(90.0, 40.0 + (50.0 * (1.0 - (days_to_expiry / 120.0)))), 1)

            findings.append(Finding(
                id=f"FIND-EXP-{b.batch}",
                type="expiry",
                severity=sev,
                title=f"Near-Expiry Risk: {brand_name} (Batch {b.batch}, {days_to_expiry}d left)",
                description=f"Batch {b.batch} in {b.warehouse} has {b.qty} units with only {days_to_expiry} days to expiry. At velocity of {velocity}/day, {at_risk} units (₹{value_at_risk:,.2f}) will expire unsold.",
                entities={
                    "sku": b.sku,
                    "batch": b.batch,
                    "warehouse": b.warehouse,
                    "brand": brand_name,
                    "expiry_date": b.expiry_date.isoformat(),
                },
                metrics={
                    "days_to_expiry": days_to_expiry,
                    "qty_total": b.qty,
                    "daily_velocity": velocity,
                    "projected_sellable": projected_sellable,
                    "at_risk_qty": at_risk,
                    "value_at_risk_inr": value_at_risk,
                    "unit_cost": unit_cost,
                    "selling_price": price,
                    "return_window_days": return_window_days,
                    "days_to_window_close": days_to_window_close,
                },
                deadline=(today + timedelta(days=min(14, max(2, days_to_window_close)))).isoformat(),
                options=options,
                source_rows=[
                    {"type": "inventory", "batch": b.batch, "qty": b.qty, "expiry": b.expiry_date.isoformat()},
                    {"type": "velocity_metric", "last_60d_dispatches": disp_qty_60d, "daily_velocity": velocity},
                    {"type": "commercial", "unit_cost": unit_cost, "credit_pct": credit_pct, "return_window_days": return_window_days}
                ],
                evidence_sources=[
                    {
                        "source_table": "batch_inventory",
                        "record_id": f"{b.sku}:{b.batch}",
                        "timestamp": today.isoformat(),
                        "evidence_type": "EXPIRING_LOT_INSPECTION",
                        "details": {"batch": b.batch, "qty": b.qty, "expiry_date": b.expiry_date.isoformat(), "warehouse": b.warehouse}
                    },
                    {
                        "source_table": "dispatches",
                        "record_id": f"60D_DISPATCHES:{b.batch}",
                        "timestamp": f"{sixty_days_ago.isoformat()} - {today.isoformat()}",
                        "evidence_type": "CONSUMPTION_VELOCITY",
                        "details": {"units_shipped_60d": disp_qty_60d, "daily_rate": velocity}
                    },
                    {
                        "source_table": "suppliers",
                        "record_id": f"SUPPLIER:{b.sku}",
                        "timestamp": today.isoformat(),
                        "evidence_type": "VENDOR_CREDIT_POLICY",
                        "details": {"unit_cost": unit_cost, "return_window_days": return_window_days, "credit_pct": credit_pct}
                    }
                ],
                rule_metadata={
                    "rule_id": "RULE-EXP-003",
                    "rule_name": "Proactive Expiry & Unsold Inventory Mitigation",
                    "regulatory_reference": "Good Distribution Practice (GDP) Shelf-Life Liquidation Guidelines",
                    "threshold_days_to_expiry": 120,
                    "at_risk_ratio_threshold": 0.20,
                },
                calculation_steps=[
                    {"step": 1, "description": "Calculate remaining shelf life", "formula": "(expiry_date - today).days", "value": days_to_expiry},
                    {"step": 2, "description": "Compute 60-day historical consumption velocity", "formula": "sum(dispatches_60d) / 60.0", "value": velocity},
                    {"step": 3, "description": "Project sellable volume before expiration", "formula": "round(velocity * days_to_expiry, 1)", "value": projected_sellable},
                    {"step": 4, "description": "Isolate quantity at risk of expiry write-off", "formula": "max(0, qty - projected_sellable)", "value": at_risk},
                    {"step": 5, "description": "Calculate commercial value at risk", "formula": "at_risk * unit_cost", "value": value_at_risk},
                ],
                data_quality_warnings=["Zero historical dispatches for this batch; velocity assumed zero, maximizing risk projection." if disp_qty_60d == 0 else ""] if disp_qty_60d == 0 else [],
            ))

    return findings
