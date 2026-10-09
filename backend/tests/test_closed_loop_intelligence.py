import pytest
from datetime import datetime, date, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.seed.seed import run_seed
from app.db import SessionLocal
from app.models import BatchInventory, Action, Ledger, Case, WarehouseTransfer, Shipment, Dispatch, Product
from app.schemas import Finding
from app.engine.root_cause import investigate_root_cause
from app.engine.forecasting import calculate_demand_forecast
from app.agent.tools import execute_registered_tool, ANTHROPIC_TOOLS

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_closed_loop_test_db():
    run_seed(reset=True)


def test_evidence_backed_findings():
    """
    Requirement 1: Verify findings have attached evidence_sources, rule_metadata,
    calculation_steps, and data_quality_warnings.
    """
    resp = client.get("/api/board")
    assert resp.status_code == 200
    data = resp.json()
    findings = data["findings"]
    assert len(findings) > 0

    for finding in findings:
        # Check evidence fields exist
        assert "evidence_sources" in finding, f"Missing evidence_sources in {finding['id']}"
        assert isinstance(finding["evidence_sources"], list)
        assert len(finding["evidence_sources"]) > 0

        # Check rule metadata
        assert "rule_metadata" in finding, f"Missing rule_metadata in {finding['id']}"
        rule_meta = finding["rule_metadata"]
        assert "rule_id" in rule_meta
        assert "rule_name" in rule_meta or "name" in rule_meta
        assert "regulatory_reference" in rule_meta or "description" in rule_meta

        # Check calculation steps
        assert "calculation_steps" in finding, f"Missing calculation_steps in {finding['id']}"
        assert isinstance(finding["calculation_steps"], list)
        assert len(finding["calculation_steps"]) > 0

        # Check data quality warnings
        assert "data_quality_warnings" in finding, f"Missing data_quality_warnings in {finding['id']}"
        assert isinstance(finding["data_quality_warnings"], list)


def test_root_cause_engine_zero_fabrication():
    """
    Requirement 2: Root-cause engine uses available records to identify confirmed facts
    or ranked hypotheses. Zero fabrication.
    """
    db = SessionLocal()
    try:
        # 1. Investigate cold-chain breach finding
        cold_finding = Finding(
            id="FIND-COLD-TEST",
            type="coldchain",
            severity=95.0,
            title="Cold Chain Temperature Breach: Human Insulin Regular 100 IU/ml",
            description="Excursion detected in cold room",
            entities={"batch": "INS-B101", "sku": "INSULIN-R", "warehouse": "WH-1"},
            metrics={"breach_hours": 4.5, "max_temp": 12.4},
        )
        rca_cold = investigate_root_cause(cold_finding, db)

        assert rca_cold["finding_type"] == "coldchain"
        assert len(rca_cold["facts"]) > 0
        assert len(rca_cold["ranked_hypotheses"]) > 0
        assert rca_cold["evidence_completeness"]["score"] > 0

        for fact in rca_cold["facts"]:
            assert "fact" in fact
            assert "source" in fact
            assert "certainty" in fact

        for hyp in rca_cold["ranked_hypotheses"]:
            assert "hypothesis" in hyp
            assert hyp["likelihood"] in ["HIGH", "MEDIUM", "LOW"]
            assert "supporting_evidence" in hyp

        # 2. Investigate recall finding for B2231
        recall_finding = Finding(
            id="FIND-RECALL-TEST",
            type="recall",
            severity=100.0,
            title="Class II Recall: Augmentin 625 (B2231)",
            description="CDSCO recall notice for B2231",
            entities={"sku": "AMOX-625", "batches": ["B2231"], "recall_id": "REC-2026-001"},
            metrics={"warehouse_stock_units": 180, "field_units_at_risk": 640},
        )
        rca_recall = investigate_root_cause(recall_finding, db)
        assert rca_recall["finding_type"] == "recall"
        assert len(rca_recall["facts"]) >= 2
        assert any("180 units" in f["fact"] or "WH-1" in f["fact"] for f in rca_recall["facts"])
    finally:
        db.close()


def test_cases_sync_and_verification_states():
    """
    Requirement 3 & 4: Support verified, unverified, disputed, false-positive, duplicate states
    with recorded reasons, and persistent closed-loop lifecycle.
    """
    # 1. Sync findings into cases
    sync_resp = client.post("/api/cases/sync")
    assert sync_resp.status_code == 200
    sync_data = sync_resp.json()
    assert sync_data["total_cases"] > 0

    cases = client.get("/api/cases").json()
    assert len(cases) > 0
    first_case = cases[0]
    case_id = first_case["id"]

    # 2. Verify case as verified
    verify_resp = client.post(
        f"/api/cases/{case_id}/verify",
        json={
            "verification_state": "verified",
            "reason": "Confirmed authentic batch alert via CDSCO notification letter.",
            "verified_by": "Dr. Sneha Rao (Chief Pharmacist)",
        },
    )
    assert verify_resp.status_code == 200
    case_verified = verify_resp.json()
    assert case_verified["verification_state"] == "verified"
    assert case_verified["verified_by"] == "Dr. Sneha Rao (Chief Pharmacist)"
    assert case_verified["verification_reason"] == "Confirmed authentic batch alert via CDSCO notification letter."

    # 3. Test other verification states: disputed
    disp_resp = client.post(
        f"/api/cases/{case_id}/verify",
        json={
            "verification_state": "disputed",
            "reason": "Hospital claims shipment was delivered in secondary validated cooler.",
            "verified_by": "Arun Kumar",
        },
    )
    assert disp_resp.status_code == 200
    assert disp_resp.json()["verification_state"] == "disputed"

    # 4. Test false_positive
    fp_resp = client.post(
        f"/api/cases/{case_id}/verify",
        json={
            "verification_state": "false_positive",
            "reason": "Sensor logger calibration drift verified by QA.",
            "verified_by": "Vikram Singh",
        },
    )
    assert fp_resp.status_code == 200
    assert fp_resp.json()["verification_state"] == "false_positive"

    # 5. Test duplicate
    dup_resp = client.post(
        f"/api/cases/{case_id}/verify",
        json={
            "verification_state": "duplicate",
            "reason": "Covered under master recall case.",
            "verified_by": "Arun Kumar",
        },
    )
    assert dup_resp.status_code == 200
    assert dup_resp.json()["verification_state"] == "duplicate"


def test_closed_loop_lifecycle_investigate_outcome_close_reopen():
    """
    Requirement 4: Lifecycle transitions from investigation to execution,
    outcome check, closure and reopening.
    """
    cases = client.get("/api/cases").json()
    assert len(cases) > 0
    case = cases[0]
    case_id = case["id"]

    # 1. Run investigation endpoint
    inv_resp = client.post(f"/api/cases/{case_id}/investigate")
    assert inv_resp.status_code == 200
    inv_data = inv_resp.json()
    assert inv_data["status"] in ["investigating", "recommended"]
    assert inv_data["root_cause_analysis"] is not None
    assert len(inv_data["root_cause_analysis"]["facts"]) > 0

    # 2. Outcome checking
    outcome_resp = client.post(
        f"/api/cases/{case_id}/outcome-check",
        json={"notes": "All quarantine labels applied and customer dispatches halted."},
    )
    assert outcome_resp.status_code == 200
    outcome_data = outcome_resp.json()
    assert outcome_data["status"] == "outcome_checking"
    assert "checked_at" in outcome_data["outcome_metrics"]

    # 3. Close case
    close_resp = client.post(
        f"/api/cases/{case_id}/close",
        json={
            "reason": "100% stock safely segregated and replacement PO issued.",
            "closed_by": "Dr. Sneha Rao (Responsible Person)",
        },
    )
    assert close_resp.status_code == 200
    closed_data = close_resp.json()
    assert closed_data["status"] == "closed"
    assert closed_data["closure_reason"] == "100% stock safely segregated and replacement PO issued."
    assert closed_data["closed_at"] is not None

    # 4. Reopen case
    reopen_resp = client.post(
        f"/api/cases/{case_id}/reopen",
        json={
            "reason": "Secondary hospital reported late adverse incident; audit restarted.",
            "reopened_by": "Arun Kumar",
        },
    )
    assert reopen_resp.status_code == 200
    reopened_data = reopen_resp.json()
    assert reopened_data["status"] == "reopened"
    assert reopened_data["closure_reason"] is not None


def test_seasonal_demand_forecasting_with_sufficiency_guard():
    """
    Requirement 6: Seasonal demand forecasting with statistical metrics, lead time,
    safety stock (95% Z=1.65), and strict Data Sufficiency Guard (<10 records / <14 days).
    """
    # 1. Test SKU with sufficient data (AMOX-625 has ~25 seed dispatches)
    resp = client.get("/api/supply-chain/forecast/AMOX-625?horizon_days=30")
    assert resp.status_code == 200
    data = resp.json()

    assert data["sku"] == "AMOX-625"
    assert data["data_sufficiency"]["is_sufficient"] is True
    assert data["data_sufficiency"]["dispatches_count"] >= 10
    assert data["forecast"]["mean_daily_rate"] > 0
    assert data["supply_parameters"]["supplier_lead_time_days"] > 0
    assert data["replenishment_calculation"]["safety_stock"] >= 0
    assert data["replenishment_calculation"]["reorder_point_rop"] > 0
    assert "suggested_replenishment_qty" in data["replenishment_calculation"]
    moq = data["supply_parameters"]["moq"]
    suggested = data["replenishment_calculation"]["suggested_replenishment_qty"]
    if suggested > 0:
        assert suggested % moq == 0

    # 2. Test SKU with insufficient/sparse data: Data Sufficiency Guard
    db = SessionLocal()
    try:
        sparse_sku = "SKU-SPARSE-TEST"
        prod = Product(
            sku=sparse_sku,
            molecule="Sparse Molecule",
            brand="Sparse Brand",
            category="Cardiology",
            storage="ambient",
            critical_drug=False,
        )
        d1 = Dispatch(
            date=date(2026, 9, 1),
            customer_id="C001",
            sku=sparse_sku,
            batch="B-SP-1",
            qty=10,
            from_warehouse="WH-1",
        )
        d2 = Dispatch(
            date=date(2026, 9, 3),
            customer_id="C002",
            sku=sparse_sku,
            batch="B-SP-1",
            qty=15,
            from_warehouse="WH-1",
        )
        b_sparse = BatchInventory(
            batch="B-SP-1",
            sku=sparse_sku,
            warehouse="WH-1",
            qty=50,
            status="active",
            mfg_date=date(2025, 1, 1),
            expiry_date=date(2027, 1, 1),
        )
        db.add_all([prod, d1, d2, b_sparse])
        db.commit()

        # Query forecast for sparse SKU
        sparse_resp = client.get(f"/api/supply-chain/forecast/{sparse_sku}")
        assert sparse_resp.status_code == 200
        sparse_data = sparse_resp.json()

        assert sparse_data["data_sufficiency"]["is_sufficient"] is False
        assert sparse_data["data_sufficiency"]["warning"] is not None
        assert "Insufficient historical dispatches" in sparse_data["data_sufficiency"]["warning"]
        # Confident reorder calculation is suppressed and withheld
        assert sparse_data["replenishment_calculation"] is None
        assert sparse_data["uncertainty"] == "HIGH"
    finally:
        db.close()


def test_supply_chain_transfers_and_shipments():
    """
    Requirement 5: Add supplier/shipment/warehouse-transfer capabilities.
    Atomic physical stock balances updated on transfer execution.
    """
    db = SessionLocal()
    try:
        # Check starting inventory in WH-2
        b_wh2 = db.query(BatchInventory).filter_by(batch="B2231", warehouse="WH-2").first()
        qty_wh2_before = b_wh2.qty if b_wh2 else 0

        # 1. Create a Warehouse Transfer from WH-1 to WH-2
        tr_resp = client.post(
            "/api/supply-chain/transfers",
            json={
                "from_warehouse": "WH-1",
                "to_warehouse": "WH-2",
                "batch": "B2231",
                "sku": "AMOX-625",
                "qty": 20,
                "reason": "Clinical replacement stock redistribution",
                "requested_by": "Vikram Singh (Warehouse Head)",
            },
        )
        assert tr_resp.status_code == 200
        transfer = tr_resp.json()
        assert transfer["status"] == "requested"
        assert transfer["qty"] == 20
        transfer_id = transfer["id"]

        # 2. Complete transfer and verify physical stock movement
        comp_resp = client.post(f"/api/supply-chain/transfers/{transfer_id}/complete?approved_by=Chief Pharmacist")
        assert comp_resp.status_code == 200
        completed_transfer = comp_resp.json()
        assert completed_transfer["status"] == "completed"

        # Verify physical stock moved in DB
        db.expire_all()
        b_wh2_after = db.query(BatchInventory).filter_by(batch="B2231", warehouse="WH-2").first()
        assert b_wh2_after is not None
        assert b_wh2_after.qty == qty_wh2_before + 20

        # 3. Create and track a Shipment
        sh_resp = client.post(
            "/api/supply-chain/shipments",
            json={
                "tracking_number": "TRX-SHP-9901",
                "carrier": "BlueDart Pharma TempControl",
                "type": "outbound",
                "origin": "WH-1",
                "destination": "HOSP-001",
                "batch": "B2231",
                "sku": "AMOX-625",
                "qty": 15,
                "temp_controlled": True,
                "expected_delivery": "2026-10-15T10:00:00Z",
            },
        )
        assert sh_resp.status_code == 200
        shipment = sh_resp.json()
        assert shipment["tracking_number"] == "TRX-SHP-9901"
        assert shipment["status"] in ["in_transit", "dispatched"]

        # List shipments
        list_sh = client.get("/api/supply-chain/shipments").json()
        assert len(list_sh) > 0
        assert any(s["tracking_number"] == "TRX-SHP-9901" for s in list_sh)
    finally:
        db.close()


def test_privacy_and_tamper_evident_ledger():
    """
    Requirement 8: Record transitions, approvals, action results in audit history.
    Never expose sensitive customer or patient PII in ledger records.
    """
    db = SessionLocal()
    try:
        events = db.query(Ledger).order_by(Ledger.seq.desc()).limit(25).all()
        assert len(events) > 0

        for ev in events:
            assert ev.hash is not None and len(ev.hash) == 64
            assert ev.prev_hash is not None
            payload_str = str(ev.payload).lower()
            assert "patient_name" not in payload_str
            assert "aadhaar" not in payload_str
            assert "phone_number" not in payload_str
    finally:
        db.close()


def test_multi_agent_tool_integration():
    """
    Requirement 7: Specialist agents investigate evidence and forecast demand
    using validated backend tools while keeping calculations authoritative.
    """
    db = SessionLocal()
    try:
        # 1. Confirm tools are registered in ANTHROPIC_TOOLS schema
        tool_names = [t["name"] for t in ANTHROPIC_TOOLS]
        assert "investigate_root_cause" in tool_names
        assert "forecast_demand" in tool_names

        # 2. Execute investigate_root_cause
        res_rca = execute_registered_tool(
            "investigate_root_cause",
            {
                "finding": {
                    "id": "FIND-COLD-MA-TEST",
                    "type": "coldchain",
                    "title": "Cold Chain Breach",
                    "entities": {"batch": "INS-B101", "sku": "INSULIN-R", "warehouse": "WH-1"},
                    "metrics": {"breach_hours": 3.0, "max_temp": 11.5},
                }
            },
            db,
        )
        assert res_rca["finding_type"] == "coldchain"
        assert "facts" in res_rca
        assert "ranked_hypotheses" in res_rca

        # 3. Execute forecast_demand
        res_fc = execute_registered_tool(
            "forecast_demand",
            {"sku": "AMOX-625", "horizon_days": 30},
            db,
        )
        assert res_fc["sku"] == "AMOX-625"
        assert "replenishment_calculation" in res_fc
        assert "data_sufficiency" in res_fc
        assert res_fc["data_sufficiency"]["is_sufficient"] is True
    finally:
        db.close()
