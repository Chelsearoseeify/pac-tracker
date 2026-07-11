import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  computeSemester,
  totals,
  rollover,
  initialSnapshots,
  nextSemesterId,
  semesterIdFromDate,
  type Etf,
  type SnapshotRaw,
} from '@pac/core'
import {
  db,
  ensureSchema,
  rowToConfig,
  rowToEtf,
  rowToSemester,
  rowToSnapshot,
} from './db.js'

export const app = new Hono().basePath('/api')

app.use('*', cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type'],
}))

app.use('*', async (_c, next) => { await ensureSchema(); await next() })

// ─── helpers ───────────────────────────────────────────────────────────────
async function getEtfs(): Promise<Etf[]> {
  const r = await db.execute('SELECT * FROM etfs ORDER BY order_idx ASC')
  return r.rows.map(rowToEtf)
}

async function getNames(): Promise<Record<string, string>> {
  const etfs = await getEtfs()
  return Object.fromEntries(etfs.map((e) => [e.id, e.name]))
}

async function getSnapshots(semesterId: string): Promise<SnapshotRaw[]> {
  const r = await db.execute({
    sql: 'SELECT * FROM snapshots WHERE semester_id = ?',
    args: [semesterId],
  })
  return r.rows.map(rowToSnapshot)
}

async function orderedSnapshots(semesterId: string): Promise<SnapshotRaw[]> {
  const etfs = await getEtfs()
  const snaps = await getSnapshots(semesterId)
  const byId = new Map(snaps.map((s) => [s.etfId, s]))
  return etfs.map((e) => byId.get(e.id)).filter((s): s is SnapshotRaw => !!s)
}

/** normalizeTo when the "normalize PAC" flag is set — makes the displayed
 *  NUOVO PAC total match what a rollover would actually write. */
async function normalizeTarget(): Promise<number | undefined> {
  const r = await db.execute("SELECT normalize_pac, pac_mensile FROM config WHERE id = 'current'")
  if (r.rows.length === 0) return undefined
  const c = r.rows[0] as Record<string, unknown>
  return c.normalize_pac === 1 ? (c.pac_mensile as number) : undefined
}

async function computedSemester(semesterId: string) {
  const names = await getNames()
  const normalizeTo = await normalizeTarget()
  const rows = computeSemester(await orderedSnapshots(semesterId), names, normalizeTo)
  return { rows, totals: totals(rows) }
}

async function insertSnapshots(snaps: SnapshotRaw[]) {
  for (const s of snaps) {
    await db.execute({
      sql: `INSERT INTO snapshots (semester_id, etf_id, target_pct, pac, val_attuale, tot_versato, val_reale)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [s.semesterId, s.etfId, s.targetPct, s.pac, s.valAttuale, s.totVersato, s.valReale],
    })
  }
}

// ─── state: one call powering the whole UI ───────────────────────────────────
app.get('/state', async (c) => {
  const cfgR = await db.execute("SELECT * FROM config WHERE id = 'current'")
  if (cfgR.rows.length === 0) return c.json({ configured: false })

  const config = rowToConfig(cfgR.rows[0] as Record<string, unknown>)
  const normalizePac = (cfgR.rows[0] as Record<string, unknown>).normalize_pac === 1
  const etfs = await getEtfs()
  const semR = await db.execute('SELECT * FROM semesters ORDER BY id ASC')
  const semesters = semR.rows.map(rowToSemester)
  const current = semesters.find((s) => s.status === 'open') ?? null
  const currentData = current ? await computedSemester(current.id) : null

  return c.json({ configured: true, config, normalizePac, etfs, semesters, current, currentData })
})

// ─── setup: day-zero init ────────────────────────────────────────────────────
app.post('/setup', async (c) => {
  const body = await c.req.json() as {
    pacMensile: number
    dataAvvio: string
    normalizePac?: boolean
    etfs: { name: string; targetPct: number; versatoIniziale: number; initialPac?: number }[]
  }
  const existing = await db.execute("SELECT id FROM config WHERE id = 'current'")
  if (existing.rows.length > 0) return c.json({ error: 'Already configured. Reset first.' }, 409)

  await db.execute({
    sql: `INSERT INTO config (id, pac_mensile, data_avvio, normalize_pac) VALUES ('current', ?, ?, ?)`,
    args: [body.pacMensile, body.dataAvvio, body.normalizePac ? 1 : 0],
  })

  const etfs: Etf[] = []
  const initialPac: Record<string, number> = {}
  body.etfs.forEach((e, i) => {
    const id = crypto.randomUUID()
    etfs.push({ id, name: e.name, targetPct: e.targetPct, versatoIniziale: e.versatoIniziale, orderIdx: i })
    if (e.initialPac != null) initialPac[id] = e.initialPac
  })
  for (const e of etfs) {
    await db.execute({
      sql: `INSERT INTO etfs (id, name, target_pct, versato_iniziale, order_idx) VALUES (?, ?, ?, ?, ?)`,
      args: [e.id, e.name, e.targetPct, e.versatoIniziale, e.orderIdx],
    })
  }

  const semId = semesterIdFromDate(body.dataAvvio)
  await db.execute({
    sql: `INSERT INTO semesters (id, label, status, created_at) VALUES (?, ?, 'open', ?)`,
    args: [semId, semId, new Date().toISOString()],
  })
  await insertSnapshots(initialSnapshots(etfs, semId, initialPac, body.pacMensile))

  return c.json({ ok: true, semesterId: semId }, 201)
})

// ─── read one semester (history detail) ───────────────────────────────────────
app.get('/semesters/:id', async (c) => {
  const { id } = c.req.param()
  const sem = await db.execute({ sql: 'SELECT * FROM semesters WHERE id = ?', args: [id] })
  if (sem.rows.length === 0) return c.json({ error: 'Not found' }, 404)
  const data = await computedSemester(id)
  return c.json({ semester: rowToSemester(sem.rows[0] as Record<string, unknown>), ...data })
})

// ─── edit an open snapshot (enter VAL REALE, fix a typo) ──────────────────────
app.patch('/snapshots/:semesterId/:etfId', async (c) => {
  const { semesterId, etfId } = c.req.param()
  const sem = await db.execute({ sql: 'SELECT status FROM semesters WHERE id = ?', args: [semesterId] })
  if (sem.rows.length === 0) return c.json({ error: 'Semester not found' }, 404)
  if ((sem.rows[0] as Record<string, unknown>).status === 'closed') {
    return c.json({ error: 'Semester is closed (immutable history)' }, 409)
  }

  const body = await c.req.json() as Partial<{
    valReale: number | null; valAttuale: number; pac: number; totVersato: number; targetPct: number
  }>
  const fields: string[] = []
  const args: (number | null)[] = []
  const set = (col: string, v: number | null) => { fields.push(`${col} = ?`); args.push(v) }
  if ('valReale' in body) set('val_reale', body.valReale ?? null)
  if ('valAttuale' in body) set('val_attuale', body.valAttuale!)
  if ('pac' in body) set('pac', body.pac!)
  if ('totVersato' in body) set('tot_versato', body.totVersato!)
  if ('targetPct' in body) set('target_pct', body.targetPct!)
  if (fields.length === 0) return c.json({ error: 'No fields' }, 400)

  args.push(semesterId as unknown as number, etfId as unknown as number)
  await db.execute({
    sql: `UPDATE snapshots SET ${fields.join(', ')} WHERE semester_id = ? AND etf_id = ?`,
    args,
  })
  return c.json(await computedSemester(semesterId))
})

// ─── close semester -> rollover into the next open one ────────────────────────
app.post('/semesters/:id/close', async (c) => {
  const { id } = c.req.param()
  const semR = await db.execute({ sql: 'SELECT * FROM semesters WHERE id = ?', args: [id] })
  if (semR.rows.length === 0) return c.json({ error: 'Not found' }, 404)
  const sem = rowToSemester(semR.rows[0] as Record<string, unknown>)
  if (sem.status === 'closed') return c.json({ error: 'Already closed' }, 409)

  const snaps = await orderedSnapshots(id)
  if (snaps.some((s) => s.valReale == null)) {
    return c.json({ error: 'Compila tutti i VAL REALE prima di chiudere' }, 400)
  }

  const cfgR = await db.execute("SELECT normalize_pac, pac_mensile FROM config WHERE id = 'current'")
  const cfg = cfgR.rows[0] as Record<string, unknown>
  const normalizeTo = cfg.normalize_pac === 1 ? (cfg.pac_mensile as number) : undefined

  const nextId = nextSemesterId(id)
  const names = await getNames()
  const nextSnaps = rollover(snaps, names, nextId, normalizeTo)

  const now = new Date().toISOString()
  await db.execute({ sql: `UPDATE semesters SET status = 'closed', closed_at = ? WHERE id = ?`, args: [now, id] })
  await db.execute({
    sql: `INSERT INTO semesters (id, label, status, created_at) VALUES (?, ?, 'open', ?)`,
    args: [nextId, nextId, now],
  })
  await insertSnapshots(nextSnaps)

  return c.json({ ok: true, nextSemesterId: nextId }, 201)
})

// ─── reset everything (start over) ────────────────────────────────────────────
app.delete('/reset', async (c) => {
  await db.executeMultiple(
    'DELETE FROM snapshots; DELETE FROM semesters; DELETE FROM etfs; DELETE FROM config;',
  )
  return c.body(null, 204)
})

app.get('/health', (c) => c.json({ ok: true }))
