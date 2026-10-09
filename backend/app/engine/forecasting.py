import math
from datetime import date, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import Product, BatchInventory, Dispatch, Supplier, PurchaseOrder, Shipment

def calculate_demand_forecast(
    sku: str,
    db: Session,
    horizon_days: int = 60,
    reference_date: Optional[date] = None,
    service_level_z: float = 1.65,  # 95% service level standard
) -> Dict[str, Any]:
    """
    Computes evidence-based demand forecast and replenishment calculation.
    Enforces strict Data Sufficiency Guard: does not fabricate confidence
    when historical records are sparse (<10 records or <14 days span).
    """
    today = reference_date or date(2026, 10, 9)
    ninety_days_ago = today - timedelta(days=90)

    # 1. Product & Supplier Master Data
    prod = db.query(Product).filter(Product.sku == sku).first()
    if not prod:
        raise ValueError(f"Product with SKU '{sku}' not found in catalog.")

    supp = db.query(Supplier).filter(Supplier.sku == sku).first()
    lead_time_days = supp.lead_time_days if supp else 7
    moq = supp.moq if supp else 100
    unit_cost = supp.unit_cost if supp else 100.0

    # 2. Historical Dispatches Inspection
    dispatches = db.query(Dispatch).filter(
        Dispatch.sku == sku,
        Dispatch.date >= ninety_days_ago,
        Dispatch.date <= today
    ).order_by(Dispatch.date.asc()).all()

    record_count = len(dispatches)
    min_date = min((d.date for d in dispatches), default=today)
    max_date = max((d.date for d in dispatches), default=today)
    span_days = max(1, (max_date - min_date).days)

    # 3. Data Sufficiency Evaluation
    is_sufficient = record_count >= 10 and span_days >= 14

    if not is_sufficient:
        # Strict safeguard: Do not fabricate confidence from sparse data!
        return {
            "sku": sku,
            "brand": prod.brand,
            "category": prod.category,
            "horizon_days": horizon_days,
            "data_sufficiency": {
                "is_sufficient": False,
                "dispatches_count": record_count,
                "span_days": span_days,
                "minimum_required_records": 10,
                "minimum_required_span_days": 14,
                "warning": f"Insufficient historical dispatches ({record_count} found over {span_days} days). Automated statistical forecast withheld to prevent over-ordering.",
            },
            "uncertainty": "HIGH",
            "confidence_score": round(min(0.35, record_count * 0.03), 2),
            "forecast_daily_velocity": None,
            "forecast_horizon_demand": None,
            "replenishment_calculation": None,
            "message": "Manual compliance & commercial review required. Insufficient historical data for automated replenishment modeling.",
        }

    # 4. Statistical Velocity & Volatility Calculation
    daily_totals: Dict[date, int] = {}
    for d in dispatches:
        daily_totals[d.date] = daily_totals.get(d.date, 0) + d.qty

    total_shipped = sum(daily_totals.values())
    active_days_count = len(daily_totals)
    daily_rate_active = total_shipped / float(span_days)

    # Variance & Standard Deviation
    variance = sum((qty - (total_shipped / float(active_days_count))) ** 2 for qty in daily_totals.values()) / max(1, active_days_count)
    std_dev_daily = math.sqrt(variance)

    # Seasonal adjustment factor (e.g. respiratory & antibiotic winter/monsoon surge)
    seasonality_factor = 1.15 if prod.category.lower() in ["antibiotic", "respiratory", "gastro"] else 1.0
    adjusted_daily_rate = round(daily_rate_active * seasonality_factor, 2)
    horizon_forecast_demand = int(round(adjusted_daily_rate * horizon_days))

    # Standard error of forecast
    standard_error = round(std_dev_daily / math.sqrt(max(1, active_days_count)), 2)
    cv = round(std_dev_daily / max(0.1, daily_rate_active), 2)  # Coefficient of variation
    uncertainty_level = "LOW" if cv < 0.6 else ("MODERATE" if cv < 1.2 else "HIGH")
    confidence_score = round(max(0.60, min(0.95, 1.0 - (cv * 0.25))), 2)

    # 5. Inventory Stock Position
    active_stock_batches = db.query(BatchInventory).filter(
        BatchInventory.sku == sku,
        BatchInventory.status == "active",
        BatchInventory.qty > 0
    ).all()
    on_hand_clean_stock = sum(b.qty for b in active_stock_batches)

    # Open POs
    open_pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.sku == sku,
        PurchaseOrder.status.in_(["ordered", "draft"])
    ).all()
    incoming_po_qty = sum(p.qty for p in open_pos)

    # Inbound Shipments
    inbound_shipments = db.query(Shipment).filter(
        Shipment.sku == sku,
        Shipment.status == "in_transit"
    ).all()
    incoming_shipment_qty = sum(s.qty for s in inbound_shipments)

    net_stock_position = on_hand_clean_stock + incoming_po_qty + incoming_shipment_qty

    # 6. Safety Stock & Reorder Point (ROP) Calculation
    lead_time_demand = int(round(adjusted_daily_rate * lead_time_days))
    safety_stock = int(round(service_level_z * math.sqrt(lead_time_days) * std_dev_daily))
    reorder_point = lead_time_demand + safety_stock

    # Gross Requirement over Horizon
    gross_requirement = horizon_forecast_demand + safety_stock
    net_deficit = max(0, gross_requirement - net_stock_position)

    # Suggested Replenishment Qty: Aligned to MOQ
    if net_deficit > 0:
        suggested_reorder_qty = math.ceil(net_deficit / float(moq)) * moq
    else:
        suggested_reorder_qty = 0

    estimated_procurement_cost = round(suggested_reorder_qty * unit_cost, 2)

    return {
        "sku": sku,
        "brand": prod.brand,
        "category": prod.category,
        "horizon_days": horizon_days,
        "data_sufficiency": {
            "is_sufficient": True,
            "dispatches_count": record_count,
            "span_days": span_days,
            "observation_window": f"{min_date.isoformat()} to {max_date.isoformat()}",
        },
        "uncertainty": uncertainty_level,
        "confidence_score": confidence_score,
        "forecast": {
            "mean_daily_rate": round(daily_rate_active, 2),
            "seasonality_factor": seasonality_factor,
            "adjusted_daily_velocity": adjusted_daily_rate,
            "horizon_demand": horizon_forecast_demand,
            "daily_std_dev": round(std_dev_daily, 2),
            "standard_error": standard_error,
        },
        "stock_position": {
            "on_hand_clean_stock": on_hand_clean_stock,
            "incoming_po_qty": incoming_po_qty,
            "incoming_shipment_qty": incoming_shipment_qty,
            "net_stock_position": net_stock_position,
        },
        "supply_parameters": {
            "supplier_lead_time_days": lead_time_days,
            "moq": moq,
            "unit_cost_inr": unit_cost,
            "service_level": "95%",
        },
        "replenishment_calculation": {
            "lead_time_demand": lead_time_demand,
            "safety_stock": safety_stock,
            "reorder_point_rop": reorder_point,
            "gross_requirement": gross_requirement,
            "net_deficit": net_deficit,
            "suggested_replenishment_qty": suggested_reorder_qty,
            "estimated_cost_inr": estimated_procurement_cost,
            "formula_breakdown": (
                f"ROP ({reorder_point}) = LeadTimeDemand ({lead_time_demand}) + SafetyStock ({safety_stock}); "
                f"GrossReq ({gross_requirement}) = HorizonDemand ({horizon_forecast_demand}) + SafetyStock ({safety_stock}); "
                f"NetDeficit ({net_deficit}) = GrossReq ({gross_requirement}) - NetStock ({net_stock_position}); "
                f"Suggested ({suggested_reorder_qty}) = Ceil(NetDeficit / MOQ {moq}) * MOQ"
            ),
        },
    }
