import asyncio
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from jose import JWTError, jwt
from passlib.context import CryptContext
from quart import Quart, jsonify, request

from db import SCHEMA, connect
from rules import judge

SECRET = os.environ.get("JWT_SECRET", "yaw-align-dev-secret")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS = {
    "technician": {
        "role": "writer",
        "password_hash": pwd.hash("tech123456"),
    },
    "observer": {
        "role": "reader",
        "password_hash": pwd.hash("obs123456"),
    },
}

app = Quart(__name__)


def _run_db(fn, *args, **kwargs):
    return fn(*args, **kwargs)


async def run_db(fn, *args, **kwargs):
    return await asyncio.to_thread(_run_db, fn, *args, **kwargs)


def seed_if_empty(conn):
    conn.execute(SCHEMA)
    count = conn.execute("SELECT COUNT(*) AS n FROM yaw_logs").fetchone()["n"]
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    samples = [
        ("W01", 0.4, "合格"),
        ("W07", 3.2, "偏航超差"),
    ]
    for code, err, expected_verdict in samples:
        verdict, reason = judge(err)
        assert verdict == expected_verdict
        conn.execute(
            """INSERT INTO yaw_logs
               (turbine_code, yaw_err_deg, status, verdict, reason,
                created_by, created_at, processed_at)
               VALUES (%s, %s, 'done', %s, %s, %s, %s, %s)""",
            (code, err, verdict, reason, "technician", now, now),
        )


@app.before_serving
async def startup():
    def init():
        with connect() as conn:
            seed_if_empty(conn)
            conn.commit()

    await run_db(init)


def parse_bearer():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return None


async def current_user():
    token = parse_bearer()
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except JWTError:
        return None
    sub = payload.get("sub")
    if sub not in USERS:
        return None
    return {"username": sub, "role": payload.get("role")}


def require_login(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        return await handler(user, *args, **kwargs)

    return wrapper


def writer_only(detail):
    def decorator(handler):
        @wraps(handler)
        async def wrapper(*args, **kwargs):
            user = await current_user()
            if user is None:
                return jsonify({"detail": "未登录"}), 401
            if user["role"] != "writer":
                return jsonify({"detail": detail}), 403
            return await handler(user, *args, **kwargs)

        return wrapper

    return decorator


require_writer = writer_only("仅现场技师可提交偏航记录")
require_lockout_admin = writer_only("仅现场技师可配置偏航电机过热封锁窗")


@app.get("/api/health")
async def health():
    return jsonify({"status": "ok", "service": "yaw-align-log"})


@app.post("/api/auth/login")
async def login():
    body = await request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    user = USERS.get(username)
    if not user or not pwd.verify(password, user["password_hash"]):
        return jsonify({"detail": "用户名或密码错误"}), 401
    exp = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode(
        {"sub": username, "role": user["role"], "exp": exp},
        SECRET,
        algorithm="HS256",
    )
    return jsonify(
        {
            "access_token": token,
            "username": username,
            "role": user["role"],
        }
    )


@app.get("/api/logs")
@require_login
async def list_logs(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT id, turbine_code, yaw_err_deg, status, verdict, reason,
                          created_by, created_at, processed_at
                   FROM yaw_logs ORDER BY id DESC"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.post("/api/logs")
@require_writer
async def create_log(user):
    body = await request.get_json(force=True, silent=True) or {}
    turbine_code = (body.get("turbine_code") or "").strip()
    if not turbine_code:
        return jsonify({"detail": "机组编号不能为空"}), 400
    try:
        yaw_err_deg = float(body.get("yaw_err_deg"))
    except (TypeError, ValueError):
        return jsonify({"detail": "偏航误差必须是数字"}), 400

    now = datetime.now(timezone.utc)

    def insert():
        with connect() as conn:
            # 封锁判定只认数据库服务端时钟，禁止信任客户端本机时间
            window = conn.execute(
                """SELECT id, start_at, end_at
                   FROM lockout_windows
                   WHERE turbine_code = %s
                     AND start_at <= now() AND now() < end_at
                   ORDER BY id DESC
                   LIMIT 1""",
                (turbine_code,),
            ).fetchone()
            if window is not None:
                # 封锁日志与真实拒收在同一事务写入：日志写不进去就整体回滚，
                # 绝不允许只拒不留痕或只留痕不拒
                conn.execute(
                    """INSERT INTO lockout_reject_logs
                       (window_id, turbine_code, yaw_err_deg, attempted_by, attempted_at)
                       VALUES (%s, %s, %s, %s, now())""",
                    (window["id"], turbine_code, yaw_err_deg, user["username"]),
                )
                conn.commit()
                return None, window
            row = conn.execute(
                """INSERT INTO yaw_logs
                   (turbine_code, yaw_err_deg, status, verdict, reason,
                    created_by, created_at)
                   VALUES (%s, %s, 'pending', NULL, NULL, %s, %s)
                   RETURNING id, turbine_code, yaw_err_deg, status, verdict, reason,
                             created_by, created_at, processed_at""",
                (turbine_code, yaw_err_deg, user["username"], now),
            ).fetchone()
            conn.commit()
            return row, None

    row, window = await run_db(insert)
    if window is not None:
        return (
            jsonify(
                {
                    "detail": (
                        f"机组 {turbine_code} 处于偏航电机过热封锁窗内"
                        f"（{window['start_at'].isoformat()} 至 "
                        f"{window['end_at'].isoformat()}），请移出窗外再报送"
                    )
                }
            ),
            409,
        )
    return jsonify(row), 201


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def _window_json(row):
    return {
        "id": row["id"],
        "turbine_code": row["turbine_code"],
        "start_at": _iso(row["start_at"]),
        "end_at": _iso(row["end_at"]),
        "reason": row["reason"],
        "created_by": row["created_by"],
        "created_at": _iso(row["created_at"]),
    }


def _reject_log_json(row):
    return {
        "id": row["id"],
        "window_id": row["window_id"],
        "turbine_code": row["turbine_code"],
        "yaw_err_deg": row["yaw_err_deg"],
        "attempted_by": row["attempted_by"],
        "attempted_at": _iso(row["attempted_at"]),
        "window_start_at": _iso(row["window_start_at"]),
        "window_end_at": _iso(row["window_end_at"]),
    }


def _parse_moment(value):
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment


@app.get("/api/lockout-windows")
@require_login
async def list_lockout_windows(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT id, turbine_code, start_at, end_at, reason,
                          created_by, created_at
                   FROM lockout_windows ORDER BY id DESC"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify([_window_json(row) for row in rows])


@app.post("/api/lockout-windows")
@require_lockout_admin
async def create_lockout_window(user):
    body = await request.get_json(force=True, silent=True) or {}
    turbine_code = (body.get("turbine_code") or "").strip()
    if not turbine_code:
        return jsonify({"detail": "机组编号不能为空"}), 400
    start_at = _parse_moment(body.get("start_at"))
    end_at = _parse_moment(body.get("end_at"))
    if start_at is None or end_at is None:
        return jsonify({"detail": "起止时刻必须是合法的日期时间"}), 400
    if start_at >= end_at:
        return jsonify({"detail": "开始时刻必须早于结束时刻"}), 400
    reason = (body.get("reason") or "").strip() or None

    def insert():
        with connect() as conn:
            row = conn.execute(
                """INSERT INTO lockout_windows
                   (turbine_code, start_at, end_at, reason, created_by, created_at)
                   VALUES (%s, %s, %s, %s, %s, now())
                   RETURNING id, turbine_code, start_at, end_at, reason,
                             created_by, created_at""",
                (turbine_code, start_at, end_at, reason, user["username"]),
            ).fetchone()
            conn.commit()
            return row

    row = await run_db(insert)
    return jsonify(_window_json(row)), 201


@app.get("/api/lockout-logs")
@require_login
async def list_lockout_logs(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT l.id, l.window_id, l.turbine_code, l.yaw_err_deg,
                          l.attempted_by, l.attempted_at,
                          w.start_at AS window_start_at,
                          w.end_at AS window_end_at
                   FROM lockout_reject_logs l
                   LEFT JOIN lockout_windows w ON w.id = l.window_id
                   ORDER BY l.id DESC"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify([_reject_log_json(row) for row in rows])
