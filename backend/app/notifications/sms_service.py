import re
import json
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from urllib import request as url_request, parse as url_parse, error as url_error

from app.config import settings


def clean_and_validate_indian_phone(raw_phone: Optional[str]) -> Tuple[bool, str, Optional[str]]:
    """
    Cleans and validates an Indian mobile number.
    Returns: (is_valid, standardized_format_e164, error_reason)
    Indian mobile numbers are 10 digits starting with 6, 7, 8, or 9.
    Standardized format returned is +91XXXXXXXXXX.
    """
    if not raw_phone:
        return False, "", "Missing phone number"

    # Strip whitespace, hyphens, brackets, dots
    digits = re.sub(r"[^\d+]", "", str(raw_phone).strip())

    # Handle leading +91 or 91 or 0
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]

    # Remove any remaining leading '+'
    digits = digits.lstrip("+")

    if len(digits) != 10:
        return False, raw_phone, f"Expected 10-digit mobile number, got {len(digits)} digits"

    if digits[0] not in "6789":
        return False, raw_phone, f"Indian mobile numbers must start with 6, 7, 8, or 9 (got '{digits[0]}')"

    standardized = f"+91{digits}"
    return True, standardized, None


def format_dlt_recall_sms(
    sku: str,
    batch: str,
    incident_id: str,
    portal_url: Optional[str] = None,
) -> str:
    """
    Formats an India DLT-compliant SMS text.
    Standard Header: TRACERX
    DLT Template Category: Service Implicit / Transactional Recall
    Characters: <= 160 chars for single-segment transmission.
    """
    base_url = portal_url or f"{settings.PORTAL_BASE_URL}/notifications?incident={incident_id}"
    return (
        f"URGENT PHARMA RECALL: Batch {batch} of {sku} flagged. "
        f"Quarantine stock immediately. Ref: {incident_id}. "
        f"Verify: {base_url} - TraceRx Arogya"
    )


class SMSDispatchResult:
    def __init__(
        self,
        status: str,  # 'queued', 'sent', 'delivered', 'failed'
        provider_message_id: Optional[str] = None,
        error_message: Optional[str] = None,
        provider: str = "simulator",
        dlt_compliant: bool = True,
        timestamp: Optional[datetime] = None,
    ):
        self.status = status
        self.provider_message_id = provider_message_id
        self.error_message = error_message
        self.provider = provider
        self.dlt_compliant = dlt_compliant
        self.timestamp = timestamp or datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "provider_message_id": self.provider_message_id,
            "error_message": self.error_message,
            "provider": self.provider,
            "dlt_compliant": self.dlt_compliant,
            "timestamp": self.timestamp.isoformat(),
        }


class BaseSMSProvider(ABC):
    @abstractmethod
    def send_sms(
        self,
        to_phone: str,
        recipient_name: str,
        text: str,
        template_id: Optional[str] = None,
        incident_id: str = "",
        campaign_id: str = "",
    ) -> SMSDispatchResult:
        """Dispatches an SMS and returns the provider dispatch result."""
        pass


class SimulatorSMSProvider(BaseSMSProvider):
    """
    In-memory SMS provider for automated testing, evaluation, and local development.
    Does not make external telco network requests.
    Supports inspecting dispatched messages and simulating network errors.
    """
    def __init__(self):
        self.dispatched_messages: List[Dict[str, Any]] = []
        self.forced_failure: bool = False
        self.failure_numbers: set = set()

    def send_sms(
        self,
        to_phone: str,
        recipient_name: str,
        text: str,
        template_id: Optional[str] = None,
        incident_id: str = "",
        campaign_id: str = "",
    ) -> SMSDispatchResult:
        now = datetime.now(timezone.utc)
        is_valid, standardized_phone, err = clean_and_validate_indian_phone(to_phone)
        if not is_valid:
            return SMSDispatchResult(
                status="failed",
                error_message=f"Phone validation failed: {err}",
                provider="simulator",
                dlt_compliant=False,
                timestamp=now,
            )

        if self.forced_failure or standardized_phone in self.failure_numbers:
            return SMSDispatchResult(
                status="failed",
                error_message="Simulated telco carrier timeout (Temporary delivery routing failure)",
                provider="simulator",
                dlt_compliant=True,
                timestamp=now,
            )

        provider_msg_id = f"SIM-SMS-{uuid.uuid4().hex[:10].upper()}"
        record = {
            "provider_message_id": provider_msg_id,
            "to_phone": standardized_phone,
            "recipient_name": recipient_name,
            "text": text,
            "template_id": template_id or settings.SMS_DLT_TE_ID,
            "incident_id": incident_id,
            "campaign_id": campaign_id,
            "status": "queued",  # Never claim delivered until confirmed by delivery callback/check
            "timestamp": now.isoformat(),
        }
        self.dispatched_messages.append(record)

        return SMSDispatchResult(
            status="queued",
            provider_message_id=provider_msg_id,
            provider="simulator",
            dlt_compliant=True,
            timestamp=now,
        )


class TwilioSMSProvider(BaseSMSProvider):
    """Twilio SMS REST API adapter."""
    def send_sms(
        self,
        to_phone: str,
        recipient_name: str,
        text: str,
        template_id: Optional[str] = None,
        incident_id: str = "",
        campaign_id: str = "",
    ) -> SMSDispatchResult:
        now = datetime.now(timezone.utc)
        is_valid, standardized_phone, err = clean_and_validate_indian_phone(to_phone)
        if not is_valid:
            return SMSDispatchResult(
                status="failed",
                error_message=f"Invalid phone: {err}",
                provider="twilio",
                timestamp=now,
            )

        sid = settings.TWILIO_ACCOUNT_SID
        token = settings.TWILIO_AUTH_TOKEN
        from_num = settings.TWILIO_FROM_NUMBER or settings.SMS_SENDER_ID
        if not sid or not token:
            return SMSDispatchResult(
                status="failed",
                error_message="Twilio credentials not configured in environment.",
                provider="twilio",
                timestamp=now,
            )

        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
        data = url_parse.urlencode({
            "To": standardized_phone,
            "From": from_num,
            "Body": text,
            "StatusCallback": f"{settings.PORTAL_BASE_URL}/api/notifications/webhook/delivery?channel=sms",
        }).encode("utf-8")

        import base64
        auth_header = "Basic " + base64.b64encode(f"{sid}:{token}".encode("ascii")).decode("ascii")
        req = url_request.Request(url, data=data, headers={"Authorization": auth_header}, method="POST")

        try:
            with url_request.urlopen(req, timeout=10) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                msg_sid = resp_json.get("sid", f"TW-{uuid.uuid4().hex[:10]}")
                return SMSDispatchResult(
                    status="queued",
                    provider_message_id=msg_sid,
                    provider="twilio",
                    timestamp=now,
                )
        except url_error.HTTPError as he:
            err_body = he.read().decode("utf-8", errors="ignore")
            return SMSDispatchResult(
                status="failed",
                error_message=f"Twilio HTTP {he.code}: {err_body}",
                provider="twilio",
                timestamp=now,
            )
        except Exception as ex:
            return SMSDispatchResult(
                status="failed",
                error_message=f"Twilio connection error: {str(ex)}",
                provider="twilio",
                timestamp=now,
            )


class MSG91SMSProvider(BaseSMSProvider):
    """MSG91 India DLT Flow API adapter."""
    def send_sms(
        self,
        to_phone: str,
        recipient_name: str,
        text: str,
        template_id: Optional[str] = None,
        incident_id: str = "",
        campaign_id: str = "",
    ) -> SMSDispatchResult:
        now = datetime.now(timezone.utc)
        is_valid, standardized_phone, err = clean_and_validate_indian_phone(to_phone)
        if not is_valid:
            return SMSDispatchResult(
                status="failed",
                error_message=f"Invalid phone: {err}",
                provider="msg91",
                dlt_compliant=False,
                timestamp=now,
            )

        auth_key = settings.MSG91_AUTH_KEY
        flow_id = settings.MSG91_FLOW_ID
        if not auth_key or not flow_id:
            return SMSDispatchResult(
                status="failed",
                error_message="MSG91 AUTH_KEY or FLOW_ID not configured.",
                provider="msg91",
                timestamp=now,
            )

        # MSG91 expects number without '+'
        mobile = standardized_phone.replace("+", "")
        payload = {
            "flow_id": flow_id,
            "sender": settings.SMS_SENDER_ID,
            "mobiles": mobile,
            "VAR1": text,
            "VAR2": incident_id,
        }

        req = url_request.Request(
            "https://api.msg91.com/api/v5/flow/",
            data=json.dumps(payload).encode("utf-8"),
            headers={"authkey": auth_key, "content-type": "application/json"},
            method="POST",
        )

        try:
            with url_request.urlopen(req, timeout=10) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                req_id = resp_json.get("message", f"M91-{uuid.uuid4().hex[:10]}")
                return SMSDispatchResult(
                    status="queued",
                    provider_message_id=str(req_id),
                    provider="msg91",
                    dlt_compliant=True,
                    timestamp=now,
                )
        except Exception as ex:
            return SMSDispatchResult(
                status="failed",
                error_message=f"MSG91 transmission error: {str(ex)}",
                provider="msg91",
                timestamp=now,
            )


# Global simulator instance
_SIMULATOR_SMS_INSTANCE = SimulatorSMSProvider()


def get_sms_provider() -> BaseSMSProvider:
    """Factory selecting the SMS provider configured in settings."""
    provider_name = (settings.SMS_PROVIDER or "simulator").lower().strip()
    if provider_name == "twilio":
        return TwilioSMSProvider()
    elif provider_name == "msg91":
        return MSG91SMSProvider()
    return _SIMULATOR_SMS_INSTANCE
