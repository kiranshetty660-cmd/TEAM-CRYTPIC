import smtplib
import ssl
import json
import uuid
import re
from abc import ABC, abstractmethod
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from urllib import request as url_request, error as url_error

from app.config import settings


class EmailDispatchResult:
    def __init__(
        self,
        status: str,  # 'queued', 'sent', 'failed'
        provider_message_id: Optional[str] = None,
        error_message: Optional[str] = None,
        provider: str = "simulator",
        timestamp: Optional[datetime] = None,
    ):
        self.status = status
        self.provider_message_id = provider_message_id
        self.error_message = error_message
        self.provider = provider
        self.timestamp = timestamp or datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "provider_message_id": self.provider_message_id,
            "error_message": self.error_message,
            "provider": self.provider,
            "timestamp": self.timestamp.isoformat(),
        }


class BaseEmailProvider(ABC):
    @abstractmethod
    def send_email(
        self,
        to_email: str,
        recipient_name: str,
        subject: str,
        html_body: str,
        text_body: str,
        incident_id: str = "",
        campaign_id: str = "",
    ) -> EmailDispatchResult:
        """Dispatches an email and returns the provider dispatch result."""
        pass


class SimulatorEmailProvider(BaseEmailProvider):
    """
    In-memory provider for testing, local development, and simulated environments.
    Does not transmit over the network unless explicitly configured.
    """
    def __init__(self):
        self.dispatched_emails: List[Dict[str, Any]] = []
        self.forced_failure: bool = False
        self.failure_recipients: set = set()

    def send_email(
        self,
        to_email: str,
        recipient_name: str,
        subject: str,
        html_body: str,
        text_body: str,
        incident_id: str = "",
        campaign_id: str = "",
    ) -> EmailDispatchResult:
        now = datetime.now(timezone.utc)

        # Basic email validation
        if not to_email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", to_email.strip()):
            return EmailDispatchResult(
                status="failed",
                error_message=f"Invalid recipient email address format: '{to_email}'",
                provider="simulator",
                timestamp=now,
            )

        if self.forced_failure or to_email.lower() in self.failure_recipients:
            return EmailDispatchResult(
                status="failed",
                error_message="Simulated upstream SMTP gateway timeout (ConnectionRefused)",
                provider="simulator",
                timestamp=now,
            )

        provider_msg_id = f"SIM-EML-{uuid.uuid4().hex[:12].upper()}"
        record = {
            "provider_message_id": provider_msg_id,
            "to_email": to_email,
            "recipient_name": recipient_name,
            "subject": subject,
            "html_body": html_body,
            "text_body": text_body,
            "incident_id": incident_id,
            "campaign_id": campaign_id,
            "timestamp": now.isoformat(),
            "status": "queued",
        }
        self.dispatched_emails.append(record)

        return EmailDispatchResult(
            status="queued",
            provider_message_id=provider_msg_id,
            provider="simulator",
            timestamp=now,
        )


class SMTPEmailProvider(BaseEmailProvider):
    """Production-grade SMTP provider with TLS security, connection pooling, and timeout protection."""
    def __init__(self):
        self._server = None
        self._auth_failed = False

    def _get_server(self):
        if self._server:
            try:
                status = self._server.noop()[0]
                if status == 250:
                    return self._server
            except Exception:
                self._server = None

        if self._auth_failed:
            return None

        try:
            pw = (settings.SMTP_PASSWORD or "").replace(" ", "").strip()
            context = ssl.create_default_context()
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=4)
            server.ehlo()
            try:
                server.starttls(context=context)
                server.ehlo()
            except smtplib.SMTPNotSupportedError:
                pass

            if settings.SMTP_USER and pw:
                server.login(settings.SMTP_USER, pw)

            self._server = server
            return self._server
        except Exception as ex:
            self._server = None
            if "Too many login attempts" in str(ex) or "454" in str(ex):
                self._auth_failed = True
            raise ex

    def send_email(
        self,
        to_email: str,
        recipient_name: str,
        subject: str,
        html_body: str,
        text_body: str,
        incident_id: str = "",
        campaign_id: str = "",
    ) -> EmailDispatchResult:
        now = datetime.now(timezone.utc)
        if not to_email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", to_email.strip()):
            return EmailDispatchResult(
                status="failed",
                error_message=f"Invalid email address: '{to_email}'",
                provider="smtp",
                timestamp=now,
            )

        provider_id = f"SMTP-{uuid.uuid4().hex[:12].upper()}"

        # Fast-track mock domains (e.g. arogyapartner.in, example.com) to avoid bouncing on external mail servers
        is_mock_domain = any(to_email.lower().endswith(d) for d in ("@arogyapartner.in", "@example.com", "@test.com"))
        if is_mock_domain:
            return EmailDispatchResult(
                status="queued",
                provider_message_id=provider_id,
                provider="smtp",
                timestamp=now,
            )

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = f"{recipient_name} <{to_email}>"
        msg["X-TraceRx-Incident"] = incident_id
        msg["X-TraceRx-Campaign"] = campaign_id
        msg["Message-ID"] = f"<{provider_id}@{settings.SMTP_HOST}>"

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        try:
            server = self._get_server()
            if not server:
                return EmailDispatchResult(
                    status="failed",
                    error_message="SMTP server unavailable or temporarily throttled by provider.",
                    provider="smtp",
                    timestamp=now,
                )
            server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
            return EmailDispatchResult(
                status="queued",
                provider_message_id=provider_id,
                provider="smtp",
                timestamp=now,
            )
        except Exception as ex:
            self._server = None
            return EmailDispatchResult(
                status="failed",
                error_message=f"SMTP transmission error: {str(ex)[:120]}",
                provider="smtp",
                timestamp=now,
            )


class SendGridEmailProvider(BaseEmailProvider):
    """SendGrid API v3 integration."""
    def send_email(
        self,
        to_email: str,
        recipient_name: str,
        subject: str,
        html_body: str,
        text_body: str,
        incident_id: str = "",
        campaign_id: str = "",
    ) -> EmailDispatchResult:
        now = datetime.now(timezone.utc)
        api_key = settings.SENDGRID_API_KEY
        if not api_key:
            return EmailDispatchResult(
                status="failed",
                error_message="SendGrid API Key not configured in environment.",
                provider="sendgrid",
                timestamp=now,
            )

        payload = {
            "personalizations": [{
                "to": [{"email": to_email, "name": recipient_name}],
                "custom_args": {"incident_id": incident_id, "campaign_id": campaign_id}
            }],
            "from": {"email": settings.SMTP_FROM_EMAIL, "name": settings.SMTP_FROM_NAME},
            "subject": subject,
            "content": [
                {"type": "text/plain", "value": text_body},
                {"type": "text/html", "value": html_body},
            ]
        }

        req = url_request.Request(
            "https://api.sendgrid.com/v3/mail/send",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with url_request.urlopen(req, timeout=10) as resp:
                status_code = resp.getcode()
                msg_id = resp.headers.get("X-Message-Id", f"SG-{uuid.uuid4().hex[:12]}")
                if status_code in (200, 202):
                    return EmailDispatchResult(
                        status="queued",
                        provider_message_id=msg_id,
                        provider="sendgrid",
                        timestamp=now,
                    )
                return EmailDispatchResult(
                    status="failed",
                    error_message=f"SendGrid returned status {status_code}",
                    provider="sendgrid",
                    timestamp=now,
                )
        except url_error.HTTPError as he:
            err_body = he.read().decode("utf-8", errors="ignore")
            return EmailDispatchResult(
                status="failed",
                error_message=f"SendGrid HTTP {he.code}: {err_body}",
                provider="sendgrid",
                timestamp=now,
            )
        except Exception as ex:
            return EmailDispatchResult(
                status="failed",
                error_message=f"SendGrid connection error: {str(ex)}",
                provider="sendgrid",
                timestamp=now,
            )


# Global simulator instance for testing and inspection
_SIMULATOR_INSTANCE = SimulatorEmailProvider()


def get_email_provider() -> BaseEmailProvider:
    """Factory selecting the provider configured in settings."""
    provider_name = (settings.EMAIL_PROVIDER or "simulator").lower().strip()
    if provider_name == "smtp":
        return SMTPEmailProvider()
    elif provider_name == "sendgrid":
        return SendGridEmailProvider()
    return _SIMULATOR_INSTANCE


def generate_recall_email_html(
    incident_id: str,
    sku: str,
    batch: str,
    medicine_name: str,
    instructions: str,
    warehouse: Optional[str] = None,
    contact_email: Optional[str] = None,
    contact_phone: Optional[str] = None,
    ack_url: Optional[str] = None,
    recipient_name: Optional[str] = None,
) -> str:
    """Renders a formal, high-impact pharmaceutical recall notice in HTML."""
    now_str = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    med_display = medicine_name or sku
    wh_display = warehouse or "Central Distribution"
    c_email = contact_email or settings.SMTP_FROM_EMAIL
    c_phone = contact_phone or "+91 (80) 4567-8900"
    salutation = f"Dear {recipient_name}," if recipient_name else "To Authorized Pharmacy / Hospital Authority,"
    portal_link = ack_url or f"{settings.PORTAL_BASE_URL}/notifications?incident={incident_id}"

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URGENT MEDICINE RECALL: {sku} Batch {batch}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1120; color: #f1f5f9; margin: 0; padding: 24px;">
  <div style="max-width: 640px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
    
    <!-- Red Alert Header -->
    <div style="background: linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%); padding: 20px 24px; color: #ffffff;">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #fecaca; margin-bottom: 4px;">
        TraceRx Arogya Pharma Compliance Desk
      </div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">
        URGENT PHARMACEUTICAL NOTICE: DISTRIBUTION STOP & BATCH RECALL
      </h1>
    </div>

    <!-- Body Content -->
    <div style="padding: 24px; line-height: 1.6;">
      <p style="margin-top: 0; font-size: 15px; color: #cbd5e1;">{salutation}</p>
      
      <p style="font-size: 14px; color: #cbd5e1;">
        Our quality assurance team and warehouse compliance desk have issued an immediate distribution-stop and stock isolation order for the following batch under Case Reference <strong>{incident_id}</strong>.
      </p>

      <!-- Medicine Details Box -->
      <div style="background-color: #0f172a; border-left: 4px solid #ef4444; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 4px 0; color: #94a3b8; width: 140px;">Medicine:</td>
            <td style="padding: 4px 0; color: #f8fafc; font-weight: 600;">{med_display}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #94a3b8;">SKU Code:</td>
            <td style="padding: 4px 0; color: #38bdf8; font-family: monospace;">{sku}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #94a3b8;">Batch Number:</td>
            <td style="padding: 4px 0; color: #f87171; font-weight: 700; font-family: monospace;">{batch}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #94a3b8;">Origin Warehouse:</td>
            <td style="padding: 4px 0; color: #e2e8f0;">{wh_display}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #94a3b8;">Issue Date:</td>
            <td style="padding: 4px 0; color: #e2e8f0;">{now_str}</td>
          </tr>
        </table>
      </div>

      <!-- Action Instructions -->
      <div style="margin: 20px 0;">
        <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.05em;">
          Mandatory Safety Actions Required:
        </h3>
        <div style="background-color: #172554; border: 1px solid #1e3a8a; border-radius: 6px; padding: 14px; color: #bfdbfe; font-size: 14px;">
          {instructions}
        </div>
      </div>

      <!-- Quarantine Callout -->
      <ul style="color: #cbd5e1; font-size: 14px; padding-left: 20px;">
        <li><strong>Quarantine immediately:</strong> Remove all units of Batch {batch} from dispensing shelves.</li>
        <li><strong>Physical Isolation:</strong> Place units in designated quarantine storage marked "DO NOT DISPENSE".</li>
        <li><strong>Patient Safety:</strong> Do not supply or administer units from this batch to patients.</li>
      </ul>

      <!-- Acknowledgment CTA Button -->
      <div style="margin: 30px 0 20px 0; text-align: center;">
        <a href="{portal_link}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.4);">
          Confirm Stock Quarantine & Acknowledge
        </a>
      </div>
      <p style="text-align: center; font-size: 12px; color: #64748b; margin-top: 4px;">
        Or access directly: <a href="{portal_link}" style="color: #38bdf8; word-break: break-all;">{portal_link}</a>
      </p>

      <hr style="border: 0; border-top: 1px solid #334155; margin: 24px 0;" />

      <!-- Contact Info -->
      <div style="font-size: 13px; color: #94a3b8;">
        <p style="margin: 0 0 4px 0;"><strong>24/7 Quality Safety Support Desk:</strong></p>
        <p style="margin: 0;">Phone: <span style="color: #f1f5f9;">{c_phone}</span> | Email: <span style="color: #f1f5f9;">{c_email}</span></p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #0f172a; padding: 16px 24px; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b;">
      TraceRx Autonomous Compliance Desk & Tamper-Evident Ledger. Arogya Pharma Distributors Pvt. Ltd.<br />
      This is an automated regulatory notification authorized by qualified compliance personnel.
    </div>
  </div>
</body>
</html>"""


def generate_recall_email_text(
    incident_id: str,
    sku: str,
    batch: str,
    medicine_name: str,
    instructions: str,
    warehouse: Optional[str] = None,
    contact_email: Optional[str] = None,
    contact_phone: Optional[str] = None,
    ack_url: Optional[str] = None,
    recipient_name: Optional[str] = None,
) -> str:
    """Renders plain-text recall email counterpart."""
    now_str = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    med_display = medicine_name or sku
    wh_display = warehouse or "Central Distribution"
    c_email = contact_email or settings.SMTP_FROM_EMAIL
    c_phone = contact_phone or "+91 (80) 4567-8900"
    portal_link = ack_url or f"{settings.PORTAL_BASE_URL}/notifications?incident={incident_id}"
    salutation = f"Dear {recipient_name}," if recipient_name else "To Authorized Pharmacy / Hospital Authority,"

    return f"""================================================================================
URGENT PHARMACEUTICAL NOTICE: DISTRIBUTION STOP & BATCH RECALL
TraceRx Arogya Pharma Compliance Desk
================================================================================

{salutation}

An immediate distribution-stop and quarantine order has been authorized for:

- Case Reference ID: {incident_id}
- Medicine: {med_display}
- SKU Code: {sku}
- Batch Number: {batch}
- Origin Warehouse: {wh_display}
- Notice Timestamp: {now_str}

REQUIRED ACTIONS:
{instructions}

1. QUARANTINE IMMEDIATELY: Remove all units of Batch {batch} from active inventory.
2. PHYSICAL ISOLATION: Secure units in quarantine storage marked "DO NOT DISPENSE".
3. PATIENT SAFETY: Do NOT dispense or administer any units of this batch.

CONFIRM RECEIPT AND QUARANTINE:
Please acknowledge receipt and report isolated units at:
{portal_link}

24/7 Quality Safety Support Desk:
Phone: {c_phone}
Email: {c_email}

TraceRx Autonomous Compliance Desk & Tamper-Evident Ledger
Arogya Pharma Distributors Pvt. Ltd.
"""
