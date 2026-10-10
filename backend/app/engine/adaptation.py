import csv
import io
import re
import hashlib
from datetime import date, datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple, Set
from sqlalchemy.orm import Session
from app.models import Product, Supplier, Customer, BatchInventory, Dispatch, TempLog, PurchaseOrder, Recall
from app.engine.canonical_schemas import (
    MANDATORY_SCHEMAS,
    OPTIONAL_SCHEMAS,
    CANONICAL_ALIASES,
    ENTITY_TITLES,
    ALLOWED_STORAGE_VALUES,
    ALLOWED_CUSTOMER_TYPES,
    normalize_header,
    canonicalize_table_name,
    validate_headers_strictly,
    generate_csv_template,
)

# ---------------------------------------------------------------------------
# Canonical Schemas & Aliases (Exported for Backward Compatibility)
# ---------------------------------------------------------------------------

CANONICAL_SCHEMAS: Dict[str, Dict[str, Any]] = {
    tbl: {
        "required": MANDATORY_SCHEMAS[tbl],
        "optional": OPTIONAL_SCHEMAS.get(tbl, []),
        "aliases": CANONICAL_ALIASES.get(tbl, {}),
    }
    for tbl in MANDATORY_SCHEMAS
}

# ---------------------------------------------------------------------------
# Multi-Format File Parser (CSV + XLSX) with Header Validation
# ---------------------------------------------------------------------------

def parse_uploaded_file(file_bytes: bytes, filename: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Parses CSV or XLSX bytes into column names and list of row dicts.
    Detects and rejects duplicate headers or unparseable formats.
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
            raw_headers = next(rows_iter)
        except StopIteration:
            raise ValueError("Excel file is empty.")

        if not raw_headers or all(h is None for h in raw_headers):
            raise ValueError("Excel sheet contains no header row.")

        cleaned_headers = []
        seen_norm_headers = set()
        for i, h in enumerate(raw_headers):
            if h is not None and str(h).strip():
                h_str = str(h).strip()
            else:
                h_str = f"Column_{i+1}"
            norm_h = normalize_header(h_str)
            if norm_h and norm_h in seen_norm_headers:
                raise ValueError(f"Duplicate header detected in file: '{h_str}'")
            seen_norm_headers.add(norm_h)
            cleaned_headers.append(h_str)

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

        # Strip empty lines while preserving structure
        lines = [line for line in text.splitlines() if line.strip()]
        if not lines:
            raise ValueError("CSV file is empty.")

        sample = "\n".join(lines[:10])
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
            delimiter = dialect.delimiter
        except Exception:
            delimiter = ","

        reader = csv.reader(lines, delimiter=delimiter)
        try:
            raw_fieldnames = next(reader)
        except StopIteration:
            raise ValueError("CSV contains no valid headers.")

        headers = [h.strip().strip('"').strip("'").strip("\ufeff") for h in raw_fieldnames if h.strip()]
        if not headers:
            raise ValueError("CSV contains no valid headers.")

        # Check for duplicate headers
        seen_headers = set()
        for h in headers:
            norm_h = normalize_header(h)
            if norm_h in seen_headers:
                raise ValueError(f"Duplicate header detected in file: '{h}'")
            seen_headers.add(norm_h)

        # Parse rows
        dict_reader = csv.DictReader(lines, delimiter=delimiter)
        rows = []
        for r in dict_reader:
            cleaned_r = {k.strip().strip('"').strip("'").strip("\ufeff"): (v.strip() if v is not None else None) for k, v in r.items() if k}
            if any(v is not None and v != "" for v in cleaned_r.values()):
                rows.append(cleaned_r)

        return headers, rows

# ---------------------------------------------------------------------------
# Strict Canonical Column Matcher
# ---------------------------------------------------------------------------

def _normalize_name(name: str) -> str:
    return normalize_header(name)

def match_columns_to_canonical(source_columns: List[str], target_table: str) -> Dict[str, Any]:
    """
    Maps source headers to TraceRx canonical schema fields.
    Computes confidence score, flags missing mandatory fields and ambiguous columns.
    """
    tbl = canonicalize_table_name(target_table)
    schema = CANONICAL_SCHEMAS.get(tbl)
    if not schema:
        raise ValueError(f"Unknown target table: '{target_table}'")

    aliases = schema["aliases"]
    final_mapping: Dict[str, str] = {}
    mapping_details: List[Dict[str, Any]] = []
    used_sources: Set[str] = set()

    # Pass 1: Exact matches against aliases
    all_canon_fields = list(schema["required"]) + [f for f in schema.get("optional", []) if f not in schema["required"]]
    for canon_field in all_canon_fields:
        alias_list = aliases.get(canon_field, [canon_field])
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
    for canon_field in all_canon_fields:
        if canon_field in final_mapping:
            continue
        alias_list = aliases.get(canon_field, [canon_field])
        candidates = []
        for src_col in source_columns:
            if src_col in used_sources:
                continue
            norm_src = _normalize_name(src_col)
            for alias in alias_list:
                norm_alias = _normalize_name(alias)
                if len(norm_src) >= 3 and (norm_alias in norm_src or norm_src in norm_alias):
                    candidates.append((src_col, 0.85))
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

    # Pass 3: Ensure all canonical fields (required + optional) appear in mapping_details
    for canon_field in all_canon_fields:
        if not any(d["canonical_field"] == canon_field for d in mapping_details):
            mapping_details.append({
                "canonical_field": canon_field,
                "mapped_source_column": None,
                "confidence": 0.0,
                "is_ambiguous": False,
                "is_required": canon_field in schema["required"],
                "competing_candidates": [],
            })

    unmapped = [col for col in source_columns if col not in used_sources]
    missing_required = [f for f in schema["required"] if f not in final_mapping]

    return {
        "target_table": tbl,
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
    if isinstance(val, int) and not isinstance(val, bool):
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
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return float(val)
    val_str = str(val).replace(",", "").replace("₹", "").replace("$", "").replace("°C", "").replace("C", "").strip()
    try:
        return float(val_str)
    except (ValueError, TypeError):
        return None

def parse_flexible_bool(val: Any) -> Optional[bool]:
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    val_str = str(val).strip().lower()
    if val_str in ("true", "1", "yes", "t", "y"):
        return True
    if val_str in ("false", "0", "no", "f", "n"):
        return False
    return None

# ---------------------------------------------------------------------------
# Dataset Profiler with Authoritative Schema Check
# ---------------------------------------------------------------------------

def profile_dataset(file_bytes: bytes, filename: str, target_table: str) -> Dict[str, Any]:
    """
    Profiles an uploaded file, detecting column mappings and verifying
    all mandatory fields for the entity exist. Rejects file immediately if mandatory
    headers are missing or duplicate headers are detected.
    """
    headers, rows = parse_uploaded_file(file_bytes, filename)
    total_rows = len(rows)
    file_sha256 = hashlib.sha256(file_bytes).hexdigest()

    fname_lower = filename.lower()
    filename_hint = None
    if any(k in fname_lower for k in ["dispatch", "shipment"]):
        filename_hint = "dispatches"
    elif any(k in fname_lower for k in ["product", "catalog"]):
        filename_hint = "products"
    elif any(k in fname_lower for k in ["customer", "client", "chemist"]):
        filename_hint = "customers"
    elif any(k in fname_lower for k in ["supplier", "vendor", "manufacturer"]):
        filename_hint = "suppliers"
    elif any(k in fname_lower for k in ["temp", "sensor"]):
        filename_hint = "temp_logs"
    elif any(k in fname_lower for k in ["purchase_order", "po"]):
        filename_hint = "purchase_orders"
    elif any(k in fname_lower for k in ["recall"]):
        filename_hint = "recalls"
    elif any(k in fname_lower for k in ["batch", "inventory"]):
        filename_hint = "batch_inventory"

    effective_table = canonicalize_table_name(filename_hint or target_table)

    # Perform strict header validation
    is_valid_headers, missing_mandatory, final_mapping, rejection_msg = validate_headers_strictly(headers, effective_table)

    # Compute column-level statistics
    col_stats = {}
    for h in headers:
        values = [r.get(h) for r in rows if r.get(h) is not None and r.get(h) != ""]
        null_count = total_rows - len(values)
        unique_count = len(set(str(v) for v in values))
        sample_values = list(dict.fromkeys(str(v) for v in values[:5]))

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

    # Duplicate rows check
    seen = set()
    dup_count = 0
    for r in rows:
        row_tuple = tuple(sorted((k, str(v)) for k, v in r.items() if v is not None))
        if row_tuple in seen:
            dup_count += 1
        else:
            seen.add(row_tuple)

    mapping_res = match_columns_to_canonical(headers, effective_table)
    file_type = "xlsx" if filename.lower().endswith((".xlsx", ".xls")) else "csv"
    capabilities = _evaluate_analytics_capabilities(effective_table, mapping_res["mapping"], total_rows)

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
        "target_table": effective_table,
        "detected_table": effective_table,
        "total_rows": total_rows,
        "row_count": total_rows,
        "duplicate_rows": dup_count,
        "columns": headers,
        "column_stats": col_stats,
        "mapping_analysis": mapping_res,
        "suggested_mappings": suggested_mappings,
        "capabilities": capabilities,
        "status": "ready" if is_valid_headers else "rejected",
        "is_rejected": not is_valid_headers,
        "missing_mandatory_fields": missing_mandatory,
        "rejection_message": rejection_msg,
        "is_valid_for_commit": is_valid_headers and total_rows > 0,
    }

# ---------------------------------------------------------------------------
# Authoritative Row-Level Validator & Import Gate
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
    Enforces that all mandatory fields are present in the mapping/file.
    Validates row-level data types, ranges, allowed enumerations, and consistency.
    """
    tbl = canonicalize_table_name(target_table)
    schema = CANONICAL_SCHEMAS.get(tbl)
    if not schema:
        raise ValueError(f"Unsupported table '{target_table}'")

    mandatory_fields = schema["required"]

    # 1. Authoritative check: Are all mandatory fields present in the mapping?
    missing_from_mapping = [f for f in mandatory_fields if not mapping.get(f)]
    if missing_from_mapping:
        entity_name = ENTITY_TITLES.get(tbl, tbl.title())
        bullets = "\n".join(f"- {f}" for f in missing_from_mapping)
        rejection_msg = (
            f"Upload rejected: {entity_name}\n\n"
            f"Missing mandatory fields:\n{bullets}\n\n"
            f"Please correct the file and upload it again.\n"
            f"No records were imported."
        )
        return {
            "target_table": tbl,
            "status": "rejected",
            "is_rejected": True,
            "import_status": "Blocked",
            "block_reason": f"Missing mandatory fields: {', '.join(missing_from_mapping)}",
            "rejection_message": rejection_msg,
            "missing_mandatory_fields": missing_from_mapping,
            "total_rows": len(rows),
            "valid_rows_count": 0,
            "valid_rows": 0,
            "invalid_rows_count": len(rows),
            "invalid_rows": len(rows),
            "warning_count": 0,
            "errors": [{"row_number": 0, "field": f, "error": f"Missing mandatory column '{f}'", "raw_data": {}} for f in missing_from_mapping],
            "warnings": [],
            "preview_rows": [],
            "preview": [],
            "capability_report": {},
            "capabilities": {},
            "is_valid_for_commit": False,
        }

    errors = []
    warnings = []
    sanitized_rows = []

    existing_skus = {p.sku for p in db.query(Product.sku).all()}
    existing_customers = {c.customer_id for c in db.query(Customer.customer_id).all()} if tbl == "dispatches" else set()

    for idx, raw_row in enumerate(rows, start=1):
        row_errors = []
        row_warnings = []
        clean_row = {}

        # 1. Map fields from raw row
        for canon_field, src_col in mapping.items():
            if not src_col or src_col not in raw_row:
                clean_row[canon_field] = None
            else:
                val = raw_row[src_col]
                clean_row[canon_field] = str(val).strip() if (val is not None and not isinstance(val, (int, float, bool))) else val

        # 2. Cell-level presence check for mandatory fields
        for req in mandatory_fields:
            val = clean_row.get(req)
            if val is None or str(val).strip() == "":
                row_errors.append(f"Missing mandatory value for '{req}'")

        # 3. Entity-specific typed validations
        if tbl == "products":
            sku_val = clean_row.get("sku")
            if sku_val:
                clean_row["sku"] = str(sku_val).strip().upper()

            mol_val = clean_row.get("molecule")
            if mol_val:
                clean_row["molecule"] = str(mol_val).strip()

            brand_val = clean_row.get("brand")
            if brand_val:
                clean_row["brand"] = str(brand_val).strip()

            cat_val = clean_row.get("category")
            if cat_val:
                clean_row["category"] = str(cat_val).strip()

            st_val = clean_row.get("storage")
            if st_val is not None and str(st_val).strip() != "":
                st_str = str(st_val).strip()
                st_lower = st_str.lower()
                if st_lower in ("ambient", "room temp", "room_temp", "rt"):
                    clean_row["storage"] = "ambient"
                elif st_lower in ("2-8c", "2-8°c", "2-8 c", "2 to 8c", "cold", "2-8"):
                    clean_row["storage"] = "2-8C"
                else:
                    row_errors.append(f"Invalid storage condition '{st_str}'. Allowed values: 'ambient', '2-8C'")
            
            crit_val = clean_row.get("critical_drug")
            if crit_val is not None and str(crit_val).strip() != "":
                p_crit = parse_flexible_bool(crit_val)
                if p_crit is None:
                    row_errors.append(f"Invalid boolean value for 'critical_drug': '{crit_val}'. Expected true/false")
                else:
                    clean_row["critical_drug"] = p_crit

        elif tbl == "batch_inventory":
            batch_val = clean_row.get("batch")
            if batch_val:
                batch_str = str(batch_val).strip()
                if len(batch_str) < 2 or len(batch_str) > 50:
                    row_errors.append(f"Invalid batch identifier length '{batch_str}' (must be 2-50 chars)")
                clean_row["batch"] = batch_str

            sku_val = clean_row.get("sku")
            if sku_val:
                sku_str = str(sku_val).strip().upper()
                clean_row["sku"] = sku_str
                if sku_str not in existing_skus:
                    row_warnings.append(f"SKU '{sku_str}' not found in Product catalog; record will require catalog sync")

            qty_val = clean_row.get("qty")
            if qty_val is not None and str(qty_val).strip() != "":
                parsed_qty = parse_flexible_int(qty_val)
                if parsed_qty is None:
                    row_errors.append(f"Quantity '{qty_val}' is not a valid integer")
                elif parsed_qty < 0:
                    row_errors.append(f"Quantity cannot be negative: '{parsed_qty}'")
                else:
                    clean_row["qty"] = parsed_qty

            exp_val = clean_row.get("expiry_date")
            parsed_exp = parse_flexible_date(exp_val)
            if exp_val and not parsed_exp:
                row_errors.append(f"Invalid expiry_date format: '{exp_val}'")
            clean_row["expiry_date"] = parsed_exp

            mfg_val = clean_row.get("mfg_date")
            parsed_mfg = parse_flexible_date(mfg_val)
            if mfg_val and not parsed_mfg:
                row_errors.append(f"Invalid mfg_date format: '{mfg_val}'")
            clean_row["mfg_date"] = parsed_mfg

            if parsed_exp and parsed_mfg:
                if parsed_mfg > parsed_exp:
                    row_errors.append(f"Manufacturing date ({parsed_mfg}) cannot be later than expiry date ({parsed_exp}). Expiry date must be after manufacturing date.")

            wh_val = clean_row.get("warehouse")
            if wh_val:
                clean_row["warehouse"] = str(wh_val).strip()

            valid_statuses = {"active", "blocked", "quarantine", "returned"}
            stat_val = clean_row.get("status")
            if stat_val:
                s_str = str(stat_val).strip().lower()
                clean_row["status"] = s_str if s_str in valid_statuses else "active"
            else:
                clean_row["status"] = "active"

        elif tbl == "dispatches":
            d_val = clean_row.get("date")
            parsed_d = parse_flexible_date(d_val)
            if d_val and not parsed_d:
                row_errors.append(f"Invalid dispatch date format: '{d_val}'")
            clean_row["date"] = parsed_d

            cust_val = clean_row.get("customer") or clean_row.get("customer_id")
            if cust_val:
                cust_str = str(cust_val).strip()
                clean_row["customer"] = cust_str
                clean_row["customer_id"] = cust_str
                if existing_customers and cust_str not in existing_customers:
                    row_warnings.append(f"Customer '{cust_str}' not found in registered accounts")

            sku_val = clean_row.get("sku")
            if sku_val:
                clean_row["sku"] = str(sku_val).strip().upper()

            batch_val = clean_row.get("batch")
            if batch_val:
                clean_row["batch"] = str(batch_val).strip()

            qty_val = clean_row.get("qty")
            parsed_qty = parse_flexible_int(qty_val)
            if parsed_qty is None or parsed_qty <= 0:
                row_errors.append(f"Dispatch quantity must be a strictly positive integer, got '{qty_val}'")
            else:
                clean_row["qty"] = parsed_qty

            wh_val = clean_row.get("from_warehouse")
            clean_row["from_warehouse"] = str(wh_val).strip() if (wh_val and str(wh_val).strip() not in ("None", "")) else "WH-1"

        elif tbl == "customers":
            cust_val = clean_row.get("customer") or clean_row.get("customer_id")
            if cust_val:
                cust_str = str(cust_val).strip()
                clean_row["customer"] = cust_str
                clean_row["customer_id"] = cust_str

            type_val = clean_row.get("type")
            if type_val is not None and str(type_val).strip() != "":
                t_str = str(type_val).strip().lower()
                if t_str not in ALLOWED_CUSTOMER_TYPES:
                    row_errors.append(f"Invalid customer type '{type_val}'. Allowed values: 'chemist', 'hospital'")
                else:
                    clean_row["type"] = t_str

            loc_val = clean_row.get("location")
            if loc_val:
                clean_row["location"] = str(loc_val).strip()

            terms_val = clean_row.get("credit_terms")
            if terms_val:
                clean_row["credit_terms"] = str(terms_val).strip()

            name_val = clean_row.get("name")
            clean_row["name"] = str(name_val).strip() if name_val else f"Customer {clean_row.get('customer', '')}"

        elif tbl in ("temperature_logs", "temp_logs"):
            wh_val = clean_row.get("warehouse")
            if wh_val:
                clean_row["warehouse"] = str(wh_val).strip()

            cr_val = clean_row.get("cold_room")
            if cr_val:
                clean_row["cold_room"] = str(cr_val).strip()

            ts_val = clean_row.get("timestamp") or clean_row.get("ts")
            if ts_val:
                try:
                    ts_str = str(ts_val).replace("Z", "+00:00").strip()
                    parsed_ts = datetime.fromisoformat(ts_str)
                    clean_row["timestamp"] = parsed_ts.isoformat()
                    clean_row["ts"] = parsed_ts
                except Exception:
                    p_date = parse_flexible_date(ts_val)
                    if p_date:
                        clean_row["timestamp"] = datetime.combine(p_date, datetime.min.time()).isoformat()
                        clean_row["ts"] = datetime.combine(p_date, datetime.min.time())
                    else:
                        row_errors.append(f"Invalid timestamp format: '{ts_val}'")

            temp_val = clean_row.get("temp_c")
            if temp_val is not None and str(temp_val).strip() != "":
                p_temp = parse_flexible_float(temp_val)
                if p_temp is None:
                    row_errors.append(f"Invalid temperature reading '{temp_val}'. Must be a valid float")
                elif p_temp < -50.0 or p_temp > 80.0:
                    row_errors.append(f"Temperature reading '{p_temp}' is out of physical sensor bounds (-50°C to 80°C)")
                else:
                    clean_row["temp_c"] = p_temp

        elif tbl == "suppliers":
            mfg_val = clean_row.get("manufacturer")
            if mfg_val:
                clean_row["manufacturer"] = str(mfg_val).strip()

            sku_val = clean_row.get("sku")
            if sku_val:
                clean_row["sku"] = str(sku_val).strip().upper()

            lead_val = clean_row.get("lead_time_days")
            if lead_val is not None and str(lead_val).strip() != "":
                p_lead = parse_flexible_int(lead_val)
                if p_lead is None or p_lead <= 0:
                    row_errors.append(f"lead_time_days must be a positive integer, got '{lead_val}'")
                else:
                    clean_row["lead_time_days"] = p_lead

            moq_val = clean_row.get("moq")
            if moq_val is not None and str(moq_val).strip() != "":
                p_moq = parse_flexible_int(moq_val)
                if p_moq is None or p_moq <= 0:
                    row_errors.append(f"moq must be a positive integer, got '{moq_val}'")
                else:
                    clean_row["moq"] = p_moq

            ret_val = clean_row.get("return_window_days")
            if ret_val is not None and str(ret_val).strip() != "":
                p_ret = parse_flexible_int(ret_val)
                if p_ret is None or p_ret <= 0:
                    row_errors.append(f"return_window_days must be a positive integer, got '{ret_val}'")
                else:
                    clean_row["return_window_days"] = p_ret

            cost_val = clean_row.get("unit_cost")
            clean_row["unit_cost"] = parse_flexible_float(cost_val) if cost_val is not None else 100.0

            cred_val = clean_row.get("credit_pct")
            clean_row["credit_pct"] = parse_flexible_float(cred_val) if cred_val is not None else 0.60

        elif tbl == "purchase_orders":
            po_val = clean_row.get("po")
            if po_val:
                clean_row["po"] = str(po_val).strip()

            mfg_val = clean_row.get("manufacturer")
            if mfg_val:
                clean_row["manufacturer"] = str(mfg_val).strip()

            sku_val = clean_row.get("sku")
            if sku_val:
                clean_row["sku"] = str(sku_val).strip().upper()

            qty_val = clean_row.get("qty")
            if qty_val is not None and str(qty_val).strip() != "":
                p_qty = parse_flexible_int(qty_val)
                if p_qty is None or p_qty <= 0:
                    row_errors.append(f"Purchase order quantity must be greater than zero, got '{qty_val}'")
                else:
                    clean_row["qty"] = p_qty

            exp_d = clean_row.get("expected_date")
            p_exp = parse_flexible_date(exp_d)
            if exp_d and not p_exp:
                row_errors.append(f"Invalid expected_date format: '{exp_d}'")
            clean_row["expected_date"] = p_exp

            stat_val = clean_row.get("status")
            if stat_val:
                clean_row["status"] = str(stat_val).strip().lower()

        elif tbl == "recalls":
            d_val = clean_row.get("date")
            parsed_d = parse_flexible_date(d_val)
            if d_val and not parsed_d:
                row_errors.append(f"Invalid recall date format: '{d_val}'")
            clean_row["date"] = parsed_d

            sku_val = clean_row.get("sku")
            if sku_val:
                clean_row["sku"] = str(sku_val).strip().upper()

            batches_val = clean_row.get("batches")
            if not batches_val or str(batches_val).strip() in ("", "[]"):
                row_errors.append("Recalls must specify affected batches")
            clean_row["batches"] = str(batches_val).strip() if batches_val else "[]"

            reason_val = clean_row.get("reason")
            if reason_val:
                clean_row["reason"] = str(reason_val).strip()

            class_val = clean_row.get("recall_class")
            if class_val:
                clean_row["recall_class"] = str(class_val).strip()

        # Aggregate row feedback
        if row_errors:
            for emsg in row_errors:
                fname = "general"
                if "for '" in emsg:
                    m = re.search(r"for '([^']+)'", emsg)
                    if m:
                        fname = m.group(1)
                elif "expiry_date" in emsg.lower():
                    fname = "expiry_date"
                elif "quantity" in emsg.lower():
                    fname = "qty"
                elif "batch" in emsg.lower():
                    fname = "batch"
                elif "sku" in emsg.lower():
                    fname = "sku"
                elif "storage" in emsg.lower():
                    fname = "storage"
                elif "customer" in emsg.lower():
                    fname = "customer"
                elif "temperature" in emsg.lower():
                    fname = "temp_c"
                errors.append({"row_number": idx, "field": fname, "error": emsg, "raw_data": raw_row})
        else:
            if row_warnings:
                warnings.append({"row_number": idx, "warnings": row_warnings})
            sanitized_rows.append(clean_row)

    invalid_rows_count = len({e["row_number"] for e in errors})
    is_valid_for_commit = len(errors) == 0 and len(sanitized_rows) > 0
    import_status = "Ready" if is_valid_for_commit else "Blocked"
    block_reason = None if is_valid_for_commit else ("Validation errors must be corrected before importing." if errors else "No valid records detected.")

    entity_title = ENTITY_TITLES.get(tbl, tbl.title())
    error_lines = "\n".join(f"Row {e['row_number']}: {e['error']}" for e in errors[:10])
    summary_text = (
        f"Entity: {entity_title}\n"
        f"Rows detected: {len(rows)}\n"
        f"Valid rows: {len(sanitized_rows)}\n"
        f"Invalid rows: {invalid_rows_count}\n\n"
        + (f"Errors:\n{error_lines}\n\n" if errors else "")
        + f"Import status: {import_status}\n"
        f"Reason: {block_reason or 'Validation passed successfully.'}"
    )

    capability_report = _evaluate_analytics_capabilities(tbl, mapping, len(sanitized_rows))

    return {
        "target_table": tbl,
        "total_rows": len(rows),
        "total_rows_detected": len(rows),
        "valid_rows_count": len(sanitized_rows),
        "valid_rows": len(sanitized_rows),
        "invalid_rows_count": invalid_rows_count,
        "invalid_rows": invalid_rows_count,
        "warning_count": len(warnings),
        "errors": errors[:50],
        "warnings": warnings[:50],
        "preview_rows": sanitized_rows[:5],
        "preview": sanitized_rows[:5],
        "capability_report": capability_report,
        "capabilities": capability_report,
        "is_valid_for_commit": is_valid_for_commit,
        "import_status": import_status,
        "block_reason": block_reason,
        "validation_summary": summary_text,
        "rejection_message": summary_text if not is_valid_for_commit else None,
        "missing_mandatory_fields": [],
    }

def _evaluate_analytics_capabilities(target_table: str, mapping: Dict[str, str], valid_rows: int) -> Dict[str, Any]:
    """
    Reports which regulatory analyses the dataset supports vs cannot support.
    """
    tbl = canonicalize_table_name(target_table)
    has_batch = "batch" in mapping
    has_sku = "sku" in mapping
    has_exp = "expiry_date" in mapping
    has_mfg = "mfg_date" in mapping
    has_temp = "temp_c" in mapping and ("timestamp" in mapping or "ts" in mapping)
    has_dispatch = tbl == "dispatches" or ("date" in mapping and ("customer" in mapping or "customer_id" in mapping))

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
            "supported": (tbl in ("temp_logs", "temperature_logs") and has_temp) or ("cold_room" in mapping),
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
            "supported": tbl == "dispatches" and valid_rows >= 10,
            "reason": "Sufficient historical dispatches to compute 60-day velocity" if (tbl == "dispatches" and valid_rows >= 10) else "Unsupported: Requires >= 10 historical dispatch records"
        }
    }
    caps["near_expiry_analysis"] = caps["near_expiry_risk_analysis"]
    caps["cold_chain_breach_detection"] = caps["cold_chain_excursion_detection"]
    return caps
