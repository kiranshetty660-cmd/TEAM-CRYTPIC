import csv
import io
import re
import hashlib
from datetime import date, datetime
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.models import Product, Supplier, Customer, BatchInventory, Dispatch, TempLog

# ---------------------------------------------------------------------------
# Canonical Schemas & Aliases
# ---------------------------------------------------------------------------

CANONICAL_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "batch_inventory": {
        "required": ["batch", "sku", "qty", "expiry_date"],
        "optional": ["warehouse", "cold_room", "mfg_date", "status"],
        "aliases": {
            "batch": ["batch", "batch_id", "batch_no", "batch_number", "lot", "lot_number", "lot_no", "batch#", "lot#", "batchcode"],
            "sku": ["sku", "item_code", "product_code", "sku_code", "material_code", "drug_code", "item_id", "product_id"],
            "qty": ["qty", "quantity", "units", "stock", "balance", "count", "inventory_qty", "stock_units", "available_qty"],
            "expiry_date": ["expiry_date", "expiry", "exp_date", "exp", "expiration_date", "use_by", "best_before", "shelf_life_end", "expirydate"],
            "mfg_date": ["mfg_date", "mfg", "manufacture_date", "manufacturing_date", "prod_date", "release_date", "mfgdate"],
            "warehouse": ["warehouse", "wh", "warehouse_id", "depot", "hub", "location_code", "dc", "facility"],
            "cold_room": ["cold_room", "coldroom", "zone", "cold_storage", "room_id", "chamber", "temperature_zone"],
            "status": ["status", "inventory_status", "stock_status", "condition", "hold_status"],
        }
    },
    "products": {
        "required": ["sku", "brand"],
        "optional": ["molecule", "category", "storage", "critical_drug"],
        "aliases": {
            "sku": ["sku", "product_id", "drug_id", "item_number", "item_code"],
            "brand": ["brand", "brand_name", "trade_name", "product_name", "drug_name", "title"],
            "molecule": ["molecule", "generic_name", "composition", "active_ingredient", "salt", "formula"],
            "category": ["category", "therapeutic_class", "drug_class", "segment"],
            "storage": ["storage", "storage_condition", "temp_req", "storage_type", "temp_condition"],
            "critical_drug": ["critical_drug", "is_critical", "icu_essential", "emergency_drug", "life_saving", "critical"],
        }
    },
    "dispatches": {
        "required": ["date", "customer_id", "sku", "batch", "qty"],
        "optional": ["from_warehouse"],
        "aliases": {
            "date": ["date", "dispatch_date", "ship_date", "delivery_date", "invoice_date"],
            "customer_id": ["customer_id", "client_id", "account_id", "chemist_id", "hospital_id", "buyer_code", "customer_code"],
            "sku": ["sku", "item_code", "product_code", "drug_code"],
            "batch": ["batch", "batch_no", "lot", "batch_number"],
            "qty": ["qty", "units_shipped", "dispatched_qty", "billed_qty", "ship_units"],
            "from_warehouse": ["from_warehouse", "warehouse", "wh", "origin_warehouse", "source_hub"],
        }
    },
    "customers": {
        "required": ["customer_id", "name", "type"],
        "optional": ["location", "credit_terms"],
        "aliases": {
            "customer_id": ["customer_id", "account_id", "client_code", "cust_id"],
            "name": ["name", "customer_name", "account_name", "hospital_name", "pharmacy_name", "client_name"],
            "type": ["type", "account_type", "facility_type", "customer_category", "tier"],
            "location": ["location", "area", "city", "address", "region", "territory"],
            "credit_terms": ["credit_terms", "payment_terms", "credit_days", "terms"],
        }
    },
    "suppliers": {
        "required": ["manufacturer", "sku", "unit_cost"],
        "optional": ["lead_time_days", "moq", "return_window_days", "credit_pct"],
        "aliases": {
            "manufacturer": ["manufacturer", "supplier", "vendor", "mfg_company", "supplier_name"],
            "sku": ["sku", "item_code", "product_code"],
            "unit_cost": ["unit_cost", "cost_price", "purchase_price", "rate_per_unit", "cost"],
            "lead_time_days": ["lead_time_days", "lead_time", "lead_days", "transit_days"],
            "moq": ["moq", "minimum_order_qty", "min_order_qty", "min_pack"],
            "return_window_days": ["return_window_days", "return_window", "rma_window", "debit_note_window_days"],
            "credit_pct": ["credit_pct", "credit_percentage", "return_credit_rate", "refund_pct"],
        }
    },
    "temp_logs": {
        "required": ["warehouse", "cold_room", "ts", "temp_c"],
        "optional": [],
        "aliases": {
            "warehouse": ["warehouse", "facility", "hub", "wh"],
            "cold_room": ["cold_room", "zone", "chamber", "sensor_zone", "sensor_id", "room"],
            "ts": ["ts", "timestamp", "time", "recorded_at", "reading_time", "date_time"],
            "temp_c": ["temp_c", "temperature", "temp", "celsius", "reading", "temperature_c"],
        }
    }
}

# ---------------------------------------------------------------------------
# Multi-Format File Parser (CSV + XLSX)
# ---------------------------------------------------------------------------

def parse_uploaded_file(file_bytes: bytes, filename: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Parses CSV or XLSX bytes into column names and list of row dicts.
    Preserves exact string content without loss.
    """
    if not file_bytes or len(file_bytes.strip()) == 0:
        raise ValueError("File is empty or contains no data.")

    clean_filename = filename.lower()
    allowed_exts = (".csv", ".tsv", ".txt", ".xlsx", ".xls")
    if not any(clean_filename.endswith(ext) for ext in allowed_exts):
        raise ValueError(f"Unsupported file format for '{filename}'. Supported: .csv, .tsv, .xlsx, .xls")

    if clean_filename.endswith(".xlsx") or clean_filename.endswith(".xls"):
        try:
            import openpyxl
        except ImportError:
            raise RuntimeError("openpyxl is required to parse Excel files.")

        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        sheet = wb.active
        rows_iter = sheet.iter_rows(values_only=True)
        
        try:
            headers = next(rows_iter)
        except StopIteration:
            raise ValueError("Excel file is empty.")

        if not headers or all(h is None for h in headers):
            raise ValueError("Excel sheet contains no header row.")

        # Clean string headers
        cleaned_headers = []
        for i, h in enumerate(headers):
            if h is not None and str(h).strip():
                cleaned_headers.append(str(h).strip())
            else:
                cleaned_headers.append(f"Column_{i+1}")

        rows = []
        for row in rows_iter:
            if not row or all(v is None for v in row):
                continue
            row_dict = {}
            for col_name, val in zip(cleaned_headers, row):
                if val is not None:
                    if isinstance(val, (datetime, date)):
                        row_dict[col_name] = val.isoformat()
                    else:
                        row_dict[col_name] = str(val).strip()
                else:
                    row_dict[col_name] = None
            rows.append(row_dict)

        return cleaned_headers, rows

    else:
        # CSV parsing with encoding fallback
        text = None
        for enc in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
            try:
                text = file_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue

        if text is None:
            raise ValueError("Unable to decode CSV text. File must be UTF-8 or Latin-1 encoded.")

        # Strip whitespace and BOM
        lines = [line for line in text.splitlines() if line.strip()]
        if not lines:
            raise ValueError("CSV file is empty.")

        # Sniff delimiter
        sample = "\n".join(lines[:10])
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
            delimiter = dialect.delimiter
        except Exception:
            delimiter = ","

        reader = csv.DictReader(lines, delimiter=delimiter)
        if not reader.fieldnames:
            raise ValueError("CSV contains no valid headers.")

        headers = [h.strip() for h in reader.fieldnames if h]
        rows = []
        for r in reader:
            cleaned_r = {k.strip(): (v.strip() if v is not None else None) for k, v in r.items() if k}
            # Only add non-completely empty rows
            if any(v is not None and v != "" for v in cleaned_r.values()):
                rows.append(cleaned_r)

        return headers, rows

# ---------------------------------------------------------------------------
# Fuzzy Synonym Matcher
# ---------------------------------------------------------------------------

def _normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())

def match_columns_to_canonical(source_columns: List[str], target_table: str) -> Dict[str, Any]:
    """
    Maps source headers to TraceRx canonical schema fields.
    Computes confidence score and flags ambiguous columns.
    Ensures 1-to-1 exact matching has priority and prevents column duplication.
    """
    schema = CANONICAL_SCHEMAS.get(target_table)
    if not schema:
        raise ValueError(f"Unknown target table: '{target_table}'")

    aliases = schema["aliases"]
    final_mapping: Dict[str, str] = {}
    mapping_details: List[Dict[str, Any]] = []
    used_sources = set()

    # Pass 1: Exact matches
    for canon_field, alias_list in aliases.items():
        for src_col in source_columns:
            if src_col in used_sources:
                continue
            norm_src = _normalize_name(src_col)
            for alias in alias_list:
                if norm_src == _normalize_name(alias):
                    final_mapping[canon_field] = src_col
                    used_sources.add(src_col)
                    mapping_details.append({
                        "canonical_field": canon_field,
                        "mapped_source_column": src_col,
                        "confidence": 1.0,
                        "is_ambiguous": False,
                        "is_required": canon_field in schema["required"],
                        "competing_candidates": [],
                    })
                    break
            if canon_field in final_mapping:
                break

    # Pass 2: Fuzzy / substring matches for remaining unmapped fields
    for canon_field, alias_list in aliases.items():
        if canon_field in final_mapping:
            continue
        candidates = []
        for src_col in source_columns:
            if src_col in used_sources:
                continue
            norm_src = _normalize_name(src_col)
            for alias in alias_list:
                norm_alias = _normalize_name(alias)
                if norm_alias in norm_src or (len(norm_src) >= 4 and norm_src in norm_alias):
                    candidates.append((src_col, 0.80))
                    break

        if candidates:
            candidates.sort(key=lambda x: -x[1])
            best_col, confidence = candidates[0]
            is_ambiguous = len(candidates) > 1 and candidates[0][1] == candidates[1][1]
            if is_ambiguous:
                confidence = 0.50
            final_mapping[canon_field] = best_col
            used_sources.add(best_col)
            mapping_details.append({
                "canonical_field": canon_field,
                "mapped_source_column": best_col,
                "confidence": confidence,
                "is_ambiguous": is_ambiguous,
                "is_required": canon_field in schema["required"],
                "competing_candidates": [c[0] for c in candidates[1:]],
            })

    unmapped = [col for col in source_columns if col not in used_sources]
    missing_required = [f for f in schema["required"] if f not in final_mapping]

    return {
        "target_table": target_table,
        "mapping": final_mapping,
        "details": mapping_details,
        "unmapped_source_columns": unmapped,
        "missing_required_fields": missing_required,
        "requires_confirmation": any(d["is_ambiguous"] for d in mapping_details) or len(missing_required) > 0,
    }

# ---------------------------------------------------------------------------
# Robust Value Parsers & Type Inferrer
# ---------------------------------------------------------------------------

def parse_flexible_date(val: Any) -> Optional[date]:
    """
    Parses ISO (YYYY-MM-DD), DD-MM-YYYY, DD/MM/YYYY, MM/DD/YYYY, or datetime.
    """
    if val is None:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()

    val_str = str(val).strip()
    if not val_str:
        return None

    # Strip time if ISO timestamp
    if "T" in val_str:
        val_str = val_str.split("T")[0]
    elif " " in val_str:
        val_str = val_str.split(" ")[0]

    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
    ]
    for fmt in formats:
        try:
            parsed = datetime.strptime(val_str, fmt).date()
            if 1990 <= parsed.year <= 2050:
                return parsed
        except ValueError:
            continue

    return None

def parse_flexible_int(val: Any) -> Optional[int]:
    if val is None:
        return None
    if isinstance(val, int):
        return val
    val_str = str(val).replace(",", "").strip()
    try:
        f_val = float(val_str)
        if f_val.is_integer():
            return int(f_val)
        return int(round(f_val))
    except (ValueError, TypeError):
        return None

def parse_flexible_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    val_str = str(val).replace(",", "").replace("₹", "").replace("$", "").strip()
    try:
        return float(val_str)
    except (ValueError, TypeError):
        return None

# ---------------------------------------------------------------------------
# Dataset Profiler
# ---------------------------------------------------------------------------

def profile_dataset(file_bytes: bytes, filename: str, target_table: str) -> Dict[str, Any]:
    """
    Profiles an uploaded file, detecting data types, null rates, duplicates,
    suggested canonical mappings, and suspicious quantity ranges.
    """
    headers, rows = parse_uploaded_file(file_bytes, filename)
    total_rows = len(rows)

    # SHA-256 for idempotency
    file_sha256 = hashlib.sha256(file_bytes).hexdigest()

    # Column-level stats
    col_stats = {}
    for h in headers:
        values = [r.get(h) for r in rows if r.get(h) is not None and r.get(h) != ""]
        null_count = total_rows - len(values)
        unique_count = len(set(str(v) for v in values))
        
        # Sample values
        sample_values = list(dict.fromkeys(str(v) for v in values[:5]))

        # Type detection
        int_matches = sum(1 for v in values if parse_flexible_int(v) is not None)
        date_matches = sum(1 for v in values if parse_flexible_date(v) is not None)
        
        inferred_type = "string"
        if len(values) > 0:
            if date_matches / len(values) > 0.8:
                inferred_type = "date"
            elif int_matches / len(values) > 0.8:
                inferred_type = "integer"

        col_stats[h] = {
            "null_count": null_count,
            "null_rate": round(null_count / max(1, total_rows), 2),
            "unique_count": unique_count,
            "inferred_type": inferred_type,
            "sample_values": sample_values,
        }

    # Duplicate check
    seen = set()
    dup_count = 0
    for r in rows:
        row_tuple = tuple(sorted((k, str(v)) for k, v in r.items() if v is not None))
        if row_tuple in seen:
            dup_count += 1
        else:
            seen.add(row_tuple)

    # Mapping suggestions
    mapping_res = match_columns_to_canonical(headers, target_table)
    file_type = "xlsx" if filename.lower().endswith((".xlsx", ".xls")) else "csv"
    capabilities = _evaluate_analytics_capabilities(target_table, mapping_res["mapping"], total_rows)
    suggested_mappings = [
        {
            "source_column": d["mapped_source_column"],
            "target_field": d["canonical_field"],
            "confidence": d["confidence"],
            "is_ambiguous": d["is_ambiguous"],
            "is_required": d["is_required"],
        }
        for d in mapping_res["details"]
    ]

    return {
        "filename": filename,
        "file_type": file_type,
        "file_sha256": file_sha256,
        "total_rows": total_rows,
        "row_count": total_rows,
        "duplicate_rows": dup_count,
        "columns": headers,
        "column_stats": col_stats,
        "mapping_analysis": mapping_res,
        "suggested_mappings": suggested_mappings,
        "capabilities": capabilities,
    }

# ---------------------------------------------------------------------------
# Strict Row-Level Validator & Capability Evaluator
# ---------------------------------------------------------------------------

def validate_dataset(
    rows: List[Dict[str, Any]],
    mapping: Dict[str, str],
    target_table: str,
    db: Session,
    reference_today: date = date(2026, 10, 9)
) -> Dict[str, Any]:
    """
    Validates rows against canonical schema and database foreign keys.
    Never fabricates missing values or silently discards rows.
    Generates preview, row-level errors, warnings, and capability report.
    """
    schema = CANONICAL_SCHEMAS.get(target_table)
    if not schema:
        raise ValueError(f"Unsupported table '{target_table}'")

    required_fields = schema["required"]
    errors = []
    warnings = []
    sanitized_rows = []

    # Cache existing SKUs to validate FK relations without N queries
    existing_skus = {p.sku for p in db.query(Product.sku).all()}
    existing_customers = {c.customer_id for c in db.query(Customer.customer_id).all()} if target_table == "dispatches" else set()

    for idx, raw_row in enumerate(rows, start=1):
        row_errors = []
        row_warnings = []
        clean_row = {}

        # 1. Map fields
        for canon_field, src_col in mapping.items():
            if not src_col or src_col not in raw_row:
                clean_row[canon_field] = None
            else:
                clean_row[canon_field] = raw_row[src_col]

        # 2. Required field presence check (Never fabricate!)
        for req in required_fields:
            val = clean_row.get(req)
            if val is None or str(val).strip() == "":
                row_errors.append(f"Missing mandatory field '{req}' (mapped from '{mapping.get(req)}')")

        # 3. Entity-specific typed validations
        if target_table == "batch_inventory":
            # Batch identifier check
            batch_val = clean_row.get("batch")
            if batch_val:
                batch_str = str(batch_val).strip()
                if len(batch_str) < 2 or len(batch_str) > 32:
                    row_errors.append(f"Invalid batch identifier length '{batch_str}' (must be 2-32 chars)")
                clean_row["batch"] = batch_str

            # SKU check
            sku_val = clean_row.get("sku")
            if sku_val:
                sku_str = str(sku_val).strip().upper()
                clean_row["sku"] = sku_str
                if sku_str not in existing_skus:
                    row_warnings.append(f"SKU '{sku_str}' not found in Product catalog; record will require catalog sync")

            # Qty check
            qty_val = clean_row.get("qty")
            if qty_val is not None and str(qty_val).strip() != "":
                parsed_qty = parse_flexible_int(qty_val)
                if parsed_qty is None:
                    row_errors.append(f"Quantity '{qty_val}' is not a valid integer")
                elif parsed_qty < 0:
                    row_errors.append(f"Negative inventory quantity '{parsed_qty}' cannot be negative")
                elif parsed_qty > 500000:
                    row_warnings.append(f"Suspiciously large quantity '{parsed_qty}' (outlier check)")
                clean_row["qty"] = parsed_qty

            # Date checks
            exp_val = clean_row.get("expiry_date")
            parsed_exp = parse_flexible_date(exp_val)
            if exp_val and not parsed_exp:
                row_errors.append(f"Invalid expiry date format: '{exp_val}'")
            clean_row["expiry_date"] = parsed_exp

            mfg_val = clean_row.get("mfg_date")
            parsed_mfg = parse_flexible_date(mfg_val) if mfg_val else None
            clean_row["mfg_date"] = parsed_mfg

            if parsed_exp and parsed_mfg:
                if parsed_exp <= parsed_mfg:
                    row_errors.append(f"Expiry date ({parsed_exp}) must be after manufacturing date ({parsed_mfg})")

            # Warehouse unmapped handling: never assign arbitrary location
            wh_val = clean_row.get("warehouse")
            if not wh_val or str(wh_val).strip() == "":
                clean_row["warehouse"] = "UNASSIGNED"
                row_warnings.append("No warehouse location specified; marked as 'UNASSIGNED'")
            else:
                clean_row["warehouse"] = str(wh_val).strip()

        elif target_table == "dispatches":
            # Date check
            d_val = clean_row.get("date")
            parsed_d = parse_flexible_date(d_val)
            if d_val and not parsed_d:
                row_errors.append(f"Invalid dispatch date format: '{d_val}'")
            clean_row["date"] = parsed_d

            # Customer check
            cust_val = clean_row.get("customer_id")
            if cust_val:
                cust_str = str(cust_val).strip()
                clean_row["customer_id"] = cust_str
                if existing_customers and cust_str not in existing_customers:
                    row_warnings.append(f"Customer '{cust_str}' not found in registered accounts")

            # Qty check
            qty_val = clean_row.get("qty")
            parsed_qty = parse_flexible_int(qty_val)
            if parsed_qty is None or parsed_qty <= 0:
                row_errors.append(f"Dispatch quantity must be a strictly positive integer, got '{qty_val}'")
            clean_row["qty"] = parsed_qty

        # Aggregate row feedback
        if row_errors:
            for emsg in row_errors:
                fname = "general"
                if "mandatory field '" in emsg:
                    m = re.search(r"mandatory field '([^']+)'", emsg)
                    if m:
                        fname = m.group(1)
                elif "expiry date" in emsg.lower():
                    fname = "expiry_date"
                elif "quantity" in emsg.lower():
                    fname = "qty"
                elif "batch" in emsg.lower():
                    fname = "batch"
                elif "sku" in emsg.lower():
                    fname = "sku"
                elif "dispatch date" in emsg.lower():
                    fname = "date"
                errors.append({"row_number": idx, "field": fname, "error": emsg, "raw_data": raw_row})
        else:
            if row_warnings:
                warnings.append({"row_number": idx, "warnings": row_warnings})
            sanitized_rows.append(clean_row)

    # 4. Generate Analysis Capability Report
    capability_report = _evaluate_analytics_capabilities(target_table, mapping, len(sanitized_rows))
    invalid_rows_count = len({e["row_number"] for e in errors})

    return {
        "total_rows": len(rows),
        "valid_rows_count": len(sanitized_rows),
        "valid_rows": len(sanitized_rows),
        "invalid_rows_count": invalid_rows_count,
        "invalid_rows": invalid_rows_count,
        "warning_count": len(warnings),
        "errors": errors[:50],  # Return first 50 errors for inspection
        "warnings": warnings[:50],
        "preview_rows": sanitized_rows[:5],
        "preview": sanitized_rows[:5],
        "capability_report": capability_report,
        "capabilities": capability_report,
        "is_valid_for_commit": len(errors) == 0 and len(sanitized_rows) > 0,
    }

def _evaluate_analytics_capabilities(target_table: str, mapping: Dict[str, str], valid_rows: int) -> Dict[str, Any]:
    """
    Explicitly reports which regulatory analyses the dataset supports vs cannot support.
    """
    has_batch = "batch" in mapping
    has_sku = "sku" in mapping
    has_exp = "expiry_date" in mapping
    has_mfg = "mfg_date" in mapping
    has_temp = "temp_c" in mapping and "ts" in mapping
    has_dispatch = target_table == "dispatches" or ("date" in mapping and "customer_id" in mapping)

    near_exp_supported = has_exp and has_sku and valid_rows > 0
    near_exp_reason = "Ready for shelf-life & near-expiry calculation" if near_exp_supported else "Requires mfg_date, expiry_date and sku columns"

    fefo_supported = (has_dispatch and valid_rows > 0) or (has_exp and has_mfg and valid_rows > 0)
    fefo_reason = "Dispatch timeline or expiry sequence available to detect inversions" if fefo_supported else "Requires mfg_date, expiry_date, or dispatch history"

    caps = {
        "recall_matching": {
            "supported": has_batch and has_sku and valid_rows > 0,
            "reason": "Ready for CDSCO recall cross-referencing" if (has_batch and has_sku) else "Requires mapped 'batch' and 'sku' columns"
        },
        "cold_chain_excursion_detection": {
            "supported": (target_table == "temp_logs" and has_temp) or ("cold_room" in mapping),
            "reason": "Cold chain IoT telemetry available" if has_temp else "Unsupported: Lacks temperature log stream or cold room assignment"
        },
        "near_expiry_risk_analysis": {
            "supported": near_exp_supported,
            "reason": near_exp_reason
        },
        "fefo_violation_detection": {
            "supported": fefo_supported,
            "reason": fefo_reason
        },
        "seasonal_demand_forecasting": {
            "supported": target_table == "dispatches" and valid_rows >= 10,
            "reason": "Sufficient historical dispatches to compute 60-day velocity" if (target_table == "dispatches" and valid_rows >= 10) else "Unsupported: Requires >= 10 historical dispatch records"
        }
    }
    caps["near_expiry_analysis"] = caps["near_expiry_risk_analysis"]
    caps["cold_chain_breach_detection"] = caps["cold_chain_excursion_detection"]
    return caps
