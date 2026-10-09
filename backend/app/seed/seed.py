import argparse
import random
from datetime import date, datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.db import engine, SessionLocal, Base
from app.models import (
    Product,
    BatchInventory,
    Customer,
    Dispatch,
    TempLog,
    Supplier,
    PurchaseOrder,
    Recall,
    Action,
    Ledger,
    Anchor,
)
from app.config import settings
from app.ledger.chain import append_ledger_event

def get_seed_date() -> date:
    return settings.today

def run_seed(reset: bool = True):
    print(f"Starting TraceRx deterministic seed. Reference TODAY = {settings.today}")
    random.seed(42)

    if reset:
        print("Resetting database schema...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    today = get_seed_date()

    try:
        # 1. Seed Warehouses & Customers (400 Chemists + 20 Hospitals)
        warehouses = ["WH-1", "WH-2", "WH-3"]  # Bengaluru, Hubballi, Mysuru
        customers = []

        # 20 Hospitals
        hospital_names = [
            "Manipal Hospital Bengaluru", "Apollo Hospital Bengaluru", "Fortis Hospital Bengaluru",
            "Narayana Health City", "St. Johns Medical College Hospital", "Aster CMI Hospital",
            "Columbia Asia Hospital", "KIMS Hospital Hubballi", "SDM Medical College Dharwad",
            "Suchirayu Hospital Hubballi", "Tatwadarsha Hospital Hubballi", "Apollo BGS Hospital Mysuru",
            "JSS Hospital Mysuru", "Columbia Asia Hospital Mysuru", "Cauvery Heart & Multi-Speciality",
            "VIMS Hospital Ballari", "Father Muller Medical College Mangaluru", "KMC Hospital Manipal",
            "AJ Hospital Mangaluru", "BM Hospital Mysuru"
        ]
        for i, name in enumerate(hospital_names, 1):
            cust_id = f"HOSP-{i:03d}"
            loc = "Bengaluru" if i <= 7 else ("Hubballi" if i <= 11 else "Mysuru")
            customers.append(Customer(
                customer_id=cust_id,
                name=name,
                type="hospital",
                location=loc,
                credit_terms="Net 45",
            ))

        # 400 Chemists
        areas = ["Indiranagar", "Koramangala", "Jayanagar", "Rajajinagar", "Malleshwaram", "Whitefield", "Hubballi Vidyanagar", "Mysuru Saraswathipuram"]
        for i in range(1, 401):
            cust_id = f"CHEM-{i:03d}"
            area = areas[(i - 1) % len(areas)]
            name = f"MedPlus Pharmacy #{i} ({area})" if i % 2 == 0 else f"Apollo Pharmacy #{i} ({area})"
            customers.append(Customer(
                customer_id=cust_id,
                name=name,
                type="chemist",
                location=area,
                credit_terms="Net 30",
            ))

        db.add_all(customers)
        db.commit()
        print(f"Seeded {len(customers)} customers (20 hospitals, 400 chemists).")

        # 2. Seed 60 SKUs
        sku_definitions = [
            # Key scenario SKUs
            ("AMOX-625", "Amoxicillin + Clavulanic Acid 625mg", "Augmentin 625", "Antibiotics", "ambient", False),
            ("INSULIN-R", "Human Insulin Regular 100 IU/ml", "Huminsulin R", "Anti-diabetic", "2-8C", True),
            ("OMEP-20", "Omeprazole 20mg", "Omez 20", "Gastro", "ambient", False),
            ("AZITH-500", "Azithromycin 500mg", "Azee 500", "Antibiotics", "ambient", False),
            ("ADREN-01", "Adrenaline 1mg/ml Injection", "Vasocon 1mg", "Cardiac", "2-8C", True),
            ("PARACET-650", "Paracetamol 650mg", "Dolo 650", "Analgesics", "ambient", False),
            ("ATRO-05", "Atropine Sulphate 0.5mg/ml", "Atrosun 0.5", "Cardiac", "2-8C", True),
            ("TET-VAC", "Tetanus Toxoid Vaccine", "Tetvac", "Vaccines", "2-8C", False),
            ("CEFT-1G", "Ceftriaxone 1g Injection", "Monocef 1g", "Antibiotics", "ambient", True),
            ("PANT-40", "Pantoprazole 40mg", "Pan 40", "Gastro", "ambient", False),
        ]

        # Additional 50 realistic SKUs to reach 60
        drug_templates = [
            ("MET-500", "Metformin 500mg", "Glycomet 500", "Anti-diabetic", "ambient", False),
            ("ATOR-10", "Atorvastatin 10mg", "Atorva 10", "Cardiac", "ambient", False),
            ("TELM-40", "Telmisartan 40mg", "Telma 40", "Cardiac", "ambient", False),
            ("AML-5", "Amlodipine 5mg", "Amlong 5", "Cardiac", "ambient", False),
            ("LOS-50", "Losartan 50mg", "Losar 50", "Cardiac", "ambient", False),
            ("CIPRO-500", "Ciprofloxacin 500mg", "Ciplox 500", "Antibiotics", "ambient", False),
            ("LEVO-500", "Levofloxacin 500mg", "Levomac 500", "Antibiotics", "ambient", False),
            ("DOXY-100", "Doxycycline 100mg", "Doxt-SL", "Antibiotics", "ambient", False),
            ("CLAR-500", "Clarithromycin 500mg", "Claribid 500", "Antibiotics", "ambient", False),
            ("MONT-10", "Montelukast 10mg", "Montair 10", "Respiratory", "ambient", False),
            ("SALB-4", "Salbutamol 4mg", "Asthalin 4", "Respiratory", "ambient", False),
            ("BUD-05", "Budesonide Respules 0.5mg", "Budecort 0.5", "Respiratory", "2-8C", False),
            ("HEPAR-5K", "Heparin Sodium 5000 IU/ml", "Heparig 5000", "Cardiac", "2-8C", True),
            ("ENOX-40", "Enoxaparin 40mg/0.4ml", "Clexane 40mg", "Cardiac", "2-8C", True),
            ("MEROP-1G", "Meropenem 1g Injection", "Meronem 1g", "Antibiotics", "ambient", True),
            ("VANCO-500", "Vancomycin 500mg Injection", "Vancogen 500", "Antibiotics", "2-8C", True),
            ("OND-4", "Ondansetron 4mg", "Emeset 4", "Gastro", "ambient", False),
            ("RAB-20", "Rabeprazole 20mg", "Razo 20", "Gastro", "ambient", False),
            ("DOM-10", "Domperidone 10mg", "Domstal 10", "Gastro", "ambient", False),
            ("IBU-400", "Ibuprofen 400mg", "Brufen 400", "Analgesics", "ambient", False),
            ("TRAM-50", "Tramadol 50mg", "Tramazac 50", "Analgesics", "ambient", False),
            ("DICLO-50", "Diclofenac Sodium 50mg", "Voveran 50", "Analgesics", "ambient", False),
            ("THYR-100", "Levothyroxine 100mcg", "Thyronorm 100", "Endocrine", "ambient", False),
            ("GLIM-2", "Glimepiride 2mg", "Amaryl 2", "Anti-diabetic", "ambient", False),
            ("VILD-50", "Vildagliptin 50mg", "Galvus 50", "Anti-diabetic", "ambient", False),
            ("DAPA-10", "Dapagliflozin 10mg", "Forxiga 10", "Anti-diabetic", "ambient", False),
            ("ROSU-10", "Rosuvastatin 10mg", "Rosuvas 10", "Cardiac", "ambient", False),
            ("CLOP-75", "Clopidogrel 75mg", "Plavix 75", "Cardiac", "ambient", False),
            ("ASP-75", "Aspirin 75mg", "Ecosprin 75", "Cardiac", "ambient", False),
            ("CETR-10", "Cetirizine 10mg", "Cetzine 10", "Respiratory", "ambient", False),
            ("FEXO-120", "Fexofenadine 120mg", "Allegra 120", "Respiratory", "ambient", False),
            ("PRED-10", "Prednisolone 10mg", "Wysolone 10", "Steroids", "ambient", False),
            ("DEXA-4", "Dexamethasone 4mg Injection", "Dexona 4mg", "Steroids", "ambient", True),
            ("HYDRO-100", "Hydrocortisone 100mg Injection", "Primacort 100", "Steroids", "ambient", True),
            ("FOL-5", "Folic Acid 5mg", "Folvite 5", "Vitamins", "ambient", False),
            ("B12-1500", "Methylcobalamin 1500mcg", "Nurokind 1500", "Vitamins", "ambient", False),
            ("CAL-500", "Calcium Carbonate 500mg", "Shelcal 500", "Vitamins", "ambient", False),
            ("VITD-60K", "Cholecalciferol 60000 IU", "Calcirol 60K", "Vitamins", "ambient", False),
            ("ZINC-50", "Zinc Sulphate 50mg", "Zinconia 50", "Vitamins", "ambient", False),
            ("ORS-21", "Oral Rehydration Salts 21.8g", "Electral", "Electrolytes", "ambient", False),
            ("NORF-400", "Norfloxacin 400mg", "Norflox 400", "Antibiotics", "ambient", False),
            ("OFL-200", "Ofloxacin 200mg", "Oflox 200", "Antibiotics", "ambient", False),
            ("METRO-400", "Metronidazole 400mg", "Flagyl 400", "Antibiotics", "ambient", False),
            ("FLUCO-150", "Fluconazole 150mg", "Forcan 150", "Antifungals", "ambient", False),
            ("ITRA-100", "Itraconazole 100mg", "Canditral 100", "Antifungals", "ambient", False),
            ("ALB-400", "Albendazole 400mg", "Zentel 400", "Anthelmintic", "ambient", False),
            ("LORA-2", "Lorazepam 2mg", "Ativan 2", "CNS", "ambient", False),
            ("CLONA-05", "Clonazepam 0.5mg", "Clona 0.5", "CNS", "ambient", False),
            ("ESC-10", "Escitalopram 10mg", "Nexito 10", "CNS", "ambient", False),
            ("SER-50", "Sertraline 50mg", "Zosert 50", "CNS", "ambient", False),
        ]
        all_skus = sku_definitions + drug_templates
        assert len(all_skus) == 60, f"Expected 60 SKUs, got {len(all_skus)}"

        products = []
        suppliers = []
        for sku, mol, brand, cat, storage, critical in all_skus:
            products.append(Product(
                sku=sku,
                molecule=mol,
                brand=brand,
                category=cat,
                storage=storage,
                critical_drug=critical,
            ))
            # Seed Supplier info
            lead = 9 if sku == "ADREN-01" else (8 if sku == "AMOX-625" else random.choice([5, 7, 10, 14]))
            ret_win = 64 if sku == "OMEP-20" else random.choice([45, 60, 90, 120])
            credit_p = 0.60 if sku in ["OMEP-20", "AMOX-625"] else 0.50
            unit_cost = 120.0 if sku == "AMOX-625" else (45.0 if sku == "OMEP-20" else float(random.randint(25, 250)))

            suppliers.append(Supplier(
                manufacturer=f"Arogya {cat} Labs Pvt Ltd",
                sku=sku,
                lead_time_days=lead,
                moq=random.choice([100, 200, 500]),
                return_window_days=ret_win,
                credit_pct=credit_p,
                unit_cost=unit_cost,
            ))

        db.add_all(products)
        db.add_all(suppliers)
        db.commit()
        print(f"Seeded {len(products)} products and suppliers.")

        # 3. Seed Inventory Batches & Dispatches
        inventory_batches = []
        dispatches = []

        # --- SCENARIO 1: S1 Recall Setup ---
        # SKU: AMOX-625
        # Batch B2231 in WH-1 qty 180, active
        # Dispatched in last 30 days: 640 units to 23 chemists + 2 hospitals
        # Clean batch B2240 in WH-1 qty 400 (later expiry)
        inventory_batches.append(BatchInventory(
            sku="AMOX-625",
            batch="B2231",
            warehouse="WH-1",
            cold_room=None,
            qty=180,
            mfg_date=today - timedelta(days=120),
            expiry_date=today + timedelta(days=240),
            status="active",
        ))
        inventory_batches.append(BatchInventory(
            sku="AMOX-625",
            batch="B2240",
            warehouse="WH-1",
            cold_room=None,
            qty=400,
            mfg_date=today - timedelta(days=30),
            expiry_date=today + timedelta(days=365),
            status="active",
        ))

        # Dispatches for B2231:
        # Exactly 2 hospitals: HOSP-001 gets 120, HOSP-002 gets 120 (total 240)
        # Exactly 23 chemists: CHEM-001 to CHEM-023
        # 400 units among 23 chemists: 17 * 17 = 289; 6 * 18 = 108; remaining 3 units added to CHEM-001..003
        # Let's verify sum: 120 + 120 + 400 = 640
        dispatches.append(Dispatch(
            date=today - timedelta(days=12),
            customer_id="HOSP-001",
            sku="AMOX-625",
            batch="B2231",
            qty=120,
            from_warehouse="WH-1",
        ))
        dispatches.append(Dispatch(
            date=today - timedelta(days=8),
            customer_id="HOSP-002",
            sku="AMOX-625",
            batch="B2231",
            qty=120,
            from_warehouse="WH-1",
        ))

        chem_qtys = [17] * 23
        remaining_chem_qty = 400 - (17 * 23)  # 400 - 391 = 9
        for i in range(remaining_chem_qty):
            chem_qtys[i] += 1
        assert sum(chem_qtys) == 400, "Chemist allocation for B2231 must equal 400"

        for idx, q in enumerate(chem_qtys, 1):
            disp_date = today - timedelta(days=random.randint(1, 28))
            dispatches.append(Dispatch(
                date=disp_date,
                customer_id=f"CHEM-{idx:03d}",
                sku="AMOX-625",
                batch="B2231",
                qty=q,
                from_warehouse="WH-1",
            ))

        # Additional dispatches for AMOX-625 over 60 days to reach normal demand ≈ 21/day
        # Total needed over 60 days ≈ 1260 units. B2231 had 640. We add ~620 from an older batch B2210.
        inventory_batches.append(BatchInventory(
            sku="AMOX-625",
            batch="B2210",
            warehouse="WH-1",
            cold_room=None,
            qty=0,
            mfg_date=today - timedelta(days=250),
            expiry_date=today + timedelta(days=60),
            status="active",
        ))
        for d in range(31, 60):
            dispatches.append(Dispatch(
                date=today - timedelta(days=d),
                customer_id=f"CHEM-{(d % 50) + 1:03d}",
                sku="AMOX-625",
                batch="B2210",
                qty=21,
                from_warehouse="WH-1",
            ))

        # --- SCENARIO 2: S2 Cold Breach Setup ---
        # WH-2 Cold Room 1 reads 9.4°C for 140 min overnight, touching 3 batches (one critical drug)
        # Batches in WH-2 Cold Room 1:
        inventory_batches.append(BatchInventory(
            sku="INSULIN-R",  # Critical drug
            batch="CR-B101",
            warehouse="WH-2",
            cold_room="Cold Room 1",
            qty=150,
            mfg_date=today - timedelta(days=60),
            expiry_date=today + timedelta(days=300),
            status="active",
        ))
        inventory_batches.append(BatchInventory(
            sku="ATRO-05",  # Critical drug
            batch="CR-B102",
            warehouse="WH-2",
            cold_room="Cold Room 1",
            qty=80,
            mfg_date=today - timedelta(days=90),
            expiry_date=today + timedelta(days=210),
            status="active",
        ))
        inventory_batches.append(BatchInventory(
            sku="TET-VAC",  # Non-critical 2-8C vaccine
            batch="CR-B103",
            warehouse="WH-2",
            cold_room="Cold Room 1",
            qty=220,
            mfg_date=today - timedelta(days=40),
            expiry_date=today + timedelta(days=180),
            status="active",
        ))

        # Temp logs for WH-2 Cold Room 1
        # Overnight breach on today: 01:00 to 03:20 (140 minutes) at 9.4°C (interval >8C for >= 30 min)
        temp_logs = []
        base_time = datetime(today.year, today.month, today.day, 0, 0, 0, tzinfo=timezone.utc)
        for m in range(0, 24 * 60, 10):  # Every 10 mins
            log_time = base_time + timedelta(minutes=m)
            # 01:00 is minute 60, 03:20 is minute 200 (140 min duration)
            if 60 <= m < 200:
                temp = 9.4
            else:
                temp = 4.8 + (random.randint(-5, 5) * 0.1)
            temp_logs.append(TempLog(
                warehouse="WH-2",
                cold_room="Cold Room 1",
                ts=log_time,
                temp_c=round(temp, 2),
            ))

        # Compliant temp logs for other cold rooms
        for wh in ["WH-1", "WH-3"]:
            for m in range(0, 24 * 60, 60):  # Every hour
                log_time = base_time + timedelta(minutes=m)
                temp_logs.append(TempLog(
                    warehouse=wh,
                    cold_room="Cold Room 1",
                    ts=log_time,
                    temp_c=4.5,
                ))

        db.add_all(temp_logs)

        # --- SCENARIO 3: S3 Near Expiry Setup ---
        # Batch of 900 strips, 70 days to expiry, velocity 6/day; manufacturer return window closes in 6 days; credit 60%
        # SKU: OMEP-20
        inventory_batches.append(BatchInventory(
            sku="OMEP-20",
            batch="NE-881",
            warehouse="WH-1",
            cold_room=None,
            qty=900,
            mfg_date=today - timedelta(days=300),
            expiry_date=today + timedelta(days=70),
            status="active",
        ))
        # Dispatches in last 60 days: 360 units (= 6/day velocity)
        for d in range(1, 61):
            dispatches.append(Dispatch(
                date=today - timedelta(days=d),
                customer_id=f"CHEM-{(d % 80) + 1:03d}",
                sku="OMEP-20",
                batch="NE-881",
                qty=6,
                from_warehouse="WH-1",
            ))

        # --- SCENARIO 4: S4 FEFO Setup ---
        # Newer batch dispatched while older batch of same SKU/warehouse sits unsold with qty > 0 within last 14 days
        # SKU: AZITH-500 in WH-1
        # Older batch sits unsold:
        inventory_batches.append(BatchInventory(
            sku="AZITH-500",
            batch="FEFO-OLD",
            warehouse="WH-1",
            cold_room=None,
            qty=160,
            mfg_date=today - timedelta(days=200),
            expiry_date=today + timedelta(days=60),
            status="active",
        ))
        # Newer batch:
        inventory_batches.append(BatchInventory(
            sku="AZITH-500",
            batch="FEFO-NEW",
            warehouse="WH-1",
            cold_room=None,
            qty=350,
            mfg_date=today - timedelta(days=40),
            expiry_date=today + timedelta(days=360),
            status="active",
        ))
        # Newer batch dispatched 50 units 3 days ago!
        dispatches.append(Dispatch(
            date=today - timedelta(days=3),
            customer_id="CHEM-025",
            sku="AZITH-500",
            batch="FEFO-NEW",
            qty=50,
            from_warehouse="WH-1",
        ))

        # --- SCENARIO 5: S5 Critical Shortage Setup ---
        # Critical drug with 4 days of cover, supplier lead time 9 days, no open PO in time
        # SKU: ADREN-01 (critical_drug = True)
        # Average daily demand = 20 units/day, current stock = 80 units (80 / 20 = 4 days cover)
        inventory_batches.append(BatchInventory(
            sku="ADREN-01",
            batch="ADR-BATCH1",
            warehouse="WH-1",
            cold_room="Cold Room 1",
            qty=80,
            mfg_date=today - timedelta(days=60),
            expiry_date=today + timedelta(days=180),
            status="active",
        ))
        # Dispatches establishing 20/day demand in last 60 days (total 1200 units)
        for d in range(1, 61):
            dispatches.append(Dispatch(
                date=today - timedelta(days=d),
                customer_id=f"HOSP-{(d % 15) + 1:03d}",
                sku="ADREN-01",
                batch="ADR-OLD",
                qty=20,
                from_warehouse="WH-1",
            ))
        # No PO arriving in time (either empty or arriving in 20 days)
        db.add(PurchaseOrder(
            po="PO-ADR-901",
            manufacturer="Arogya Cardiac Labs Pvt Ltd",
            sku="ADREN-01",
            qty=200,
            expected_date=today + timedelta(days=25),
            status="ordered",
            draft=False,
        ))

        # --- SCENARIO 6: S6 Decoy Setup ---
        # Batch with 20 months to expiry and strong velocity — must NOT be flagged
        # SKU: PARACET-650
        inventory_batches.append(BatchInventory(
            sku="PARACET-650",
            batch="DECOY-999",
            warehouse="WH-1",
            cold_room=None,
            qty=3000,
            mfg_date=today - timedelta(days=30),
            expiry_date=today + timedelta(days=600),  # 20 months
            status="active",
        ))
        # Strong velocity: 50 units/day over last 60 days
        for d in range(1, 61):
            dispatches.append(Dispatch(
                date=today - timedelta(days=d),
                customer_id=f"CHEM-{(d % 100) + 1:03d}",
                sku="PARACET-650",
                batch="DECOY-999",
                qty=50,
                from_warehouse="WH-1",
            ))

        # Populate remaining SKUs with ~3 batches per SKU and 90 days of normal dispatches
        batch_counter = 1000
        for sku, mol, brand, cat, storage, critical in all_skus:
            # Skip the ones we custom configured
            if sku in ["AMOX-625", "INSULIN-R", "OMEP-20", "AZITH-500", "ADREN-01", "PARACET-650", "ATRO-05", "TET-VAC"]:
                continue

            for b_idx in range(1, 4):
                batch_counter += 1
                b_name = f"BAT-{batch_counter}"
                wh = warehouses[b_idx % len(warehouses)]
                room = "Cold Room 1" if storage == "2-8C" else None
                mfg = today - timedelta(days=random.randint(60, 200))
                exp = today + timedelta(days=random.randint(200, 500))
                qty = random.randint(300, 1500)

                inventory_batches.append(BatchInventory(
                    sku=sku,
                    batch=b_name,
                    warehouse=wh,
                    cold_room=room,
                    qty=qty,
                    mfg_date=mfg,
                    expiry_date=exp,
                    status="active",
                ))

                # Dispatches for this batch over last 90 days
                num_dispatches = random.randint(5, 15)
                for _ in range(num_dispatches):
                    disp_day = random.randint(1, 90)
                    cust = f"HOSP-{random.randint(1, 20):03d}" if critical and random.random() < 0.6 else f"CHEM-{random.randint(1, 400):03d}"
                    dispatches.append(Dispatch(
                        date=today - timedelta(days=disp_day),
                        customer_id=cust,
                        sku=sku,
                        batch=b_name,
                        qty=random.randint(10, 40),
                        from_warehouse=wh,
                    ))

        db.add_all(inventory_batches)
        db.add_all(dispatches)
        db.commit()
        print(f"Seeded {len(inventory_batches)} batches and {len(dispatches)} dispatches.")

        # 4. Backfill Initial Seed Events into Ledger
        print("Backfilling foundational seed events to ledger...")
        # Significant receipt events
        key_batches = [
            ("AMOX-625", "B2231", "WH-1", 180),
            ("AMOX-625", "B2240", "WH-1", 400),
            ("INSULIN-R", "CR-B101", "WH-2", 150),
            ("ATRO-05", "CR-B102", "WH-2", 80),
            ("OMEP-20", "NE-881", "WH-1", 900),
            ("AZITH-500", "FEFO-OLD", "WH-1", 160),
            ("AZITH-500", "FEFO-NEW", "WH-1", 350),
            ("ADREN-01", "ADR-BATCH1", "WH-1", 80),
            ("PARACET-650", "DECOY-999", "WH-1", 3000),
        ]
        for sku, batch, wh, q in key_batches:
            append_ledger_event(
                db=db,
                event_type="BATCH_RECEIVED",
                payload={"sku": sku, "batch": batch, "warehouse": wh, "qty": q, "status": "active"},
                ts=datetime.now(timezone.utc).isoformat(),
                trigger_auto_anchor=False,
            )

        # Hospital and key dispatches for B2231
        append_ledger_event(
            db=db,
            event_type="DISPATCHED",
            payload={"batch": "B2231", "customer_id": "HOSP-001", "qty": 120, "sku": "AMOX-625"},
            ts=datetime.now(timezone.utc).isoformat(),
            trigger_auto_anchor=False,
        )
        append_ledger_event(
            db=db,
            event_type="DISPATCHED",
            payload={"batch": "B2231", "customer_id": "HOSP-002", "qty": 120, "sku": "AMOX-625"},
            ts=datetime.now(timezone.utc).isoformat(),
            trigger_auto_anchor=False,
        )

        # Cold breach event
        append_ledger_event(
            db=db,
            event_type="TEMP_BREACH_FLAGGED",
            payload={"warehouse": "WH-2", "cold_room": "Cold Room 1", "temp_c": 9.4, "duration_minutes": 140},
            ts=datetime.now(timezone.utc).isoformat(),
            trigger_auto_anchor=True,
        )

        db.commit()
        print("Seed completed successfully!")

    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TraceRx Seed Script")
    parser.add_argument("--reset", action="store_true", default=True, help="Reset database and seed")
    args = parser.parse_args()
    run_seed(reset=args.reset)
