import os
from datetime import date
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./tracerx.db")
    TODAY_STR: str = os.getenv("TODAY", "2026-10-09")
    
    # LLM Settings
    ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY", None)
    
    # Blockchain Settings
    CHAIN_RPC_URL: Optional[str] = os.getenv("CHAIN_RPC_URL", None)
    CHAIN_PRIVATE_KEY: Optional[str] = os.getenv("CHAIN_PRIVATE_KEY", None)
    ANCHOR_CONTRACT_ADDRESS: Optional[str] = os.getenv("ANCHOR_CONTRACT_ADDRESS", None)
    
    # Engine parameters
    SAFETY_WEIGHT: float = 0.4
    TIME_PRESSURE_WEIGHT: float = 0.3
    VALUE_AT_RISK_WEIGHT: float = 0.2
    BREADTH_WEIGHT: float = 0.1
    
    # Uplift factors for near-expiry discounting
    VELOCITY_UPLIFT_10: float = 1.25
    VELOCITY_UPLIFT_20: float = 1.60
    VELOCITY_UPLIFT_30: float = 2.10

    @property
    def today(self) -> date:
        return date.fromisoformat(self.TODAY_STR)


settings = Settings()
