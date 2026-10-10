from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.db import get_db, engine, Base
from app.models import Ledger
from app.config import settings

from app.routers import (
    board,
    batches,
    findings,
    actions,
    recalls,
    ledger,
    data,
    dev,
    cases,
    supply_chain,
    agent_monitor,
    calling,
    incidents,
    recall_demo,
)

# Non-blocking startup & pre-warming
import threading

def _background_startup():
    try:
        Base.metadata.create_all(bind=engine)
        # Safe incremental column migrations compatible with both SQLite and Postgres
        from sqlalchemy import text
        with engine.begin() as conn:
            columns_to_ensure = [
                ("customers", "phone", "VARCHAR(50)"),
                ("customers", "email", "VARCHAR(150)"),
                ("complaints", "incident_source", "VARCHAR(50) DEFAULT 'website_complaint'"),
                ("complaints", "caller_email", "VARCHAR(150)"),
                ("complaints", "warehouse", "VARCHAR(50)"),
                ("complaints", "is_batch_missing", "BOOLEAN DEFAULT 0"),
                ("complaints", "assigned_reviewer", "VARCHAR(100) DEFAULT 'Quality Safety Lead'"),
                ("complaints", "rejection_reason", "TEXT"),
                ("complaints", "approval_history", "TEXT"),
                ("complaints", "affected_customers_summary", "TEXT"),
                ("complaints", "campaign_id", "VARCHAR(50)"),
            ]
            for tbl, col, col_def in columns_to_ensure:
                try:
                    # SQLite PRAGMA check
                    rows = conn.execute(text(f"PRAGMA table_info({tbl});")).fetchall()
                    if rows:
                        col_names = [r[1] for r in rows]
                        if col not in col_names:
                            conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN {col} {col_def};"))
                    else:
                        conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col} {col_def};"))
                except Exception as mig_err:
                    try:
                        conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col} {col_def};"))
                    except Exception:
                        pass

        # Backfill customer contact details if unpopulated
        from app.db import SessionLocal
        from app.models import Customer
        db = SessionLocal()
        custs = db.query(Customer).limit(200).all()
        needs_commit = False
        for idx, c in enumerate(custs, start=1):
            if not c.phone:
                # 1 in 15 intentionally missing phone to test contact validation
                if idx % 15 != 0:
                    c.phone = f"+9198450{idx:05d}"
                    needs_commit = True
            if not c.email:
                # 1 in 10 intentionally missing email to test contact validation
                if idx % 10 != 0:
                    slug = c.name.lower().replace(" ", "").replace("#", "").replace("(", "").replace(")", "")[:12]
                    c.email = f"pharmacy.{slug}@arogyapartner.in"
                    needs_commit = True
        if needs_commit:
            db.commit()

        # Recover any running campaigns on server restart
        from app.calling.campaign_worker import recover_running_campaigns
        recover_running_campaigns()

        from app.routers.board import execute_full_scan
        execute_full_scan(db)
        db.close()
    except Exception as e:
        print(f"Background prewarm note: {e}")

app = FastAPI(
    title="TraceRx Agentic Compliance Desk",
    description="Agentic compliance desk for Arogya Pharma Distributors with tamper-evident audit ledger and EVM anchoring",
    version="1.0.0",
)

@app.on_event("startup")
def startup_event():
    threading.Thread(target=_background_startup, daemon=True).start()

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all feature routers
app.include_router(board.router)
app.include_router(batches.router)
app.include_router(findings.router)
app.include_router(actions.router)
app.include_router(recalls.router)
app.include_router(ledger.router)
app.include_router(data.router)
app.include_router(dev.router)
app.include_router(cases.router)
app.include_router(supply_chain.router)
app.include_router(agent_monitor.router)
app.include_router(calling.router)
app.include_router(incidents.router)
app.include_router(recall_demo.router)

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    ledger_count = db.query(Ledger).count()
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "today_configured": settings.TODAY_STR,
        "database": "connected",
        "ledger_entries": ledger_count,
        "llm_configured": bool(settings.NVIDIA_API_KEY or settings.ANTHROPIC_API_KEY),
        "llm_provider": "nvidia_nim" if settings.NVIDIA_API_KEY else ("anthropic" if settings.ANTHROPIC_API_KEY else "deterministic_fallback"),
        "llm_model": settings.NVIDIA_MODEL if settings.NVIDIA_API_KEY else ("claude-3-5-sonnet-20241022" if settings.ANTHROPIC_API_KEY else None),
        "chain_configured": bool(settings.CHAIN_RPC_URL and settings.CHAIN_PRIVATE_KEY),
        "version": "1.0.0",
    }
