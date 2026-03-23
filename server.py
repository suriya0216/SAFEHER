from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
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


def load_env_file() -> None:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file()

HOST = os.getenv("SAFEHER_HOST", "127.0.0.1")
PORT = int(os.getenv("SAFEHER_PORT", "8000"))
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


def resolve_sos_provider() -> str:
    if SOS_PROVIDER in ("", "auto"):
        if FAST2SMS_API_KEY:
            return "fast2sms"
        if SOS_WEBHOOK_URL:
            return "webhook"
        return "unconfigured"
    if SOS_PROVIDER in {"fast2sms", "webhook"}:
        return SOS_PROVIDER
    raise ApiError(500, "Unsupported SAFEHER_SOS_PROVIDER value in .env.")


def send_sos_via_fast2sms(message: str, recipients: list[dict[str, str]]) -> dict[str, Any]:
    if not FAST2SMS_API_KEY:
        return {
            "ok": False,
            "provider": "unconfigured",
            "dispatched": 0,
            "message": "Fast2SMS is selected but FAST2SMS_API_KEY is missing in .env.",
            "recipients": recipients,
        }

    numbers = ",".join(normalize_fast2sms_number(item["phone"]) for item in recipients)
    headers = {"authorization": FAST2SMS_API_KEY}
    route = FAST2SMS_ROUTE

    if route == "q":
        provider_response = http_post_form(
            f"{FAST2SMS_BASE_URL}/dev/bulkV2",
            {
                "message": message,
                "language": FAST2SMS_LANGUAGE,
                "route": "q",
                "numbers": numbers,
            },
            timeout=FAST2SMS_TIMEOUT,
            headers=headers,
            service_label="Fast2SMS",
        )
    elif route == "dlt_manual":
        missing_fields = [
            name
            for name, value in (
                ("FAST2SMS_SENDER_ID", FAST2SMS_SENDER_ID),
                ("FAST2SMS_ENTITY_ID", FAST2SMS_ENTITY_ID),
                ("FAST2SMS_TEMPLATE_ID", FAST2SMS_TEMPLATE_ID),
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
            f"{FAST2SMS_BASE_URL}/dev/custom",
            {
                "route": "dlt_manual",
                "requests": [
                    {
                        "sender_id": FAST2SMS_SENDER_ID,
                        "entity_id": FAST2SMS_ENTITY_ID,
                        "template_id": FAST2SMS_TEMPLATE_ID,
                        "message": message,
                        "flash": 0,
                        "numbers": numbers,
                    }
                ],
            },
            timeout=FAST2SMS_TIMEOUT,
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


def send_sos_via_webhook(message: str, recipients: list[dict[str, str]], meta: dict[str, Any]) -> dict[str, Any]:
    if not SOS_WEBHOOK_URL:
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
    if SOS_WEBHOOK_BEARER_TOKEN:
        headers["Authorization"] = f"Bearer {SOS_WEBHOOK_BEARER_TOKEN}"

    provider_response = http_post_json(
        SOS_WEBHOOK_URL,
        webhook_payload,
        timeout=SOS_WEBHOOK_TIMEOUT,
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

    provider = resolve_sos_provider()
    if provider == "fast2sms":
        return send_sos_via_fast2sms(message, recipients)
    if provider == "webhook":
        return send_sos_via_webhook(message, recipients, meta)

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
