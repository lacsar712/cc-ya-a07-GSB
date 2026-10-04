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

CREATE TABLE IF NOT EXISTS lockout_windows (
    id serial PRIMARY KEY,
    turbine_code text NOT NULL,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    reason text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lockout_reject_logs (
    id serial PRIMARY KEY,
    window_id integer NOT NULL REFERENCES lockout_windows(id),
    turbine_code text NOT NULL,
    yaw_err_deg double precision NOT NULL,
    attempted_by text NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now()
);
"""
