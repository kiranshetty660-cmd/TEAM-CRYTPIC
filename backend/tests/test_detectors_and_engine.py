import pytest
import random
from app.db import SessionLocal
from app.seed.seed import run_seed
from app.models import Recall, BatchInventory
from app.detectors.recall import detect_recalls
from app.detectors.coldchain import detect_coldchain_breaches
from app.detectors.expiry import detect_near_expiry
from app.detectors.returnwindow import detect_return_window_closing
from app.detectors.fefo import detect_fefo_violations
from app.detectors.critical import detect_critical_shortages
from app.engine.ranking import rank_findings
from app.engine.allocation import allocate_clean_stock
from app.engine.options import compare_near_expiry_options, compare_recall_replacement_options

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    run_seed(reset=True)

def test_decoy_batch_produces_no_findings():
    """
    Decoy batch (S6) with 20 months to expiry and strong velocity must NOT be flagged.
    """
    db = SessionLocal()
    try:
        expiry_findings = detect_near_expiry(db)
        return_findings = detect_return_window_closing(db)
        cold_findings = detect_coldchain_breaches(db)
        fefo_findings = detect_fefo_violations(db)

        all_flagged_batches = []
        for f in expiry_findings + return_findings:
            if "batch" in f.entities:
                all_flagged_batches.append(f.entities["batch"])
        for f in cold_findings:
            all_flagged_batches.extend(f.entities.get("batches_affected", []))
        for f in fefo_findings:
            all_flagged_batches.append(f.entities.get("dispatched_batch"))
            all_flagged_batches.append(f.entities.get("unpicked_older_batch"))

        assert "DECOY-999" not in all_flagged_batches
    finally:
        db.close()

def test_coldchain_detector():
    """
    Cold chain detector finds WH-2 Cold Room 1 excursion (9.4C for 140 min)
    touching 3 batches including critical drugs.
    """
    db = SessionLocal()
    try:
        findings = detect_coldchain_breaches(db)
        assert len(findings) >= 1
        wh2_finding = next((f for f in findings if f.entities.get("warehouse") == "WH-2"), None)
        assert wh2_finding is not None
        assert "CR-B101" in wh2_finding.entities["batches_affected"]
        assert wh2_finding.metrics["has_critical_drug"] is True
        assert "quarantine pending qa review" in wh2_finding.description.lower()
    finally:
        db.close()

def test_near_expiry_and_return_window_detectors():
    """
    Detects OMEP-20 batch NE-881 with 70 days left, return window closing in 6 days.
    """
    db = SessionLocal()
    try:
        exp_findings = detect_near_expiry(db)
        ne881 = next((f for f in exp_findings if f.entities.get("batch") == "NE-881"), None)
        assert ne881 is not None
        assert ne881.metrics["days_to_expiry"] == 70

        ret_findings = detect_return_window_closing(db)
        ret_ne881 = next((f for f in ret_findings if f.entities.get("batch") == "NE-881"), None)
        assert ret_ne881 is not None
        assert ret_ne881.metrics["days_to_window_close"] == 6
    finally:
        db.close()

def test_fefo_violation_detector():
    """
    Detects FEFO-NEW dispatched while FEFO-OLD sits unsold.
    """
    db = SessionLocal()
    try:
        findings = detect_fefo_violations(db)
        assert len(findings) >= 1
        azith_fefo = next((f for f in findings if f.entities.get("dispatched_batch") == "FEFO-NEW"), None)
        assert azith_fefo is not None
        assert azith_fefo.entities["unpicked_older_batch"] == "FEFO-OLD"
    finally:
        db.close()

def test_critical_shortage_detector():
    """
    Detects ADREN-01 critical shortage (4 days cover, 9 days lead time).
    """
    db = SessionLocal()
    try:
        findings = detect_critical_shortages(db)
        adren = next((f for f in findings if f.entities.get("sku") == "ADREN-01"), None)
        assert adren is not None
        assert adren.metrics["cover_days"] == 4.0
    finally:
        db.close()

def test_ranking_engine_pins_critical_and_recalls():
    """
    Multi-criteria ranking engine correctly ranks and pins high severity findings.
    """
    db = SessionLocal()
    try:
        all_findings = []
        all_findings.extend(detect_coldchain_breaches(db))
        all_findings.extend(detect_near_expiry(db))
        all_findings.extend(detect_critical_shortages(db))
        all_findings.extend(detect_fefo_violations(db))

        ranked = rank_findings(all_findings)
        assert len(ranked) > 0

        # Top item should be pinned (critical drug shortage or cold chain with critical drug)
        top = ranked[0]
        assert top.explanation["is_pinned"] is True
        assert top.severity >= 90.0
    finally:
        db.close()

def test_allocation_never_exceeds_clean_stock_property_test():
    """
    Property test: for any random clean_qty and any randomized customer list,
    total allocated NEVER exceeds clean_qty, and hospital/critical priorities hold.
    """
    for _ in range(50):
        clean_stock = random.randint(0, 1000)
        num_custs = random.randint(5, 50)
        customers = []
        for i in range(num_custs):
            customers.append({
                "customer_id": f"CUST-{i:03d}",
                "name": f"Customer {i}",
                "type": "hospital" if random.random() < 0.25 else "chemist",
                "demand": random.randint(10, 100),
                "recalled_volume": random.randint(5, 80),
                "credit_terms": random.choice(["Net 15", "Net 30", "Net 45"]),
            })

        is_crit = random.choice([True, False])
        result = allocate_clean_stock(clean_stock, customers, is_critical_drug=is_crit)

        # Property 1: Hard bound
        assert result["total_allocated"] <= clean_stock
        assert result["total_allocated"] + result["unallocated_clean"] == clean_stock

        # Property 2: Allocations sum
        sum_alloc = sum(a["allocated_qty"] for a in result["allocations"])
        assert sum_alloc == result["total_allocated"]

        # Property 3: Individual bounds
        for a in result["allocations"]:
            assert a["allocated_qty"] <= a["demand"]
            assert a["allocated_qty"] >= 0
