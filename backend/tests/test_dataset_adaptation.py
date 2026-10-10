import io
import json
import pytest
import openpyxl
from fastapi.testclient import TestClient
from app.main import app
from app.seed.seed import run_seed
from app.db import SessionLocal
from app.models import BatchInventory, DatasetImport, Ledger

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def init_db():
    run_seed(reset=True)

def test_adaptation_profiling_and_column_matching():
    """
    Test profiling CSV with diverse real-world column names:
    'item_code', 'lot_number', 'stock_units', 'mfg_dt', 'exp_dt', 'location'
    """
    csv_data = (
        "item_code,lot_number,stock_units,mfg_dt,exp_dt,location\n"
        "CIPRO-500,LOT-9988,450,2025-06-01,2027-06-01,WH-Central\n"
        "AZITH-250,LOT-9989,300,2025-08-01,2027-08-01,WH-North\n"
    )
    files = {"file": ("distributor_stock.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/profile", data={"table": "batch_inventory"}, files=files)
    assert resp.status_code == 200
    data = resp.json()

    assert data["filename"] == "distributor_stock.csv"
    assert data["file_type"] == "csv"
    assert data["row_count"] == 2
    assert "file_sha256" in data
    assert len(data["file_sha256"]) == 64

    # Check mapping suggestions
    mappings = {m["source_column"]: m for m in data["suggested_mappings"]}
    assert mappings["item_code"]["target_field"] == "sku"
    assert mappings["lot_number"]["target_field"] == "batch"
    assert mappings["stock_units"]["target_field"] == "qty"
    assert mappings["mfg_dt"]["target_field"] == "mfg_date"
    assert mappings["exp_dt"]["target_field"] == "expiry_date"
    assert mappings["location"]["target_field"] == "warehouse"

    # Capability report
    cap = data["capabilities"]
    assert cap["near_expiry_analysis"]["supported"] is True
    assert cap["fefo_violation_detection"]["supported"] is True


def test_xlsx_profiling_and_validation():
    """
    Test XLSX parsing and validation using openpyxl.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Inventory"
    ws.append(["Product_SKU", "Batch_ID", "Quantity", "MfgDate", "ExpDate", "Storage"])
    ws.append(["AMOX-500", "XL-BATCH-1", 500, "2025-01-01", "2027-01-01", "WH-1"])
    ws.append(["AMOX-500", "XL-BATCH-2", 250, "2025-02-01", "2027-02-01", "WH-2"])

    excel_buffer = io.BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)

    files = {"file": ("test_sheets.xlsx", excel_buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    resp = client.post("/api/data/profile", data={"table": "batch_inventory"}, files=files)
    assert resp.status_code == 200
    data = resp.json()

    assert data["file_type"] == "xlsx"
    assert data["row_count"] == 2
    mappings = {m["source_column"]: m["target_field"] for m in data["suggested_mappings"]}
    assert mappings["Product_SKU"] == "sku"
    assert mappings["Batch_ID"] == "batch"
    assert mappings["Quantity"] == "qty"


def test_validation_rejects_missing_mandatory_fields_and_no_fabrication():
    """
    Safeguard: Never fabricate missing critical values or silently drop rows.
    Rows with missing mandatory fields must be reported with explicit RowValidationError.
    """
    # Row 1 has valid data, Row 2 is missing 'sku', Row 3 is missing 'qty'
    csv_data = (
        "sku,batch,qty,mfg_date,expiry_date,warehouse\n"
        "PARA-500,B-VALID,100,2025-01-01,2027-01-01,WH-1\n"
        ",B-MISSING-SKU,100,2025-01-01,2027-01-01,WH-1\n"
        "PARA-500,B-MISSING-QTY,,2025-01-01,2027-01-01,WH-1\n"
    )
    files = {"file": ("missing_fields.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/validate", data={"table": "batch_inventory"}, files=files)
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_rows"] == 3
    assert data["valid_rows"] == 1
    assert data["invalid_rows"] == 2
    assert len(data["errors"]) >= 2

    # Check explicit error descriptions
    err_fields = [e["field"] for e in data["errors"]]
    assert "sku" in err_fields
    assert "qty" in err_fields


def test_validation_rejects_invalid_dates_and_negative_quantities():
    """
    Safeguard: Detects illogical dates (expiry <= mfg) and negative quantities.
    """
    csv_data = (
        "sku,batch,qty,mfg_date,expiry_date,warehouse\n"
        "PARA-500,B-EXP-BEFORE-MFG,100,2026-05-01,2025-01-01,WH-1\n"
        "PARA-500,B-NEG-QTY,-45,2025-01-01,2027-01-01,WH-1\n"
    )
    files = {"file": ("invalid_values.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/validate", data={"table": "batch_inventory"}, files=files)
    assert resp.status_code == 200
    data = resp.json()

    assert data["invalid_rows"] == 2
    err_reasons = " ".join([e["error"] for e in data["errors"]]).lower()
    assert "must be after manufacturing date" in err_reasons
    assert "cannot be negative" in err_reasons


def test_unmapped_warehouse_is_rejected_as_mandatory():
    """
    Safeguard: Warehouse is mandatory for batch_inventory according to canonical schema.
    A file missing warehouse must be rejected without fabricating an arbitrary warehouse.
    """
    csv_data = (
        "sku,batch,qty,mfg_date,expiry_date\n"
        "CET-10,B-NO-WH-1,500,2025-01-01,2027-01-01\n"
    )
    files = {"file": ("no_warehouse.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    # Validate with explicit column mappings without warehouse
    mapping_json = (
        '{"sku":"sku","batch":"batch","qty":"qty","mfg_date":"mfg_date","expiry_date":"expiry_date"}'
    )
    resp = client.post(
        "/api/data/validate",
        data={"table": "batch_inventory", "column_mappings": mapping_json},
        files=files,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "rejected"
    assert data["is_valid_for_commit"] is False
    assert "warehouse" in data["missing_mandatory_fields"]


def test_capability_report_disables_unsupported_analytics():
    """
    Safeguard: Enable only analyses supported by imported data.
    When mfg/expiry are omitted, expiry/FEFO analyses must report unsupported.
    """
    csv_data = (
        "sku,batch,qty,warehouse\n"
        "CET-10,B-PARTIAL,500,WH-1\n"
    )
    files = {"file": ("partial_cols.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/profile", data={"table": "batch_inventory"}, files=files)
    assert resp.status_code == 200
    data = resp.json()

    caps = data["capabilities"]
    assert caps["near_expiry_analysis"]["supported"] is False
    assert "Requires mfg_date, expiry_date" in caps["near_expiry_analysis"]["reason"]
    assert caps["fefo_violation_detection"]["supported"] is False


def test_transactional_commit_and_idempotency_and_ledger():
    """
    Test transactional commit, audit ledger record, and idempotency prevention.
    """
    csv_data = (
        "sku,batch,qty,mfg_date,expiry_date,warehouse\n"
        "IBUPROF-400,TX-COMMIT-1,750,2025-01-01,2027-01-01,WH-1\n"
        "IBUPROF-400,TX-COMMIT-2,250,2025-01-01,2027-01-01,WH-2\n"
    )
    files = {"file": ("commit_test.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post(
        "/api/data/commit",
        data={"table": "batch_inventory", "mode": "upsert", "user": "compliance_lead"},
        files=files,
    )
    assert resp.status_code == 200
    res = resp.json()
    assert res["status"] == "committed"
    assert res["committed_rows"] == 2
    import_id = res["import_id"]

    # Verify rows exist in DB with import_batch_id
    db = SessionLocal()
    b1 = db.query(BatchInventory).filter(BatchInventory.batch == "TX-COMMIT-1").first()
    b2 = db.query(BatchInventory).filter(BatchInventory.batch == "TX-COMMIT-2").first()
    assert b1 is not None and b1.qty == 750 and b1.import_batch_id == import_id
    assert b2 is not None and b2.qty == 250 and b2.import_batch_id == import_id

    # Verify Ledger event
    ledger_entry = db.query(Ledger).filter(Ledger.event_type == "DATASET_IMPORTED").order_by(Ledger.seq.desc()).first()
    assert ledger_entry is not None
    payload = json.loads(ledger_entry.payload) if isinstance(ledger_entry.payload, str) else ledger_entry.payload
    assert payload["import_id"] == import_id
    assert payload["rows_committed"] == 2
    db.close()

    # Idempotency test: Re-submitting the exact same file returns already committed result
    files_again = {"file": ("commit_test.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp_again = client.post(
        "/api/data/commit",
        data={"table": "batch_inventory", "mode": "upsert", "user": "compliance_lead"},
        files=files_again,
    )
    assert resp_again.status_code == 200
    res_again = resp_again.json()
    assert res_again["status"] == "already_committed"
    assert res_again["import_id"] == import_id


def test_rollback_affects_only_imported_records_preserving_seed():
    """
    Safeguard: Rollback restores state and removes only records created/updated
    by the target import. Seed data remains strictly untouched.
    """
    db = SessionLocal()
    seed_count = db.query(BatchInventory).count()
    seed_batch_b2231 = db.query(BatchInventory).filter(BatchInventory.batch == "B2231").first()
    assert seed_batch_b2231 is not None
    seed_b2231_qty = seed_batch_b2231.qty
    db.close()

    # Import new batches + update an existing batch
    csv_data = (
        "sku,batch,qty,mfg_date,expiry_date,warehouse\n"
        "MOCK-SKU,RB-BATCH-1,100,2025-01-01,2027-01-01,WH-1\n"
        "MOCK-SKU,RB-BATCH-2,200,2025-01-01,2027-01-01,WH-2\n"
        "AMOX-625,B2231,999,2025-06-01,2027-06-01,WH-1\n"
    )
    files = {"file": ("rollback_test.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post(
        "/api/data/commit",
        data={"table": "batch_inventory", "mode": "upsert", "user": "test_officer"},
        files=files,
    )
    assert resp.status_code == 200
    import_id = resp.json()["import_id"]

    # Verify batches exist
    db = SessionLocal()
    assert db.query(BatchInventory).filter(BatchInventory.batch == "RB-BATCH-1").first() is not None
    assert db.query(BatchInventory).filter(BatchInventory.batch == "B2231").first().qty == 999
    db.close()

    # Perform Rollback
    rb_resp = client.post(f"/api/data/rollback?import_id={import_id}&user=qa_reviewer")
    assert rb_resp.status_code == 200
    rb_data = rb_resp.json()
    assert rb_data["status"] == "rolled_back"
    assert rb_data["deleted_new_records"] == 2
    assert rb_data["restored_records"] == 1

    # Verify RB batches are deleted, and B2231 is restored to original seed qty
    db = SessionLocal()
    assert db.query(BatchInventory).filter(BatchInventory.batch == "RB-BATCH-1").first() is None
    assert db.query(BatchInventory).filter(BatchInventory.batch == "RB-BATCH-2").first() is None
    restored_b2231 = db.query(BatchInventory).filter(BatchInventory.batch == "B2231").first()
    assert restored_b2231 is not None
    assert restored_b2231.qty == seed_b2231_qty
    assert db.query(BatchInventory).count() == seed_count

    # Check rollback ledger entry
    rb_ledger = db.query(Ledger).filter(Ledger.event_type == "DATASET_ROLLED_BACK").order_by(Ledger.seq.desc()).first()
    assert rb_ledger is not None
    rb_payload = json.loads(rb_ledger.payload) if isinstance(rb_ledger.payload, str) else rb_ledger.payload
    assert rb_payload["import_id"] == import_id
    db.close()


def test_recompute_affected_findings_after_import_and_rollback():
    """
    Safeguard: Recompute affected findings after a successful import
    and verify that stale findings are cleaned up when the dataset changes or rolls back.
    """
    # 1. Verify NE-9999 is not in findings
    board = client.get("/api/board").json()
    assert not any(f["entities"].get("batch") == "NE-9999" for f in board["findings"])

    # 2. Import a batch that expires in 30 days (triggering Near Expiry finding)
    # Today is in 2026-10-09, so 2026-11-05 is within 120 days
    csv_data = (
        "sku,batch,qty,mfg_date,expiry_date,warehouse\n"
        "OMEP-20,NE-9999,500,2025-01-01,2026-11-05,WH-1\n"
    )
    files = {"file": ("near_expiry_inflow.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post(
        "/api/data/commit",
        data={"table": "batch_inventory", "mode": "upsert", "user": "analyst"},
        files=files,
    )
    assert resp.status_code == 200
    import_id = resp.json()["import_id"]

    # 3. Check findings board - finding for NE-9999 must now be automatically recomputed and present
    board_updated = client.get("/api/board").json()
    new_finding = next((f for f in board_updated["findings"] if f["entities"].get("batch") == "NE-9999"), None)
    assert new_finding is not None
    assert new_finding["type"] == "expiry"

    # 4. Rollback the import
    rb_resp = client.post(f"/api/data/rollback?import_id={import_id}&user=analyst")
    assert rb_resp.status_code == 200

    # 5. Check findings board - NE-9999 finding must be removed, preventing stale findings
    board_after_rollback = client.get("/api/board").json()
    stale_finding = next((f for f in board_after_rollback["findings"] if f["entities"].get("batch") == "NE-9999"), None)
    assert stale_finding is None


def test_malformed_and_empty_file_handling():
    """
    Safeguard: Rejects empty or unsupported files cleanly.
    """
    # Empty file
    files = {"file": ("empty.csv", io.BytesIO(b""), "text/csv")}
    resp = client.post("/api/data/profile", data={"table": "batch_inventory"}, files=files)
    assert resp.status_code == 400
    assert "File is empty" in resp.json()["detail"]

    # Unsupported format
    files_bad = {"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4..."), "application/pdf")}
    resp_bad = client.post("/api/data/profile", data={"table": "batch_inventory"}, files=files_bad)
    assert resp_bad.status_code == 400
    assert "Unsupported file format" in resp_bad.json()["detail"]
