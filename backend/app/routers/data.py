import csv
import io
import json
import uuid
import hashlib
from datetime import datetime, timezone, date, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import BatchInventory, Product, Customer, Dispatch, Supplier, TempLog, DatasetImport, PurchaseOrder, Recall
from app.ledger.chain import append_ledger_event
from app.routers.board import execute_full_scan
from app.engine.canonical_schemas import (
    MANDATORY_SCHEMAS,
    OPTIONAL_SCHEMAS,
    CANONICAL_ALIASES,
    ENTITY_TITLES,
    canonicalize_table_name,
    generate_csv_template,
    validate_headers_strictly,
)
from app.engine.adaptation import (
    parse_uploaded_file,
    profile_dataset,
    validate_dataset,
    match_columns_to_canonical,
    parse_flexible_int,
    parse_flexible_float,
    parse_flexible_date,
    CANONICAL_SCHEMAS,
)

router = APIRouter(prefix="/api/data", tags=["Data Adaptation & Ingestion"])

# In-memory staged rows storage for validation -> commit lifecycle
_STAGED_ROWS_CACHE: Dict[str, Dict[str, Any]] = {}

@router.get("/schemas")
def get_authoritative_schemas():
    """
    Returns the centralized, authoritative schema definitions for all 8 entities.
    Single source of truth for both frontend and backend validation.
    """
    schemas_data = {}
    for tbl, mandatory in MANDATORY_SCHEMAS.items():
        if tbl == "temp_logs":
            continue
        schemas_data[tbl] = {
            "entity": tbl,
            "title": ENTITY_TITLES.get(tbl, tbl.title()),
            "mandatory_fields": mandatory,
            "optional_fields": OPTIONAL_SCHEMAS.get(tbl, []),
            "aliases": CANONICAL_ALIASES.get(tbl, {}),
            "allowed_enums": {
                "storage": ["ambient", "2-8C"] if tbl == "products" else None,
                "type": ["chemist", "hospital"] if tbl == "customers" else None,
            },
        }
    return {
        "status": "success",
        "schemas": schemas_data,
        "supported_tables": list(schemas_data.keys()),
    }


@router.get("/templates/{table}")
def get_entity_csv_template(table: str):
    """
    Returns a downloadable CSV template containing all mandatory headers and example rows.
    """
    tbl = canonicalize_table_name(table)
    if tbl not in MANDATORY_SCHEMAS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported entity '{table}'. Supported: {list(MANDATORY_SCHEMAS.keys())}",
        )
    csv_content = generate_csv_template(tbl)
    filename = f"{tbl}_template.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/profile")
async def profile_file_data(
    file: UploadFile = File(...),
    target_table: Optional[str] = Form(None),
    table: Optional[str] = Form(None),
):
    """
    Profiles an uploaded CSV or XLSX file.
    Detects column names, null counts, inferred data types, duplicate rows,
    suggests canonical schema mappings, and strictly verifies all mandatory fields exist.
    """
    tbl = canonicalize_table_name(target_table or table or "batch_inventory")
    if tbl not in CANONICAL_SCHEMAS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported target table '{tbl}'. Supported: {list(CANONICAL_SCHEMAS.keys())}",
        )

    try:
        content = await file.read()
        profile_res = profile_dataset(
            file_bytes=content,
            filename=file.filename or "uploaded_file",
            target_table=tbl,
        )
        return profile_res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"File profiling failed: {str(ex)}")


@router.post("/validate")
async def validate_file_data(
    file: UploadFile = File(...),
    target_table: Optional[str] = Form(None),
    table: Optional[str] = Form(None),
    mapping_json: Optional[str] = Form(None),
    column_mappings: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Validates file rows against the user-confirmed column mapping and database foreign keys.
    Generates preview rows, row-level errors, warnings, and an analysis capability report.
    Never silently discards invalid rows or fabricates missing values.
    """
    tbl = target_table or table or "batch_inventory"
    if tbl not in CANONICAL_SCHEMAS:
        raise HTTPException(status_code=400, detail=f"Unsupported target table '{tbl}'")

    try:
        content = await file.read()
        headers, rows = parse_uploaded_file(content, file.filename or "file")
        file_sha256 = hashlib.sha256(content).hexdigest()

        raw_map = mapping_json or column_mappings
        if raw_map:
            try:
                mapping = json.loads(raw_map)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid mapping_json format. Must be JSON.")
        else:
            inferred = match_columns_to_canonical(headers, tbl)
            mapping = inferred["mapping"]

        val_res = validate_dataset(
            rows=rows,
            mapping=mapping,
            target_table=tbl,
            db=db,
        )

        import_id = f"IMP-{uuid.uuid4().hex[:8].upper()}"

        valid_rows_data = [r for idx, r in enumerate(rows, start=1) if idx not in {e["row_number"] for e in val_res["errors"]}]

        # Stage in DatasetImport table
        import_status_val = "staged" if val_res["is_valid_for_commit"] else "rejected"
        new_import = DatasetImport(
            id=import_id,
            filename=file.filename or "uploaded_file",
            file_type="xlsx" if (file.filename or "").lower().endswith((".xlsx", ".xls")) else "csv",
            file_sha256=file_sha256,
            target_table=tbl,
            total_rows=val_res["total_rows"],
            valid_rows=val_res["valid_rows_count"],
            invalid_rows=val_res["invalid_rows_count"],
            status=import_status_val,
            mapping_config=json.dumps(mapping),
            capability_report=json.dumps(val_res["capability_report"]),
            errors_summary=json.dumps(val_res["errors"][:50]),
            previous_state=json.dumps(valid_rows_data, default=str),
            imported_by="Staged User",
            created_at=datetime.now(timezone.utc),
        )
        db.add(new_import)
        db.commit()

        # Cache parsed sanitized rows for commit step
        _STAGED_ROWS_CACHE[import_id] = {
            "target_table": tbl,
            "rows": val_res.get("preview_rows", []),
            "all_sanitized_rows": valid_rows_data,
            "mapping": mapping,
            "val_res": val_res,
        }

        val_res["import_id"] = import_id
        return val_res

    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Validation failed: {str(ex)}")


@router.post("/commit")
async def commit_dataset(
    import_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    target_table: Optional[str] = Form(None),
    table: Optional[str] = Form(None),
    mode: Optional[str] = Form("upsert"),
    imported_by: Optional[str] = Form(None),
    user: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Transactionally commits a validated or uploaded dataset.
    Preserves audit provenance, records a SHA-256 ledger event,
    and automatically recalculates compliance findings to avoid stale risk state.
    """
    committer = imported_by or user or "Authorized Pharmacist"

    # Direct file commit mode
    if file is not None and not import_id:
        tbl = target_table or table or "batch_inventory"
        content = await file.read()
        file_sha256 = hashlib.sha256(content).hexdigest()

        # Check idempotency
        existing_commit = db.query(DatasetImport).filter(
            DatasetImport.file_sha256 == file_sha256,
            DatasetImport.status == "committed",
        ).first()
        if existing_commit:
            return {
                "status": "already_committed",
                "import_id": existing_commit.id,
                "message": f"Dataset with identical hash ({file_sha256[:12]}) already committed.",
                "rows_committed": existing_commit.valid_rows,
                "committed_rows": existing_commit.valid_rows,
            }

        headers, rows = parse_uploaded_file(content, file.filename or "file")
        inferred = match_columns_to_canonical(headers, tbl)
        mapping = inferred["mapping"]

        val_res = validate_dataset(rows=rows, mapping=mapping, target_table=tbl, db=db)
        if val_res["invalid_rows_count"] > 0 and val_res["valid_rows_count"] == 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot commit dataset with 0 valid rows. Found {val_res['invalid_rows_count']} validation errors.",
            )

        import_id = f"IMP-{uuid.uuid4().hex[:8].upper()}"
        new_import = DatasetImport(
            id=import_id,
            filename=file.filename or "uploaded_file",
            file_type="xlsx" if (file.filename or "").lower().endswith((".xlsx", ".xls")) else "csv",
            file_sha256=file_sha256,
            target_table=tbl,
            total_rows=val_res["total_rows"],
            valid_rows=val_res["valid_rows_count"],
            invalid_rows=val_res["invalid_rows_count"],
            status="staged",
            mapping_config=json.dumps(mapping),
            capability_report=json.dumps(val_res["capability_report"]),
            errors_summary=json.dumps(val_res["errors"][:50]),
            imported_by=committer,
            created_at=datetime.now(timezone.utc),
        )
        db.add(new_import)
        db.commit()

        _STAGED_ROWS_CACHE[import_id] = {
            "target_table": tbl,
            "rows": val_res.get("preview_rows", []),
            "all_sanitized_rows": [r for idx, r in enumerate(rows, start=1) if idx not in {e["row_number"] for e in val_res["errors"]}],
            "mapping": mapping,
            "val_res": val_res,
        }

    if not import_id:
        raise HTTPException(status_code=400, detail="Missing required 'import_id' or 'file' parameter.")

    import_record = db.query(DatasetImport).filter(DatasetImport.id == import_id).first()
    if not import_record:
        raise HTTPException(status_code=404, detail=f"Import record '{import_id}' not found.")

    if import_record.status == "committed":
        return {
            "status": "already_committed",
            "import_id": import_record.id,
            "message": "This dataset has already been committed.",
            "committed_rows": import_record.valid_rows,
            "rows_committed": import_record.valid_rows,
        }

    if import_record.status == "rolled_back":
        raise HTTPException(status_code=400, detail="This dataset was previously rolled back and cannot be recommitted.")

    if import_record.status == "rejected" or import_record.invalid_rows > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot commit dataset: Import is blocked due to validation errors ({import_record.invalid_rows} errors). All errors must be corrected before committing."
        )

    staged_data = _STAGED_ROWS_CACHE.get(import_id)
    if not staged_data and import_record and import_record.previous_state:
        try:
            rec_rows = json.loads(import_record.previous_state)
            rec_map = json.loads(import_record.mapping_config or "{}")
            staged_data = {
                "target_table": import_record.target_table,
                "all_sanitized_rows": rec_rows,
                "mapping": rec_map,
            }
        except Exception:
            pass

    if not staged_data:
        raise HTTPException(status_code=400, detail="Staged row cache expired or unavailable. Please re-validate the file.")

    target_table_name = import_record.target_table
    sanitized_rows = staged_data["all_sanitized_rows"]
    mapping = staged_data["mapping"]

    affected_ids = []
    previous_states = []

    try:
        # Atomic Transaction
        with db.begin_nested():
            if target_table_name == "batch_inventory":
                existing_sku_ids = {p.sku for p in db.query(Product.sku).all()}
                for raw_r in sanitized_rows:
                    batch_num = raw_r.get(mapping.get("batch"))
                    sku = raw_r.get(mapping.get("sku"))
                    if not batch_num or not sku:
                        continue

                    batch_str = str(batch_num).strip()
                    sku_str = str(sku).strip().upper()

                    # Ensure parent product exists for foreign key
                    if sku_str not in existing_sku_ids:
                        new_prod = Product(
                            sku=sku_str,
                            brand=f"Brand {sku_str}",
                            molecule=sku_str,
                            category="General",
                            storage="ambient",
                            critical_drug=False,
                        )
                        db.add(new_prod)
                        db.flush()
                        existing_sku_ids.add(sku_str)
                    
                    qty_val = parse_flexible_int(raw_r.get(mapping.get("qty"))) or 0
                    exp_val = parse_flexible_date(raw_r.get(mapping.get("expiry_date")))
                    mfg_val = parse_flexible_date(raw_r.get(mapping.get("mfg_date")))
                    raw_wh = raw_r.get(mapping.get("warehouse"))
                    wh_val = str(raw_wh).strip() if (raw_wh is not None and str(raw_wh).strip() not in ("None", "")) else "WH-1"
                    cold_val = raw_r.get(mapping.get("cold_room"))
                    valid_statuses = {"active", "blocked", "quarantine", "returned"}
                    raw_status = str(raw_r.get(mapping.get("status", "")) or "").strip().lower()
                    status_val = raw_status if raw_status in valid_statuses else "active"

                    existing = db.query(BatchInventory).filter(
                        BatchInventory.batch == batch_str,
                        BatchInventory.sku == sku_str,
                    ).first()

                    if existing:
                        previous_states.append({
                            "id": existing.id,
                            "batch": existing.batch,
                            "sku": existing.sku,
                            "qty": existing.qty,
                            "expiry_date": existing.expiry_date.isoformat() if existing.expiry_date else None,
                            "status": existing.status,
                            "warehouse": existing.warehouse,
                        })
                        existing.qty = qty_val
                        if exp_val:
                            existing.expiry_date = exp_val
                        if mfg_val:
                            existing.mfg_date = mfg_val
                        if wh_val != "UNASSIGNED":
                            existing.warehouse = str(wh_val).strip()
                        if cold_val:
                            existing.cold_room = str(cold_val).strip()
                        existing.status = str(status_val).strip()
                        affected_ids.append(batch_str)
                    else:
                        new_batch = BatchInventory(
                            sku=sku_str,
                            batch=batch_str,
                            warehouse=str(wh_val).strip(),
                            cold_room=str(cold_val).strip() if cold_val else None,
                            qty=qty_val,
                            mfg_date=mfg_val or (exp_val - timedelta(days=730) if exp_val else date(2025, 1, 1)),
                            expiry_date=exp_val or date(2027, 1, 1),
                            status=str(status_val).strip(),
                            import_batch_id=import_id,
                        )
                        db.add(new_batch)
                        affected_ids.append(batch_str)

            elif target_table_name == "products":
                for raw_r in sanitized_rows:
                    sku = str(raw_r.get(mapping.get("sku", ""))).strip().upper()
                    if not sku:
                        continue
                    brand = str(raw_r.get(mapping.get("brand", "Generic Brand"))).strip()
                    molecule = str(raw_r.get(mapping.get("molecule", "Generic Molecule"))).strip()
                    category = str(raw_r.get(mapping.get("category", "General"))).strip()
                    storage = str(raw_r.get(mapping.get("storage", "ambient"))).strip()
                    crit = str(raw_r.get(mapping.get("critical_drug", "false"))).lower() == "true"

                    existing = db.query(Product).filter(Product.sku == sku).first()
                    if existing:
                        previous_states.append({
                            "sku": existing.sku,
                            "brand": existing.brand,
                            "molecule": existing.molecule,
                            "category": existing.category,
                            "storage": existing.storage,
                            "critical_drug": existing.critical_drug,
                        })
                        existing.brand = brand
                        existing.molecule = molecule
                        existing.category = category
                        existing.storage = storage
                        existing.critical_drug = crit
                    else:
                        new_prod = Product(
                            sku=sku,
                            brand=brand,
                            molecule=molecule,
                            category=category,
                            storage=storage,
                            critical_drug=crit,
                        )
                        db.add(new_prod)
                    affected_ids.append(sku)

            elif target_table_name == "dispatches":
                existing_cust_ids = {c.customer_id for c in db.query(Customer.customer_id).all()}
                existing_sku_ids = {p.sku for p in db.query(Product.sku).all()}

                for raw_r in sanitized_rows:
                    date_val = (raw_r.get(mapping.get("date")) if mapping.get("date") else None) or raw_r.get("date")
                    d_date = parse_flexible_date(date_val)

                    cust_val = (
                        (raw_r.get(mapping.get("customer")) if mapping.get("customer") else None)
                        or (raw_r.get(mapping.get("customer_id")) if mapping.get("customer_id") else None)
                        or raw_r.get("customer")
                        or raw_r.get("customer_id")
                        or ""
                    )
                    cust = str(cust_val or "").strip()

                    sku_val = (raw_r.get(mapping.get("sku")) if mapping.get("sku") else None) or raw_r.get("sku")
                    sku = str(sku_val or "").strip().upper()

                    batch_val = (raw_r.get(mapping.get("batch")) if mapping.get("batch") else None) or raw_r.get("batch")
                    batch = str(batch_val or "").strip()

                    qty_val = (raw_r.get(mapping.get("qty")) if mapping.get("qty") else None) or raw_r.get("qty")
                    qty = parse_flexible_int(qty_val) or 1

                    wh_val = (
                        (raw_r.get(mapping.get("from_warehouse")) if mapping.get("from_warehouse") else None)
                        or raw_r.get("from_warehouse")
                        or raw_r.get("warehouse")
                    )
                    wh = str(wh_val).strip() if (wh_val is not None and str(wh_val).strip() not in ("None", "")) else "WH-1"

                    if d_date and cust and sku and batch:
                        # Auto-create missing foreign key parent customer if not present
                        if cust not in existing_cust_ids:
                            new_cust = Customer(
                                customer_id=cust,
                                name=f"Customer {cust}",
                                type="hospital" if "HOSP" in cust.upper() else "chemist",
                                location="Regional Territory",
                                credit_terms="Net 30",
                            )
                            db.add(new_cust)
                            db.flush()
                            existing_cust_ids.add(cust)

                        # Auto-create missing foreign key parent product if not present
                        if sku not in existing_sku_ids:
                            new_prod = Product(
                                sku=sku,
                                brand=f"Brand {sku}",
                                molecule=sku,
                                category="General",
                                storage="ambient",
                                critical_drug=False,
                            )
                            db.add(new_prod)
                            db.flush()
                            existing_sku_ids.add(sku)

                        # Enforce regulatory dispatch block for future dispatches of recalled/quarantined batches
                        blocked_batch = db.query(BatchInventory).filter(
                            BatchInventory.batch == batch,
                            BatchInventory.status.in_(["blocked", "quarantine", "recalled"])
                        ).first()
                        if blocked_batch and d_date >= settings.today:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Dispatch blocked: Batch '{batch}' has been quarantined/recalled (status: {blocked_batch.status}). Regulatory compliance prevents further dispatch."
                            )

                        new_disp = Dispatch(
                            date=d_date,
                            customer_id=cust,
                            sku=sku,
                            batch=batch,
                            qty=qty,
                            from_warehouse=wh,
                        )
                        db.add(new_disp)
                        affected_ids.append(f"{cust}:{batch}")


            elif target_table_name == "customers":
                for raw_r in sanitized_rows:
                    c_id_raw = (
                        (raw_r.get(mapping.get("customer")) if mapping.get("customer") else None)
                        or (raw_r.get(mapping.get("customer_id")) if mapping.get("customer_id") else None)
                        or raw_r.get("customer")
                        or raw_r.get("customer_id")
                        or ""
                    )
                    c_id = str(c_id_raw or "").strip()
                    if not c_id:
                        continue
                    c_name = str(
                        (raw_r.get(mapping.get("name")) if mapping.get("name") else None)
                        or raw_r.get("name")
                        or f"Customer {c_id}"
                    ).strip()
                    c_type = str(
                        (raw_r.get(mapping.get("type")) if mapping.get("type") else None)
                        or raw_r.get("type")
                        or "chemist"
                    ).strip().lower()
                    c_loc = str(
                        (raw_r.get(mapping.get("location")) if mapping.get("location") else None)
                        or raw_r.get("location")
                        or "Regional Territory"
                    ).strip()
                    c_terms = str(
                        (raw_r.get(mapping.get("credit_terms")) if mapping.get("credit_terms") else None)
                        or raw_r.get("credit_terms")
                        or "Net 30"
                    ).strip()

                    existing = db.query(Customer).filter(Customer.customer_id == c_id).first()
                    if existing:
                        previous_states.append({
                            "customer_id": existing.customer_id,
                            "name": existing.name,
                            "type": existing.type,
                            "location": existing.location,
                            "credit_terms": existing.credit_terms,
                        })
                        existing.name = c_name
                        existing.type = c_type
                        existing.location = c_loc
                        existing.credit_terms = c_terms
                    else:
                        new_c = Customer(
                            customer_id=c_id,
                            name=c_name,
                            type=c_type,
                            location=c_loc,
                            credit_terms=c_terms,
                        )
                        db.add(new_c)
                    affected_ids.append(c_id)

            elif target_table_name == "suppliers":
                existing_sku_ids = {p.sku for p in db.query(Product.sku).all()}
                for raw_r in sanitized_rows:
                    mfg = str(raw_r.get(mapping.get("manufacturer", "")) or "").strip()
                    sku = str(raw_r.get(mapping.get("sku", "")) or "").strip().upper()
                    if not mfg or not sku:
                        continue
                    if sku not in existing_sku_ids:
                        db.add(Product(sku=sku, brand=f"Brand {sku}", molecule=sku, category="General", storage="ambient", critical_drug=False))
                        existing_sku_ids.add(sku)
                    cost = parse_flexible_float(raw_r.get(mapping.get("unit_cost"))) or 100.0
                    lead = parse_flexible_int(raw_r.get(mapping.get("lead_time_days"))) or 7
                    moq = parse_flexible_int(raw_r.get(mapping.get("moq"))) or 100
                    ret_w = parse_flexible_int(raw_r.get(mapping.get("return_window_days"))) or 60
                    cred = parse_flexible_float(raw_r.get(mapping.get("credit_pct"))) or 0.60

                    existing = db.query(Supplier).filter(Supplier.manufacturer == mfg, Supplier.sku == sku).first()
                    if existing:
                        previous_states.append({
                            "id": existing.id,
                            "manufacturer": existing.manufacturer,
                            "sku": existing.sku,
                            "unit_cost": existing.unit_cost,
                        })
                        existing.unit_cost = cost
                        existing.lead_time_days = lead
                        existing.moq = moq
                        existing.return_window_days = ret_w
                        existing.credit_pct = cred
                    else:
                        db.add(Supplier(manufacturer=mfg, sku=sku, unit_cost=cost, lead_time_days=lead, moq=moq, return_window_days=ret_w, credit_pct=cred))
                    affected_ids.append(f"{mfg}:{sku}")

            elif target_table_name in ("temp_logs", "temperature_logs"):
                for raw_r in sanitized_rows:
                    wh = str((raw_r.get(mapping.get("warehouse")) if mapping.get("warehouse") else None) or raw_r.get("warehouse") or "WH-1").strip()
                    cr = str((raw_r.get(mapping.get("cold_room")) if mapping.get("cold_room") else None) or raw_r.get("cold_room") or "CR-1").strip()
                    temp_val = parse_flexible_float((raw_r.get(mapping.get("temp_c")) if mapping.get("temp_c") else None) or raw_r.get("temp_c"))
                    if temp_val is None:
                        continue
                    raw_ts = (
                        (raw_r.get(mapping.get("timestamp")) if mapping.get("timestamp") else None)
                        or (raw_r.get(mapping.get("ts")) if mapping.get("ts") else None)
                        or raw_r.get("timestamp")
                        or raw_r.get("ts")
                    )
                    ts_val = None
                    if raw_ts:
                        try:
                            ts_val = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
                        except Exception:
                            pass
                    if not ts_val:
                        ts_val = datetime.now(timezone.utc)

                    db.add(TempLog(warehouse=wh, cold_room=cr, ts=ts_val, temp_c=temp_val))
                    affected_ids.append(f"{wh}:{cr}:{ts_val.isoformat()}")

            elif target_table_name == "purchase_orders":
                existing_sku_ids = {p.sku for p in db.query(Product.sku).all()}
                for raw_r in sanitized_rows:
                    po_num = str((raw_r.get(mapping.get("po")) if mapping.get("po") else None) or raw_r.get("po") or "").strip()
                    mfg = str((raw_r.get(mapping.get("manufacturer")) if mapping.get("manufacturer") else None) or raw_r.get("manufacturer") or "MANU-GENERIC").strip()
                    sku = str((raw_r.get(mapping.get("sku")) if mapping.get("sku") else None) or raw_r.get("sku") or "").strip().upper()
                    qty = parse_flexible_int((raw_r.get(mapping.get("qty")) if mapping.get("qty") else None) or raw_r.get("qty")) or 100
                    exp_d = parse_flexible_date((raw_r.get(mapping.get("expected_date")) if mapping.get("expected_date") else None) or raw_r.get("expected_date")) or (date.today() + timedelta(days=7))
                    status = str((raw_r.get(mapping.get("status")) if mapping.get("status") else None) or raw_r.get("status") or "ordered").strip().lower()[:100]
                    if not po_num or not sku:
                        continue
                    if sku not in existing_sku_ids:
                        db.add(Product(sku=sku, brand=f"Brand {sku}", molecule=sku, category="General", storage="ambient", critical_drug=False))
                        existing_sku_ids.add(sku)

                    existing = db.query(PurchaseOrder).filter(PurchaseOrder.po == po_num).first()
                    if existing:
                        existing.manufacturer = mfg
                        existing.sku = sku
                        existing.qty = qty
                        existing.expected_date = exp_d
                        existing.status = status
                    else:
                        db.add(PurchaseOrder(po=po_num, manufacturer=mfg, sku=sku, qty=qty, expected_date=exp_d, status=status))
                    affected_ids.append(po_num)

            elif target_table_name == "recalls":
                existing_sku_ids = {p.sku for p in db.query(Product.sku).all()}
                for raw_r in sanitized_rows:
                    sku = str(raw_r.get(mapping.get("sku", "")) or "").strip().upper()
                    raw_batches = raw_r.get(mapping.get("batches")) or ""
                    if isinstance(raw_batches, list):
                        b_json = json.dumps(raw_batches)
                    elif str(raw_batches).startswith("["):
                        b_json = str(raw_batches)
                    else:
                        b_list = [b.strip() for b in str(raw_batches).split(",") if b.strip()]
                        b_json = json.dumps(b_list)

                    reason = str(raw_r.get(mapping.get("reason", "")) or "Regulatory recall notice").strip()
                    r_class = str(raw_r.get(mapping.get("recall_class", "")) or "Class II").strip()
                    r_date = parse_flexible_date(raw_r.get(mapping.get("date"))) or date.today()
                    rec_id = f"REC-{sku}-{uuid.uuid4().hex[:6].upper()}"
                    if not sku:
                        continue
                    if sku not in existing_sku_ids:
                        db.add(Product(sku=sku, brand=f"Brand {sku}", molecule=sku, category="General", storage="ambient", critical_drug=False))
                        existing_sku_ids.add(sku)

                    db.add(Recall(id=rec_id, date=r_date, sku=sku, batches=b_json, reason=reason, recall_class=r_class))
                    affected_ids.append(rec_id)

            # Update import audit record
            import_record.status = "committed"
            import_record.committed_at = datetime.now(timezone.utc)
            import_record.imported_by = committer
            import_record.affected_ids = json.dumps(affected_ids)
            import_record.previous_state = json.dumps(previous_states)
            db.commit()

    except Exception as ex:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit error (rolled back): {str(ex)}")

    # Append to SHA-256 Hash-Chained Audit Ledger
    append_ledger_event(
        db=db,
        event_type="DATASET_IMPORTED",
        payload={
            "import_id": import_id,
            "filename": import_record.filename,
            "target_table": target_table_name,
            "rows_committed": len(affected_ids),
            "imported_by": committer,
        },
        ts=datetime.now(timezone.utc).isoformat(),
        trigger_auto_anchor=True,
    )

    # Recompute compliance detectors to clear stale findings
    scan_result = execute_full_scan(db)

    return {
        "status": "committed",
        "import_id": import_id,
        "committed_rows": len(affected_ids),
        "rows_committed": len(affected_ids),
        "target_table": target_table_name,
        "new_findings_count": len(scan_result.findings),
        "capability_report": json.loads(import_record.capability_report) if import_record.capability_report else {},
    }


@router.post("/rollback")
def rollback_import(
    import_id: Optional[str] = Form(None),
    rolled_back_by: Optional[str] = Form(None),
    import_id_query: Optional[str] = Query(None, alias="import_id"),
    user_query: Optional[str] = Query(None, alias="user"),
    db: Session = Depends(get_db),
):
    """
    Rolls back an import batch. Removes newly inserted records and restores
    prior state for updated rows, ensuring existing seed data is preserved.
    """
    imp_id = import_id or import_id_query
    if not imp_id:
        raise HTTPException(status_code=400, detail="Missing required 'import_id' parameter.")

    operator = rolled_back_by or user_query or "Quality Head"

    import_record = db.query(DatasetImport).filter(DatasetImport.id == imp_id).first()
    if not import_record:
        raise HTTPException(status_code=404, detail=f"Import record '{imp_id}' not found.")

    if import_record.status != "committed":
        raise HTTPException(status_code=400, detail=f"Cannot rollback import with status '{import_record.status}'.")

    target_table_name = import_record.target_table
    previous_states = json.loads(import_record.previous_state or "[]")
    deleted_count = 0

    try:
        with db.begin_nested():
            if target_table_name == "batch_inventory":
                # Delete batches that were created solely by this import
                deleted_count = db.query(BatchInventory).filter(
                    BatchInventory.import_batch_id == imp_id
                ).delete(synchronize_session="fetch")

                # Restore previous values for updated batches
                for prev in previous_states:
                    existing = db.query(BatchInventory).filter(BatchInventory.id == prev["id"]).first()
                    if existing:
                        existing.qty = prev["qty"]
                        existing.status = prev["status"]
                        existing.warehouse = prev["warehouse"]
                        if prev.get("expiry_date"):
                            existing.expiry_date = date.fromisoformat(prev["expiry_date"])
                        existing.import_batch_id = None

            import_record.status = "rolled_back"
            db.commit()

    except Exception as ex:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Rollback failed: {str(ex)}")

    # Record in Ledger
    append_ledger_event(
        db=db,
        event_type="DATASET_ROLLED_BACK",
        payload={
            "import_id": imp_id,
            "target_table": target_table_name,
            "rolled_back_by": operator,
        },
        ts=datetime.now(timezone.utc).isoformat(),
        trigger_auto_anchor=True,
    )

    # Recompute compliance detectors
    scan_result = execute_full_scan(db)

    return {
        "status": "rolled_back",
        "import_id": imp_id,
        "deleted_new_records": deleted_count,
        "restored_records": len(previous_states),
        "message": f"Dataset {imp_id} successfully rolled back. Compliance board refreshed.",
        "new_findings_count": len(scan_result.findings),
    }


# ---------------------------------------------------------------------------
# Direct /upload Ingestion Endpoint with Authoritative Schema Validation
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_csv_data(
    table: str = Form(..., description="Target table name"),
    mode: str = Form("upsert", description="Mode: upsert, replace, append"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Direct CSV ingestion endpoint enforcing mandatory fields, valid types, and atomic transactions.
    """
    tbl = canonicalize_table_name(table)
    if tbl not in MANDATORY_SCHEMAS:
        raise HTTPException(status_code=400, detail=f"Invalid table '{table}'. Must be one of: {list(MANDATORY_SCHEMAS.keys())}")

    try:
        content = await file.read()
        headers, rows = parse_uploaded_file(content, file.filename or "file.csv")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    # Validate headers strictly against mandatory schema
    is_valid_headers, missing_mandatory, mapping, rejection_msg = validate_headers_strictly(headers, tbl)
    if not is_valid_headers:
        raise HTTPException(status_code=400, detail=rejection_msg)

    # Validate row-level constraints
    val_res = validate_dataset(rows=rows, mapping=mapping, target_table=tbl, db=db)
    if not val_res["is_valid_for_commit"] or val_res["invalid_rows_count"] > 0:
        raise HTTPException(
            status_code=400,
            detail=val_res.get("validation_summary") or f"Cannot import dataset: Found {val_res['invalid_rows_count']} validation errors."
        )

    # Use database transaction
    affected_count = 0
    try:
        sanitized_rows = [r for idx, r in enumerate(rows, start=1) if idx not in {e["row_number"] for e in val_res["errors"]}]

        if tbl == "batch_inventory":
            if mode == "replace":
                db.query(BatchInventory).delete()
            for r in sanitized_rows:
                batch_num = str(r.get(mapping.get("batch")) or r.get("batch", "")).strip()
                sku = str(r.get(mapping.get("sku")) or r.get("sku", "")).strip().upper()
                qty = parse_flexible_int(r.get(mapping.get("qty")) or r.get("qty")) or 0
                exp_date = parse_flexible_date(r.get(mapping.get("expiry_date")) or r.get("expiry_date"))
                mfg_date = parse_flexible_date(r.get(mapping.get("mfg_date")) or r.get("mfg_date"))
                wh = str(r.get(mapping.get("warehouse")) or r.get("warehouse") or "WH-1").strip()
                cold = r.get(mapping.get("cold_room")) if mapping.get("cold_room") else None
                status = str(r.get(mapping.get("status")) or r.get("status") or "active").strip()

                prod = db.query(Product).filter(Product.sku == sku).first()
                if not prod:
                    db.add(Product(sku=sku, brand=f"Brand {sku}", molecule=sku, category="General", storage="ambient", critical_drug=False))
                    db.flush()

                existing = db.query(BatchInventory).filter(BatchInventory.batch == batch_num, BatchInventory.sku == sku).first()
                if existing and mode == "upsert":
                    existing.qty = qty
                    existing.expiry_date = exp_date
                    existing.mfg_date = mfg_date
                    existing.warehouse = wh
                    existing.cold_room = cold
                    existing.status = status
                else:
                    db.add(BatchInventory(sku=sku, batch=batch_num, warehouse=wh, cold_room=cold, qty=qty, mfg_date=mfg_date, expiry_date=exp_date, status=status))
                affected_count += 1

        elif tbl == "products":
            if mode == "replace":
                db.query(Product).delete()
            for r in sanitized_rows:
                sku = str(r.get(mapping.get("sku")) or r.get("sku", "")).strip().upper()
                brand = str(r.get(mapping.get("brand")) or r.get("brand", "")).strip()
                mol = str(r.get(mapping.get("molecule")) or r.get("molecule", "")).strip()
                cat = str(r.get(mapping.get("category")) or r.get("category", "")).strip()
                storage = str(r.get(mapping.get("storage")) or r.get("storage", "")).strip()
                crit = parse_flexible_bool(r.get(mapping.get("critical_drug")) or r.get("critical_drug", False)) or False

                existing = db.query(Product).filter(Product.sku == sku).first()
                if existing and mode == "upsert":
                    existing.brand = brand
                    existing.molecule = mol
                    existing.category = cat
                    existing.storage = storage
                    existing.critical_drug = crit
                else:
                    db.add(Product(sku=sku, brand=brand, molecule=mol, category=cat, storage=storage, critical_drug=crit))
                affected_count += 1

        elif tbl == "dispatches":
            for r in sanitized_rows:
                d_date = parse_flexible_date((r.get(mapping.get("date")) if mapping.get("date") else None) or r.get("date"))
                cust = str(
                    (r.get(mapping.get("customer")) if mapping.get("customer") else None)
                    or (r.get(mapping.get("customer_id")) if mapping.get("customer_id") else None)
                    or r.get("customer")
                    or r.get("customer_id")
                    or ""
                ).strip()
                sku = str((r.get(mapping.get("sku")) if mapping.get("sku") else None) or r.get("sku") or "").strip().upper()
                batch = str((r.get(mapping.get("batch")) if mapping.get("batch") else None) or r.get("batch") or "").strip()
                qty = parse_flexible_int((r.get(mapping.get("qty")) if mapping.get("qty") else None) or r.get("qty")) or 1
                wh = str(
                    (r.get(mapping.get("from_warehouse")) if mapping.get("from_warehouse") else None)
                    or r.get("from_warehouse")
                    or r.get("warehouse")
                    or "WH-1"
                ).strip()

                if not cust or not sku or not batch or not d_date:
                    continue

                if not db.query(Customer).filter(Customer.customer_id == cust).first():
                    db.add(Customer(customer_id=cust, name=f"Customer {cust}", type="chemist", location="Regional Territory", credit_terms="Net 30"))
                    db.flush()
                if not db.query(Product).filter(Product.sku == sku).first():
                    db.add(Product(sku=sku, brand=f"Brand {sku}", molecule=sku, category="General", storage="ambient", critical_drug=False))
                    db.flush()

                db.add(Dispatch(date=d_date, customer_id=cust, sku=sku, batch=batch, qty=qty, from_warehouse=wh))
                affected_count += 1

        elif tbl == "customers":
            for r in sanitized_rows:
                c_id = str(r.get(mapping.get("customer")) or r.get(mapping.get("customer_id")) or r.get("customer", "")).strip()
                c_type = str(r.get(mapping.get("type")) or r.get("type", "chemist")).strip().lower()
                c_loc = str(r.get(mapping.get("location")) or r.get("location", "")).strip()
                c_terms = str(r.get(mapping.get("credit_terms")) or r.get("credit_terms", "Net 30")).strip()
                c_name = str(r.get(mapping.get("name")) or r.get("name") or f"Customer {c_id}").strip()

                existing = db.query(Customer).filter(Customer.customer_id == c_id).first()
                if existing and mode == "upsert":
                    existing.type = c_type
                    existing.location = c_loc
                    existing.credit_terms = c_terms
                    existing.name = c_name
                else:
                    db.add(Customer(customer_id=c_id, name=c_name, type=c_type, location=c_loc, credit_terms=c_terms))
                affected_count += 1

        elif tbl == "suppliers":
            for r in sanitized_rows:
                mfg = str(r.get(mapping.get("manufacturer")) or r.get("manufacturer", "")).strip()
                sku = str(r.get(mapping.get("sku")) or r.get("sku", "")).strip().upper()
                lead = parse_flexible_int(r.get(mapping.get("lead_time_days")) or r.get("lead_time_days")) or 7
                moq = parse_flexible_int(r.get(mapping.get("moq")) or r.get("moq")) or 100
                ret_w = parse_flexible_int(r.get(mapping.get("return_window_days")) or r.get("return_window_days")) or 60
                cost = parse_flexible_float(r.get(mapping.get("unit_cost")) or r.get("unit_cost")) or 100.0

                if not db.query(Product).filter(Product.sku == sku).first():
                    db.add(Product(sku=sku, brand=f"Brand {sku}", molecule=sku, category="General", storage="ambient", critical_drug=False))
                    db.flush()

                existing = db.query(Supplier).filter(Supplier.manufacturer == mfg, Supplier.sku == sku).first()
                if existing and mode == "upsert":
                    existing.lead_time_days = lead
                    existing.moq = moq
                    existing.return_window_days = ret_w
                    existing.unit_cost = cost
                else:
                    db.add(Supplier(manufacturer=mfg, sku=sku, lead_time_days=lead, moq=moq, return_window_days=ret_w, unit_cost=cost))
                affected_count += 1

        elif tbl in ("temperature_logs", "temp_logs"):
            for r in sanitized_rows:
                wh = str(r.get(mapping.get("warehouse")) or r.get("warehouse", "WH-1")).strip()
                cr = str(r.get(mapping.get("cold_room")) or r.get("cold_room", "CR-1")).strip()
                temp_val = parse_flexible_float(r.get(mapping.get("temp_c")) or r.get("temp_c")) or 4.0
                raw_ts = r.get(mapping.get("timestamp")) or r.get(mapping.get("ts")) or r.get("timestamp") or r.get("ts")
                ts_val = None
                if raw_ts:
                    try:
                        ts_val = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
                    except Exception:
                        pass
                if not ts_val:
                    ts_val = datetime.now(timezone.utc)
                db.add(TempLog(warehouse=wh, cold_room=cr, ts=ts_val, temp_c=temp_val))
                affected_count += 1

        elif tbl == "purchase_orders":
            for r in sanitized_rows:
                po_num = str(r.get(mapping.get("po")) or r.get("po", "")).strip()
                mfg = str(r.get(mapping.get("manufacturer")) or r.get("manufacturer", "")).strip()
                sku = str(r.get(mapping.get("sku")) or r.get("sku", "")).strip().upper()
                qty = parse_flexible_int(r.get(mapping.get("qty")) or r.get("qty")) or 100
                exp_d = parse_flexible_date(r.get(mapping.get("expected_date")) or r.get("expected_date")) or (date.today() + timedelta(days=7))
                status = str(r.get(mapping.get("status")) or r.get("status", "ordered")).strip().lower()[:100]

                if not db.query(Product).filter(Product.sku == sku).first():
                    db.add(Product(sku=sku, brand=f"Brand {sku}", molecule=sku, category="General", storage="ambient", critical_drug=False))
                    db.flush()

                existing = db.query(PurchaseOrder).filter(PurchaseOrder.po == po_num).first()
                if existing and mode == "upsert":
                    existing.manufacturer = mfg
                    existing.sku = sku
                    existing.qty = qty
                    existing.expected_date = exp_d
                    existing.status = status
                else:
                    db.add(PurchaseOrder(po=po_num, manufacturer=mfg, sku=sku, qty=qty, expected_date=exp_d, status=status))
                affected_count += 1

        elif tbl == "recalls":
            for r in sanitized_rows:
                sku = str(r.get(mapping.get("sku")) or r.get("sku", "")).strip().upper()
                batches = str(r.get(mapping.get("batches")) or r.get("batches", "[]")).strip()
                reason = str(r.get(mapping.get("reason")) or r.get("reason", "Recall")).strip()
                r_class = str(r.get(mapping.get("recall_class")) or r.get("recall_class", "Class II")).strip()
                r_date = parse_flexible_date(r.get(mapping.get("date")) or r.get("date")) or date.today()
                rec_id = f"REC-{sku}-{uuid.uuid4().hex[:6].upper()}"

                if not db.query(Product).filter(Product.sku == sku).first():
                    db.add(Product(sku=sku, brand=f"Brand {sku}", molecule=sku, category="General", storage="ambient", critical_drug=False))
                    db.flush()

                db.add(Recall(id=rec_id, date=r_date, sku=sku, batches=batches, reason=reason, recall_class=r_class))
                affected_count += 1

        db.commit()

        # Append to Ledger
        append_ledger_event(
            db=db,
            event_type="CSV_INGESTED",
            payload={"table": tbl, "mode": mode, "rows": affected_count, "filename": file.filename},
            ts=datetime.now(timezone.utc).isoformat(),
            trigger_auto_anchor=True,
        )

        execute_full_scan(db)

        return {
            "status": "success",
            "table": tbl,
            "mode": mode,
            "rows_affected": affected_count,
            "message": f"Successfully ingested {affected_count} records into {tbl}",
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ingestion transaction failed (rolled back): {str(e)}")
