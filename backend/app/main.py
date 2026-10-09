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
)

# Ensure tables exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TraceRx Agentic Compliance Desk",
    description="Agentic compliance desk for Arogya Pharma Distributors with tamper-evident audit ledger and EVM anchoring",
    version="1.0.0",
)

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
