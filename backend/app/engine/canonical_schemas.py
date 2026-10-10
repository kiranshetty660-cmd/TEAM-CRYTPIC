import re
from typing import Dict, List, Any, Optional, Tuple, Set

# ==============================================================================
# AUTHORITATIVE CENTRALIZED SCHEMAS FOR TRACERX
# Single source of truth across all 8 core entities
# ==============================================================================

MANDATORY_SCHEMAS: Dict[str, List[str]] = {
    "products": [
        "sku",
        "molecule",
        "brand",
        "category",
        "storage",
        "critical_drug",
    ],
    "batch_inventory": [
        "sku",
        "batch",
        "warehouse",
        "qty",
        "mfg_date",
        "expiry_date",
    ],
    "dispatches": [
        "date",
        "customer",
        "sku",
        "batch",
        "qty",
    ],
    "customers": [
        "customer",
        "type",
        "location",
        "credit_terms",
    ],
    "temperature_logs": [
        "warehouse",
        "cold_room",
        "timestamp",
        "temp_c",
    ],
    "suppliers": [
        "manufacturer",
        "sku",
        "lead_time_days",
        "moq",
        "return_window_days",
    ],
    "purchase_orders": [
        "po",
        "manufacturer",
        "sku",
        "qty",
        "expected_date",
        "status",
    ],
    "recalls": [
        "date",
        "sku",
        "batches",
        "reason",
        "recall_class",
    ],
}

# Alias "temp_logs" to "temperature_logs" for seamless backward compatibility
MANDATORY_SCHEMAS["temp_logs"] = MANDATORY_SCHEMAS["temperature_logs"]

OPTIONAL_SCHEMAS: Dict[str, List[str]] = {
    "products": [],
    "batch_inventory": ["cold_room", "status"],
    "dispatches": ["from_warehouse"],
    "customers": ["name"],
    "temperature_logs": [],
    "temp_logs": [],
    "suppliers": ["unit_cost", "credit_pct"],
    "purchase_orders": [],
    "recalls": ["id"],
}

ENTITY_TITLES: Dict[str, str] = {
    "products": "Products",
    "batch_inventory": "Batch Inventory",
    "dispatches": "Dispatches",
    "customers": "Customers",
    "temperature_logs": "Temperature Logs",
    "temp_logs": "Temperature Logs",
    "suppliers": "Suppliers",
    "purchase_orders": "Purchase Orders",
    "recalls": "Recalls",
}

# Supported enumerated values
ALLOWED_STORAGE_VALUES: Set[str] = {"ambient", "2-8c", "2-8°c", "2-8 c", "2 to 8c"}
ALLOWED_CUSTOMER_TYPES: Set[str] = {"chemist", "hospital"}

CANONICAL_ALIASES: Dict[str, Dict[str, List[str]]] = {
    "products": {
        "sku": ["sku", "product_id", "drug_id", "item_code", "item_number", "code"],
        "molecule": ["molecule", "generic_name", "composition", "active_ingredient", "salt", "formula"],
        "brand": ["brand", "brand_name", "trade_name", "product_name", "drug_name", "title", "name"],
        "category": ["category", "therapeutic_class", "drug_class", "segment"],
        "storage": ["storage", "storage_condition", "temp_req", "storage_type", "temp_condition"],
        "critical_drug": ["critical_drug", "is_critical", "icu_essential", "emergency_drug", "life_saving", "critical"],
    },
    "batch_inventory": {
        "sku": ["sku", "item_code", "product_code", "sku_code", "material_code", "drug_code", "item_id", "product_id"],
        "batch": ["batch", "batch_id", "batch_no", "batch_number", "lot", "lot_number", "lot_no", "batch#", "lot#", "batchcode"],
        "warehouse": ["warehouse", "wh", "warehouse_id", "depot", "hub", "location_code", "dc", "facility", "location"],
        "qty": ["qty", "quantity", "units", "stock", "balance", "count", "inventory_qty", "stock_units", "available_qty"],
        "mfg_date": ["mfg_date", "mfg", "manufacture_date", "manufacturing_date", "prod_date", "release_date", "mfgdate"],
        "expiry_date": ["expiry_date", "expiry", "exp_date", "exp", "expiration_date", "use_by", "best_before", "shelf_life_end", "expirydate", "expdate"],
        "cold_room": ["cold_room", "coldroom", "zone", "cold_storage", "room_id", "chamber", "temperature_zone"],
        "status": ["status", "inventory_status", "stock_status", "condition", "hold_status"],
    },
    "dispatches": {
        "date": ["date", "dispatch_date", "ship_date", "delivery_date", "invoice_date"],
        "customer": ["customer", "customer_id", "client_id", "account_id", "chemist_id", "hospital_id", "buyer_code", "customer_code", "cust", "client", "account"],
        "sku": ["sku", "item_code", "product_code", "drug_code"],
        "batch": ["batch", "batch_no", "lot", "batch_number", "lot_number"],
        "qty": ["qty", "units_shipped", "dispatched_qty", "billed_qty", "ship_units", "quantity", "units"],
        "from_warehouse": ["from_warehouse", "warehouse", "wh", "origin_warehouse", "source_hub", "depot", "location"],
    },
    "customers": {
        "customer": ["customer", "customer_id", "account_id", "client_code", "cust_id", "client", "cust", "account", "id"],
        "type": ["type", "account_type", "facility_type", "customer_category", "tier", "category"],
        "location": ["location", "area", "city", "address", "region", "territory"],
        "credit_terms": ["credit_terms", "payment_terms", "credit_days", "terms"],
        "name": ["name", "customer_name", "account_name", "hospital_name", "pharmacy_name", "client_name"],
    },
    "temperature_logs": {
        "warehouse": ["warehouse", "facility", "hub", "wh", "location"],
        "cold_room": ["cold_room", "zone", "chamber", "sensor_zone", "sensor_id", "room"],
        "timestamp": ["timestamp", "ts", "time", "recorded_at", "reading_time", "date_time", "datetime", "date"],
        "temp_c": ["temp_c", "temperature", "temp", "celsius", "reading", "temperature_c"],
    },
    "suppliers": {
        "manufacturer": ["manufacturer", "supplier", "vendor", "mfg_company", "supplier_name", "company"],
        "sku": ["sku", "item_code", "product_code"],
        "lead_time_days": ["lead_time_days", "lead_time", "lead_days", "transit_days"],
        "moq": ["moq", "minimum_order_qty", "min_order_qty", "min_pack"],
        "return_window_days": ["return_window_days", "return_window", "rma_window", "debit_note_window_days"],
        "unit_cost": ["unit_cost", "cost_price", "purchase_price", "rate_per_unit", "cost"],
        "credit_pct": ["credit_pct", "credit_percentage", "return_credit_rate", "refund_pct"],
    },
    "purchase_orders": {
        "po": ["po", "po_number", "order_id", "po_id", "purchase_order", "po_no"],
        "manufacturer": ["manufacturer", "vendor", "supplier", "company"],
        "sku": ["sku", "item_code", "product_code"],
        "qty": ["qty", "quantity", "units", "order_qty"],
        "expected_date": ["expected_date", "eta", "delivery_date", "due_date", "expected", "date"],
        "status": ["status", "po_status", "order_status"],
    },
    "recalls": {
        "date": ["date", "recall_date", "notice_date"],
        "sku": ["sku", "item_code", "product_code"],
        "batches": ["batches", "batch", "lot", "affected_batches", "batch_numbers"],
        "reason": ["reason", "issue", "defect", "description", "alert_reason"],
        "recall_class": ["recall_class", "class", "severity", "urgency"],
        "id": ["id", "recall_id"],
    },
}
CANONICAL_ALIASES["temp_logs"] = CANONICAL_ALIASES["temperature_logs"]

TEMPLATE_SAMPLES: Dict[str, List[Dict[str, Any]]] = {
    "products": [
        {"sku": "AMOXCLAV625", "molecule": "Amoxicillin + Clavulanic Acid", "brand": "Augmentin 625 Duo", "category": "Antibiotic", "storage": "ambient", "critical_drug": "false"},
        {"sku": "INSULIN100", "molecule": "Human Insulin", "brand": "Huminsulin R", "category": "Antidiabetic", "storage": "2-8C", "critical_drug": "true"},
    ],
    "batch_inventory": [
        {"sku": "AMOXCLAV625", "batch": "B2231", "warehouse": "WH-1", "qty": 500, "mfg_date": "2025-01-01", "expiry_date": "2027-01-01"},
        {"sku": "INSULIN100", "batch": "B1042", "warehouse": "WH-1", "qty": 350, "mfg_date": "2025-03-01", "expiry_date": "2026-11-01"},
    ],
    "dispatches": [
        {"date": "2026-09-01", "customer": "CHEM-001", "sku": "AMOXCLAV625", "batch": "B2231", "qty": 24},
        {"date": "2026-09-02", "customer": "HOSP-002", "sku": "INSULIN100", "batch": "B1042", "qty": 50},
    ],
    "customers": [
        {"customer": "CHEM-001", "type": "chemist", "location": "Indiranagar Bengaluru", "credit_terms": "Net 30"},
        {"customer": "HOSP-002", "type": "hospital", "location": "Whitefield Bengaluru", "credit_terms": "Net 45"},
    ],
    "temperature_logs": [
        {"warehouse": "WH-1", "cold_room": "CR-1", "timestamp": "2026-10-01T08:00:00Z", "temp_c": 4.2},
        {"warehouse": "WH-1", "cold_room": "CR-1", "timestamp": "2026-10-01T08:15:00Z", "temp_c": 4.5},
    ],
    "suppliers": [
        {"manufacturer": "Sun Pharma", "sku": "AMOXCLAV625", "lead_time_days": 7, "moq": 100, "return_window_days": 60},
        {"manufacturer": "Cipla Ltd", "sku": "INSULIN100", "lead_time_days": 5, "moq": 50, "return_window_days": 45},
    ],
    "purchase_orders": [
        {"po": "PO-9901", "manufacturer": "Sun Pharma", "sku": "AMOXCLAV625", "qty": 500, "expected_date": "2026-10-15", "status": "ordered"},
        {"po": "PO-9902", "manufacturer": "Cipla Ltd", "sku": "INSULIN100", "qty": 200, "expected_date": "2026-10-20", "status": "ordered"},
    ],
    "recalls": [
        {"date": "2026-09-10", "sku": "CEFTRIAXONE1G", "batches": '["B9901"]', "reason": "Packaging seal integrity failure", "recall_class": "Class II"},
    ],
}
TEMPLATE_SAMPLES["temp_logs"] = TEMPLATE_SAMPLES["temperature_logs"]


def normalize_header(header: str) -> str:
    """Normalizes header by stripping BOM, surrounding quotes, whitespace, and punctuation."""
    if not header:
        return ""
    h = str(header).strip().strip('"').strip("'").strip("\ufeff")
    return re.sub(r"[^a-zA-Z0-9_]", "", h.lower())


def canonicalize_table_name(table_name: str) -> str:
    """Standardizes table name (e.g., temp_logs -> temperature_logs or vice-versa)."""
    norm = re.sub(r"[^a-zA-Z0-9_]", "", (table_name or "").lower().strip())
    if norm in ("temperature_logs", "templogs", "temp_log", "temperature_log", "temp_logs"):
        return "temp_logs"
    if norm in ("batch_inventory", "batchinventory", "inventory", "batches"):
        return "batch_inventory"
    if norm in ("products", "product", "product_catalog", "catalog"):
        return "products"
    if norm in ("dispatches", "dispatch", "shipments", "sales"):
        return "dispatches"
    if norm in ("customers", "customer", "accounts", "clients"):
        return "customers"
    if norm in ("suppliers", "supplier", "vendors", "manufacturers"):
        return "suppliers"
    if norm in ("purchase_orders", "purchaseorders", "pos", "po"):
        return "purchase_orders"
    if norm in ("recalls", "recall"):
        return "recalls"
    return norm


def validate_headers_strictly(source_headers: List[str], target_table: str) -> Tuple[bool, List[str], Dict[str, str], Optional[str]]:
    """
    Authoritative header validator.
    1. Detects duplicate headers.
    2. Maps headers against canonical fields.
    3. Verifies EVERY mandatory field is present.
    Returns: (is_valid, missing_mandatory_fields, final_mapping, rejection_message)
    """
    tbl = canonicalize_table_name(target_table)
    if tbl not in MANDATORY_SCHEMAS:
        return False, [], {}, f"Unsupported target entity '{target_table}'. Supported: {list(MANDATORY_SCHEMAS.keys())}"

    # Check for duplicate headers
    seen_headers: Set[str] = set()
    for h in source_headers:
        norm_h = normalize_header(h)
        if not norm_h:
            continue
        if norm_h in seen_headers:
            return False, [], {}, f"Duplicate header detected in file: '{h}'"
        seen_headers.add(norm_h)

    aliases = CANONICAL_ALIASES.get(tbl, {})
    mandatory = MANDATORY_SCHEMAS[tbl]
    optional = OPTIONAL_SCHEMAS.get(tbl, [])

    mapping: Dict[str, str] = {}
    used_sources: Set[str] = set()

    # Pass 1: exact matches
    for canon_field in mandatory + optional:
        alias_list = aliases.get(canon_field, [canon_field])
        for src_col in source_headers:
            if src_col in used_sources:
                continue
            norm_src = normalize_header(src_col)
            for alias in alias_list:
                if norm_src == normalize_header(alias):
                    mapping[canon_field] = src_col
                    used_sources.add(src_col)
                    break
            if canon_field in mapping:
                break

    # Pass 2: substring / fuzzy matches for unmapped fields
    for canon_field in mandatory + optional:
        if canon_field in mapping:
            continue
        alias_list = aliases.get(canon_field, [canon_field])
        for src_col in source_headers:
            if src_col in used_sources:
                continue
            norm_src = normalize_header(src_col)
            for alias in alias_list:
                norm_alias = normalize_header(alias)
                if len(norm_src) >= 3 and (norm_alias in norm_src or norm_src in norm_alias):
                    mapping[canon_field] = src_col
                    used_sources.add(src_col)
                    break
            if canon_field in mapping:
                break

    # Determine missing mandatory fields
    missing_mandatory = [f for f in mandatory if f not in mapping]

    if missing_mandatory:
        entity_name = ENTITY_TITLES.get(tbl, tbl.title())
        missing_bullets = "\n".join(f"- {field}" for field in missing_mandatory)
        msg = (
            f"Upload rejected: {entity_name}\n\n"
            f"Missing mandatory fields:\n{missing_bullets}\n\n"
            f"Please correct the file and upload it again.\n"
            f"No records were imported."
        )
        return False, missing_mandatory, mapping, msg

    return True, [], mapping, None


def generate_csv_template(target_table: str) -> str:
    """Generates standard CSV template containing all mandatory headers and demo row."""
    tbl = canonicalize_table_name(target_table)
    mandatory = MANDATORY_SCHEMAS.get(tbl, [])
    if not mandatory:
        raise ValueError(f"Unknown entity '{target_table}'")

    rows = TEMPLATE_SAMPLES.get(tbl, [])
    import csv, io
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=mandatory, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return output.getvalue()
