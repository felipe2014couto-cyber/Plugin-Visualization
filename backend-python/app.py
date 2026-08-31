"""Hardened, read-only SIP/Oracle API.

The browser selects a registered profile; it never supplies a DSN. Security
authority lives here and in the Oracle grants, not in client-side validation.
"""

import hashlib
import json
import logging
import os
import re
import secrets
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple

import oracledb
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, StrictInt
from sip_sql_policy import validate_read_only_sql

logger = logging.getLogger("sip.security")
logging.basicConfig(level=os.environ.get("SIP_LOG_LEVEL", "INFO"))
app = FastAPI(title="PIMS Vision SIP API")

ENVIRONMENT = os.environ.get("SIP_ENV", "production").strip().lower()
IS_PRODUCTION = ENVIRONMENT == "production"
ALLOWED_ORIGINS = tuple(x.strip().rstrip("/") for x in os.environ.get("SIP_ALLOWED_ORIGINS", "").split(",") if x.strip())
if ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(ALLOWED_ORIGINS),
        allow_credentials=True,
        allow_methods=["POST"],
        allow_headers=["Content-Type", "X-Request-ID"],
    )

SESSION_COOKIE = "__Host-sip-session" if IS_PRODUCTION else "sip-session"
COOKIE_SECURE = IS_PRODUCTION
PROFILE_ENV_NAMES = {"sip": "SIP_ORACLE_DSN"}
DEFAULT_MAX_ROWS = int(os.environ.get("SIP_DEFAULT_MAX_ROWS", "200"))
HARD_MAX_ROWS = int(os.environ.get("SIP_HARD_MAX_ROWS", "2000"))
MAX_SQL_BYTES = int(os.environ.get("SIP_MAX_SQL_BYTES", "65536"))
MAX_COLUMNS = int(os.environ.get("SIP_MAX_COLUMNS", "256"))
MAX_CELL_BYTES = int(os.environ.get("SIP_MAX_CELL_BYTES", "65536"))
MAX_RESPONSE_BYTES = int(os.environ.get("SIP_MAX_RESPONSE_BYTES", "8388608"))
MAX_REQUEST_BYTES = int(os.environ.get("SIP_MAX_REQUEST_BYTES", "1048576"))
QUERY_TIMEOUT_MS = int(os.environ.get("SIP_QUERY_TIMEOUT_MS", "30000"))
IDLE_TIMEOUT_SECONDS = int(os.environ.get("SIP_SESSION_IDLE_SECONDS", "1800"))
ABSOLUTE_TIMEOUT_SECONDS = int(os.environ.get("SIP_SESSION_MAX_SECONDS", "28800"))
MAX_SESSIONS = int(os.environ.get("SIP_MAX_SESSIONS", "100"))
RATE_WINDOW_SECONDS = int(os.environ.get("SIP_RATE_WINDOW_SECONDS", "60"))
CONNECT_RATE_LIMIT = int(os.environ.get("SIP_CONNECT_RATE_LIMIT", "10"))
QUERY_RATE_LIMIT = int(os.environ.get("SIP_QUERY_RATE_LIMIT", "60"))
INSTANTCLIENT_DIR = os.environ.get("ORACLE_CLIENT_DIR", "/opt/oracle/instantclient_19_30")


class ConnectRequest(BaseModel):
    connectionProfile: str = "sip"
    username: str
    password: str


class QueryRequest(BaseModel):
    sql: str
    max_rows: Optional[StrictInt] = None
    params: Optional[Dict[str, Any]] = None


class SessionData:
    def __init__(self, connection: Any, username: str) -> None:
        now = time.monotonic()
        self.connection = connection
        self.username = username
        self.created_at = now
        self.last_used_at = now
        self.lock = threading.Lock()


SESSIONS: Dict[str, SessionData] = {}
SESSIONS_LOCK = threading.Lock()
RATE_BUCKETS: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
RATE_LOCK = threading.Lock()
_THICK_INIT = False


class SipError(HTTPException):
    def __init__(self, status_code: int, code: str, request_id: str) -> None:
        super().__init__(status_code=status_code, detail={"code": code, "request_id": request_id})


def request_id_for(request: Request) -> str:
    supplied = request.headers.get("x-request-id", "")
    return supplied if re.fullmatch(r"[A-Za-z0-9._-]{8,64}", supplied) else uuid.uuid4().hex


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    request_id = request_id_for(request)
    request.state.request_id = request_id
    content_length = request.headers.get("content-length")
    if content_length and (not content_length.isdigit() or int(content_length) > MAX_REQUEST_BYTES):
        response = Response(
            content=json.dumps({"detail": {"code": "SIP_QUERY_LIMIT", "request_id": request_id}}),
            status_code=413,
            media_type="application/json",
        )
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Request-ID"] = request_id
        return response
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        source = origin
        if not source and referer:
            source = "/".join(referer.split("/", 3)[:3])
        allow_missing = not IS_PRODUCTION and os.environ.get("SIP_ALLOW_MISSING_ORIGIN", "true").lower() == "true"
        if (not source and not allow_missing) or (source and source.rstrip("/") not in ALLOWED_ORIGINS):
            response = Response(
                content=json.dumps({"detail": {"code": "SIP_ORIGIN_REJECTED", "request_id": request_id}}),
                status_code=403,
                media_type="application/json",
            )
        else:
            response = await call_next(request)
    else:
        response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Request-ID"] = request_id
    return response


def enforce_rate_limit(request: Request, action: str, limit: int) -> None:
    now = time.monotonic()
    client = request.client.host if request.client else "unknown"
    with RATE_LOCK:
        bucket = RATE_BUCKETS[(client, action)]
        while bucket and bucket[0] <= now - RATE_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= limit:
            raise SipError(429, "SIP_RATE_LIMIT", request.state.request_id)
        bucket.append(now)


def init_thick() -> None:
    global _THICK_INIT
    if _THICK_INIT:
        return
    path = Path(INSTANTCLIENT_DIR)
    if path.exists():
        try:
            oracledb.init_oracle_client(lib_dir=str(path))
        except Exception:
            logger.warning("Oracle thick client initialization failed; using thin mode")
    _THICK_INIT = True


def resolve_profile(profile: str, request_id: str) -> str:
    env_name = PROFILE_ENV_NAMES.get(profile)
    dsn = os.environ.get(env_name, "") if env_name else ""
    if not env_name or not dsn:
        raise SipError(503, "SIP_DATABASE_UNAVAILABLE", request_id)
    return dsn


def close_session(session_id: str) -> None:
    with SESSIONS_LOCK:
        session = SESSIONS.pop(session_id, None)
    if session:
        try:
            session.connection.close()
        except Exception:
            logger.warning("Failed to close SIP Oracle connection")


def cleanup_expired_sessions() -> None:
    now = time.monotonic()
    with SESSIONS_LOCK:
        expired = [token for token, session in SESSIONS.items() if now - session.last_used_at > IDLE_TIMEOUT_SECONDS or now - session.created_at > ABSOLUTE_TIMEOUT_SECONDS]
    for token in expired:
        close_session(token)


def require_session(request: Request) -> SessionData:
    cleanup_expired_sessions()
    token = request.cookies.get(SESSION_COOKIE)
    with SESSIONS_LOCK:
        session = SESSIONS.get(token or "")
    if not token or not session:
        raise SipError(401, "SIP_SESSION_EXPIRED", request.state.request_id)
    session.last_used_at = time.monotonic()
    return session


def to_jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        raise ValueError("binary values are not supported")
    if isinstance(value, oracledb.LOB):
        raise ValueError("LOB values are not supported")
    if isinstance(value, str) and len(value.encode("utf-8")) > MAX_CELL_BYTES:
        return value.encode("utf-8")[:MAX_CELL_BYTES].decode("utf-8", errors="ignore")
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)[:MAX_CELL_BYTES]


def audit(action: str, request_id: str, started: float, username: str = "", **fields: Any) -> None:
    safe = {key: value for key, value in fields.items() if key not in {"password", "session", "params", "dsn", "sql"}}
    logger.info("sip_request %s", json.dumps({"request_id": request_id, "action": action, "username": username, "duration_ms": round((time.monotonic() - started) * 1000), **safe}, default=str))


@app.post("/connect")
def connect(req: ConnectRequest, request: Request, response: Response):
    started = time.monotonic()
    enforce_rate_limit(request, "connect", CONNECT_RATE_LIMIT)
    cleanup_expired_sessions()
    username = req.username.strip()
    if not username or not req.password or len(username) > 256 or len(req.password) > 1024:
        raise SipError(400, "SIP_INVALID_PARAMETERS", request.state.request_id)
    with SESSIONS_LOCK:
        if len(SESSIONS) >= MAX_SESSIONS:
            raise SipError(503, "SIP_QUERY_LIMIT", request.state.request_id)
    try:
        init_thick()
        connection = oracledb.connect(user=username, password=req.password, dsn=resolve_profile(req.connectionProfile, request.state.request_id))
        connection.call_timeout = QUERY_TIMEOUT_MS
        cursor = connection.cursor()
        try:
            cursor.execute("SET TRANSACTION READ ONLY")
            cursor.execute("SELECT 1 FROM DUAL")
            cursor.fetchone()
        finally:
            cursor.close()
    except SipError:
        raise
    except Exception:
        audit("connect", request.state.request_id, started, username, success=False)
        raise SipError(401, "SIP_AUTH_FAILED", request.state.request_id)
    token = secrets.token_urlsafe(48)
    previous_token = request.cookies.get(SESSION_COOKIE)
    if previous_token:
        close_session(previous_token)
    with SESSIONS_LOCK:
        SESSIONS[token] = SessionData(connection, username)
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=COOKIE_SECURE, samesite="strict", path="/", max_age=ABSOLUTE_TIMEOUT_SECONDS)
    audit("connect", request.state.request_id, started, username, success=True)
    return {"connected": True, "request_id": request.state.request_id}


@app.post("/disconnect")
def disconnect(request: Request, response: Response):
    started = time.monotonic()
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        close_session(token)
    response.delete_cookie(SESSION_COOKIE, path="/", secure=COOKIE_SECURE, samesite="strict")
    audit("disconnect", request.state.request_id, started, success=True)
    return {"status": "ok", "request_id": request.state.request_id}


@app.post("/query")
def run_query(req: QueryRequest, request: Request):
    started = time.monotonic()
    enforce_rate_limit(request, "query", QUERY_RATE_LIMIT)
    session = require_session(request)
    try:
        sql = validate_read_only_sql(req.sql, MAX_SQL_BYTES)
        requested_rows = DEFAULT_MAX_ROWS if req.max_rows is None else int(req.max_rows)
        if requested_rows < 1:
            raise ValueError("invalid row limit")
        max_rows = min(requested_rows, HARD_MAX_ROWS)
        params = req.params or {}
        if not isinstance(params, dict) or len(params) > 256:
            raise ValueError("invalid binds")
    except (TypeError, ValueError):
        raise SipError(400, "SIP_QUERY_REJECTED", request.state.request_id)
    if not session.lock.acquire(blocking=False):
        raise SipError(429, "SIP_QUERY_LIMIT", request.state.request_id)
    query_hash = hashlib.sha256(sql.encode("utf-8")).hexdigest()[:16]
    cursor = None
    try:
        cursor = session.connection.cursor()
        cursor.arraysize = min(max_rows + 1, 1000)
        cursor.execute(sql, params)
        if not cursor.description:
            raise SipError(400, "SIP_QUERY_REJECTED", request.state.request_id)
        columns = [description[0] for description in cursor.description]
        if len(columns) > MAX_COLUMNS:
            raise SipError(413, "SIP_QUERY_LIMIT", request.state.request_id)
        fetched = cursor.fetchmany(max_rows + 1)
        truncated = len(fetched) > max_rows or requested_rows > HARD_MAX_ROWS
        rows: List[Dict[str, Any]] = []
        response_size = 0
        for record in fetched[:max_rows]:
            row = {name: to_jsonable(value) for name, value in zip(columns, record)}
            response_size += len(json.dumps(row, ensure_ascii=False, default=str).encode("utf-8"))
            if response_size > MAX_RESPONSE_BYTES:
                truncated = True
                break
            rows.append(row)
        audit("query", request.state.request_id, started, session.username, success=True, row_count=len(rows), query_hash=query_hash)
        return {"rows": rows, "row_count": len(rows), "max_rows": max_rows, "truncated": truncated, "request_id": request.state.request_id}
    except SipError:
        raise
    except oracledb.Error as error:
        oracle_code = getattr(getattr(error, "args", [None])[0], "code", None)
        code = "SIP_QUERY_TIMEOUT" if oracle_code in {1013, 3136} else "SIP_QUERY_REJECTED"
        audit("query", request.state.request_id, started, session.username, success=False, query_hash=query_hash, oracle_code=oracle_code)
        raise SipError(408 if code == "SIP_QUERY_TIMEOUT" else 400, code, request.state.request_id)
    except Exception:
        audit("query", request.state.request_id, started, session.username, success=False, query_hash=query_hash)
        raise SipError(500, "SIP_DATABASE_UNAVAILABLE", request.state.request_id)
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        session.lock.release()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("SIP_BIND_HOST", "127.0.0.1"), port=int(os.environ.get("SIP_PORT", "8085")))
