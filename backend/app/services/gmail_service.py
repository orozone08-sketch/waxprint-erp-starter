import email
import imaplib
import re
from datetime import datetime
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.config import settings


ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def status():
    imap_configured = bool(settings.gmail_user and settings.gmail_app_password)
    oauth_configured = bool(settings.gmail_client_id and settings.gmail_client_secret and settings.gmail_refresh_token)
    mode = "imap" if imap_configured else "oauth" if oauth_configured else "none"
    return {
        "enabled": settings.gmail_enabled,
        "configured": imap_configured or oauth_configured,
        "mode": mode,
        "user": settings.gmail_user if settings.gmail_user != "me" else "",
        "mailbox": settings.gmail_mailbox,
        "fetch_query": settings.gmail_fetch_query,
        "fetch_limit": settings.gmail_fetch_limit,
        "pubsub_topic": settings.gmail_pubsub_topic or None,
        "archive_label": settings.gmail_archive_label,
    }


def configure(
    *,
    enabled: bool,
    user: str,
    app_password: str | None,
    clear_password: bool,
    mailbox: str,
    fetch_query: str,
    fetch_limit: int,
):
    email_address = user.strip().lower()
    if enabled and not email_address:
        raise ValueError("Gmail email is required.")
    password = _clean_app_password(app_password)
    if app_password is not None and app_password.strip() and not password:
        raise ValueError("Gmail password is invalid.")

    updates = {
        "GMAIL_ENABLED": "true" if enabled else "false",
        "GMAIL_USER": email_address,
        "GMAIL_MAILBOX": mailbox.strip() or "INBOX",
        "GMAIL_FETCH_QUERY": fetch_query.strip() or "UNSEEN",
        "GMAIL_FETCH_LIMIT": str(fetch_limit),
    }
    if clear_password:
        updates["GMAIL_APP_PASSWORD"] = ""
    elif password:
        updates["GMAIL_APP_PASSWORD"] = password

    _write_env(updates)
    settings.gmail_enabled = enabled
    settings.gmail_user = updates["GMAIL_USER"]
    settings.gmail_mailbox = updates["GMAIL_MAILBOX"]
    settings.gmail_fetch_query = updates["GMAIL_FETCH_QUERY"]
    settings.gmail_fetch_limit = fetch_limit
    if "GMAIL_APP_PASSWORD" in updates:
        settings.gmail_app_password = updates["GMAIL_APP_PASSWORD"]
    return status()


def test_connection():
    current = status()
    if not settings.gmail_enabled:
        return {"ok": False, "message": "Gmail integration is disabled.", "gmail": current}
    if not current["configured"]:
        return {"ok": False, "message": "Gmail email or password is missing.", "gmail": current}
    if current["mode"] != "imap":
        return {"ok": False, "message": "This app currently tests Gmail through IMAP.", "gmail": current}

    try:
        mail = imaplib.IMAP4_SSL(settings.gmail_imap_host, settings.gmail_imap_port)
        try:
            mail.login(settings.gmail_user, settings.gmail_app_password.replace(" ", ""))
            typ, _ = mail.select(settings.gmail_mailbox, readonly=True)
            if typ != "OK":
                return {"ok": False, "message": f"Could not open mailbox {settings.gmail_mailbox}.", "gmail": status()}
        finally:
            try:
                mail.logout()
            except Exception:
                pass
    except imaplib.IMAP4.error:
        return {"ok": False, "message": "Gmail login failed. Google rejected the saved email/password.", "gmail": status()}
    except Exception as exc:
        return {"ok": False, "message": f"Gmail connection failed: {exc}", "gmail": status()}
    return {"ok": True, "message": "Gmail connected successfully.", "gmail": status()}


def reconcile(db: Session):
    current = status()
    if not settings.gmail_enabled:
        return {"ok": False, "message": "Gmail integration is disabled. Add Gmail email and password in Settings."}
    if not current["configured"]:
        return {"ok": False, "message": "Gmail credentials are incomplete. Add Gmail email and password in Settings."}
    if current["mode"] != "imap":
        return {"ok": False, "message": "OAuth credentials are configured, but this app currently fetches through Gmail IMAP."}
    return _fetch_with_imap(db)


def _fetch_with_imap(db: Session):
    imported = 0
    skipped_existing = 0
    errors: list[str] = []
    fetched = 0
    mail = None
    try:
        mail = imaplib.IMAP4_SSL(settings.gmail_imap_host, settings.gmail_imap_port)
        mail.login(settings.gmail_user, settings.gmail_app_password.replace(" ", ""))
        typ, _ = mail.select(settings.gmail_mailbox, readonly=True)
        if typ != "OK":
            return {"ok": False, "message": f"Could not open mailbox {settings.gmail_mailbox}."}

        typ, data = mail.uid("search", None, settings.gmail_fetch_query or "UNSEEN")
        if typ != "OK":
            return {"ok": False, "message": "Gmail search failed."}

        uids = (data[0] or b"").split()
        selected = uids[-max(settings.gmail_fetch_limit, 1):]
        fetched = len(selected)

        for uid in reversed(selected):
            external_id = f"gmail:{uid.decode('ascii', errors='ignore')}"
            exists = db.scalar(select(models.InboxMessage.id).where(models.InboxMessage.external_message_id == external_id))
            if exists:
                skipped_existing += 1
                continue
            try:
                typ, message_data = mail.uid("fetch", uid, "(BODY.PEEK[])")
                if typ != "OK":
                    errors.append(f"Could not fetch UID {uid.decode(errors='ignore')}")
                    continue
                raw = next((part[1] for part in message_data if isinstance(part, tuple)), None)
                if not raw:
                    errors.append(f"Empty message UID {uid.decode(errors='ignore')}")
                    continue
                msg = email.message_from_bytes(raw)
                sender = _decode_header(msg.get("From", ""))
                sender_email = parseaddr(sender)[1].lower()
                subject = _decode_header(msg.get("Subject", ""))
                received_at = _received_at(msg.get("Date"))
                customer = _match_customer(db, sender_email)
                inbox = models.InboxMessage(
                    source="gmail",
                    external_message_id=external_id,
                    sender=sender,
                    subject=subject or "(no subject)",
                    body=_message_body(msg),
                    received_at=received_at,
                    archived=False,
                    status="MATCHED" if customer else "RECEIVED",
                    customer_id=customer.id if customer else None,
                )
                db.add(inbox)
                imported += 1
            except Exception as exc:
                errors.append(f"UID {uid.decode(errors='ignore')}: {exc}")
        db.commit()
    except imaplib.IMAP4.error:
        return {
            "ok": False,
            "message": "Gmail login failed. Google rejected the saved email/password.",
            "fetched": fetched,
            "imported": imported,
            "skipped_existing": skipped_existing,
            "errors": errors,
        }
    except Exception as exc:
        return {
            "ok": False,
            "message": f"Gmail fetch failed: {exc}",
            "fetched": fetched,
            "imported": imported,
            "skipped_existing": skipped_existing,
            "errors": errors,
        }
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass

    return {
        "ok": not errors,
        "message": f"Fetched {fetched} Gmail message(s), imported {imported}, skipped {skipped_existing}.",
        "fetched": fetched,
        "imported": imported,
        "skipped_existing": skipped_existing,
        "errors": errors,
    }


def _decode_header(value: str) -> str:
    if not value:
        return ""
    return str(make_header(decode_header(value)))


def _received_at(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    try:
        parsed = parsedate_to_datetime(value)
        return parsed.replace(tzinfo=None)
    except Exception:
        return datetime.utcnow()


def _match_customer(db: Session, sender_email: str):
    if not sender_email:
        return None
    return db.scalar(select(models.Customer).where(models.Customer.email == sender_email))


def _message_body(msg) -> str:
    plain_parts: list[str] = []
    html_parts: list[str] = []
    parts = msg.walk() if msg.is_multipart() else [msg]
    for part in parts:
        disposition = part.get_content_disposition()
        if disposition == "attachment":
            continue
        content_type = part.get_content_type()
        if content_type not in {"text/plain", "text/html"}:
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        charset = part.get_content_charset() or "utf-8"
        text = payload.decode(charset, errors="replace").strip()
        if content_type == "text/plain":
            plain_parts.append(text)
        else:
            html_parts.append(_strip_html(text))
    body = "\n\n".join(plain_parts or html_parts)
    return re.sub(r"\n{3,}", "\n\n", body).strip()[:10000]


def _strip_html(value: str) -> str:
    value = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value)
    value = re.sub(r"(?s)<br\s*/?>", "\n", value)
    value = re.sub(r"(?s)</p\s*>", "\n", value)
    value = re.sub(r"(?s)<.*?>", " ", value)
    return re.sub(r"[ \t]+", " ", value).strip()


def _clean_app_password(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", "", value.strip())


def _write_env(updates: dict[str, str]):
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            output.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in updates:
            output.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            output.append(line)
    missing = [key for key in updates if key not in seen]
    if missing and output and output[-1].strip():
        output.append("")
    for key in missing:
        output.append(f"{key}={updates[key]}")
    ENV_PATH.write_text("\n".join(output) + "\n", encoding="utf-8")
