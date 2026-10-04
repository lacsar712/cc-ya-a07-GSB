import os

import psycopg
from psycopg.rows import dict_row

DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://app:app@localhost:54399/yawalign",
)


def connect():
    return psycopg.connect(DSN, row_factory=dict_row)


SCHEMA = """
CREATE TABLE IF NOT EXISTS yaw_logs (
    id serial PRIMARY KEY,
    turbine_code text NOT NULL,
    yaw_err_deg double precision NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    verdict text,
    reason text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL,
    processed_at timestamptz
);

-- 偏航电机过热封锁窗：起止时刻内，该机组的偏航报送整体上锁
CREATE TABLE IF NOT EXISTS yaw_overheat_windows (
    id serial PRIMARY KEY,
    turbine_code text NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT yaw_overheat_windows_time_order CHECK (started_at < ended_at)
);
CREATE INDEX IF NOT EXISTS idx_overheat_windows_lookup
    ON yaw_overheat_windows (turbine_code, started_at, ended_at);

-- 封锁日志：落窗报送被真实拒收的审计记录，与拒收结果同一事务写入
CREATE TABLE IF NOT EXISTS yaw_overheat_blocks (
    id serial PRIMARY KEY,
    window_id integer NOT NULL
        REFERENCES yaw_overheat_windows(id) ON DELETE CASCADE,
    turbine_code text NOT NULL,
    yaw_err_deg double precision NOT NULL,
    blocked_by text NOT NULL,
    blocked_at timestamptz NOT NULL,
    detail text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_overheat_blocks_window
    ON yaw_overheat_blocks (window_id);
"""
