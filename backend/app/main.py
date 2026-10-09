from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.db import get_db, engine, Base
from app.models import Ledger
from app.config import settings

# Create tables if not existing
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TraceRx Agentic Compliance Desk",
    description="Agentic compliance desk for Arogya Pharma Distributors with tamper-evident audit ledger and EVM anchoring",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    ledger_count = db.query(Ledger).count()
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "today_configured": settings.TODAY_STR,
        "database": "connected",
        "ledger_entries": ledger_count,
        "llm_configured": bool(settings.ANTHROPIC_API_KEY),
        "chain_configured": bool(settings.CHAIN_RPC_URL and settings.CHAIN_PRIVATE_KEY),
        "version": "1.0.0",
    }
