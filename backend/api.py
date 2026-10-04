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


def require_writer(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        if user["role"] != "writer":
            return jsonify({"detail": "仅现场技师可执行该操作"}), 403
        return await handler(user, *args, **kwargs)

    return wrapper


def parse_dt(value):
    """解析前端传入的 ISO 8601 时刻；naive 视为 UTC。失败抛 ValueError。"""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("时间格式无效")
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@app.get("/api/health")
async def health():
    return jsonify({"status": "ok", "service": "yaw-align-log"})


@app.get("/api/time")
async def server_time():
    """服务端当前时钟，供前端对齐；所有封锁判定一律以后端/数据库时钟为准。"""

    def query():
        with connect() as conn:
            return conn.execute("SELECT now() AS now").fetchone()["now"]

    now = await run_db(query)
    return jsonify({"now": now})


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

    def insert_or_block():
        """单事务：以数据库服务端时钟 now() 判定是否落入过热封锁窗。

        入窗 -> 仅写入封锁日志（报送记录不落库），随事务一起提交并返回拒收；
        出窗 -> 正常写入报送记录。整个函数在一个数据库事务内完成，块退出时
        统一提交，异常则整体回滚，不存在“拒了却没日志”或“有日志却收下”的中间态。
        """
        with connect() as conn:
            # 服务端时钟：同一条语句内 now() 恒定，判定与审计时刻均取自数据库。
            # FOR UPDATE 锁定命中窗行，与删除封锁窗串行：若删除已先提交，
            # READ COMMITTED 下本查询读到的窗已消失，报送即正常受理。
            hit = conn.execute(
                """SELECT id
                   FROM yaw_overheat_windows
                   WHERE turbine_code = %s
                     AND now() >= started_at
                     AND now() < ended_at
                   ORDER BY started_at DESC
                   LIMIT 1
                   FOR UPDATE""",
                (turbine_code,),
            ).fetchone()

            if hit is not None:
                detail = (
                    f"机组 {turbine_code} 偏航电机过热封锁中，报送已被拒收，"
                    "请移出封锁时段后再报送"
                )
                blocked = conn.execute(
                    """INSERT INTO yaw_overheat_blocks
                       (window_id, turbine_code, yaw_err_deg, blocked_by,
                        blocked_at, detail)
                       VALUES (%s, %s, %s, %s, now(), %s)
                       RETURNING id, window_id, turbine_code, yaw_err_deg,
                                 blocked_by, blocked_at, detail""",
                    (
                        hit["id"],
                        turbine_code,
                        yaw_err_deg,
                        user["username"],
                        detail,
                    ),
                ).fetchone()
                return {
                    "blocked": True,
                    "window_id": hit["id"],
                    "block": blocked,
                    "detail": detail,
                }

            row = conn.execute(
                """INSERT INTO yaw_logs
                   (turbine_code, yaw_err_deg, status, verdict, reason,
                    created_by, created_at)
                   VALUES (%s, %s, 'pending', NULL, NULL, %s, now())
                   RETURNING id, turbine_code, yaw_err_deg, status, verdict,
                             reason, created_by, created_at, processed_at""",
                (turbine_code, yaw_err_deg, user["username"]),
            ).fetchone()
            return {"blocked": False, "row": row}

    result = await run_db(insert_or_block)
    if result["blocked"]:
        return (
            jsonify(
                {
                    "detail": result["detail"],
                    "blocked": True,
                    "window_id": result["window_id"],
                    "block": result["block"],
                }
            ),
            409,
        )
    return jsonify(result["row"]), 201


@app.get("/api/overheat/windows")
@require_login
async def list_windows(user):
    def query():
        with connect() as conn:
            windows = conn.execute(
                """SELECT id, turbine_code, started_at, ended_at, created_by,
                          created_at,
                          (now() >= started_at AND now() < ended_at) AS active
                   FROM yaw_overheat_windows
                   ORDER BY started_at DESC, id DESC"""
            ).fetchall()
            blocks = conn.execute(
                """SELECT id, window_id, turbine_code, yaw_err_deg, blocked_by,
                          blocked_at, detail
                   FROM yaw_overheat_blocks
                   ORDER BY id DESC"""
            ).fetchall()
            return windows, blocks

    windows, blocks = await run_db(query)
    return jsonify({"windows": windows, "blocks": blocks})


@app.post("/api/overheat/windows")
@require_writer
async def create_window(user):
    body = await request.get_json(force=True, silent=True) or {}
    turbine_code = (body.get("turbine_code") or "").strip()
    if not turbine_code:
        return jsonify({"detail": "机组编号不能为空"}), 400
    try:
        started_at = parse_dt(body.get("started_at"))
        ended_at = parse_dt(body.get("ended_at"))
    except ValueError:
        return jsonify({"detail": "起止时刻格式无效"}), 400
    if not started_at < ended_at:
        return jsonify({"detail": "起始时刻必须早于结束时刻"}), 400

    def insert():
        with connect() as conn:
            return conn.execute(
                """INSERT INTO yaw_overheat_windows
                   (turbine_code, started_at, ended_at, created_by, created_at)
                   VALUES (%s, %s, %s, %s, now())
                   RETURNING id, turbine_code, started_at, ended_at,
                             created_by, created_at""",
                (turbine_code, started_at, ended_at, user["username"]),
            ).fetchone()

    row = await run_db(insert)
    return jsonify(row), 201


@app.delete("/api/overheat/windows/<int:window_id>")
@require_writer
async def delete_window(user, window_id):
    def remove():
        with connect() as conn:
            return conn.execute(
                "DELETE FROM yaw_overheat_windows WHERE id = %s RETURNING id",
                (window_id,),
            ).fetchone()

    row = await run_db(remove)
    if row is None:
        return jsonify({"detail": "封锁窗不存在"}), 404
    return jsonify({"deleted": row["id"]})
