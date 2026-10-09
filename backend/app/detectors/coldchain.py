from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import TempLog, BatchInventory, Product
from app.schemas import Finding, FindingOption

def detect_coldchain_breaches(db: Session) -> List[Finding]:
    findings = []
    
    # Query distinct warehouse & cold_room combinations
    rooms = db.query(TempLog.warehouse, TempLog.cold_room).distinct().all()

    for wh, room in rooms:
        # Fetch ordered logs
        logs = db.query(TempLog).filter(
            TempLog.warehouse == wh,
            TempLog.cold_room == room
        ).order_by(TempLog.ts.asc()).all()

        if not logs:
            continue

        # Find continuous breach intervals (>8°C or <2°C for >= 30 mins)
        breach_intervals = []
        current_breach = None

        for log in logs:
            is_breach = log.temp_c > 8.0 or log.temp_c < 2.0
            if is_breach:
                if current_breach is None:
                    current_breach = {
                        "start_ts": log.ts,
                        "end_ts": log.ts,
                        "temps": [log.temp_c],
                        "max_delta": abs(log.temp_c - (8.0 if log.temp_c > 8.0 else 2.0)),
                    }
                else:
                    current_breach["end_ts"] = log.ts
                    current_breach["temps"].append(log.temp_c)
                    delta = abs(log.temp_c - (8.0 if log.temp_c > 8.0 else 2.0))
                    if delta > current_breach["max_delta"]:
                        current_breach["max_delta"] = delta
            else:
                if current_breach is not None:
                    # Calculate duration in minutes
                    duration_mins = int((current_breach["end_ts"] - current_breach["start_ts"]).total_seconds() / 60)
                    # Add 10 mins for reading window interval if equal or short
                    if len(current_breach["temps"]) > 1:
                        duration_mins = max(duration_mins, len(current_breach["temps"]) * 10)
                    if duration_mins >= 30:
                        current_breach["duration_mins"] = duration_mins
                        breach_intervals.append(current_breach)
                    current_breach = None

        if current_breach is not None:
            duration_mins = int((current_breach["end_ts"] - current_breach["start_ts"]).total_seconds() / 60)
            if len(current_breach["temps"]) > 1:
                duration_mins = max(duration_mins, len(current_breach["temps"]) * 10)
            if duration_mins >= 30:
                current_breach["duration_mins"] = duration_mins
                breach_intervals.append(current_breach)

        for idx, breach in enumerate(breach_intervals, 1):
            avg_temp = round(sum(breach["temps"]) / len(breach["temps"]), 1)
            duration = breach["duration_mins"]
            delta = round(breach["max_delta"], 2)

            # Find batches stored in that warehouse and cold room
            batches = db.query(BatchInventory).filter(
                BatchInventory.warehouse == wh,
                BatchInventory.cold_room == room,
                BatchInventory.qty > 0
            ).all()

            if not batches:
                continue

            batch_details = []
            has_critical = False
            total_qty_touched = 0

            for b in batches:
                prod = db.query(Product).filter(Product.sku == b.sku).first()
                is_crit = prod.critical_drug if prod else False
                if is_crit:
                    has_critical = True
                total_qty_touched += b.qty
                batch_details.append({
                    "batch": b.batch,
                    "sku": b.sku,
                    "brand": prod.brand if prod else b.sku,
                    "qty": b.qty,
                    "critical_drug": is_crit,
                    "status": b.status,
                })

            # Severity scales with duration x delta x critical flag
            crit_multiplier = 1.6 if has_critical else 1.0
            computed_sev = min(98.0, max(65.0, round((duration / 10.0) * delta * crit_multiplier, 1)))

            options = [
                FindingOption(
                    id="OPT-QUARANTINE-QA",
                    name="Quarantine Pending QA Review",
                    description=f"Immediate quarantine of {len(batch_details)} batches ({total_qty_touched} units) in {wh} {room} pending formal QA temperature excursion assessment.",
                    metrics={
                        "batches_to_quarantine": len(batch_details),
                        "total_units": total_qty_touched,
                        "safety_risk_mitigated": "100%",
                    },
                    projected_outcome="Locks all affected stock in ERP. Prevents any accidental dispatch before quality sign-off.",
                ),
                FindingOption(
                    id="OPT-QA-SAMPLE-TEST",
                    name="Accelerated Lab Stability Testing",
                    description="Dispatch random batch samples to analytical quality lab while keeping remaining inventory on temporary dispatch hold.",
                    metrics={
                        "batches_tested": len(batch_details),
                        "turnaround_hours": 36,
                        "estimated_test_cost": 7500,
                    },
                    projected_outcome="Provides definitive chemical potency validation to rescue undamaged inventory.",
                )
            ]

            findings.append(Finding(
                id=f"FIND-COLD-{wh}-{room.replace(' ', '_')}-{idx}",
                type="coldchain",
                severity=computed_sev,
                title=f"Cold Chain Excursion: {wh} {room} ({avg_temp}°C for {duration}m)",
                description=f"Temperature excursion detected in {wh} {room}: readings reached {avg_temp}°C for {duration} min (threshold: 2-8°C). Affects {len(batch_details)} batches ({total_qty_touched} units). Recommended: quarantine pending QA review.",
                entities={
                    "warehouse": wh,
                    "cold_room": room,
                    "batches_affected": [b["batch"] for b in batch_details],
                    "critical_drug_present": has_critical,
                    "batch_details": batch_details,
                },
                metrics={
                    "duration_minutes": duration,
                    "avg_temp_c": avg_temp,
                    "max_delta_c": delta,
                    "batches_count": len(batch_details),
                    "total_units": total_qty_touched,
                    "has_critical_drug": has_critical,
                },
                deadline=(breach["end_ts"] + timedelta(hours=12)).isoformat(),
                options=options,
                source_rows=[
                    {"type": "breach_interval", "start": breach["start_ts"].isoformat(), "end": breach["end_ts"].isoformat(), "duration_mins": duration, "peak_temp": max(breach["temps"])},
                    {"type": "batches_present", "items": batch_details}
                ],
                evidence_sources=[
                    {
                        "source_table": "temp_logs",
                        "record_id": f"{wh}:{room}",
                        "timestamp": f"{breach['start_ts'].isoformat()} - {breach['end_ts'].isoformat()}",
                        "evidence_type": "IOT_TELEMETRY_SERIES",
                        "details": {"readings_count": len(breach["temps"]), "peak_temp_c": max(breach["temps"]), "min_temp_c": min(breach["temps"])}
                    },
                    {
                        "source_table": "batch_inventory",
                        "record_id": f"{wh}:{room}:ACTIVE_BATCHES",
                        "timestamp": breach["end_ts"].isoformat(),
                        "evidence_type": "COLD_ROOM_INVENTORY",
                        "details": {"batches_count": len(batch_details), "units_at_risk": total_qty_touched, "has_critical_drugs": has_critical}
                    }
                ],
                rule_metadata={
                    "rule_id": "RULE-COLD-002",
                    "rule_name": "WHO Cold Chain Thermal Breach Monitoring",
                    "regulatory_reference": "WHO TRS 961 Annex 9 / CDSCO Schedule M Temperature Storage Guidelines",
                    "safe_temperature_range": "2.0°C to 8.0°C",
                    "minimum_excursion_duration_minutes": 30,
                },
                calculation_steps=[
                    {"step": 1, "description": "Calculate excursion window duration", "formula": "(end_ts - start_ts).total_seconds() / 60", "value": duration},
                    {"step": 2, "description": "Compute mean excursion reading", "formula": "sum(temps) / len(temps)", "value": avg_temp},
                    {"step": 3, "description": "Isolate maximum departure from safe band", "formula": "abs(temp - limit)", "value": delta},
                    {"step": 4, "description": "Apply critical drug multiplier and duration scaling", "formula": "min(98.0, max(65.0, (duration / 10.0) * delta * crit_mult))", "value": computed_sev},
                ],
                data_quality_warnings=["Telemetry stream exhibits sporadic sensor intervals (>10 min)." if duration > len(breach["temps"]) * 10 else ""] if duration > len(breach["temps"]) * 10 else [],
            ))

    return findings
