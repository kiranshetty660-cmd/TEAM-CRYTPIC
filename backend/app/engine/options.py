from typing import Dict, Any, List
from app.config import settings

def compare_near_expiry_options(
    qty_at_risk: int,
    days_to_expiry: int,
    daily_velocity: float,
    unit_cost: float,
    selling_price: float,
    days_to_window_close: int,
    credit_pct: float,
    transfer_cost: float = 1800.0,
    dest_velocity_multiplier: float = 1.8,
) -> List[Dict[str, Any]]:
    """
    Computes comparative financial options table for near-expiry inventory.
    """
    # 1. Manufacturer Return
    can_return = (days_to_window_close >= 0)
    return_recovery = round(qty_at_risk * unit_cost * credit_pct, 2) if can_return else 0.0

    # 2. Discount tiers (10%, 20%, 30%)
    discounts = []
    for disc, uplift in [
        (0.10, settings.VELOCITY_UPLIFT_10),
        (0.20, settings.VELOCITY_UPLIFT_20),
        (0.30, settings.VELOCITY_UPLIFT_30),
    ]:
        exp_sold = min(qty_at_risk, int(round(daily_velocity * uplift * max(0, days_to_expiry))))
        recovery = round(exp_sold * selling_price * (1.0 - disc), 2)
        discounts.append({
            "discount_pct": int(disc * 100),
            "uplift": uplift,
            "expected_sold": exp_sold,
            "gross_recovery_inr": recovery,
            "unsold_writeoff_inr": round(max(0, qty_at_risk - exp_sold) * unit_cost, 2),
        })

    # 3. Inter-Warehouse Transfer
    dest_vel = max(1.0, daily_velocity * dest_velocity_multiplier)
    transfer_sold = min(qty_at_risk, int(round(dest_vel * max(0, days_to_expiry))))
    transfer_net = max(0.0, round((transfer_sold * selling_price) - transfer_cost, 2))

    # 4. Hold (status quo)
    hold_sold = min(qty_at_risk, int(round(daily_velocity * max(0, days_to_expiry))))
    hold_recovery = round(hold_sold * selling_price, 2)
    hold_writeoff = round((qty_at_risk - hold_sold) * unit_cost, 2)

    return [
        {
            "option": "Return to Manufacturer",
            "condition": f"Available ({days_to_window_close} days left)" if can_return else "Expired",
            "units_liquidated": qty_at_risk if can_return else 0,
            "net_recovery_inr": return_recovery,
            "recovery_rate_pct": round(credit_pct * 100, 1) if can_return else 0.0,
            "execution_speed": "3-5 days (RMA process)",
            "risk_profile": "Zero risk once manufacturer accepts credit note",
        },
        {
            "option": f"Promotional Discount ({discounts[1]['discount_pct']}%)",
            "condition": f"Uplift factor {discounts[1]['uplift']}x",
            "units_liquidated": discounts[1]["expected_sold"],
            "net_recovery_inr": discounts[1]["gross_recovery_inr"],
            "recovery_rate_pct": round((discounts[1]["gross_recovery_inr"] / max(1, qty_at_risk * selling_price)) * 100, 1),
            "execution_speed": "Immediate (Push to chemists)",
            "risk_profile": "Moderate market absorption risk",
        },
        {
            "option": "Inter-Warehouse Transfer",
            "condition": f"Freight ₹{transfer_cost:,.0f}",
            "units_liquidated": transfer_sold,
            "net_recovery_inr": transfer_net,
            "recovery_rate_pct": round((transfer_net / max(1, qty_at_risk * selling_price)) * 100, 1),
            "execution_speed": "24-48 hours",
            "risk_profile": "Transit damage / logistics coordination risk",
        },
        {
            "option": "Hold (Do Nothing)",
            "condition": "Natural run-out",
            "units_liquidated": hold_sold,
            "net_recovery_inr": hold_recovery,
            "recovery_rate_pct": round((hold_recovery / max(1, qty_at_risk * selling_price)) * 100, 1),
            "execution_speed": "Passive",
            "risk_profile": f"High risk: ₹{hold_writeoff:,.2f} expired loss",
        },
    ]

def compare_recall_replacement_options(
    clean_stock_available: int,
    dispatched_recalled_qty: int,
    hospitals_qty_needed: int,
    chemists_qty_needed: int,
    lead_time_days: int,
    unit_cost: float,
) -> List[Dict[str, Any]]:
    """
    Computes comparative table for recall replacement:
    A: Clean batch only
    B: Clean batch + Urgent PO
    C: Clean batch + Urgent PO + Inter-warehouse transfer
    """
    total_need = hospitals_qty_needed + chemists_qty_needed
    hosp_fill_a = min(clean_stock_available, hospitals_qty_needed)
    hosp_pct_a = round((hosp_fill_a / max(1, hospitals_qty_needed)) * 100.0, 1)
    shortfall_a = max(0, total_need - clean_stock_available)

    return [
        {
            "id": "A",
            "strategy": "Clean Batch Only (Hospitals First)",
            "shortfall": shortfall_a,
            "hospital_fill_rate_pct": hosp_pct_a,
            "estimated_cost_inr": 0.0,
            "eta_days": 1,
            "description": f"Allocates {clean_stock_available} units of clean stock immediately. Covers {hosp_pct_a}% of hospital emergency needs.",
        },
        {
            "id": "B",
            "strategy": "Clean Batch + Urgent Manufacturer PO",
            "shortfall": 0,
            "hospital_fill_rate_pct": 100.0,
            "estimated_cost_inr": round(shortfall_a * unit_cost, 2),
            "eta_days": lead_time_days,
            "description": f"Covers immediate hospital emergency, plus expedited manufacturer replenishment for {shortfall_a} units arriving in {lead_time_days} days.",
        },
        {
            "id": "C",
            "strategy": "Clean Batch + Urgent PO + Inter-WH Transfer",
            "shortfall": 0,
            "hospital_fill_rate_pct": 100.0,
            "estimated_cost_inr": round((shortfall_a * unit_cost) + 4000.0, 2),
            "eta_days": 2,
            "description": "Emergency air/express transfer from regional warehouse closes entire network shortfall in 48 hours.",
        },
    ]
