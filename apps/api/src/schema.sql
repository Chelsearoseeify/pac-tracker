CREATE TABLE IF NOT EXISTS config (
  id           TEXT PRIMARY KEY DEFAULT 'current',
  pac_mensile  REAL NOT NULL DEFAULT 150,
  data_avvio   TEXT NOT NULL,
  normalize_pac INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS etfs (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  target_pct       REAL NOT NULL,        -- fraction 0..1
  versato_iniziale REAL NOT NULL,
  order_idx        INTEGER NOT NULL DEFAULT 0,
  isin             TEXT                  -- optional, for live DWS/Xtrackers PDP lookup
);

CREATE TABLE IF NOT EXISTS semesters (
  id         TEXT PRIMARY KEY,           -- "2026-H1"
  label      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  created_at TEXT NOT NULL,
  closed_at  TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
  semester_id TEXT NOT NULL,
  etf_id      TEXT NOT NULL,
  target_pct  REAL NOT NULL,
  pac         REAL NOT NULL,
  val_attuale REAL NOT NULL,
  tot_versato REAL NOT NULL,
  val_reale   REAL,                       -- null until semester close
  PRIMARY KEY (semester_id, etf_id),
  FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
  FOREIGN KEY (etf_id) REFERENCES etfs(id) ON DELETE CASCADE
);
