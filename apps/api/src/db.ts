import type { Config, Etf, Semester, SnapshotRaw } from '@pac/core'

// ─── Minimal Turso hrana-over-HTTP client ─────────────────────────────────────
// @libsql/client@0.14 mis-sends the auth token on Vercel's runtime (Turso 401),
// while a plain POST to /v2/pipeline with a Bearer header works. So we talk the
// hrana v2 HTTP protocol directly — same wire format, no broken dependency.

type Value = number | string | null
type Cell = { type: 'null' | 'integer' | 'float' | 'text' | 'blob'; value?: string | number }
type Row = Record<string, unknown>
export interface ResultSet { rows: Row[]; rowsAffected: number }

const host = () => (process.env.TURSO_DATABASE_URL ?? '').replace(/^libsql:\/\//, 'https://').replace(/^wss:\/\//, 'https://').replace(/\/$/, '')
const token = () => process.env.TURSO_AUTH_TOKEN ?? ''

function toArg(v: Value): Cell {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v }
  return { type: 'text', value: String(v) }
}

function fromCell(cell: Cell): unknown {
  switch (cell.type) {
    case 'null': return null
    case 'integer': return Number(cell.value)
    case 'float': return cell.value as number
    default: return cell.value as string
  }
}

interface ExecResp {
  type: 'execute'
  result: { cols: { name: string }[]; rows: Cell[][]; affected_row_count: number }
}
type PipelineResult = { type: 'ok'; response?: ExecResp } | { type: 'error'; error: { message: string } }

async function pipeline(stmts: { sql: string; args?: Value[] }[]): Promise<ResultSet[]> {
  const res = await fetch(`${host()}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        ...stmts.map((s) => ({ type: 'execute', stmt: { sql: s.sql, args: (s.args ?? []).map(toArg) } })),
        { type: 'close' },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { results: PipelineResult[] }
  return body.results
    .filter((r) => r.type === 'error' || (r as { response?: { type: string } }).response?.type === 'execute')
    .map((r) => {
      if (r.type === 'error') throw new Error(r.error.message)
      const result = (r as { response: ExecResp }).response.result
      const rows = result.rows.map((cells) => {
        const obj: Row = {}
        result.cols.forEach((col, i) => { obj[col.name] = fromCell(cells[i]) })
        return obj
      })
      return { rows, rowsAffected: result.affected_row_count }
    })
}

export const db = {
  async execute(stmt: string | { sql: string; args?: Value[] }): Promise<ResultSet> {
    const s = typeof stmt === 'string' ? { sql: stmt } : stmt
    const [r] = await pipeline([s])
    return r
  },
  async executeMultiple(sql: string): Promise<void> {
    const stmts = sql.split(';').map((s) => s.trim()).filter(Boolean).map((s) => ({ sql: s }))
    if (stmts.length) await pipeline(stmts)
  },
}

// ─── Schema bootstrap (idempotent) ────────────────────────────────────────────
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
