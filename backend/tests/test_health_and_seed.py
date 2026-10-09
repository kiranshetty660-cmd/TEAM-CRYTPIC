import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func
from app.main import app
from app.db import SessionLocal
from app.models import BatchInventory, Dispatch, Customer, Product, Ledger
from app.seed.seed import run_seed

@pytest.fixture(scope="module", autouse=True)
def setup_database():
    run_seed(reset=True)

def test_health_endpoint():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert data["ledger_entries"] > 0

def test_seed_fixtures_s1_recall():
    """
    Test section 12 requirement:
    Seed fixtures reproduce: 180 in WH, 640 dispatched, 23 chemists + 2 hospitals, clean 400, shortfall > 0
    """
    db = SessionLocal()
    try:
        # Check WH-1 stock for B2231
        b2231 = db.query(BatchInventory).filter(
            BatchInventory.batch == "B2231",
            BatchInventory.warehouse == "WH-1"
        ).first()
        assert b2231 is not None
        assert b2231.qty == 180

        # Check clean batch B2240 in WH-1
        b2240 = db.query(BatchInventory).filter(
            BatchInventory.batch == "B2240",
            BatchInventory.warehouse == "WH-1"
        ).first()
        assert b2240 is not None
        assert b2240.qty == 400

        # Check dispatched total for B2231
        dispatched_total = db.query(func.sum(Dispatch.qty)).filter(
            Dispatch.batch == "B2231"
        ).scalar()
        assert dispatched_total == 640

        # Check customer breakdown: 2 hospitals, 23 chemists
        dispatches_b2231 = db.query(Dispatch).filter(Dispatch.batch == "B2231").all()
        cust_ids = {d.customer_id for d in dispatches_b2231}
        assert len(cust_ids) == 25

        hospitals = db.query(Customer).filter(
            Customer.customer_id.in_(cust_ids),
            Customer.type == "hospital"
        ).count()
        chemists = db.query(Customer).filter(
            Customer.customer_id.in_(cust_ids),
            Customer.type == "chemist"
        ).count()
        assert hospitals == 2
        assert chemists == 23

        # Shortfall calculation:
        # daily demand ~ 21, lead time = 8
        # need = 640 + 21 * 8 = 808
        # clean = 400 -> shortfall = 808 - 400 = 408 > 0
        normal_daily_demand = 21
        lead_time = 8
        replacement_need = dispatched_total + (normal_daily_demand * lead_time)
        shortfall = replacement_need - b2240.qty
        assert shortfall > 0

    finally:
        db.close()

def test_seed_fixtures_decoy_batch_s6():
    """
    Decoy batch (S6) exists with 20 months to expiry
    """
    db = SessionLocal()
    try:
        decoy = db.query(BatchInventory).filter(
            BatchInventory.batch == "DECOY-999"
        ).first()
        assert decoy is not None
        assert decoy.qty == 3000
    finally:
        db.close()
