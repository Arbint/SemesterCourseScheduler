import hashlib
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import SessionLocal
from models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

_session_token: str | None = None


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _hash_password(password: str) -> str:
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100_000)
    return salt.hex() + ':' + key.hex()


def _verify_password(password: str, stored: str) -> bool:
    salt_hex, key_hex = stored.split(':', 1)
    salt = bytes.fromhex(salt_hex)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100_000)
    return secrets.compare_digest(key.hex(), key_hex)


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


@router.get("/status")
def get_status(db: Session = Depends(get_db)):
    user = db.query(User).first()
    return {
        "has_user": user is not None,
        "logged_in": _session_token is not None,
        "username": user.username if (user and _session_token) else None,
    }


@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).count() > 0:
        raise HTTPException(status_code=400, detail="A user account already exists")
    if not req.username.strip() or not req.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    user = User(username=req.username.strip(), hashed_password=_hash_password(req.password))
    db.add(user)
    db.commit()
    return {"ok": True}


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    global _session_token
    user = db.query(User).first()
    if not user or user.username != req.username:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not _verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    _session_token = secrets.token_hex(32)
    return {"token": _session_token, "username": user.username}


@router.post("/logout")
def logout():
    global _session_token
    _session_token = None
    return {"ok": True}
