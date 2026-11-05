"""
VibeGene telemetry + bug-report API with a password-protected admin UI.

Env:
  VIBEGENE_ADMIN_USER       default: admin
  VIBEGENE_ADMIN_PASSWORD   required
  VIBEGENE_DB_PATH          default: /data/vibegene.sqlite3
  VIBEGENE_CORS_ORIGINS     comma-separated, default: https://vibe-gene.com
  PORT                      default: 8080
"""

from __future__ import annotations

import os
import secrets
import sqlite3
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field, field_validator

APP_DIR = Path(__file__).resolve().parent
ADMIN_HTML = APP_DIR / "static" / "admin.html"
DB_PATH = Path(os.environ.get("VIBEGENE_DB_PATH", "/data/vibegene.sqlite3"))
ADMIN_USER = os.environ.get("VIBEGENE_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("VIBEGENE_ADMIN_PASSWORD", "")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "VIBEGENE_CORS_ORIGINS",
        "https://vibe-gene.com,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

security = HTTPBasic()
app = FastAPI(title="VibeGene API", version="1.0.0", docs_url=None, redoc_url=None)


def utc_now() -> int:
    return int(time.time())


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS installs (
              install_id TEXT PRIMARY KEY,
              first_seen INTEGER NOT NULL,
              last_seen INTEGER NOT NULL,
              app_version TEXT,
              platform TEXT,
              timezone TEXT,
              heartbeat_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS heartbeats (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              install_id TEXT NOT NULL,
              seen_at INTEGER NOT NULL,
              app_version TEXT,
              platform TEXT,
              timezone TEXT
            );

            CREATE TABLE IF NOT EXISTS reports (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at INTEGER NOT NULL,
              title TEXT NOT NULL,
              description TEXT NOT NULL,
              email TEXT,
              app_version TEXT,
              platform TEXT,
              user_agent TEXT,
              status_note TEXT,
              diagnostics TEXT,
              install_id TEXT,
              resolved INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_heartbeats_seen ON heartbeats(seen_at);
            CREATE INDEX IF NOT EXISTS idx_installs_last ON installs(last_seen);
            CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
            """
        )
        # Older DBs created before diagnostics existed.
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(reports)")}
        if "diagnostics" not in cols:
            conn.execute("ALTER TABLE reports ADD COLUMN diagnostics TEXT")


@app.on_event("startup")
def on_startup() -> None:
    if not ADMIN_PASSWORD:
        raise RuntimeError("VIBEGENE_ADMIN_PASSWORD must be set")
    init_db()


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"^(?:https?://tauri\.localhost|tauri://localhost)$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)


NCBI_BLAST_URL = "https://blast.ncbi.nlm.nih.gov/Blast.cgi"
MAX_NCBI_REQUEST_BYTES = 5 * 1024 * 1024
MAX_NCBI_RESPONSE_BYTES = 25 * 1024 * 1024


@app.post("/api/v1/ncbi/blast")
async def ncbi_blast_proxy(request: Request) -> Response:
    """Same-origin relay for NCBI's BLAST Common URL API, which lacks CORS."""
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" not in content_type.lower():
        raise HTTPException(status_code=415, detail="Expected a URL-encoded BLAST request")
    body = await request.body()
    if not body or len(body) > MAX_NCBI_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="BLAST request is empty or too large")
    upstream_request = urllib.request.Request(
        NCBI_BLAST_URL,
        data=body,
        method="POST",
        headers={
            "Accept": "text/plain, application/xml",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "VibeGene/0.3.3 (support@example.org)",
        },
    )
    try:
        with urllib.request.urlopen(upstream_request, timeout=60) as upstream:
            payload = upstream.read(MAX_NCBI_RESPONSE_BYTES + 1)
            if len(payload) > MAX_NCBI_RESPONSE_BYTES:
                raise HTTPException(status_code=502, detail="NCBI response exceeded 25 MB")
            return Response(
                content=payload,
                status_code=upstream.status,
                media_type=upstream.headers.get_content_type(),
            )
    except urllib.error.HTTPError as error:
        detail = error.read(1000).decode("utf-8", errors="replace").strip()
        raise HTTPException(status_code=error.code, detail=detail or "NCBI rejected the BLAST request") from error
    except urllib.error.URLError as error:
        raise HTTPException(status_code=502, detail="Could not reach NCBI BLAST") from error


def require_admin(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    user_ok = secrets.compare_digest(credentials.username, ADMIN_USER)
    pass_ok = secrets.compare_digest(credentials.password, ADMIN_PASSWORD)
    if not (user_ok and pass_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": 'Basic realm="VibeGene Admin"'},
        )
    return credentials.username


class HeartbeatIn(BaseModel):
    installId: str = Field(min_length=8, max_length=80)
    appVersion: str = Field(default="unknown", max_length=64)
    platform: str = Field(default="unknown", max_length=64)
    timezone: str = Field(default="", max_length=64)

    @field_validator("installId", "appVersion", "platform", "timezone")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class ReportIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3, max_length=8000)
    email: Optional[str] = Field(default=None, max_length=200)
    appVersion: str = Field(default="unknown", max_length=64)
    platform: str = Field(default="unknown", max_length=64)
    userAgent: str = Field(default="", max_length=400)
    statusNote: str = Field(default="", max_length=1000)
    diagnostics: str = Field(default="", max_length=200000)
    installId: Optional[str] = Field(default=None, max_length=80)

    @field_validator(
        "title",
        "description",
        "email",
        "appVersion",
        "platform",
        "userAgent",
        "statusNote",
        "diagnostics",
        "installId",
    )
    @classmethod
    def strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ReportResolveIn(BaseModel):
    resolved: bool = True


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/heartbeat")
def heartbeat(payload: HeartbeatIn) -> dict[str, str]:
    now = utc_now()
    with db() as conn:
        row = conn.execute(
            "SELECT install_id FROM installs WHERE install_id = ?",
            (payload.installId,),
        ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE installs
                SET last_seen = ?, app_version = ?, platform = ?, timezone = ?,
                    heartbeat_count = heartbeat_count + 1
                WHERE install_id = ?
                """,
                (now, payload.appVersion, payload.platform, payload.timezone, payload.installId),
            )
        else:
            conn.execute(
                """
                INSERT INTO installs (
                  install_id, first_seen, last_seen, app_version, platform, timezone, heartbeat_count
                ) VALUES (?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    payload.installId,
                    now,
                    now,
                    payload.appVersion,
                    payload.platform,
                    payload.timezone,
                ),
            )
        conn.execute(
            """
            INSERT INTO heartbeats (install_id, seen_at, app_version, platform, timezone)
            VALUES (?, ?, ?, ?, ?)
            """,
            (payload.installId, now, payload.appVersion, payload.platform, payload.timezone),
        )
    return {"status": "ok"}


@app.post("/api/v1/reports")
def create_report(payload: ReportIn, request: Request) -> dict[str, Any]:
    now = utc_now()
    user_agent = payload.userAgent or (request.headers.get("user-agent") or "")[:400]
    with db() as conn:
        cur = conn.execute(
            """
            INSERT INTO reports (
              created_at, title, description, email, app_version, platform,
              user_agent, status_note, diagnostics, install_id, resolved
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                now,
                payload.title,
                payload.description,
                payload.email,
                payload.appVersion,
                payload.platform,
                user_agent,
                payload.statusNote or "",
                payload.diagnostics or "",
                payload.installId,
            ),
        )
        report_id = int(cur.lastrowid)
    return {"status": "ok", "id": report_id}


@app.get("/api/v1/admin/stats")
def admin_stats(_: str = Depends(require_admin)) -> dict[str, Any]:
    now = utc_now()
    day = 24 * 60 * 60
    with db() as conn:
        total = conn.execute("SELECT COUNT(*) AS n FROM installs").fetchone()["n"]
        active_7 = conn.execute(
            "SELECT COUNT(*) AS n FROM installs WHERE last_seen >= ?",
            (now - 7 * day,),
        ).fetchone()["n"]
        active_30 = conn.execute(
            "SELECT COUNT(*) AS n FROM installs WHERE last_seen >= ?",
            (now - 30 * day,),
        ).fetchone()["n"]
        new_7 = conn.execute(
            "SELECT COUNT(*) AS n FROM installs WHERE first_seen >= ?",
            (now - 7 * day,),
        ).fetchone()["n"]
        open_reports = conn.execute(
            "SELECT COUNT(*) AS n FROM reports WHERE resolved = 0"
        ).fetchone()["n"]
        versions = [
            {"version": row["app_version"] or "unknown", "count": row["n"]}
            for row in conn.execute(
                """
                SELECT app_version, COUNT(*) AS n
                FROM installs
                WHERE last_seen >= ?
                GROUP BY app_version
                ORDER BY n DESC
                LIMIT 12
                """,
                (now - 30 * day,),
            )
        ]
        recent = [
            dict(row)
            for row in conn.execute(
                """
                SELECT install_id, first_seen, last_seen, app_version, platform, timezone, heartbeat_count
                FROM installs
                ORDER BY last_seen DESC
                LIMIT 50
                """
            )
        ]
    return {
        "totalInstalls": total,
        "active7d": active_7,
        "active30d": active_30,
        "new7d": new_7,
        "openReports": open_reports,
        "versions30d": versions,
        "recentInstalls": recent,
        "generatedAt": now,
    }


@app.get("/api/v1/admin/reports")
def admin_reports(_: str = Depends(require_admin)) -> dict[str, Any]:
    with db() as conn:
        rows = [
            dict(row)
            for row in conn.execute(
                """
                SELECT id, created_at, title, description, email, app_version, platform,
                       user_agent, status_note, diagnostics, install_id, resolved
                FROM reports
                ORDER BY created_at DESC
                LIMIT 200
                """
            )
        ]
    return {"reports": rows}


@app.patch("/api/v1/admin/reports/{report_id}")
def resolve_report(
    report_id: int,
    payload: ReportResolveIn,
    _: str = Depends(require_admin),
) -> dict[str, Any]:
    with db() as conn:
        cur = conn.execute(
            "UPDATE reports SET resolved = ? WHERE id = ?",
            (1 if payload.resolved else 0, report_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Report not found")
    return {"status": "ok", "id": report_id, "resolved": payload.resolved}


@app.get("/admin", response_class=HTMLResponse)
@app.get("/admin/", response_class=HTMLResponse)
def admin_page(_: str = Depends(require_admin)) -> FileResponse:
    if not ADMIN_HTML.exists():
        raise HTTPException(status_code=500, detail="admin.html missing")
    return FileResponse(ADMIN_HTML)


@app.get("/")
def root() -> JSONResponse:
    return JSONResponse(
        {
            "service": "vibegene-api",
            "health": "/api/v1/health",
            "admin": "/admin",
        }
    )
