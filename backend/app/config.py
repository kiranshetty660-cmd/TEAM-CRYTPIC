import os
from datetime import date
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./tracerx.db")
    TODAY_STR: str = os.getenv("TODAY", "2026-10-09")
    
    # LLM Settings (NVIDIA NIM primary, Anthropic fallback)
    NVIDIA_API_KEY: Optional[str] = os.getenv("NVIDIA_API_KEY", None)
    NVIDIA_BASE_URL: str = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    NVIDIA_MODEL: str = os.getenv("NVIDIA_MODEL", "z-ai/glm-5.3")
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

    # LiveKit & Local Voice AI Settings (Exotel removed per requirement)
    TELEPHONY_PROVIDER: str = os.getenv("TELEPHONY_PROVIDER", "livekit")  # 'livekit', 'simulator', 'sip'
    LIVEKIT_URL: str = os.getenv("LIVEKIT_URL", "wss://tracerx-demo.livekit.cloud")
    LIVEKIT_API_KEY: Optional[str] = os.getenv("LIVEKIT_API_KEY", None)
    LIVEKIT_API_SECRET: Optional[str] = os.getenv("LIVEKIT_API_SECRET", None)

    # Open-Source Local Voice & AI Engines
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2:latest")
    STT_MODEL: str = os.getenv("STT_MODEL", "whisper-base")
    TTS_MODEL: str = os.getenv("TTS_MODEL", "piper-en_US-lessac-medium")

    # Optional Asterisk / SIP Telephony Adapter (Future carrier connectivity)
    SIP_HOST: Optional[str] = os.getenv("SIP_HOST", None)
    SIP_PORT: int = int(os.getenv("SIP_PORT", "5060"))
    SIP_USERNAME: Optional[str] = os.getenv("SIP_USERNAME", None)
    SIP_PASSWORD: Optional[str] = os.getenv("SIP_PASSWORD", None)

    CALLING_CONCURRENCY_LIMIT: int = int(os.getenv("CALLING_CONCURRENCY_LIMIT", "5"))
    CALLING_MAX_RETRIES: int = int(os.getenv("CALLING_MAX_RETRIES", "3"))

    # Email Notification Settings
    OWNER_ADMIN_EMAIL: str = os.getenv("OWNER_ADMIN_EMAIL", "chethuc809@gmail.com")
    EMAIL_PROVIDER: str = os.getenv("EMAIL_PROVIDER", "simulator")  # 'smtp', 'sendgrid', 'resend', 'simulator'
    SMTP_HOST: Optional[str] = os.getenv("SMTP_HOST", "smtp.tracerx.arogyapharma.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: Optional[str] = os.getenv("SMTP_USER", None)
    SMTP_PASSWORD: Optional[str] = os.getenv("SMTP_PASSWORD", None)
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "compliance@tracerx.arogyapharma.com")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "TraceRx Quality & Compliance")
    SENDGRID_API_KEY: Optional[str] = os.getenv("SENDGRID_API_KEY", None)
    RESEND_API_KEY: Optional[str] = os.getenv("RESEND_API_KEY", None)

    # SMS Notification Settings
    SMS_PROVIDER: str = os.getenv("SMS_PROVIDER", "simulator")  # 'msg91', 'twilio', 'fast2sms', 'simulator'
    SMS_SENDER_ID: str = os.getenv("SMS_SENDER_ID", "TRACERX")  # 6-char registered DLT sender header
    SMS_DLT_TE_ID: Optional[str] = os.getenv("SMS_DLT_TE_ID", "1007161234567890123")  # Approved DLT Template ID
    MSG91_AUTH_KEY: Optional[str] = os.getenv("MSG91_AUTH_KEY", None)
    MSG91_FLOW_ID: Optional[str] = os.getenv("MSG91_FLOW_ID", None)
    TWILIO_ACCOUNT_SID: Optional[str] = os.getenv("TWILIO_ACCOUNT_SID", None)
    TWILIO_AUTH_TOKEN: Optional[str] = os.getenv("TWILIO_AUTH_TOKEN", None)
    TWILIO_FROM_NUMBER: Optional[str] = os.getenv("TWILIO_FROM_NUMBER", None)
    FAST2SMS_API_KEY: Optional[str] = os.getenv("FAST2SMS_API_KEY", None)

    # Incident Portal Link for SMS
    PORTAL_BASE_URL: str = os.getenv("PORTAL_BASE_URL", "http://localhost:3000")

    @property
    def today(self) -> date:
        return date.fromisoformat(self.TODAY_STR)


settings = Settings()

