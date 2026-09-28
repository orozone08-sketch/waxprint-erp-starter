from __future__ import annotations
import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Callable
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import settings
from app.db import get_db, SessionLocal
from app import models

TOKEN_TTL_SECONDS = 60 * 60 * 12

def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"

def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$", 2)
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt), f"pbkdf2_sha256${salt}${digest}")

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")

def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))

def create_token(user: models.AppUser) -> str:
    payload = {"uid": user.id, "username": user.username, "role": user.role, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signature = hmac.new(settings.auth_secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(signature)}"

def parse_token(token: str) -> dict | None:
    try:
        body, signature = token.split(".", 1)
        expected = _b64(hmac.new(settings.auth_secret.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        payload = json.loads(_unb64(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None

def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    prefix = "Bearer "
    return authorization[len(prefix):].strip() if authorization.startswith(prefix) else None

def user_id_from_authorization(authorization: str | None) -> int | None:
    token = bearer_token(authorization)
    payload = parse_token(token) if token else None
    return int(payload["uid"]) if payload and payload.get("uid") else None

def current_user(request: Request, db: Session = Depends(get_db)) -> models.AppUser:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        user_id = user_id_from_authorization(request.headers.get("authorization"))
    if not user_id:
        raise HTTPException(401, "Login required")
    user = db.get(models.AppUser, user_id)
    if not user or not user.active:
        raise HTTPException(401, "Login required")
    return user

def require_roles(*roles: str) -> Callable:
    allowed = {role.upper() for role in roles}
    def dependency(user: models.AppUser = Depends(current_user)) -> models.AppUser:
        if user.role.upper() not in allowed:
            raise HTTPException(403, "Admin access required")
        return user
    return dependency

def require_admin(user: models.AppUser = Depends(current_user)) -> models.AppUser:
    if user.role.upper() != "ADMIN":
        raise HTTPException(403, "Admin access required")
    return user

def ensure_default_users():
    db = SessionLocal()
    try:
        if db.scalar(select(models.AppUser.id).limit(1)):
            return
        users = [
            ("admin", "admin123", "Admin User", "ADMIN"),
            ("staff", "staff123", "Staff User", "STAFF"),
            ("accounts", "accounts123", "Accounts User", "ACCOUNTS"),
        ]
        for username, password, display_name, role in users:
            db.add(models.AppUser(username=username, display_name=display_name, role=role, password_hash=hash_password(password), active=True))
        db.commit()
    finally:
        db.close()
