# TraceRx — Agentic Compliance Desk
> **Cypher 2026 Hackathon | Challenge 07: "Batch B2231" | Arogya Pharma Distributors**

TraceRx is an agentic compliance intelligence desk for a regional pharmaceutical distributor overseeing **3 warehouses (Bengaluru, Hubballi, Mysuru), 400 retail chemists, and 20 major tertiary hospitals**.

It continuously evaluates batch-level telemetry, diagnoses compliance risks across 6 critical operational vectors, generates mathematical option comparators, and drafts mitigation actions with strict **Human-in-the-Loop (HITL)** role gating. Every state change is immutably committed to an append-only **SHA-256 hash-chained audit ledger** with periodic **Merkle root anchoring to the Polygon Amoy testnet** (with simulated fallback).

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Data Sources & Telemetry
        WMS[WMS ERP Inventory]
        DISP[90-Day Dispatches]
        IOT[Cold Room IoT Sensors]
        SUPP[Manufacturer Supply Contracts]
        REG[Regulatory Recall Notices]
    end

    subgraph Deterministic Detectors & Rules
        D1[Recall Detector]
        D2[Cold Chain Excursion Detector]
        D3[Near-Expiry & RMA Detector]
        D4[FEFO Pick Violation Detector]
        D5[Critical Shortage Detector]
    end

    subgraph Decision Engine
        RANK[Multi-Criteria Ranking Engine]
        OPT[Mathematical Options Comparator]
        ALLOC[Bounded Stock Allocation Engine]
    end

    subgraph Agentic Reasoning Loop
        LOOP["Observe → Reason → Evaluate → Decide → Act (Draft) → Explain"]
        LLM["Anthropic Claude 3.5 / Fallback Templates"]
    end

    subgraph Human Authorization Gate
        ROLE["Role Gate: Pharmacist | Compliance | Purchase | Warehouse"]
        ACTION[Pending Action Queue]
    end

    subgraph Audit & Blockchain Ledger
        LEDGER[Append-Only SHA-256 Hash Chain]
        MERKLE[Merkle Root Aggregator]
        CHAIN["EVM Anchor Contract (Polygon Amoy / Simulated)"]
    end

    Data Sources & Telemetry --> Deterministic Detectors & Rules
    Deterministic Detectors & Rules --> Decision Engine
    Decision Engine --> Agentic Reasoning Loop
    Agentic Reasoning Loop --> LLM
    LLM --> ACTION
    ACTION --> ROLE
    ROLE -- "Approved / Executed" --> LEDGER
    LEDGER --> MERKLE
    MERKLE --> CHAIN
```

---

## ⚡ Quick Start & Run Commands

### Method A: One-Click Windows Launch
Double-click `run_all.bat` or run in terminal:
```powershell
.\run_all.bat
```
This spawns:
- **Backend API Server**: `http://localhost:8000` (FastAPI with OpenAPI docs at `http://localhost:8000/docs`)
- **Frontend Web App**: `http://localhost:3000` (Next.js 14 App Router)

### Method B: Manual Command Line Execution

#### 1. Backend Setup
```powershell
cd backend
.\venv\Scripts\activate
# (Optional reset & re-seed): python -m app.seed.seed --reset
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup
```powershell
cd frontend
npm run dev
```

#### 3. Run Test Suite
```powershell
cd backend
.\venv\Scripts\activate
pytest -v
```

### Method C: Docker Compose
```bash
docker compose up --build
```

---

## 👥 Seeded Demo Personas (Role Switcher)

TraceRx implements role-gated approvals. Use the **Role Switcher** in the top navigation bar to test authorization rules:

| Persona Name | Role Key | Title / Responsibilities | Authorized Actions |
|---|---|---|---|
| **Dr. Sneha Rao** | `pharmacist` | Chief Pharmacist (Responsible Person) | `BLOCK_BATCH`, `QUARANTINE_FOR_QA`, `SEND_NOTICES` |
| **Arun Kumar** | `compliance` | Regulatory Compliance Lead | Full approval override across all action types |
| **Pooja Sharma** | `purchase` | Procurement & Purchase Manager | `URGENT_PO`, `TRANSFER`, `RETURN_REQUEST`, `DISCOUNT_OFFER` |
| **Vikram Singh** | `warehouse` | Distribution & Warehouse Operations Head | `PICK_INSTRUCTION` (FEFO enforcement) |
| **Devika Menon** | `auditor` | External Qualified Auditor | Read-only ledger inspection, verification & anchoring |

---

## 🧪 4-Minute End-to-End Demo Script

1. **Board Overview (`http://localhost:3000`)**:
   - Inspect the top KPI strip: Open Recalls, Cold Breaches, ₹ Value at Risk, and Pending Approvals.
   - Click **"Replay B2231 Recall"** to simulate an incoming Class II regulatory recall alert for Amoxiclav 625 batch `B2231`.
2. **Deep Batch Trace (`/trace`)**:
   - Trace batch `B2231`: verify **180 units in WH-1**, **640 units dispatched in last 30d across 25 accounts** (exactly 2 hospitals + 23 chemists).
   - Review clean batch `B2240` (400 units available in WH-1) and observe the computed network shortfall of 408 units.
3. **Evaluating & Approving Finding (`/findings/FIND-REC-REC-2026-B2231`)**:
   - Inspect the **Deterministic Options Comparison Matrix**: Strategy A (clean batch only, hospital priority), Strategy B (+ expedited PO), and Strategy C (+ inter-warehouse courier).
   - Expand **"Why this finding? (Explain Panel)"** to see mathematical weighting formula and sub-scores.
   - Switch active persona to **Dr. Sneha Rao (Pharmacist)**.
   - Click **"Authorize & Execute"** to lock the batch in ERP and commit the approval event to the ledger.
4. **Cold Chain & Near-Expiry Findings**:
   - Review the **Cold Chain Excursion card**: WH-2 Cold Room 1 excursion (9.4°C for 140 min touching 3 batches including Insulin). Note the strict wording: *"quarantine pending QA review"* without premature clinical verdicts.
   - Review the **Near-Expiry / RMA card**: Omeprazole batch `NE-881` with 70 days shelf life and manufacturer return window closing in 6 days.
5. **Tamper-Evident Ledger & Blockchain Verification (`/verify`)**:
   - Click **"Recompute Chain"**: verify that cryptographic validation is **100% green** across all events.
   - Inspect the **EVM Blockchain Anchors** table displaying Merkle roots and transaction hashes (Polygon Amoy testnet / simulated fallback).
   - Click **"Simulate Tampering (Demo)"**: modifies an event payload in the database.
   - Watch the verification banner instantly turn **RED**, pinpointing the exact corrupted sequence number `#5` and displaying the hash pointer discrepancy!
   - Click **"Restore Clean State"** to restore deterministic integrity.

---

## ⚙️ Environment Variables (`.env`)

See `.env.example` for reference:

```env
# Backend Database
DATABASE_URL=sqlite:///./tracerx.db

# Configured Base Reference Date
TODAY=2026-10-09

# LLM Configuration (Anthropic API - Optional. Falls back to deterministic templates if omitted)
ANTHROPIC_API_KEY=

# Blockchain EVM Configuration (Polygon Amoy Testnet - Optional. Falls back to simulated anchors if omitted)
CHAIN_RPC_URL=https://rpc-amoy.polygon.technology/
CHAIN_PRIVATE_KEY=
ANCHOR_CONTRACT_ADDRESS=

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 📐 Assumptions

1. **Deterministic Numbers Rule**: The LLM NEVER generates numerical estimates, stock counts, financial losses, or clinical evaluations. All numbers originate from SQL queries and mathematical engines (`app/engine/`).
2. **Clinical Safety Verdicts**: In compliance with pharmaceutical regulations (Schedule M & Good Distribution Practices), the agent NEVER proclaims a medicine is "safe" or "unsafe"; it recommends *"quarantine pending QA review"* and delegates disposition to licensed personnel.
3. **Reference Date**: `TODAY` defaults to `2026-10-09` to anchor reproducible scenario testing.
4. **Zero External Lock-in**: Works 100% offline without LLM API keys (using structured deterministic fallback templates) and without live blockchain RPC (using simulated Merkle root anchoring clearly badged in the UI).

---

## 🔍 Known Gaps & Future Work

- **Hardware IoT Integration**: Currently ingests time-series temperature readings from the database; production deployment would connect MQTT broker streams directly from cold room dataloggers.
- **Physical Barcode / GS1 DataMatrix**: Next phase will integrate 2D DataMatrix scanning for mobile warehouse pickers.
