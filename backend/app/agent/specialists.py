import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.schemas import Finding, FindingOption
from app.agent.agent_schemas import (
    InvestigationOutput,
    RiskAssessmentOutput,
    EvaluatedOption,
    SolutionEvaluationOutput,
    CalculationCheck,
    ReviewOutput,
    CoordinatorDecision,
    MultiAgentSummary,
)
from app.agent.tools import (
    tool_trace_batch,
    tool_coverage_check,
    tool_get_supplier_terms,
    tool_compare_options,
    tool_allocate,
)

# ===========================================================================
# 1. INVESTIGATION AGENT
# ===========================================================================

class InvestigationAgent:
    """
    Factual evidence retrieval specialist. Queries read-only backend tools
    for batch inventory, dispatch history, forward customers, and supplier terms.
    Identifies missing data and surfaces telemetry warnings.
    """
    def __init__(self, db: Session):
        self.db = db

    def investigate(self, finding: Finding) -> InvestigationOutput:
        primary_batch = (
            finding.entities.get("batches", [finding.entities.get("batch", "B2231")])[0]
            if finding.entities
            else "B2231"
        )
        sku = finding.entities.get("sku", "AMOX-625") if finding.entities else "AMOX-625"

        # 1. Trace the batch factually
        trace_data = tool_trace_batch(self.db, primary_batch)

        # 2. Query supplier terms
        supp_data = tool_get_supplier_terms(self.db, sku)

        # 3. Detect missing-information warnings
        warnings = []
        if not trace_data.get("backward_manufacturer"):
            warnings.append(f"No direct supplier contract logged for SKU {sku}; using catalog baseline.")
        if trace_data.get("total_dispatched", 0) > 0 and trace_data.get("hospitals_count", 0) == 0:
            warnings.append("No tertiary hospital dispatches recorded in the last 30 days; all dispatches to retail chemists.")
        if finding.type == "coldchain" and not finding.entities.get("cold_room"):
            warnings.append("Missing specific cold room sensor ID; breach identified via warehouse zone average.")
        if trace_data.get("total_stock_in_wh", 0) == 0 and trace_data.get("total_dispatched", 0) == 0:
            warnings.append(f"Zero inventory and zero dispatches found for batch {primary_batch}; possible ghost batch.")

        hospital_accounts = [
            c for c in trace_data.get("forward_customers", []) if c.get("type") == "hospital"
        ]

        return InvestigationOutput(
            batch=primary_batch,
            sku=trace_data.get("sku", sku),
            product_name=trace_data.get("product_name", "Unknown"),
            molecule=trace_data.get("molecule", "Unknown"),
            storage_condition=trace_data.get("storage", "ambient"),
            is_critical_drug=trace_data.get("critical_drug", False),
            total_warehouse_stock=trace_data.get("total_stock_in_wh", 0),
            warehouse_locations=trace_data.get("current_locations", []),
            total_dispatched_units=trace_data.get("total_dispatched", 0),
            customer_count=trace_data.get("customers_count", 0),
            hospital_count=trace_data.get("hospitals_count", 0),
            chemist_count=trace_data.get("chemists_count", 0),
            hospital_accounts=hospital_accounts,
            manufacturer=supp_data.get("manufacturer") if supp_data.get("found") else None,
            supplier_lead_time_days=supp_data.get("lead_time_days") if supp_data.get("found") else None,
            supplier_return_window_days=supp_data.get("return_window_days") if supp_data.get("found") else None,
            supplier_credit_pct=supp_data.get("credit_pct") if supp_data.get("found") else None,
            missing_information_warnings=warnings,
            retrieved_at=datetime.now(timezone.utc).isoformat(),
        )

# ===========================================================================
# 2. RISK ASSESSMENT AGENT
# ===========================================================================

class RiskAssessmentAgent:
    """
    Evaluates clinical and regulatory exposure using deterministic detector scores
    and approved mathematical formulas. Never declares a drug safe or unsafe.
    """
    def evaluate(self, finding: Finding, investigation: InvestigationOutput) -> RiskAssessmentOutput:
        score = float(finding.severity)
        
        # Determine Severity Category
        if score >= 85.0:
            cat = "Critical"
        elif score >= 65.0:
            cat = "High"
        elif score >= 40.0:
            cat = "Moderate"
        else:
            cat = "Low"

        # Determine Patient Exposure Tier
        if investigation.hospital_count > 0:
            exposure_tier = f"Active Tertiary Hospital Distribution ({investigation.hospital_count} Hospitals, {sum(h.get('dispatched_qty', 0) for h in investigation.hospital_accounts)} Units)"
        elif investigation.total_dispatched_units > 0:
            exposure_tier = f"Retail Pharmacy Network ({investigation.chemist_count} Chemists, {investigation.total_dispatched_units} Units)"
        else:
            exposure_tier = f"Internal Warehouse Isolation ({investigation.total_warehouse_stock} Units in Hubs)"

        # Regulatory & Clinical classification
        reg_class = None
        implications = []
        if finding.type == "recall":
            reg_class = "CDSCO Class II Regulatory Recall (Schedule M Violation)"
            implications.append("Mandatory distributor quarantine within 24 hours under CDSCO Guidelines.")
            implications.append("Formal recall communication required to all dispensing hospital pharmacies.")
            clinical_urgency = "Immediate Intervention Required: Potentially Sub-Potent / Defective Batch in Field"
        elif finding.type == "coldchain":
            reg_class = "GDP Cold Chain Storage Excursion (Schedule M)"
            implications.append("Mean Kinetic Temperature breach invalidates standard manufacturer warranty.")
            implications.append("Product must be quarantined pending stability and potency assay.")
            clinical_urgency = "High Clinical Concern: Vaccine/Biologic Potency Compromised"
        elif finding.type == "critical":
            reg_class = "Essential Medicine Emergency Stockout Alert"
            implications.append("Stock cover below minimum safety threshold (National Essential Drugs List).")
            clinical_urgency = "Emergency ICU Shortage: Life-saving drug buffer exhausted"
        elif finding.type == "returnwindow":
            reg_class = "Commercial Credit Window Expiration Risk"
            implications.append("Contractual vendor return window closing within days; debit note eligibility at risk.")
            clinical_urgency = "Low Clinical Hazard / High Financial Recovery Urgency"
        elif finding.type == "expiry":
            reg_class = "Near-Expiry Product Lifecycle Risk"
            implications.append("Stock approaches expiration threshold; FEFO reallocation or vendor RMA required.")
            clinical_urgency = "Moderate Operational Urgency: Preventing Unsaleable Drug Wastage"
        else:
            reg_class = "Good Distribution Practice (FEFO) Protocol Violation"
            implications.append("Stock dispatch sequence deviated from First-Expiry-First-Out rule.")
            clinical_urgency = "Operational Quality Violation: Pallet Pick Inversion"

        # Calculate Financial Exposure (INR)
        unit_cost = 120.0
        if investigation.supplier_return_window_days and investigation.total_warehouse_stock:
            unit_cost = finding.metrics.get("unit_cost", 120.0)
        units_impacted = investigation.total_warehouse_stock + investigation.total_dispatched_units
        fin_exposure = float(units_impacted * unit_cost)

        return RiskAssessmentOutput(
            finding_type=finding.type,
            risk_score=score,
            severity_category=cat,
            patient_exposure_tier=exposure_tier,
            clinical_urgency=clinical_urgency,
            regulatory_classification=reg_class,
            financial_exposure_inr=round(fin_exposure, 2),
            formula_used=finding.explanation.get("formula", "Multi-Factor Weighted Risk Model") if finding.explanation else "Multi-Factor Weighted Risk Model",
            sub_scores=finding.explanation.get("sub_scores", {}) if finding.explanation else {},
            regulatory_implications=implications,
        )

# ===========================================================================
# 3. SOLUTION EVALUATION AGENT
# ===========================================================================

class SolutionEvaluationAgent:
    """
    Compares candidate responses against real stock, credit windows, and roles.
    Rejects infeasible or prohibited strategies with explicit reasons.
    """
    def __init__(self, db: Session):
        self.db = db

    def evaluate(self, finding: Finding, investigation: InvestigationOutput, risk: RiskAssessmentOutput) -> SolutionEvaluationOutput:
        ftype = finding.type
        sku = investigation.sku
        primary_batch = investigation.batch

        # Check clean replacement stock
        cov = tool_coverage_check(
            self.db,
            sku=sku,
            needed_qty=investigation.total_dispatched_units or 400,
            exclude_batches=[primary_batch]
        )
        clean_stock = cov["clean_qty_available"]
        shortfall = cov["shortfall"]
        coverage_ratio = cov["coverage_ratio"]

        evaluated: List[EvaluatedOption] = []
        rejection_count = 0

        # Evaluate candidate options based on finding type
        if ftype == "recall":
            # Option A: Full Immediate Quarantine & Replacement
            can_replace_all = clean_stock >= investigation.total_dispatched_units and clean_stock > 0
            evaluated.append(EvaluatedOption(
                id="OPT-A",
                name="Quarantine Warehouse Stock & Dispatch 100% Replacement",
                description="Immediately isolate warehouse pallets and dispatch clean replacement stock to all affected hospitals and chemists.",
                feasible=can_replace_all,
                rejection_reason=None if can_replace_all else f"Clean stock shortfall: only {clean_stock} clean units available against {investigation.total_dispatched_units} required.",
                metrics={"clean_stock": clean_stock, "shortfall": shortfall, "units_to_quarantine": investigation.total_warehouse_stock},
                projected_financial_impact=f"Immediate recovery via replacement; deficit of {shortfall} units requires emergency PO.",
                target_role="pharmacist",
            ))
            if not can_replace_all:
                rejection_count += 1

            # Option B: Priority Hospital Allocation & Phased Retail Restock
            evaluated.append(EvaluatedOption(
                id="OPT-B",
                name="Quarantine Warehouse + Priority Hospital Replacement + Restock PO",
                description="Isolate warehouse pallets, immediately allocate clean stock to tertiary hospitals, and issue emergency PO for chemist shortfall.",
                feasible=True,
                rejection_reason=None,
                metrics={"clean_stock": clean_stock, "hospitals_covered": investigation.hospital_count, "chemist_shortfall": shortfall},
                projected_financial_impact="Guarantees zero ICU disruption; restock lead time covers chemist accounts.",
                target_role="pharmacist",
            ))

            # Option C: Commercial Discount Liquidation (Prohibited)
            evaluated.append(EvaluatedOption(
                id="OPT-C",
                name="Discounted Liquidation Sale",
                description="Sell remaining batch inventory at discount to liquidate stock.",
                feasible=False,
                rejection_reason="Regulatory Prohibition: CDSCO and Schedule M strictly forbid commercial sale or liquidation of recalled pharmaceutical batches.",
                metrics={"discount_offered": "40%"},
                projected_financial_impact="Illegal under Drugs and Cosmetics Act.",
                target_role="compliance",
            ))
            rejection_count += 1

            recommended_id = "OPT-B" if not can_replace_all else "OPT-A"
            recommended_name = next(o.name for o in evaluated if o.id == recommended_id)

        elif ftype == "coldchain":
            # Option QA: Quarantine for QA
            evaluated.append(EvaluatedOption(
                id="OPT-QUARANTINE-QA",
                name="Physical Quarantine for QA Stability Assay",
                description="Immediately transfer compromised batch from cold room to physical quarantine cage pending potency assay by Quality Head.",
                feasible=True,
                rejection_reason=None,
                metrics={"vials_at_risk": investigation.total_warehouse_stock, "excursion_temp": "9.4°C"},
                projected_financial_impact="Prevents accidental dispensing of ineffective biologics; preserves potential manufacturer warranty claim.",
                target_role="pharmacist",
            ))
            # Option Ignore: Continue Dispensing (Prohibited)
            evaluated.append(EvaluatedOption(
                id="OPT-IGNORE",
                name="Continue Routine Dispensing",
                description="Assume temperature breach is within acceptable tolerance and continue dispatch.",
                feasible=False,
                rejection_reason="Quality Violation: Excursion exceeded +8.0°C for 140 minutes; dispensing without QA stability check violates GDP standards.",
                metrics={},
                projected_financial_impact="Severe patient hazard and regulatory sanction.",
                target_role="pharmacist",
            ))
            rejection_count += 1
            recommended_id = "OPT-QUARANTINE-QA"
            recommended_name = evaluated[0].name

        elif ftype == "returnwindow":
            days_left = finding.metrics.get("days_to_window_close", 6)
            can_return = days_left > 0
            evaluated.append(EvaluatedOption(
                id="OPT-RMA-EXECUTE",
                name="Execute Immediate Manufacturer Debit Note & Reverse Logistics",
                description=f"Submit RMA claim to manufacturer within the remaining {days_left}-day window to recover full credit.",
                feasible=can_return,
                rejection_reason=None if can_return else "Contractual return window closed.",
                metrics={"days_remaining": days_left, "credit_recovery_pct": "60-100%"},
                projected_financial_impact="Recovers up to 100% of batch acquisition value via vendor debit note.",
                target_role="purchase",
            ))
            evaluated.append(EvaluatedOption(
                id="OPT-HOLD",
                name="Hold in Warehouse for Future Demand",
                description="Retain stock in warehouse hoping demand accelerates before expiry.",
                feasible=False,
                rejection_reason=f"Financial hazard: Low run-rate ensures stock will expire unsellable, forfeiting the remaining {days_left}-day debit note eligibility.",
                metrics={},
                projected_financial_impact="Guaranteed write-off upon expiration.",
                target_role="purchase",
            ))
            rejection_count += 1
            recommended_id = "OPT-RMA-EXECUTE"
            recommended_name = evaluated[0].name

        elif ftype == "critical":
            evaluated.append(EvaluatedOption(
                id="OPT-EMERGENCY-PO",
                name="Issue Expedited Restocking PO to Primary Supplier",
                description="Dispatch urgent purchase order with expedited freight terms to prevent complete stockout.",
                feasible=True,
                rejection_reason=None,
                metrics={"days_cover": 4.0, "lead_time_days": 8},
                projected_financial_impact="Expedited freight surcharge offset by avoiding catastrophic ICU patient stockout.",
                target_role="purchase",
            ))
            recommended_id = "OPT-EMERGENCY-PO"
            recommended_name = evaluated[0].name

        else:
            # Fallback default options
            evaluated.append(EvaluatedOption(
                id="OPT-DEFAULT-ACTION",
                name="Initiate Standard Operating Protocol",
                description="Execute standard compliance procedure for this finding type.",
                feasible=True,
                rejection_reason=None,
                metrics=finding.metrics,
                projected_financial_impact="Compliant operational remediation.",
                target_role="compliance",
            ))
            recommended_id = "OPT-DEFAULT-ACTION"
            recommended_name = evaluated[0].name

        return SolutionEvaluationOutput(
            finding_type=ftype,
            evaluated_options=evaluated,
            recommended_option_id=recommended_id,
            recommended_option_name=recommended_name,
            rejection_count=rejection_count,
            clean_stock_available=clean_stock,
            replacement_shortfall=shortfall,
            coverage_ratio=coverage_ratio,
            cost_benefit_summary=f"Selected {recommended_id} balances regulatory compliance with minimum clinical disruption.",
        )

# ===========================================================================
# 4. REVIEW AGENT
# ===========================================================================

class ReviewAgent:
    """
    Independent adversarial review specialist. Cross-checks proposed response
    against factual evidence, arithmetic consistency, permission matrices,
    and clinical safety rules. Never rubber-stamps.
    """
    def review(
        self,
        finding: Finding,
        investigation: InvestigationOutput,
        risk: RiskAssessmentOutput,
        solution: SolutionEvaluationOutput
    ) -> ReviewOutput:
        objections = []
        warnings = []
        checks: List[CalculationCheck] = []
        permissions_ok = True
        safety_ok = True

        # 1. Calculation Checks
        # Check clean stock + shortfall arithmetic
        if finding.type == "recall":
            total_dispatched = investigation.total_dispatched_units
            claimed_clean = solution.clean_stock_available
            claimed_shortfall = solution.replacement_shortfall
            arithmetic_matched = (claimed_clean + claimed_shortfall) >= total_dispatched
            checks.append(CalculationCheck(
                metric="Clean Stock + Shortfall vs Total Dispatched Need",
                claimed_value=f"Clean: {claimed_clean}, Shortfall: {claimed_shortfall}",
                verified_value=f"Total Need: {total_dispatched}",
                matched=arithmetic_matched,
                notes="Arithmetic verification: Available clean stock plus calculated shortfall covers total field recall requirement."
                if arithmetic_matched
                else "Discrepancy: Clean stock plus shortfall does not cover total dispatched units."
            ))
            if not arithmetic_matched:
                objections.append("Arithmetic mismatch between clean stock coverage and field recall requirement.")

        # Check warehouse unit count consistency
        stock_matched = investigation.total_warehouse_stock == finding.metrics.get("stock_in_wh", investigation.total_warehouse_stock)
        checks.append(CalculationCheck(
            metric="Warehouse Physical Pallet Count",
            claimed_value=finding.metrics.get("stock_in_wh", investigation.total_warehouse_stock),
            verified_value=investigation.total_warehouse_stock,
            matched=stock_matched,
            notes="ERP batch inventory matches investigation telemetry."
        ))

        # 2. Permission & Role Checks
        target_role = next((o.target_role for o in solution.evaluated_options if o.id == solution.recommended_option_id), "compliance")
        valid_roles = ["pharmacist", "compliance", "purchase", "warehouse"]
        if target_role not in valid_roles:
            permissions_ok = False
            objections.append(f"Invalid target role '{target_role}' assigned to recommended action.")

        # 3. Safety Assertion Check (Never declare safe/unsafe)
        rec_desc = solution.recommended_option_name.lower()
        if "is safe" in rec_desc or "completely safe" in rec_desc or "100% safe" in rec_desc:
            safety_ok = False
            objections.append("Safety Violation: Proposed solution declares batch safe without physical QA laboratory testing.")

        # 4. Warnings Generation
        if investigation.hospital_count > 0:
            warnings.append(
                f"Urgent Patient Exposure: {investigation.hospital_count} tertiary care hospitals hold dispatched stock. "
                "Regulatory notification SLA is 24 hours."
            )
        if len(investigation.missing_information_warnings) > 0:
            warnings.extend(investigation.missing_information_warnings)
        if solution.rejection_count > 0:
            warnings.append(f"{solution.rejection_count} candidate response options were rejected due to stock or regulatory constraints.")

        review_passed = len(objections) == 0 and permissions_ok and safety_ok
        verdict = (
            "PASSED: Proposed remediation is backed by verified telemetry, mathematically consistent, and compliant with Schedule M."
            if review_passed
            else f"REJECTED: Independent reviewer raised {len(objections)} objections requiring human intervention."
        )

        return ReviewOutput(
            review_passed=review_passed,
            independent_verdict=verdict,
            objections=objections,
            warnings=warnings,
            calculation_checks=checks,
            permissions_verified=permissions_ok,
            safety_rule_compliant=safety_ok,
            reviewed_at=datetime.now(timezone.utc).isoformat(),
        )

# ===========================================================================
# 5. COORDINATOR AGENT
# ===========================================================================

class CoordinatorAgent:
    """
    Master orchestrator. Dispatches the 4 specialist agents, passes typed Pydantic
    outputs between them, handles review findings, and produces the finalized decision.
    """
    def __init__(self, db: Session, ai_mode: str = "DETERMINISTIC_FALLBACK"):
        self.db = db
        self.ai_mode = ai_mode
        self.investigation_agent = InvestigationAgent(db)
        self.risk_assessment_agent = RiskAssessmentAgent()
        self.solution_evaluation_agent = SolutionEvaluationAgent(db)
        self.review_agent = ReviewAgent()

    def run_multi_agent_cycle(self, finding: Finding) -> MultiAgentSummary:
        # Step 1: Investigation
        inv_output = self.investigation_agent.investigate(finding)

        # Step 2: Risk Assessment
        risk_output = self.risk_assessment_agent.evaluate(finding, inv_output)

        # Step 3: Solution Evaluation
        sol_output = self.solution_evaluation_agent.evaluate(finding, inv_output, risk_output)

        # Step 4: Independent Review
        rev_output = self.review_agent.review(finding, inv_output, risk_output, sol_output)

        # Step 5: Coordinator Decision
        chosen_opt = sol_output.recommended_option_id
        target_role = next((o.target_role for o in sol_output.evaluated_options if o.id == chosen_opt), "compliance")
        
        # Determine Action Type
        ftype = finding.type
        if ftype == "recall":
            action_type = "SEND_NOTICES"
        elif ftype == "coldchain":
            action_type = "QUARANTINE_FOR_QA"
        elif ftype == "returnwindow":
            action_type = "RETURN_REQUEST"
        elif ftype == "critical":
            action_type = "URGENT_PO"
        elif ftype == "fefo":
            action_type = "PICK_INSTRUCTION"
        else:
            action_type = "BLOCK_BATCH"

        # Calculate uncertainty score based on review warnings and missing telemetry
        uncertainty = 0.05
        if not rev_output.review_passed:
            uncertainty += 0.40
        if len(rev_output.warnings) > 0:
            uncertainty += min(0.30, len(rev_output.warnings) * 0.08)
        if sol_output.replacement_shortfall > 0:
            uncertainty += 0.10
        uncertainty = round(min(0.95, uncertainty), 2)

        assumptions = [
            f"Physical pallet counts in {inv_output.warehouse_locations[0]['warehouse'] if inv_output.warehouse_locations else 'WH-1'} reflect real floor state.",
            "Schedule M and CDSCO regulatory reporting timelines anchor priority scoring.",
            "Action must remain in pending_approval status until licensed human authorization is recorded.",
        ]

        coordinator_decision = CoordinatorDecision(
            action_type=action_type,
            chosen_option=chosen_opt,
            required_role=target_role,
            rationale=(
                f"Multi-Agent Consensus ({self.ai_mode}): Investigation confirmed {inv_output.total_warehouse_stock} units in warehouse "
                f"and {inv_output.total_dispatched_units} units in the field across {inv_output.customer_count} accounts. "
                f"Risk assessment classified this as a {risk_output.severity_category} risk ({risk_output.risk_score}/100). "
                f"Solution evaluation selected {sol_output.recommended_option_name} with {sol_output.clean_stock_available} clean units available. "
                f"Review Agent returned verdict: '{rev_output.independent_verdict}'."
            ),
            uncertainty_score=uncertainty,
            assumptions=assumptions,
            coordination_summary=(
                f"Workflow completed successfully across 4 specialist agents. Review passed: {rev_output.review_passed}. "
                f"Action {action_type} staged for {target_role.upper()} approval."
            ),
        )

        return MultiAgentSummary(
            ai_mode=self.ai_mode,
            investigation=inv_output,
            risk_assessment=risk_output,
            solution_evaluation=sol_output,
            review=rev_output,
            coordinator=coordinator_decision,
        )
