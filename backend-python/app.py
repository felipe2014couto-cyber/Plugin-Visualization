import os
import re
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import oracledb
from sqlalchemy import create_engine, text
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# =========================
# CONFIGURAÇÃO GERAL
# =========================
app = FastAPI(title="PIMS Vision SQL API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # TODO: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory sessions (Do not use in production without Redis or similar, but fine for temporary sessions)
SESSIONS: Dict[str, Dict[str, Any]] = {}

INSTANTCLIENT_DIR = os.environ.get("ORACLE_CLIENT_DIR", "/opt/oracle/instantclient_19_30")
DEFAULT_MAX_ROWS = int(os.environ.get("ORACLE_DEFAULT_ROW_LIMIT", 200))
HARD_MAX_ROWS = int(os.environ.get("ORACLE_MAX_ROW_LIMIT", 2000))

_THICK_INIT = False

# =========================
# MODELOS (Pydantic)
# =========================
class ConnectRequest(BaseModel):
    dsn: str
    username: str
    password: str

class QueryRequest(BaseModel):
    session_id: str
    sql: str
    max_rows: Optional[int] = None
    params: Optional[Dict[str, Any]] = None

# =========================
# PROTEÇÃO READ-ONLY
# =========================
COMMENT_RE = re.compile(r"(--[^\n]*\n)|(/\*.*?\*/)", re.DOTALL)
LEADING_SPACE_RE = re.compile(r"^\s+", re.DOTALL)

BLOCKED_TOKENS = [
    "insert", "update", "delete", "merge", "alter", "drop", "create",
    "truncate", "rename", "grant", "revoke", "commit", "rollback",
    "savepoint", "call", "execute", "exec", "begin", "declare",
]

def strip_comments(sql: str) -> str:
    sql2 = COMMENT_RE.sub("\n", sql)
    sql2 = LEADING_SPACE_RE.sub("", sql2)
    return sql2.strip()

def is_read_only_sql(sql: str) -> bool:
    if not sql or not isinstance(sql, str):
        return False

    if ";" in sql:
        return False

    cleaned = strip_comments(sql)
    low = cleaned.lower()

    if not (low.startswith("select") or low.startswith("with")):
        return False

    for token in BLOCKED_TOKENS:
        if re.search(rf"\b{re.escape(token)}\b", low):
            return False

    return True

def to_jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value

# =========================
# ORACLE CLIENT
# =========================
def init_thick() -> None:
    global _THICK_INIT
    if _THICK_INIT:
        return

    instant_client_path = Path(INSTANTCLIENT_DIR)
    if instant_client_path.exists():
        try:
            oracledb.init_oracle_client(lib_dir=str(instant_client_path))
            _THICK_INIT = True
        except Exception as e:
            print(f"Warning: Failed to init thick client: {e}")
    else:
        print(f"Warning: Instant Client not found at {instant_client_path}. Falling back to thin client.")


def get_engine_for_session(session_data: Dict[str, Any]):
    if "engine" in session_data:
        return session_data["engine"]

    username = session_data["username"]
    password = session_data["password"]
    dsn = session_data["dsn"]
    
    connection_url = f"oracle+oracledb://{username}:{password}@/?dsn={quote_plus(dsn)}"
    
    engine = create_engine(connection_url, pool_pre_ping=True)
    session_data["engine"] = engine
    return engine

# =========================
# ROTAS API
# =========================

@app.post("/connect")
def connect(req: ConnectRequest):
    init_thick()
    
    session_id = str(uuid.uuid4())
    
    SESSIONS[session_id] = {
        "username": req.username,
        "password": req.password,
        "dsn": req.dsn,
        "created_at": datetime.now()
    }
    
    try:
        engine = get_engine_for_session(SESSIONS[session_id])
        with engine.connect() as conn:
            # Simple ping to test connection
            conn.execute(text("SELECT 1 FROM DUAL"))
    except Exception as e:
        del SESSIONS[session_id]
        raise HTTPException(status_code=401, detail=f"Database connection failed: {str(e)}")
        
    return {"session_id": session_id}

@app.post("/disconnect")
def disconnect(session_id: str):
    if session_id in SESSIONS:
        session_data = SESSIONS[session_id]
        if "engine" in session_data:
            session_data["engine"].dispose()
        del SESSIONS[session_id]
    return {"status": "ok"}

@app.post("/query")
def run_query(req: QueryRequest):
    if req.session_id not in SESSIONS:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
        
    max_rows = req.max_rows or DEFAULT_MAX_ROWS
    if max_rows < 1: max_rows = 1
    if max_rows > HARD_MAX_ROWS: max_rows = HARD_MAX_ROWS

    if not is_read_only_sql(req.sql):
        raise HTTPException(status_code=400, detail="SQL inválido. Permitido apenas SELECT/WITH em modo read-only, sem ';' e sem comandos de escrita.")

    engine = get_engine_for_session(SESSIONS[req.session_id])
    
    rows: List[Dict[str, Any]] = []
    
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SET TRANSACTION READ ONLY")
            
            result = connection.execute(text(req.sql), req.params or {})
            
            if result.returns_rows:
                fetched_rows = result.mappings().fetchmany(max_rows)
                for row in fetched_rows:
                    row_dict = dict(row)
                    rows.append({k: to_jsonable(v) for k, v in row_dict.items()})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "rows": rows,
        "row_count": len(rows),
        "max_rows": max_rows,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)
