import { createClient } from '@libsql/client'
import type { Config, Etf, Semester, SnapshotRaw } from '@pac/core'

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

// Embedded DDL (kept in sync with schema.sql) so migrations run without file IO
// on serverless. Idempotent: safe to run on every cold start.
const DDL = `
CREATE TABLE IF NOT EXISTS config (
  id TEXT PRIMARY KEY DEFAULT 'current',
  pac_mensile REAL NOT NULL DEFAULT 150,
  data_avvio TEXT NOT NULL,
  normalize_pac INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS etfs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_pct REAL NOT NULL,
  versato_iniziale REAL NOT NULL,
  order_idx INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS semesters (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS snapshots (
  semester_id TEXT NOT NULL,
  etf_id TEXT NOT NULL,
  target_pct REAL NOT NULL,
  pac REAL NOT NULL,
  val_attuale REAL NOT NULL,
  tot_versato REAL NOT NULL,
  val_reale REAL,
  PRIMARY KEY (semester_id, etf_id)
);
`

let migrated = false
export async function ensureSchema() {
  if (migrated) return
  await db.executeMultiple(DDL)
  migrated = true
}

type Row = Record<string, unknown>

export const rowToConfig = (r: Row): Config => ({
  pacMensile: r.pac_mensile as number,
  dataAvvio: r.data_avvio as string,
})

export const rowToEtf = (r: Row): Etf => ({
  id: r.id as string,
  name: r.name as string,
  targetPct: r.target_pct as number,
  versatoIniziale: r.versato_iniziale as number,
  orderIdx: r.order_idx as number,
})

export const rowToSemester = (r: Row): Semester => ({
  id: r.id as string,
  label: r.label as string,
  status: r.status as 'open' | 'closed',
  createdAt: r.created_at as string,
  closedAt: (r.closed_at as string) ?? null,
})

export const rowToSnapshot = (r: Row): SnapshotRaw => ({
  semesterId: r.semester_id as string,
  etfId: r.etf_id as string,
  targetPct: r.target_pct as number,
  pac: r.pac as number,
  valAttuale: r.val_attuale as number,
  totVersato: r.tot_versato as number,
  valReale: (r.val_reale as number) ?? null,
})
