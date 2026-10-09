from datetime import timedelta
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import BatchInventory, Dispatch, Product, Supplier
from app.schemas import Finding, FindingOption
from app.config import settings

def detect_return_window_closing(db: Session) -> List[Finding]:
    findings = []
    today = settings.today
    sixty_days_ago = today - timedelta(days=60)

    batches = db.query(BatchInventory).filter(
        BatchInventory.status == "active",
        BatchInventory.qty > 0
    ).all()

    for b in batches:
        supp = db.query(Supplier).filter(Supplier.sku == b.sku).first()
        if not supp:
            continue

        return_window_days = supp.return_window_days
        window_close_date = b.expiry_date - timedelta(days=return_window_days)
        days_to_window_close = (window_close_date - today).days

        # Rule: flag if <= 14 days to close (and window has not passed more than 2 days)
        if -2 <= days_to_window_close <= 14:
            # Check at_risk
            days_to_expiry = (b.expiry_date - today).days
            disp_60d = db.query(func.sum(Dispatch.qty)).filter(
                Dispatch.sku == b.sku,
                Dispatch.batch == b.batch,
                Dispatch.date >= sixty_days_ago
            ).scalar() or 0
            velocity = round(disp_60d / 60.0, 2)
            projected_sellable = round(velocity * max(0, days_to_expiry), 1)
            at_risk = max(0, int(b.qty - projected_sellable))

            if at_risk > 0:
                prod = db.query(Product).filter(Product.sku == b.sku).first()
                brand_name = prod.brand if prod else b.sku
                credit_pct = supp.credit_pct
                value_at_risk = round(at_risk * supp.unit_cost, 2)
                recovery_inr = round(value_at_risk * credit_pct, 2)

                options = [
                    FindingOption(
                        id="OPT-RMA-EXECUTE",
                        name="Immediate Manufacturer Return Authorisation (RMA)",
                        description=f"Submit RMA request for {at_risk} units before window closes on {window_close_date.isoformat()} ({days_to_window_close} days remaining).",
                        metrics={
                            "units_to_return": at_risk,
                            "credit_pct": credit_pct,
                            "recovery_credit_inr": recovery_inr,
                            "window_closes_in_days": days_to_window_close,
                        },
                        projected_outcome=f"Secures ₹{recovery_inr:,.2f} credit note. After deadline, loss is 100% (₹{value_at_risk:,.2f}).",
                    ),
                    FindingOption(
                        id="OPT-EMERGENCY-DISCOUNT",
                        name="Emergency Hospital Clearance at 25% Off",
                        description="Push batch immediately to contracted hospital formulary at special clearance pricing.",
                        metrics={
                            "discount_pct": 25,
                            "expected_recovery_inr": round(at_risk * (supp.unit_cost * 1.25) * 0.75, 2),
                        },
                        projected_outcome="Instant local movement without waiting for manufacturer RMA shipping.",
                    )
                ]

                # High time pressure severity (75 to 88)
                sev = round(min(88.0, 75.0 + max(0, (14 - days_to_window_close))), 1)

                findings.append(Finding(
                    id=f"FIND-RET-{b.batch}",
                    type="returnwindow",
                    severity=sev,
                    title=f"Return Window Closing: {brand_name} ({days_to_window_close}d remaining)",
                    description=f"Manufacturer return window for {brand_name} (Batch {b.batch}) closes in {days_to_window_close} days. {at_risk} units at risk of total write-off (₹{value_at_risk:,.2f}).",
                    entities={
                        "sku": b.sku,
                        "batch": b.batch,
                        "brand": brand_name,
                        "manufacturer": supp.manufacturer,
                        "warehouse": b.warehouse,
                    },
                    metrics={
                        "days_to_window_close": days_to_window_close,
                        "window_close_date": window_close_date.isoformat(),
                        "at_risk_qty": at_risk,
                        "unit_cost": supp.unit_cost,
                        "credit_pct": credit_pct,
                        "value_at_risk_inr": value_at_risk,
                        "potential_recovery_inr": recovery_inr,
                    },
                    deadline=window_close_date.isoformat(),
                    options=options,
                    source_rows=[
                        {"type": "supplier_contract", "manufacturer": supp.manufacturer, "return_window_days": return_window_days, "credit_pct": credit_pct},
                        {"type": "inventory_batch", "batch": b.batch, "qty": b.qty, "expiry": b.expiry_date.isoformat()}
                    ],
                    evidence_sources=[
                        {
                            "source_table": "suppliers",
                            "record_id": f"SUPPLIER:{supp.manufacturer}:{b.sku}",
                            "timestamp": today.isoformat(),
                            "evidence_type": "CONTRACT_RETURN_POLICY",
                            "details": {"manufacturer": supp.manufacturer, "return_window_days": return_window_days, "credit_pct": credit_pct, "unit_cost": supp.unit_cost}
                        },
                        {
                            "source_table": "batch_inventory",
                            "record_id": f"LOT:{b.batch}",
                            "timestamp": today.isoformat(),
                            "evidence_type": "UNSOLD_STOCK_AT_RISK",
                            "details": {"batch": b.batch, "qty": b.qty, "expiry_date": b.expiry_date.isoformat(), "warehouse": b.warehouse}
                        }
                    ],
                    rule_metadata={
                        "rule_id": "RULE-RET-004",
                        "rule_name": "Supplier Debit Note & RMA Window Expiry Protection",
                        "regulatory_reference": "Pharma Commercial Distribution RMA Protocol",
                        "threshold_days_to_window_close": 30,
                    },
                    calculation_steps=[
                        {"step": 1, "description": "Calculate return window closing cutoff", "formula": "expiry_date - return_window_days", "value": window_close_date.isoformat()},
                        {"step": 2, "description": "Compute remaining claim window", "formula": "(window_close_date - today).days", "value": days_to_window_close},
                        {"step": 3, "description": "Calculate recoverable manufacturer credit", "formula": "at_risk * unit_cost * credit_pct", "value": recovery_inr},
                        {"step": 4, "description": "Calculate unmitigated write-off risk", "formula": "at_risk * unit_cost", "value": value_at_risk},
                    ],
                    data_quality_warnings=["Supplier agreement lacks explicit return window; 60-day default applied."] if (return_window_days == 60 and not supp.return_window_days) else [],
                ))

    return findings
