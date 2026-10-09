import math
from typing import List, Dict, Any
from app.schemas import Finding
from app.config import settings

def rank_findings(findings: List[Finding]) -> List[Finding]:
    """
    Ranks findings using deterministic multi-criteria decision formula:
    Score = 0.4 * safety_factor + 0.3 * time_pressure + 0.2 * value_at_risk + 0.1 * breadth
    Class I/II recalls and critical drugs are pinned to the top.
    """
    ranked = []

    for f in findings:
        # 1. Safety Factor (0 - 100)
        is_pinned = False
        if f.type == "recall":
            rc = f.entities.get("recall_class", "II")
            safety = 100.0 if rc == "I" else 95.0
            is_pinned = True
        elif f.type == "coldchain":
            has_crit = f.metrics.get("has_critical_drug", False)
            safety = 95.0 if has_crit else 80.0
            if has_crit:
                is_pinned = True
        elif f.type == "critical":
            safety = 96.0
            is_pinned = True
        elif f.type == "fefo":
            safety = 60.0
        elif f.type in ["expiry", "returnwindow"]:
            safety = 45.0
        else:
            safety = 50.0

        # 2. Time Pressure (0 - 100)
        if f.type == "recall":
            time_pressure = 95.0  # 24h statutory window
        elif f.type == "coldchain":
            time_pressure = 90.0
        elif f.type == "returnwindow":
            days = f.metrics.get("days_to_window_close", 14)
            time_pressure = min(100.0, max(40.0, 100.0 - (days * 4.0)))
        elif f.type == "critical":
            days = f.metrics.get("cover_days", 5)
            time_pressure = min(100.0, max(50.0, 100.0 - (days * 5.0)))
        elif f.type == "expiry":
            days = f.metrics.get("days_to_expiry", 60)
            time_pressure = min(80.0, max(20.0, 100.0 - (days * 0.7)))
        elif f.type == "fefo":
            time_pressure = 65.0
        else:
            time_pressure = 50.0

        # 3. Value at Risk (0 - 100)
        var_inr = f.metrics.get("value_at_risk_inr", 0.0)
        if var_inr <= 0:
            if f.type == "recall":
                # Dispatched value
                var_inr = f.metrics.get("dispatched_total_30d", 0) * 120.0
            elif f.type == "coldchain":
                var_inr = f.metrics.get("total_units", 0) * 80.0
            elif f.type == "critical":
                var_inr = f.metrics.get("total_stock", 0) * 150.0

        # Scale logarithmically so ₹5,000 = 30, ₹50,000 = 65, ₹200,000+ = 90+
        if var_inr > 0:
            var_score = min(100.0, max(10.0, (math.log10(max(10.0, var_inr)) - 2.0) * 30.0))
        else:
            var_score = 15.0

        # 4. Breadth (0 - 100) - entities / accounts affected
        cust_count = f.metrics.get("total_customers", 0) or f.metrics.get("hospitals_affected", 0)
        units_touched = f.metrics.get("total_units", 0) or f.metrics.get("stock_in_wh", 0) or f.metrics.get("at_risk_qty", 0)
        breadth_score = min(100.0, max(10.0, (cust_count * 2.5) + (units_touched / 50.0)))

        # Weighted calculation
        raw_score = (
            settings.SAFETY_WEIGHT * safety +
            settings.TIME_PRESSURE_WEIGHT * time_pressure +
            settings.VALUE_AT_RISK_WEIGHT * var_score +
            settings.BREADTH_WEIGHT * breadth_score
        )

        final_score = round(raw_score, 1)
        if is_pinned and final_score < 90.0:
            final_score = 92.0

        f.severity = final_score
        f.explanation = {
            "formula": "0.4 * safety + 0.3 * time_pressure + 0.2 * value_at_risk + 0.1 * breadth",
            "weights": {
                "safety": settings.SAFETY_WEIGHT,
                "time_pressure": settings.TIME_PRESSURE_WEIGHT,
                "value_at_risk": settings.VALUE_AT_RISK_WEIGHT,
                "breadth": settings.BREADTH_WEIGHT,
            },
            "sub_scores": {
                "safety": round(safety, 1),
                "time_pressure": round(time_pressure, 1),
                "value_at_risk": round(var_score, 1),
                "breadth": round(breadth_score, 1),
            },
            "is_pinned": is_pinned,
            "final_score": final_score,
        }
        ranked.append(f)

    # Sort pinned items first, then descending by severity
    ranked.sort(
        key=lambda x: (
            1 if x.explanation.get("is_pinned") else 0,
            x.severity
        ),
        reverse=True
    )
    return ranked
