from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import time
from contextlib import contextmanager
from email.message import EmailMessage
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "safeher.db"
INCIDENTS_DIR = DATA_DIR / "incidents"


def parse_env_file() -> dict[str, str]:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return {}

    values: dict[str, str] = {}

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")

    return values


def load_env_file() -> None:
    for key, value in parse_env_file().items():
        os.environ.setdefault(key, value)


load_env_file()

HOST = os.getenv("SAFEHER_HOST", "0.0.0.0")
PORT = int(os.getenv("PORT") or os.getenv("SAFEHER_PORT", "8000"))
APP_USER_AGENT = os.getenv("SAFEHER_USER_AGENT", f"SafeHer/1.0 (+http://{HOST}:{PORT}/)")
SOS_PROVIDER = os.getenv("SAFEHER_SOS_PROVIDER", "auto").strip().lower() or "auto"
SOS_WEBHOOK_URL = os.getenv("SAFEHER_SOS_WEBHOOK_URL", "").strip()
SOS_WEBHOOK_BEARER_TOKEN = os.getenv("SAFEHER_SOS_WEBHOOK_BEARER_TOKEN", "").strip()
try:
    SOS_WEBHOOK_TIMEOUT = max(5, int(os.getenv("SAFEHER_SOS_WEBHOOK_TIMEOUT", "15")))
except ValueError:
    SOS_WEBHOOK_TIMEOUT = 15
FAST2SMS_BASE_URL = os.getenv("FAST2SMS_BASE_URL", "https://www.fast2sms.com").strip().rstrip("/")
FAST2SMS_API_KEY = os.getenv("FAST2SMS_API_KEY", "").strip()
FAST2SMS_ROUTE = os.getenv("FAST2SMS_ROUTE", "q").strip().lower() or "q"
FAST2SMS_LANGUAGE = os.getenv("FAST2SMS_LANGUAGE", "english").strip().lower() or "english"
FAST2SMS_SENDER_ID = os.getenv("FAST2SMS_SENDER_ID", "").strip()
FAST2SMS_ENTITY_ID = os.getenv("FAST2SMS_ENTITY_ID", "").strip()
FAST2SMS_TEMPLATE_ID = os.getenv("FAST2SMS_TEMPLATE_ID", "").strip()
try:
    FAST2SMS_TIMEOUT = max(5, int(os.getenv("FAST2SMS_TIMEOUT", "15")))
except ValueError:
    FAST2SMS_TIMEOUT = 15
NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
OSRM_ROUTE_BASE = "http://router.project-osrm.org/route/v1/driving"
MAP_CACHE: dict[str, tuple[float, Any]] = {}

KNOWN_LOCATIONS = {
    "thanjavur": {"lat": 10.7870, "lng": 79.1546, "label": "Thanjavur, Tamil Nadu"},
    "tamil": {"lat": 10.7870, "lng": 79.1546, "label": "Thanjavur, Tamil Nadu"},
    "tanjore": {"lat": 10.7870, "lng": 79.1546, "label": "Thanjavur, Tamil Nadu"},
    "trichy": {"lat": 10.8163, "lng": 78.7066, "label": "Tiruchirappalli, Tamil Nadu"},
    "tiruchchirappalli": {"lat": 10.8163, "lng": 78.7066, "label": "Tiruchirappalli, Tamil Nadu"},
    "madurai": {"lat": 9.9252, "lng": 78.1198, "label": "Madurai, Tamil Nadu"},
    "coimbatore": {"lat": 11.0066, "lng": 76.9655, "label": "Coimbatore, Tamil Nadu"},
    "salem": {"lat": 11.6643, "lng": 78.1460, "label": "Salem, Tamil Nadu"},
    "t nagar": {"lat": 13.0415, "lng": 80.2337, "label": "T Nagar, Chennai"},
    "tnagar": {"lat": 13.0415, "lng": 80.2337, "label": "T Nagar, Chennai"},
    "egmore": {"lat": 13.0744, "lng": 80.2619, "label": "Egmore, Chennai"},
    "chromepet": {"lat": 12.9516, "lng": 80.1406, "label": "Chromepet, Chennai"},
    "pallavaram": {"lat": 12.9677, "lng": 80.1499, "label": "Pallavaram, Chennai"},
    "guindy": {"lat": 13.0071, "lng": 80.2127, "label": "Guindy, Chennai"},
    "phoenix marketcity": {"lat": 13.0267, "lng": 80.2469, "label": "Phoenix Marketcity, Chennai"},
    "chennai central": {"lat": 13.0827, "lng": 80.2707, "label": "Chennai Central Railway Station"},
    "airport metro": {"lat": 12.9940, "lng": 80.2104, "label": "Airport Metro, Chennai"},
}


class ApiError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def now_ts() -> int:
    return int(time.time())


def get_runtime_env_value(name: str, default: str = "") -> str:
    runtime_values = parse_env_file()
    file_value = runtime_values.get(name)
    env_value = os.getenv(name)

    if file_value is not None:
        return file_value
    if env_value is not None:
        return env_value
    return default


def get_runtime_sos_settings() -> dict[str, Any]:
    provider = get_runtime_env_value("SAFEHER_SOS_PROVIDER", "auto").strip().lower() or "auto"
    webhook_url = get_runtime_env_value("SAFEHER_SOS_WEBHOOK_URL", "").strip()
    webhook_bearer_token = get_runtime_env_value("SAFEHER_SOS_WEBHOOK_BEARER_TOKEN", "").strip()
    try:
        webhook_timeout = max(5, int(get_runtime_env_value("SAFEHER_SOS_WEBHOOK_TIMEOUT", "15")))
    except ValueError:
        webhook_timeout = 15

    fast2sms_base_url = get_runtime_env_value("FAST2SMS_BASE_URL", "https://www.fast2sms.com").strip().rstrip("/")
    fast2sms_api_key = get_runtime_env_value("FAST2SMS_API_KEY", "").strip()
    fast2sms_route = get_runtime_env_value("FAST2SMS_ROUTE", "q").strip().lower() or "q"
    fast2sms_language = get_runtime_env_value("FAST2SMS_LANGUAGE", "english").strip().lower() or "english"
    fast2sms_sender_id = get_runtime_env_value("FAST2SMS_SENDER_ID", "").strip()
    fast2sms_entity_id = get_runtime_env_value("FAST2SMS_ENTITY_ID", "").strip()
    fast2sms_template_id = get_runtime_env_value("FAST2SMS_TEMPLATE_ID", "").strip()
    try:
        fast2sms_timeout = max(5, int(get_runtime_env_value("FAST2SMS_TIMEOUT", "15")))
    except ValueError:
        fast2sms_timeout = 15

    return {
        "provider": provider,
        "webhook_url": webhook_url,
        "webhook_bearer_token": webhook_bearer_token,
        "webhook_timeout": webhook_timeout,
        "fast2sms_base_url": fast2sms_base_url,
        "fast2sms_api_key": fast2sms_api_key,
        "fast2sms_route": fast2sms_route,
        "fast2sms_language": fast2sms_language,
        "fast2sms_sender_id": fast2sms_sender_id,
        "fast2sms_entity_id": fast2sms_entity_id,
        "fast2sms_template_id": fast2sms_template_id,
        "fast2sms_timeout": fast2sms_timeout,
    }


def parse_env_bool(name: str, default: bool = False) -> bool:
    raw = get_runtime_env_value(name, "true" if default else "false").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def get_runtime_alert_settings() -> dict[str, Any]:
    public_base_url = get_runtime_env_value("SAFEHER_PUBLIC_BASE_URL", os.getenv("RENDER_EXTERNAL_URL", "")).strip().rstrip("/")
    smtp_host = get_runtime_env_value("SAFEHER_SMTP_HOST", "").strip()
    smtp_username = get_runtime_env_value("SAFEHER_SMTP_USERNAME", "").strip()
    smtp_password = get_runtime_env_value("SAFEHER_SMTP_PASSWORD", "").strip()
    smtp_from = get_runtime_env_value("SAFEHER_SMTP_FROM", "").strip()
    telegram_bot_token = get_runtime_env_value("SAFEHER_TELEGRAM_BOT_TOKEN", "").strip()
    try:
        smtp_port = int(get_runtime_env_value("SAFEHER_SMTP_PORT", "587"))
    except ValueError:
        smtp_port = 587

    return {
        "public_base_url": public_base_url,
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
        "smtp_username": smtp_username,
        "smtp_password": smtp_password,
        "smtp_from": smtp_from,
        "smtp_use_tls": parse_env_bool("SAFEHER_SMTP_USE_TLS", True),
        "smtp_use_ssl": parse_env_bool("SAFEHER_SMTP_USE_SSL", False),
        "telegram_bot_token": telegram_bot_token,
    }


def ensure_incidents_dir() -> None:
    ensure_data_dir()
    INCIDENTS_DIR.mkdir(parents=True, exist_ok=True)


def get_incident_dir(incident_id: str) -> Path:
    ensure_incidents_dir()
    return INCIDENTS_DIR / incident_id


def get_incident_meta_path(incident_id: str) -> Path:
    return get_incident_dir(incident_id) / "incident.json"


def get_incident_frame_path(incident_id: str, extension: str = "jpg") -> Path:
    return get_incident_dir(incident_id) / f"latest.{extension}"


def get_incident_video_path(incident_id: str, extension: str = "webm") -> Path:
    return get_incident_dir(incident_id) / f"latest-video.{extension}"


def write_json_file(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


def read_incident_record(incident_id: str) -> dict[str, Any]:
    meta_path = get_incident_meta_path(incident_id)
    if not meta_path.exists():
        raise ApiError(404, "Incident was not found.")

    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ApiError(500, "Incident record is corrupted.") from exc


def save_incident_record(record: dict[str, Any]) -> None:
    incident_id = str(record.get("id") or "").strip()
    if not incident_id:
        raise ApiError(500, "Incident record is missing an id.")

    write_json_file(get_incident_meta_path(incident_id), record)


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


@contextmanager
def db_conn() -> Any:
    ensure_data_dir()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        yield conn
        conn.commit()
    finally:
        conn.close()


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    if not column_exists(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    with db_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE,
                phone_country_code TEXT,
                phone_number TEXT,
                phone_e164 TEXT UNIQUE,
                auth_method TEXT NOT NULL DEFAULT 'email',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_e164);
            """
        )
        ensure_column(conn, "users", "password_hash", "TEXT")
        ensure_column(conn, "users", "password_salt", "TEXT")


def json_dumps(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=True).encode("utf-8")


def normalize_name(value: str) -> str:
    name = re.sub(r"\s+", " ", value.strip())
    if len(name) < 2:
        raise ApiError(400, "Enter your full name to continue.")
    return name


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ApiError(400, "Enter a valid email address.")
    return email


def normalize_password(value: str, *, login: bool = False) -> str:
    password = value or ""
    if not password:
        raise ApiError(400, "Enter your password.")
    if not login and len(password) < 6:
        raise ApiError(400, "Password must be at least 6 characters.")
    return password


def create_password_record(password: str) -> tuple[str, str]:
    salt = secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120000,
    ).hex()
    return salt, password_hash


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    computed_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120000,
    ).hex()
    return hmac.compare_digest(computed_hash, password_hash)


def get_user_by_email(conn: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def serialize_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "registered": True,
        "authMethod": "email",
        "contact": row["email"],
        "email": row["email"],
    }


def parse_json_body(handler: "SafeHerHandler") -> dict[str, Any]:
    raw_length = handler.headers.get("Content-Length", "0").strip() or "0"
    try:
        length = int(raw_length)
    except ValueError as exc:
        raise ApiError(400, "Invalid request body.") from exc

    if length <= 0:
        raise ApiError(400, "Request body is required.")

    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ApiError(400, "Request body must be valid JSON.") from exc


def parse_int(value: str, *, field: str, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ApiError(400, f"Invalid {field}.") from exc

    if minimum is not None and parsed < minimum:
        raise ApiError(400, f"{field.capitalize()} is too small.")
    if maximum is not None and parsed > maximum:
        raise ApiError(400, f"{field.capitalize()} is too large.")
    return parsed


def parse_float(value: str, *, field: str, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ApiError(400, f"Invalid {field}.") from exc

    if parsed < minimum or parsed > maximum:
        raise ApiError(400, f"{field.capitalize()} is out of range.")
    return parsed


def get_query_param(query: dict[str, list[str]], name: str, *, required: bool = True) -> str:
    values = query.get(name)
    if not values or not values[0].strip():
        if required:
            raise ApiError(400, f"Missing {name}.")
        return ""
    return values[0].strip()


def get_cache(key: str) -> Any | None:
    cached = MAP_CACHE.get(key)
    if not cached:
        return None

    expires_at, payload = cached
    if expires_at <= time.time():
        MAP_CACHE.pop(key, None)
        return None

    return payload


def set_cache(key: str, payload: Any, ttl_seconds: int) -> Any:
    MAP_CACHE[key] = (time.time() + ttl_seconds, payload)
    return payload


def http_get_json(url: str, *, timeout: int = 12, headers: dict[str, str] | None = None) -> Any:
    request_headers = {
        "User-Agent": APP_USER_AGENT,
        "Accept": "application/json",
    }
    if headers:
        request_headers.update(headers)

    request = Request(url, headers=request_headers, method="GET")
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        raise ApiError(502, f"Map service returned {exc.code}.") from exc
    except URLError as exc:
        raise ApiError(502, "Map service is unreachable right now.") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ApiError(502, "Map service returned an invalid response.") from exc


def http_post_json(
    url: str,
    payload: Any,
    *,
    timeout: int = 15,
    headers: dict[str, str] | None = None,
    service_label: str = "Provider",
) -> Any:
    request_headers = {
        "User-Agent": APP_USER_AGENT,
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
    }
    if headers:
        request_headers.update(headers)

    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    request = Request(url, data=body, headers=request_headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        response_text = ""
        try:
            response_text = exc.read().decode("utf-8")
        except Exception:
            response_text = ""
        detail = f"{service_label} returned {exc.code}."
        if response_text:
            detail = f"{detail} {response_text[:200]}"
        raise ApiError(502, detail) from exc
    except URLError as exc:
        raise ApiError(502, f"{service_label} is unreachable right now.") from exc

    if not raw.strip():
        return {"ok": True}

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"ok": True, "raw": raw}


def http_post_form(
    url: str,
    fields: dict[str, Any],
    *,
    timeout: int = 15,
    headers: dict[str, str] | None = None,
    service_label: str = "Provider",
) -> Any:
    request_headers = {
        "User-Agent": APP_USER_AGENT,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    if headers:
        request_headers.update(headers)

    body = urlencode({key: str(value) for key, value in fields.items() if value is not None}).encode("utf-8")
    request = Request(url, data=body, headers=request_headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        response_text = ""
        try:
            response_text = exc.read().decode("utf-8")
        except Exception:
            response_text = ""
        detail = f"{service_label} returned {exc.code}."
        if response_text:
            detail = f"{detail} {response_text[:200]}"
        raise ApiError(502, detail) from exc
    except URLError as exc:
        raise ApiError(502, f"{service_label} is unreachable right now.") from exc

    if not raw.strip():
        return {"ok": True}

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"ok": True, "raw": raw}


def search_places(query_text: str, limit: int) -> dict[str, Any]:
    query_text = query_text.strip()
    if len(query_text) < 2:
        raise ApiError(400, "Enter at least 2 characters to search.")

    # Check if query matches any known location
    query_lower = query_text.lower()
    for key, location in KNOWN_LOCATIONS.items():
        if query_lower in key or key in query_lower:
            return {
                "ok": True,
                "results": [
                    {
                        "label": location["label"],
                        "shortLabel": location["label"].split(",")[0].strip(),
                        "lat": location["lat"],
                        "lng": location["lng"],
                    }
                ],
            }

    safe_limit = max(1, min(limit, 5))
    params = urlencode(
        {
            "q": query_text,
            "format": "jsonv2",
            "limit": str(safe_limit),
            "addressdetails": "0",
        }
    )
    url = f"{NOMINATIM_BASE}/search?{params}"
    cache_key = f"map-search:{query_text.lower()}:{safe_limit}"
    data = get_cache(cache_key)
    if data is None:
        data = set_cache(cache_key, http_get_json(url, headers={"Accept-Language": "en"}), 900)

    results = []
    for item in data:
        try:
            lat = float(item["lat"])
            lng = float(item["lon"])
        except (KeyError, TypeError, ValueError):
            continue

        label = str(item.get("display_name") or "").strip()
        if not label:
            continue

        results.append(
            {
                "label": label,
                "shortLabel": label.split(",")[0].strip(),
                "lat": lat,
                "lng": lng,
            }
        )

    return {"ok": True, "results": results}


def reverse_place(lat: float, lng: float) -> dict[str, Any]:
    params = urlencode(
        {
            "lat": f"{lat:.6f}",
            "lon": f"{lng:.6f}",
            "format": "jsonv2",
            "zoom": "18",
            "addressdetails": "0",
        }
    )
    url = f"{NOMINATIM_BASE}/reverse?{params}"
    cache_key = f"map-reverse:{lat:.5f}:{lng:.5f}"
    data = get_cache(cache_key)
    if data is None:
        data = set_cache(cache_key, http_get_json(url, headers={"Accept-Language": "en"}), 600)

    label = str(data.get("display_name") or f"{lat:.5f}, {lng:.5f}").strip()
    return {
        "ok": True,
        "result": {
            "label": label,
            "shortLabel": label.split(",")[0].strip(),
            "lat": lat,
            "lng": lng,
        },
    }


def parse_route_coords(raw_value: str) -> list[tuple[float, float]]:
    parts = [part.strip() for part in raw_value.split(";") if part.strip()]
    if len(parts) < 2:
        raise ApiError(400, "At least two route points are required.")
    if len(parts) > 5:
        raise ApiError(400, "Too many route points were provided.")

    coords: list[tuple[float, float]] = []
    for part in parts:
        try:
            lng_text, lat_text = part.split(",", 1)
        except ValueError as exc:
            raise ApiError(400, "Route points must be in lng,lat format.") from exc

        lng = parse_float(lng_text, field="longitude", minimum=-180, maximum=180)
        lat = parse_float(lat_text, field="latitude", minimum=-90, maximum=90)
        coords.append((lng, lat))

    return coords


def fetch_route(coords: list[tuple[float, float]]) -> dict[str, Any]:
    coords_path = ";".join(f"{lng:.6f},{lat:.6f}" for lng, lat in coords)
    params = urlencode(
        {
            "overview": "full",
            "steps": "true",
            "geometries": "geojson",
        }
    )
    url = f"{OSRM_ROUTE_BASE}/{coords_path}?{params}"
    cache_key = f"map-route:{coords_path}"
    data = get_cache(cache_key)
    if data is None:
        data = set_cache(cache_key, http_get_json(url), 180)

    if data.get("code") != "Ok" or not data.get("routes"):
        raise ApiError(502, "Route service could not build a path for this trip.")

    route = data["routes"][0]
    steps: list[dict[str, Any]] = []
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            steps.append(step)

    return {
        "ok": True,
        "route": {
            "distance": route.get("distance", 0),
            "duration": route.get("duration", 0),
            "geometry": route.get("geometry", {"type": "LineString", "coordinates": []}),
            "legs": route.get("legs", []),
            "steps": steps,
            "waypoints": data.get("waypoints", []),
        },
    }


def register_user(payload: dict[str, Any]) -> dict[str, Any]:
    name = normalize_name(str(payload.get("name") or ""))
    email = normalize_email(str(payload.get("email") or ""))
    password = normalize_password(str(payload.get("password") or ""))
    current_time = now_ts()
    password_salt, password_hash = create_password_record(password)

    with db_conn() as conn:
        existing_user = get_user_by_email(conn, email)
        if existing_user and existing_user["password_hash"]:
            raise ApiError(409, "Account already exists. Please sign in.")

        if existing_user:
            conn.execute(
                """
                UPDATE users
                SET name = ?, password_hash = ?, password_salt = ?, auth_method = 'email', updated_at = ?
                WHERE id = ?
                """,
                (name, password_hash, password_salt, current_time, existing_user["id"]),
            )
            user_id = existing_user["id"]
        else:
            cursor = conn.execute(
                """
                INSERT INTO users (
                    name,
                    email,
                    auth_method,
                    created_at,
                    updated_at,
                    password_hash,
                    password_salt
                ) VALUES (?, ?, 'email', ?, ?, ?, ?)
                """,
                (name, email, current_time, current_time, password_hash, password_salt),
            )
            user_id = cursor.lastrowid

        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    return {
        "ok": True,
        "message": "Account created successfully.",
        "user": serialize_user(user),
    }


def login_user(payload: dict[str, Any]) -> dict[str, Any]:
    email = normalize_email(str(payload.get("email") or ""))
    password = normalize_password(str(payload.get("password") or ""), login=True)

    with db_conn() as conn:
        user = get_user_by_email(conn, email)
        if not user or not user["password_hash"] or not user["password_salt"]:
            raise ApiError(401, "Incorrect email or password.")

        if not verify_password(password, user["password_salt"], user["password_hash"]):
            raise ApiError(401, "Incorrect email or password.")

    return {
        "ok": True,
        "message": "Signed in successfully.",
        "user": serialize_user(user),
    }


def normalize_alert_phone(value: str) -> str:
    cleaned = value.strip()
    digits = re.sub(r"\D", "", cleaned)
    if len(digits) < 5:
        raise ApiError(400, "Each SOS recipient must include a valid phone number.")
    return f"+{digits}" if cleaned.startswith("+") else digits


def normalize_optional_alert_phone(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        return ""
    return normalize_alert_phone(cleaned)


def normalize_telegram_chat_id(value: str) -> str:
    telegram = value.strip()
    if not telegram:
        return ""
    if re.fullmatch(r"-?\d{5,}", telegram) or re.fullmatch(r"@[A-Za-z0-9_]{5,}", telegram):
        return telegram
    raise ApiError(400, "Telegram Chat ID must be numeric or start with @.")


def build_request_base_url(handler: "SafeHerHandler") -> str:
    settings = get_runtime_alert_settings()
    if settings["public_base_url"]:
        return settings["public_base_url"]

    host = handler.headers.get("Host", f"{HOST}:{PORT}").strip()
    forwarded_proto = handler.headers.get("X-Forwarded-Proto", "").strip().lower()
    scheme = "https" if forwarded_proto == "https" else "http"
    return f"{scheme}://{host}"


def build_incident_viewer_url(handler: "SafeHerHandler", incident_id: str, token: str) -> str:
    base_url = build_request_base_url(handler).rstrip("/")
    return f"{base_url}/pages/incident-view.html?incident={incident_id}&token={token}"


def is_public_viewer_url(url: str) -> bool:
    lowered = url.lower()
    return not any(part in lowered for part in ("127.0.0.1", "localhost", "0.0.0.0"))


def decode_data_url_image(data_url: str) -> tuple[bytes, str, str]:
    match = re.fullmatch(r"data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)", data_url.strip(), re.IGNORECASE)
    if not match:
        raise ApiError(400, "Snapshot must be a base64 data URL image.")

    image_kind = match.group(1).lower()
    extension = "jpg" if image_kind in {"jpeg", "jpg"} else "png"
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except ValueError as exc:
        raise ApiError(400, "Snapshot image data is invalid.") from exc

    if len(raw) > 6 * 1024 * 1024:
        raise ApiError(400, "Snapshot image is too large.")

    content_type = "image/jpeg" if extension == "jpg" else "image/png"
    return raw, extension, content_type


def decode_data_url_video(data_url: str) -> tuple[bytes, str, str]:
    match = re.fullmatch(
        r"data:video/(webm|mp4|ogg)(?:;codecs=[A-Za-z0-9,._-]+)?;base64,([A-Za-z0-9+/=\s]+)",
        data_url.strip(),
        re.IGNORECASE,
    )
    if not match:
        raise ApiError(400, "Video clip must be a base64 data URL video.")

    extension = match.group(1).lower()
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except ValueError as exc:
        raise ApiError(400, "Video clip data is invalid.") from exc

    if len(raw) > 24 * 1024 * 1024:
        raise ApiError(400, "Video clip is too large.")

    content_type = {
        "webm": "video/webm",
        "mp4": "video/mp4",
        "ogg": "video/ogg",
    }[extension]
    return raw, extension, content_type


def create_incident_record(
    *,
    handler: "SafeHerHandler",
    message: str,
    recipients: list[dict[str, Any]],
    meta: dict[str, Any],
) -> dict[str, Any]:
    incident_id = secrets.token_hex(8)
    viewer_token = secrets.token_urlsafe(24)
    viewer_url = build_incident_viewer_url(handler, incident_id, viewer_token)
    created_at = now_ts()

    incident_record = {
        "id": incident_id,
        "viewer_token": viewer_token,
        "viewer_url": viewer_url,
        "status": "active",
        "message": message,
        "created_at": created_at,
        "updated_at": created_at,
        "snapshot_updated_at": 0,
        "snapshot_extension": "",
        "video_updated_at": 0,
        "video_extension": "",
        "user_name": str(meta.get("userName") or "SafeHer User").strip()[:80] or "SafeHer User",
        "location": str(meta.get("location") or "").strip()[:160],
        "vehicle": str(meta.get("vehicle") or "").strip()[:80],
        "trigger": str(meta.get("trigger") or "SOS Triggered").strip()[:160] or "SOS Triggered",
        "transcript_preview": str(meta.get("transcriptPreview") or "").strip()[:240],
        "media": meta.get("media") if isinstance(meta.get("media"), dict) else {},
        "recipients": recipients,
        "transcripts": [],
        "events": [],
    }
    save_incident_record(incident_record)
    return incident_record


def normalize_fast2sms_number(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    elif len(digits) > 10:
        digits = digits[-10:]

    if len(digits) != 10 or digits[0] not in "6789":
        raise ApiError(400, "Fast2SMS requires a valid Indian mobile number for each SOS recipient.")
    return digits


def summarize_provider_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [str(item).strip() for item in value if str(item).strip()]
        return "; ".join(parts)
    if isinstance(value, dict):
        for key in ("message", "error", "reason", "detail"):
            text = summarize_provider_text(value.get(key))
            if text:
                return text
    return ""


def normalize_incident_recipient(item: dict[str, Any]) -> dict[str, Any]:
    label = str(item.get("label") or item.get("name") or "Emergency Contact").strip()[:80] or "Emergency Contact"
    phone = normalize_optional_alert_phone(str(item.get("dialNumber") or item.get("phone") or item.get("number") or ""))
    email = str(item.get("email") or "").strip().lower()
    telegram_chat_id = normalize_telegram_chat_id(str(item.get("telegramChatId") or item.get("telegram") or ""))
    contact_id = str(item.get("contactId") or "").strip()[:80]

    if email:
        email = normalize_email(email)

    if not phone and not email and not telegram_chat_id:
        raise ApiError(400, "Each live incident contact needs a phone number, email, or Telegram Chat ID.")

    return {
        "contact_id": contact_id,
        "label": label,
        "phone": phone,
        "email": email,
        "telegram_chat_id": telegram_chat_id,
    }


def append_incident_event(record: dict[str, Any], text: str) -> None:
    event_text = text.strip()
    if not event_text:
        return

    events = record.setdefault("events", [])
    events.append({"text": event_text[:240], "created_at": now_ts()})
    if len(events) > 40:
        del events[:-40]
    record["updated_at"] = now_ts()


def append_incident_transcripts(record: dict[str, Any], entries: list[dict[str, Any]]) -> None:
    transcripts = record.setdefault("transcripts", [])
    for entry in entries:
        text = str(entry.get("text") or "").strip()
        if not text:
            continue

        captured_at_raw = entry.get("capturedAt")
        try:
            captured_at = int(int(captured_at_raw) / 1000) if captured_at_raw else now_ts()
        except (TypeError, ValueError):
            captured_at = now_ts()

        if transcripts and transcripts[-1]["text"] == text:
            continue

        transcripts.append(
            {
                "text": text[:500],
                "captured_at": captured_at,
                "source": str(entry.get("source") or "speech")[:40] or "speech",
            }
        )

    if len(transcripts) > 30:
        del transcripts[:-30]

    if transcripts:
        record["transcript_preview"] = transcripts[-1]["text"]
    record["updated_at"] = now_ts()


def save_incident_snapshot(record: dict[str, Any], image_data: str) -> None:
    raw, extension, _content_type = decode_data_url_image(image_data)
    incident_dir = get_incident_dir(record["id"])
    incident_dir.mkdir(parents=True, exist_ok=True)

    previous_extension = str(record.get("snapshot_extension") or "").strip()
    if previous_extension and previous_extension != extension:
        old_path = get_incident_frame_path(record["id"], previous_extension)
        if old_path.exists():
            old_path.unlink()

    frame_path = get_incident_frame_path(record["id"], extension)
    frame_path.write_bytes(raw)
    record["snapshot_extension"] = extension
    record["snapshot_updated_at"] = now_ts()
    record["updated_at"] = now_ts()


def save_incident_video_clip(record: dict[str, Any], video_data: str) -> None:
    raw, extension, _content_type = decode_data_url_video(video_data)
    incident_dir = get_incident_dir(record["id"])
    incident_dir.mkdir(parents=True, exist_ok=True)

    previous_extension = str(record.get("video_extension") or "").strip()
    if previous_extension and previous_extension != extension:
        old_path = get_incident_video_path(record["id"], previous_extension)
        if old_path.exists():
            old_path.unlink()

    video_path = get_incident_video_path(record["id"], extension)
    video_path.write_bytes(raw)
    record["video_extension"] = extension
    record["video_updated_at"] = now_ts()
    record["updated_at"] = now_ts()


def load_authorized_incident(incident_id: str, token: str) -> dict[str, Any]:
    if not incident_id.strip() or not token.strip():
        raise ApiError(400, "Incident id and token are required.")

    record = read_incident_record(incident_id.strip())
    expected_token = str(record.get("viewer_token") or "")
    if not expected_token or not secrets.compare_digest(expected_token, token.strip()):
        raise ApiError(403, "Incident viewer token is invalid.")
    return record


def build_snapshot_api_url(incident_id: str, token: str) -> str:
    return f"/api/sos/frame?incident={incident_id}&token={token}&ts={now_ts()}"


def build_video_api_url(incident_id: str, token: str) -> str:
    return f"/api/sos/video?incident={incident_id}&token={token}&ts={now_ts()}"


def serialize_incident_for_view(record: dict[str, Any], token: str) -> dict[str, Any]:
    snapshot_extension = str(record.get("snapshot_extension") or "").strip()
    snapshot_url = build_snapshot_api_url(record["id"], token) if snapshot_extension else ""
    video_extension = str(record.get("video_extension") or "").strip()
    video_url = build_video_api_url(record["id"], token) if video_extension else ""
    transcripts = [
        {
            "text": item["text"],
            "capturedAt": item["captured_at"],
            "source": item.get("source") or "speech",
        }
        for item in record.get("transcripts", [])[-10:]
    ]

    return {
        "ok": True,
        "incident": {
            "id": record["id"],
            "status": record.get("status") or "active",
            "userName": record.get("user_name") or "SafeHer User",
            "location": record.get("location") or "",
            "vehicle": record.get("vehicle") or "",
            "trigger": record.get("trigger") or "SOS Triggered",
            "latestTranscript": record.get("transcript_preview") or "Waiting for voice updates...",
            "snapshotUpdatedAt": int(record.get("snapshot_updated_at") or 0),
            "videoUpdatedAt": int(record.get("video_updated_at") or 0),
            "viewerUrl": record.get("viewer_url") or "",
        },
        "snapshotUrl": snapshot_url,
        "videoUrl": video_url,
        "transcripts": transcripts,
    }


def send_email_alert(recipient_email: str, subject: str, body_text: str) -> dict[str, Any]:
    settings = get_runtime_alert_settings()
    if not settings["smtp_host"] or not settings["smtp_from"]:
        return {"ok": False, "type": "email", "message": "Email automation is not configured in .env."}

    email_message = EmailMessage()
    email_message["From"] = settings["smtp_from"]
    email_message["To"] = recipient_email
    email_message["Subject"] = subject
    email_message.set_content(body_text)

    try:
        if settings["smtp_use_ssl"]:
            with smtplib.SMTP_SSL(settings["smtp_host"], settings["smtp_port"], timeout=20) as server:
                if settings["smtp_username"]:
                    server.login(settings["smtp_username"], settings["smtp_password"])
                server.send_message(email_message)
        else:
            with smtplib.SMTP(settings["smtp_host"], settings["smtp_port"], timeout=20) as server:
                server.ehlo()
                if settings["smtp_use_tls"]:
                    server.starttls()
                    server.ehlo()
                if settings["smtp_username"]:
                    server.login(settings["smtp_username"], settings["smtp_password"])
                server.send_message(email_message)
    except Exception as exc:
        return {"ok": False, "type": "email", "message": f"Email delivery failed: {exc}"}

    return {"ok": True, "type": "email", "message": f"Email sent to {recipient_email}."}


def send_telegram_alert(chat_id: str, text: str) -> dict[str, Any]:
    settings = get_runtime_alert_settings()
    bot_token = settings["telegram_bot_token"]
    if not bot_token:
        return {"ok": False, "type": "telegram", "message": "Telegram bot token is not configured in .env."}

    try:
        provider_response = http_post_json(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            {
                "chat_id": chat_id,
                "text": text,
                "disable_web_page_preview": False,
            },
            timeout=20,
            service_label="Telegram",
        )
    except ApiError as exc:
        return {"ok": False, "type": "telegram", "message": exc.message}

    if isinstance(provider_response, dict) and provider_response.get("ok") is False:
        return {
            "ok": False,
            "type": "telegram",
            "message": summarize_provider_text(provider_response) or "Telegram rejected the alert.",
        }

    return {"ok": True, "type": "telegram", "message": f"Telegram alert sent to {chat_id}."}


def build_incident_notification_text(record: dict[str, Any], *, safe_update: bool = False, note: str = "") -> str:
    heading = "SAFEHER SAFE UPDATE" if safe_update else "SAFEHER SOS ALERT"
    lines = [
        heading,
        f"Name: {record.get('user_name') or 'SafeHer User'}",
        f"Trigger: {record.get('trigger') or 'SOS Triggered'}",
        f"Location: {record.get('location') or 'Not provided'}",
        f"Vehicle: {record.get('vehicle') or 'Not provided'}",
    ]

    transcript = str(record.get("transcript_preview") or "").strip()
    if transcript:
        lines.append(f"Latest transcript: {transcript}")

    if note:
        lines.append(note.strip())

    lines.append("Viewer includes rolling video clips, latest snapshots, and transcript updates when device permissions allow.")
    lines.append(f"Secure live viewer: {record.get('viewer_url') or 'Unavailable'}")
    return "\n".join(lines)


def dispatch_incident_notifications(record: dict[str, Any], *, safe_update: bool = False, note: str = "") -> dict[str, Any]:
    viewer_url = str(record.get("viewer_url") or "")
    public_viewer = is_public_viewer_url(viewer_url)
    subject = (
        f"SafeHer: {record.get('user_name') or 'SafeHer user'} is safe"
        if safe_update
        else f"SafeHer SOS: {record.get('user_name') or 'SafeHer user'} needs help"
    )
    body = build_incident_notification_text(record, safe_update=safe_update, note=note)

    recipient_results: list[dict[str, Any]] = []
    success_channels = 0
    failed_channels = 0
    successful_recipients = 0

    for recipient in record.get("recipients", []):
        channels: list[dict[str, Any]] = []

        if recipient.get("email"):
            result = send_email_alert(str(recipient["email"]), subject, body)
            channels.append(result)
        if recipient.get("telegram_chat_id"):
            result = send_telegram_alert(str(recipient["telegram_chat_id"]), body)
            channels.append(result)

        if not channels:
            channels.append({"ok": False, "type": "unconfigured", "message": "No email or Telegram destination saved for this contact."})

        if any(channel["ok"] for channel in channels):
            successful_recipients += 1

        for channel in channels:
            if channel["ok"]:
                success_channels += 1
            else:
                failed_channels += 1

        recipient_results.append(
            {
                "contactId": recipient.get("contact_id") or "",
                "label": recipient.get("label") or "Emergency Contact",
                "email": recipient.get("email") or "",
                "telegramChatId": recipient.get("telegram_chat_id") or "",
                "channels": channels,
            }
        )

    ok = success_channels > 0
    provider = "multi"
    if not ok and not get_runtime_alert_settings()["smtp_host"] and not get_runtime_alert_settings()["telegram_bot_token"]:
        provider = "unconfigured"

    summary_message = (
        f"Secure viewer shared with {successful_recipients} contact(s) across {success_channels} channel(s)."
        if ok
        else "SafeHer could not deliver the incident alert through email or Telegram."
    )
    if ok and not public_viewer:
        summary_message = f"{summary_message} Viewer link is local-only until SAFEHER_PUBLIC_BASE_URL points to a public URL."

    return {
        "ok": ok,
        "provider": provider,
        "message": summary_message,
        "summary": {
            "successChannels": success_channels,
            "failedChannels": failed_channels,
            "successfulRecipients": successful_recipients,
            "totalRecipients": len(record.get("recipients", [])),
            "viewerIsPublic": public_viewer,
        },
        "recipients": recipient_results,
    }


def start_live_incident(payload: dict[str, Any], handler: "SafeHerHandler") -> dict[str, Any]:
    message = str(payload.get("message") or "").strip()
    if len(message) < 10:
        raise ApiError(400, "SOS message is too short.")
    if len(message) > 1000:
        raise ApiError(400, "SOS message is too long.")

    recipients_raw = payload.get("recipients")
    if not isinstance(recipients_raw, list) or not recipients_raw:
        raise ApiError(400, "At least one contact is required for live incident sharing.")

    recipients = [normalize_incident_recipient(item) for item in recipients_raw[:20] if isinstance(item, dict)]
    if not recipients:
        raise ApiError(400, "At least one valid live incident contact is required.")

    meta = payload.get("meta")
    if not isinstance(meta, dict):
        meta = {}

    record = create_incident_record(handler=handler, message=message, recipients=recipients, meta=meta)

    initial_transcripts = payload.get("initialTranscripts")
    if isinstance(initial_transcripts, list):
        append_incident_transcripts(record, [item for item in initial_transcripts if isinstance(item, dict)])

    initial_frame_data = str(payload.get("initialFrameData") or "").strip()
    if initial_frame_data:
        save_incident_snapshot(record, initial_frame_data)

    append_incident_event(record, "SOS live incident created.")
    dispatch_result = dispatch_incident_notifications(record)
    record["dispatch_summary"] = dispatch_result.get("summary", {})
    append_incident_event(record, dispatch_result["message"])
    save_incident_record(record)

    return {
        "ok": dispatch_result["ok"],
        "provider": dispatch_result["provider"],
        "message": dispatch_result["message"],
        "viewerUrl": record["viewer_url"],
        "incident": {
            "id": record["id"],
            "token": record["viewer_token"],
            "viewerUrl": record["viewer_url"],
            "status": record["status"],
        },
        "summary": dispatch_result["summary"],
        "recipients": dispatch_result["recipients"],
    }


def record_incident_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    incident_id = str(payload.get("incidentId") or "").strip()
    token = str(payload.get("token") or "").strip()
    image_data = str(payload.get("imageData") or "").strip()
    if not image_data:
        raise ApiError(400, "Snapshot image data is required.")

    record = load_authorized_incident(incident_id, token)
    save_incident_snapshot(record, image_data)
    append_incident_event(record, "Live snapshot refreshed.")
    save_incident_record(record)
    return {"ok": True, "message": "Snapshot uploaded.", "time": record["snapshot_updated_at"]}


def record_incident_video(payload: dict[str, Any]) -> dict[str, Any]:
    incident_id = str(payload.get("incidentId") or "").strip()
    token = str(payload.get("token") or "").strip()
    video_data = str(payload.get("videoData") or "").strip()
    if not video_data:
        raise ApiError(400, "Video clip is required.")

    record = load_authorized_incident(incident_id, token)
    save_incident_video_clip(record, video_data)
    save_incident_record(record)
    return {"ok": True, "message": "Video clip uploaded.", "time": record["video_updated_at"]}


def record_incident_transcripts(payload: dict[str, Any]) -> dict[str, Any]:
    incident_id = str(payload.get("incidentId") or "").strip()
    token = str(payload.get("token") or "").strip()
    entries_raw = payload.get("entries")
    if not isinstance(entries_raw, list) or not entries_raw:
        raise ApiError(400, "Transcript entries are required.")

    record = load_authorized_incident(incident_id, token)
    entries = [item for item in entries_raw[:12] if isinstance(item, dict)]
    append_incident_transcripts(record, entries)
    if record.get("transcript_preview"):
        append_incident_event(record, f"Transcript updated: {record['transcript_preview']}")
    save_incident_record(record)
    return {"ok": True, "message": "Transcript updates saved.", "count": len(entries)}


def finish_live_incident(payload: dict[str, Any]) -> dict[str, Any]:
    incident_id = str(payload.get("incidentId") or "").strip()
    token = str(payload.get("token") or "").strip()
    note = str(payload.get("note") or "").strip()[:240]
    status = str(payload.get("status") or "safe").strip().lower() or "safe"

    record = load_authorized_incident(incident_id, token)
    record["status"] = status
    record["updated_at"] = now_ts()
    append_incident_event(record, note or "User marked the incident as safe.")

    dispatch_result = dispatch_incident_notifications(record, safe_update=True, note=note or "The user has marked herself safe.")
    record["safe_dispatch_summary"] = dispatch_result.get("summary", {})
    save_incident_record(record)

    return {
        "ok": dispatch_result["ok"],
        "provider": dispatch_result["provider"],
        "message": dispatch_result["message"] if dispatch_result["ok"] else "Incident was marked safe. Some contacts may not have received the update.",
    }


def resolve_sos_provider(settings: dict[str, Any] | None = None) -> str:
    runtime_settings = settings or get_runtime_sos_settings()
    provider = runtime_settings["provider"]

    if provider in ("", "auto"):
        if runtime_settings["fast2sms_api_key"]:
            return "fast2sms"
        if runtime_settings["webhook_url"]:
            return "webhook"
        return "unconfigured"
    if provider in {"fast2sms", "webhook"}:
        return provider
    raise ApiError(500, "Unsupported SAFEHER_SOS_PROVIDER value in .env.")


def send_sos_via_fast2sms(
    message: str,
    recipients: list[dict[str, str]],
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    runtime_settings = settings or get_runtime_sos_settings()

    if not runtime_settings["fast2sms_api_key"]:
        return {
            "ok": False,
            "provider": "unconfigured",
            "dispatched": 0,
            "message": "Fast2SMS is selected but FAST2SMS_API_KEY is missing in .env.",
            "recipients": recipients,
        }

    numbers = ",".join(normalize_fast2sms_number(item["phone"]) for item in recipients)
    headers = {"authorization": runtime_settings["fast2sms_api_key"]}
    route = runtime_settings["fast2sms_route"]

    if route == "q":
        provider_response = http_post_form(
            f"{runtime_settings['fast2sms_base_url']}/dev/bulkV2",
            {
                "message": message,
                "language": runtime_settings["fast2sms_language"],
                "route": "q",
                "numbers": numbers,
            },
            timeout=runtime_settings["fast2sms_timeout"],
            headers=headers,
            service_label="Fast2SMS",
        )
    elif route == "dlt_manual":
        missing_fields = [
            name
            for name, value in (
                ("FAST2SMS_SENDER_ID", runtime_settings["fast2sms_sender_id"]),
                ("FAST2SMS_ENTITY_ID", runtime_settings["fast2sms_entity_id"]),
                ("FAST2SMS_TEMPLATE_ID", runtime_settings["fast2sms_template_id"]),
            )
            if not value
        ]
        if missing_fields:
            return {
                "ok": False,
                "provider": "unconfigured",
                "dispatched": 0,
                "message": f"Fast2SMS DLT route needs {', '.join(missing_fields)} in .env.",
                "recipients": recipients,
            }

        provider_response = http_post_json(
            f"{runtime_settings['fast2sms_base_url']}/dev/custom",
            {
                "route": "dlt_manual",
                "requests": [
                    {
                        "sender_id": runtime_settings["fast2sms_sender_id"],
                        "entity_id": runtime_settings["fast2sms_entity_id"],
                        "template_id": runtime_settings["fast2sms_template_id"],
                        "message": message,
                        "flash": 0,
                        "numbers": numbers,
                    }
                ],
            },
            timeout=runtime_settings["fast2sms_timeout"],
            headers=headers,
            service_label="Fast2SMS",
        )
    else:
        return {
            "ok": False,
            "provider": "unconfigured",
            "dispatched": 0,
            "message": "FAST2SMS_ROUTE must be either q or dlt_manual in .env.",
            "recipients": recipients,
        }

    success = bool(provider_response.get("return")) if isinstance(provider_response, dict) else False
    provider_message = summarize_provider_text(provider_response) or "Fast2SMS did not return a readable status."

    if not success:
        return {
            "ok": False,
            "provider": "fast2sms",
            "dispatched": 0,
            "message": provider_message,
            "recipients": recipients,
            "provider_response": provider_response,
        }

    return {
        "ok": True,
        "provider": "fast2sms",
        "dispatched": len(recipients),
        "message": provider_message or f"Automatic SOS sent to {len(recipients)} saved contact(s) through Fast2SMS.",
        "recipients": recipients,
        "provider_response": provider_response,
    }


def send_sos_via_webhook(
    message: str,
    recipients: list[dict[str, str]],
    meta: dict[str, Any],
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    runtime_settings = settings or get_runtime_sos_settings()

    if not runtime_settings["webhook_url"]:
        return {
            "ok": False,
            "provider": "unconfigured",
            "dispatched": 0,
            "message": "SOS webhook is selected but SAFEHER_SOS_WEBHOOK_URL is missing in .env.",
            "recipients": recipients,
        }

    webhook_payload = {
        "type": "safeher_sos",
        "message": message,
        "recipients": recipients,
        "meta": meta,
        "sent_at": now_ts(),
    }

    headers: dict[str, str] = {}
    if runtime_settings["webhook_bearer_token"]:
        headers["Authorization"] = f"Bearer {runtime_settings['webhook_bearer_token']}"

    provider_response = http_post_json(
        runtime_settings["webhook_url"],
        webhook_payload,
        timeout=runtime_settings["webhook_timeout"],
        headers=headers,
        service_label="SOS webhook",
    )

    return {
        "ok": True,
        "provider": "webhook",
        "dispatched": len(recipients),
        "message": f"Automatic SOS sent to {len(recipients)} saved contact(s).",
        "recipients": recipients,
        "provider_response": provider_response,
    }


def send_sos_alert(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message") or "").strip()
    if len(message) < 10:
        raise ApiError(400, "SOS message is too short.")
    if len(message) > 1000:
        raise ApiError(400, "SOS message is too long.")

    recipients_raw = payload.get("recipients")
    if not isinstance(recipients_raw, list) or not recipients_raw:
        raise ApiError(400, "At least one SOS recipient is required.")

    recipients: list[dict[str, str]] = []
    for item in recipients_raw[:20]:
        if not isinstance(item, dict):
            raise ApiError(400, "Invalid SOS recipient entry.")

        label = str(item.get("label") or item.get("name") or "Emergency Contact").strip()[:80] or "Emergency Contact"
        phone = normalize_alert_phone(str(item.get("dialNumber") or item.get("phone") or item.get("number") or ""))
        recipients.append({"label": label, "phone": phone})

    meta = payload.get("meta")
    if not isinstance(meta, dict):
        meta = {}

    settings = get_runtime_sos_settings()
    provider = resolve_sos_provider(settings)
    if provider == "fast2sms":
        return send_sos_via_fast2sms(message, recipients, settings)
    if provider == "webhook":
        return send_sos_via_webhook(message, recipients, meta, settings)

    if provider == "unconfigured":
        return {
            "ok": False,
            "provider": "unconfigured",
            "dispatched": 0,
            "message": "Automatic SOS messaging is not configured on the server. Add FAST2SMS_API_KEY or SAFEHER_SOS_WEBHOOK_URL in .env to enable it.",
            "recipients": recipients,
        }

    raise ApiError(500, "SOS provider could not be resolved.")


class SafeHerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.startswith("/api/"):
            self.handle_api_get()
            return

        if self.path == "/":
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self) -> None:
        if not self.path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        self.handle_api_post()

    def handle_api_get(self) -> None:
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            query = parse_qs(parsed.query)

            if path == "/api/health":
                self.write_json(
                    HTTPStatus.OK,
                    {"ok": True, "service": "safeher-backend", "time": now_ts()},
                )
                return

            if path == "/api/map/search":
                q = get_query_param(query, "q")
                limit = parse_int(get_query_param(query, "limit", required=False) or "5", field="limit", minimum=1, maximum=5)
                self.write_json(HTTPStatus.OK, search_places(q, limit))
                return

            if path == "/api/map/reverse":
                lat = parse_float(get_query_param(query, "lat"), field="latitude", minimum=-90, maximum=90)
                lng = parse_float(get_query_param(query, "lng"), field="longitude", minimum=-180, maximum=180)
                self.write_json(HTTPStatus.OK, reverse_place(lat, lng))
                return

            if path == "/api/map/route":
                coords = parse_route_coords(get_query_param(query, "coords"))
                self.write_json(HTTPStatus.OK, fetch_route(coords))
                return

            if path == "/api/sos/view":
                incident_id = get_query_param(query, "incident")
                token = get_query_param(query, "token")
                record = load_authorized_incident(incident_id, token)
                self.write_json(HTTPStatus.OK, serialize_incident_for_view(record, token))
                return

            if path == "/api/sos/frame":
                incident_id = get_query_param(query, "incident")
                token = get_query_param(query, "token")
                record = load_authorized_incident(incident_id, token)
                extension = str(record.get("snapshot_extension") or "").strip()
                if not extension:
                    raise ApiError(404, "No live snapshot has been uploaded yet.")

                frame_path = get_incident_frame_path(record["id"], extension)
                if not frame_path.exists():
                    raise ApiError(404, "Snapshot image is unavailable.")

                content_type = "image/jpeg" if extension == "jpg" else "image/png"
                self.write_binary(HTTPStatus.OK, frame_path.read_bytes(), content_type=content_type)
                return

            if path == "/api/sos/video":
                incident_id = get_query_param(query, "incident")
                token = get_query_param(query, "token")
                record = load_authorized_incident(incident_id, token)
                extension = str(record.get("video_extension") or "").strip()
                if not extension:
                    raise ApiError(404, "No live video clip has been uploaded yet.")

                video_path = get_incident_video_path(record["id"], extension)
                if not video_path.exists():
                    raise ApiError(404, "Video clip is unavailable.")

                content_type = {
                    "webm": "video/webm",
                    "mp4": "video/mp4",
                    "ogg": "video/ogg",
                }.get(extension, "application/octet-stream")
                self.write_binary(HTTPStatus.OK, video_path.read_bytes(), content_type=content_type)
                return

            raise ApiError(404, "API route not found.")
        except ApiError as exc:
            self.write_json(exc.status, {"ok": False, "message": exc.message})
        except Exception as exc:  # pragma: no cover - defensive fallback
            self.write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "message": f"Server error: {exc}"})

    def handle_api_post(self) -> None:
        try:
            payload = parse_json_body(self)
            if self.path == "/api/auth/register":
                response = register_user(payload)
            elif self.path == "/api/auth/login":
                response = login_user(payload)
            elif self.path == "/api/sos/send":
                response = send_sos_alert(payload)
            elif self.path == "/api/sos/start":
                response = start_live_incident(payload, self)
            elif self.path == "/api/sos/frame":
                response = record_incident_snapshot(payload)
            elif self.path == "/api/sos/video":
                response = record_incident_video(payload)
            elif self.path == "/api/sos/transcript":
                response = record_incident_transcripts(payload)
            elif self.path == "/api/sos/finish":
                response = finish_live_incident(payload)
            else:
                raise ApiError(404, "API route not found.")

            self.write_json(HTTPStatus.OK, response)
        except ApiError as exc:
            self.write_json(exc.status, {"ok": False, "message": exc.message})
        except Exception as exc:  # pragma: no cover - defensive fallback
            self.write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "message": f"Server error: {exc}"})

    def write_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json_dumps(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def write_binary(self, status: int, body: bytes, *, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")


def run() -> None:
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), SafeHerHandler)
    print(f"SafeHer server running on http://{HOST}:{PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSafeHer server stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
