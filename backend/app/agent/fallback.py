from typing import Dict, Any, List

def get_fallback_decision(finding_dict: Dict[str, Any], computed_options: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Deterministic rule-based fallback decision when LLM API key is absent or validation fails.
    Produces rigorous, deterministic rationale grounded strictly in computed metrics.
    """
    ftype = finding_dict.get("type")
    metrics = finding_dict.get("metrics", {})
    entities = finding_dict.get("entities", {})

    if ftype == "recall":
        clean_qty = metrics.get("clean_qty", 0)
        shortfall = metrics.get("shortfall", 0)
        hosp_count = metrics.get("hospitals_affected", 0)
        chem_count = metrics.get("chemists_affected", 0)
        lead_time = metrics.get("lead_time_days", 8)

        # Prefer Strategy B (Clean + Urgent PO) if there is shortfall; else A
        chosen = "OPT-B" if shortfall > 0 else "OPT-A"
        return {
            "chosen_option": chosen,
            "rationale": (
                f"Selected Strategy {chosen[-1]}: Prioritises 100% clean replacement stock allocation to all {hosp_count} affected hospitals first. "
                f"With {clean_qty} clean units immediately deployed against {metrics.get('replacement_need', 0)} total replacement requirement, "
                f"an expedited manufacturer PO for {shortfall} units bridges the remaining network shortfall within {lead_time} days while blocking the recalled batch."
            ),
            "confidence": 0.98,
            "assumptions": [
                "Hospital emergency departments require immediate 100% stock replacement.",
                f"Manufacturer can deliver expedited PO within contracted {lead_time} days lead time.",
                "Recalled batch stock in warehouse must remain blocked under quarantine."
            ],
            "fallback_used": True,
        }

    elif ftype == "coldchain":
        duration = metrics.get("duration_minutes", 140)
        avg_temp = metrics.get("avg_temp_c", 9.4)
        batches_count = metrics.get("batches_count", 3)
        total_units = metrics.get("total_units", 450)
        wh = entities.get("warehouse", "WH-2")
        room = entities.get("cold_room", "Cold Room 1")

        return {
            "chosen_option": "OPT-QUARANTINE-QA",
            "rationale": (
                f"Temperature excursion of {avg_temp}°C exceeded the statutory 2-8°C range for {duration} continuous minutes in {wh} {room}. "
                f"In accordance with Good Distribution Practices (GDP), automated status is set to 'quarantine pending QA review' for {batches_count} batches ({total_units} units). "
                f"Antigravity compliance policy prohibits making autonomous safety verdicts; disposition requires formal QA sign-off."
            ),
            "confidence": 0.99,
            "assumptions": [
                f"Temperature probe readings in {room} are physically verified.",
                "Cold chain excursion exceeds allowable transient defrost cycle threshold.",
                "Formal stability dossier review required by Quality Assurance before release."
            ],
            "fallback_used": True,
        }

    elif ftype == "returnwindow":
        days_left = metrics.get("days_to_window_close", 6)
        at_risk = metrics.get("at_risk_qty", 900)
        credit_pct = int(metrics.get("credit_pct", 0.60) * 100)
        recovery = metrics.get("potential_recovery_inr", 0)

        return {
            "chosen_option": "OPT-RMA-EXECUTE",
            "rationale": (
                f"Manufacturer return window closes in {days_left} calendar days. Submitting an immediate Return Material Authorisation (RMA) "
                f"for {at_risk} units locks in a guaranteed {credit_pct}% credit recovery (₹{recovery:,.2f}). "
                f"Failing to execute within {days_left} days results in irreversible 100% inventory write-off."
            ),
            "confidence": 0.96,
            "assumptions": [
                f"Manufacturer will honor credit note if RMA is filed within {days_left} days.",
                "Local promotional discounting cannot absorb full inventory volume before expiry."
            ],
            "fallback_used": True,
        }

    elif ftype == "expiry":
        days_to_exp = metrics.get("days_to_expiry", 70)
        at_risk = metrics.get("at_risk_qty", 900)
        days_to_close = metrics.get("days_to_window_close", 6)

        # If return window open, return; else promotional discount
        chosen = "OPT-RETURN" if days_to_close >= 0 else "OPT-DISCOUNT"
        return {
            "chosen_option": chosen,
            "rationale": (
                f"Batch has {days_to_exp} days to expiry with {at_risk} units projected unsold. "
                + (f"Manufacturer return window is active for {days_to_close} more days; initiating return secures guaranteed credit note."
                   if days_to_close >= 0 else
                   "Return window has lapsed; executing 20% promotional discount to maximize net cash recovery across chemist network.")
            ),
            "confidence": 0.94,
            "assumptions": [
                "Daily sales velocity will not experience unexpected organic surge.",
                "Discounts will drive higher turnover velocity as per historical elasticities."
            ],
            "fallback_used": True,
        }

    elif ftype == "fefo":
        disp_batch = entities.get("dispatched_batch", "")
        older_batch = entities.get("unpicked_older_batch", "")
        wh = entities.get("warehouse", "WH-1")

        return {
            "chosen_option": "OPT-ENFORCE-FEFO",
            "rationale": (
                f"Outbound dispatch of batch {disp_batch} violated FEFO while older batch {older_batch} remains unsold in {wh}. "
                f"Issuing mandatory warehouse pick instruction pins {older_batch} as priority-one for all subsequent outbound orders."
            ),
            "confidence": 0.95,
            "assumptions": [
                f"Stock in {wh} for {older_batch} is physically accessible.",
                "Warehouse management system enforces pick queue locking."
            ],
            "fallback_used": True,
        }

    elif ftype == "critical":
        cover_days = metrics.get("cover_days", 4.0)
        lead_time = metrics.get("supplier_lead_time_days", 9)
        brand = entities.get("brand", "Critical Drug")
        order_qty = metrics.get("recommended_order_qty", 600)

        return {
            "chosen_option": "OPT-URGENT-PO",
            "rationale": (
                f"Critical drug {brand} stock cover has depleted to {cover_days} days against supplier lead time of {lead_time} days. "
                f"Drafting expedited PO for {order_qty} units with supplier priority guarantee to prevent hospital inpatient stockouts."
            ),
            "confidence": 0.97,
            "assumptions": [
                "Manufacturer has raw material availability for expedited batch packaging.",
                "Inpatient demand velocity remains stable over the replenishment window."
            ],
            "fallback_used": True,
        }

    # Generic fallback
    opt_id = computed_options[0].get("id", "OPT-1") if computed_options else "OPT-DEFAULT"
    return {
        "chosen_option": opt_id,
        "rationale": "Automated evaluation based on deterministic risk metrics.",
        "confidence": 0.90,
        "assumptions": ["Standard operating procedures apply."],
        "fallback_used": True,
    }
