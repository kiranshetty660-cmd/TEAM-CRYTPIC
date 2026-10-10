import io
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Product, BatchInventory, Customer, Dispatch, Supplier, TempLog, PurchaseOrder, Recall
from app.engine.canonical_schemas import (
    MANDATORY_SCHEMAS,
    OPTIONAL_SCHEMAS,
    ENTITY_TITLES,
    validate_headers_strictly,
    generate_csv_template,
    canonicalize_table_name,
)

client = TestClient(app)

ALL_8_ENTITIES = [
    "products",
    "batch_inventory",
    "dispatches",
    "customers",
    "temperature_logs",
    "suppliers",
    "purchase_orders",
    "recalls",
]

# Valid baseline records for all 8 entities containing 100% mandatory fields
VALID_RECORDS = {
    "products": {
        "headers": ["sku", "molecule", "brand", "category", "storage", "critical_drug"],
        "row": "AMOX-625,Amoxicillin,Augmentin,Antibiotic,ambient,false",
    },
    "batch_inventory": {
        "headers": ["sku", "batch", "warehouse", "qty", "mfg_date", "expiry_date"],
        "row": "AMOX-625,B-9901,WH-1,500,2025-01-01,2027-01-01",
    },
    "dispatches": {
        "headers": ["date", "customer", "sku", "batch", "qty"],
        "row": "2026-09-01,CHEM-001,AMOX-625,B-9901,25",
    },
    "customers": {
        "headers": ["customer", "type", "location", "credit_terms"],
        "row": "CHEM-001,chemist,Indiranagar,Net 30",
    },
    "temperature_logs": {
        "headers": ["warehouse", "cold_room", "timestamp", "temp_c"],
        "row": "WH-1,CR-1,2026-10-01T08:00:00Z,4.5",
    },
    "suppliers": {
        "headers": ["manufacturer", "sku", "lead_time_days", "moq", "return_window_days"],
        "row": "Sun Pharma,AMOX-625,7,100,60",
    },
    "purchase_orders": {
        "headers": ["po", "manufacturer", "sku", "qty", "expected_date", "status"],
        "row": "PO-1001,Sun Pharma,AMOX-625,500,2026-10-25,ordered",
    },
    "recalls": {
        "headers": ["date", "sku", "batches", "reason", "recall_class"],
        "row": "2026-09-10,AMOX-625,[\"B-9901\"],Contamination alert,Class II",
    },
}

# ---------------------------------------------------------------------------
# Test 1: Every mandatory field present & valid -> Accepted for all 8 entities
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("entity", ALL_8_ENTITIES)
def test_all_entities_accepted_with_complete_mandatory_fields(entity):
    meta = VALID_RECORDS[entity]
    csv_content = f"{','.join(meta['headers'])}\n{meta['row']}\n"
    files = {"file": (f"{entity}_valid.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}

    resp = client.post("/api/data/profile", data={"target_table": entity}, files=files)
    assert resp.status_code == 200, resp.text
    pdata = resp.json()
    assert pdata["is_rejected"] is False, f"Entity {entity} was unexpectedly rejected"
    assert len(pdata["missing_mandatory_fields"]) == 0

    # Also validate endpoint
    files2 = {"file": (f"{entity}_valid.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    resp_val = client.post("/api/data/validate", data={"target_table": entity}, files=files2)
    assert resp_val.status_code == 200
    vdata = resp_val.json()
    assert vdata["is_valid_for_commit"] is True, f"Entity {entity} not valid for commit: {vdata.get('errors')}"
    assert vdata["invalid_rows_count"] == 0
    assert vdata["valid_rows_count"] >= 1


# ---------------------------------------------------------------------------
# Test 2: Missing ONE mandatory field -> Rejected with missing field listed
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("entity", ALL_8_ENTITIES)
def test_all_entities_rejected_when_missing_single_mandatory_field(entity):
    meta = VALID_RECORDS[entity]
    mandatory_fields = MANDATORY_SCHEMAS[canonicalize_table_name(entity)]
    missing_target = mandatory_fields[0]  # Omit first mandatory column

    incomplete_headers = [h for h in meta["headers"] if h != missing_target]
    csv_content = f"{','.join(incomplete_headers)}\nval1,val2,val3\n"
    files = {"file": (f"{entity}_missing_one.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}

    resp = client.post("/api/data/profile", data={"target_table": entity}, files=files)
    assert resp.status_code == 200
    pdata = resp.json()
    assert pdata["is_rejected"] is True
    assert missing_target in pdata["missing_mandatory_fields"]
    assert "Upload rejected:" in pdata["rejection_message"]
    assert f"- {missing_target}" in pdata["rejection_message"]

    # Validate endpoint must also reject
    files2 = {"file": (f"{entity}_missing_one.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    resp_val = client.post("/api/data/validate", data={"target_table": entity}, files=files2)
    assert resp_val.status_code == 200
    vdata = resp_val.json()
    assert vdata["is_valid_for_commit"] is False
    assert vdata["import_status"] == "Blocked"


# ---------------------------------------------------------------------------
# Test 3: Missing MULTIPLE mandatory fields -> Rejected with all missing listed
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("entity", ALL_8_ENTITIES)
def test_all_entities_rejected_when_missing_multiple_mandatory_fields(entity):
    meta = VALID_RECORDS[entity]
    mandatory_fields = MANDATORY_SCHEMAS[canonicalize_table_name(entity)]
    if len(mandatory_fields) < 3:
        pytest.skip("Not enough mandatory fields to test multiple")

    omitted = mandatory_fields[:2]  # Omit first two
    remaining_headers = [h for h in meta["headers"] if h not in omitted]
    csv_content = f"{','.join(remaining_headers)}\nval1,val2\n"
    files = {"file": (f"{entity}_missing_multi.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}

    resp = client.post("/api/data/profile", data={"target_table": entity}, files=files)
    pdata = resp.json()
    assert pdata["is_rejected"] is True
    for om in omitted:
        assert om in pdata["missing_mandatory_fields"]
        assert f"- {om}" in pdata["rejection_message"]


# ---------------------------------------------------------------------------
# Test 4: Header casing and surrounding whitespace normalized safely
# ---------------------------------------------------------------------------
def test_header_casing_and_whitespace_normalization():
    # Messy headers: uppercase, leading/trailing whitespace
    messy_csv = (
        "  SKU  ,   MOLECULE  , Brand, CATEGORY , Storage , Critical_Drug \n"
        "CIPRO-500,Ciprofloxacin,Ciprobid,Antibiotic,ambient,true\n"
    )
    files = {"file": ("products_messy.csv", io.BytesIO(messy_csv.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/profile", data={"target_table": "products"}, files=files)
    assert resp.status_code == 200
    pdata = resp.json()
    assert pdata["is_rejected"] is False
    assert len(pdata["missing_mandatory_fields"]) == 0

    files2 = {"file": ("products_messy.csv", io.BytesIO(messy_csv.encode("utf-8")), "text/csv")}
    resp_val = client.post("/api/data/validate", data={"target_table": "products"}, files=files2)
    vdata = resp_val.json()
    assert vdata["is_valid_for_commit"] is True
    assert vdata["valid_rows_count"] == 1


# ---------------------------------------------------------------------------
# Test 5: Extra non-mandatory columns do NOT cause rejection
# ---------------------------------------------------------------------------
def test_extra_non_mandatory_columns_accepted():
    extra_csv = (
        "sku,batch,warehouse,qty,mfg_date,expiry_date,extra_internal_notes,supplier_code\n"
        "PARA-500,B-7711,WH-1,200,2025-01-01,2027-01-01,Handled with care,VEND-01\n"
    )
    files = {"file": ("inventory_extra_cols.csv", io.BytesIO(extra_csv.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/profile", data={"target_table": "batch_inventory"}, files=files)
    pdata = resp.json()
    assert pdata["is_rejected"] is False
    assert len(pdata["missing_mandatory_fields"]) == 0

    files2 = {"file": ("inventory_extra_cols.csv", io.BytesIO(extra_csv.encode("utf-8")), "text/csv")}
    resp_val = client.post("/api/data/validate", data={"target_table": "batch_inventory"}, files=files2)
    vdata = resp_val.json()
    assert vdata["is_valid_for_commit"] is True


# ---------------------------------------------------------------------------
# Test 6: Empty mandatory cells in rows are rejected with row numbers
# ---------------------------------------------------------------------------
def test_empty_mandatory_cells_rejected():
    # Row 1 valid, Row 2 empty batch, Row 3 empty qty
    csv_data = (
        "sku,batch,warehouse,qty,mfg_date,expiry_date\n"
        "AMOX-625,B-001,WH-1,100,2025-01-01,2027-01-01\n"
        "AMOX-625,,WH-1,100,2025-01-01,2027-01-01\n"
        "AMOX-625,B-003,WH-1,,2025-01-01,2027-01-01\n"
    )
    files = {"file": ("empty_cells.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/validate", data={"target_table": "batch_inventory"}, files=files)
    vdata = resp.json()
    assert vdata["is_valid_for_commit"] is False
    assert vdata["import_status"] == "Blocked"
    assert vdata["invalid_rows_count"] == 2
    assert vdata["valid_rows_count"] == 1

    error_rows = {e["row_number"] for e in vdata["errors"]}
    assert 2 in error_rows
    assert 3 in error_rows


# ---------------------------------------------------------------------------
# Test 7: Invalid values, enums, dates, and types are rejected
# ---------------------------------------------------------------------------
def test_invalid_storage_enum_and_dates_rejected():
    # Row 1: Invalid storage 'frozen' (only ambient or 2-8C allowed)
    prod_csv = (
        "sku,molecule,brand,category,storage,critical_drug\n"
        "AZITH-500,Azithromycin,Azee,Antibiotic,deep-freeze,false\n"
    )
    files = {"file": ("invalid_storage.csv", io.BytesIO(prod_csv.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/validate", data={"target_table": "products"}, files=files)
    vdata = resp.json()
    assert vdata["is_valid_for_commit"] is False
    assert any("Invalid storage condition" in e["error"] for e in vdata["errors"])

    # Row with mfg_date later than expiry_date
    batch_csv = (
        "sku,batch,warehouse,qty,mfg_date,expiry_date\n"
        "AMOX-625,B-99,WH-1,50,2028-01-01,2026-01-01\n"
    )
    files_b = {"file": ("inverted_dates.csv", io.BytesIO(batch_csv.encode("utf-8")), "text/csv")}
    resp_b = client.post("/api/data/validate", data={"target_table": "batch_inventory"}, files=files_b)
    vbdata = resp_b.json()
    assert vbdata["is_valid_for_commit"] is False
    assert any("cannot be later than expiry date" in e["error"] for e in vbdata["errors"])

    # Invalid customer type
    cust_csv = (
        "customer,type,location,credit_terms\n"
        "CHEM-99,wholesaler,MG Road,Net 30\n"
    )
    files_c = {"file": ("invalid_type.csv", io.BytesIO(cust_csv.encode("utf-8")), "text/csv")}
    resp_c = client.post("/api/data/validate", data={"target_table": "customers"}, files=files_c)
    vcdata = resp_c.json()
    assert vcdata["is_valid_for_commit"] is False
    assert any("Invalid customer type" in e["error"] for e in vcdata["errors"])


# ---------------------------------------------------------------------------
# Test 8: Duplicate headers are detected and rejected
# ---------------------------------------------------------------------------
def test_duplicate_headers_rejected():
    dup_csv = (
        "sku,batch,qty,batch,warehouse,mfg_date,expiry_date\n"
        "AMOX-625,B-1,100,B-1,WH-1,2025-01-01,2027-01-01\n"
    )
    files = {"file": ("dup_headers.csv", io.BytesIO(dup_csv.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/profile", data={"target_table": "batch_inventory"}, files=files)
    assert resp.status_code == 400
    assert "Duplicate header detected" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Test 9: Direct API requests cannot bypass mandatory field checks
# ---------------------------------------------------------------------------
def test_direct_api_upload_rejects_missing_mandatory_fields():
    # Direct POST to /api/data/upload with missing mandatory columns
    incomplete_csv = "sku,qty\nPARA-500,100\n"
    files = {"file": ("direct_incomplete.csv", io.BytesIO(incomplete_csv.encode("utf-8")), "text/csv")}
    resp = client.post("/api/data/upload", data={"table": "batch_inventory", "mode": "upsert"}, files=files)
    assert resp.status_code == 400
    assert "Missing mandatory fields:" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Test 10: Direct commit endpoint blocks invalid / rejected datasets
# ---------------------------------------------------------------------------
def test_commit_blocked_when_validation_errors_exist():
    # Validate a file that has errors
    csv_data = (
        "sku,batch,warehouse,qty,mfg_date,expiry_date\n"
        "AMOX-625,B-ERR,WH-1,-50,2025-01-01,2027-01-01\n"  # negative qty
    )
    files = {"file": ("negative_qty.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    r_val = client.post("/api/data/validate", data={"target_table": "batch_inventory"}, files=files)
    vdata = r_val.json()
    import_id = vdata["import_id"]

    # Attempting to commit this import_id must be rejected with 400
    r_com = client.post("/api/data/commit", data={"import_id": import_id, "imported_by": "Tester"})
    assert r_com.status_code == 400
    assert "Import is blocked" in r_com.json()["detail"]


# ---------------------------------------------------------------------------
# Test 11: Templates endpoint returns complete mandatory schema for all 8 entities
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("entity", ALL_8_ENTITIES)
def test_templates_contain_complete_mandatory_schema(entity):
    resp = client.get(f"/api/data/templates/{entity}")
    assert resp.status_code == 200
    csv_text = resp.text
    header_line = csv_text.splitlines()[0]
    headers = [h.strip() for h in header_line.split(",")]

    expected_mandatory = MANDATORY_SCHEMAS[canonicalize_table_name(entity)]
    for req in expected_mandatory:
        assert req in headers, f"Template for {entity} missing required header '{req}'"


# ---------------------------------------------------------------------------
# Test 12: Schemas endpoint returns unified centralized schemas
# ---------------------------------------------------------------------------
def test_authoritative_schemas_endpoint():
    resp = client.get("/api/data/schemas")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    schemas = data["schemas"]

    for entity in ["products", "batch_inventory", "dispatches", "customers", "temperature_logs", "suppliers", "purchase_orders", "recalls"]:
        assert entity in schemas
        canon_tbl = canonicalize_table_name(entity)
        assert schemas[entity]["mandatory_fields"] == MANDATORY_SCHEMAS[canon_tbl]
