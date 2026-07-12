// End-to-end route smoke test. The DB client is hrana-over-HTTP only (no file:
// URLs), so point it at a remote Turso DB or a local `turso dev` server:
//   turso dev --db-file /tmp/pac-smoke.db   # serves :8080
//   TURSO_DATABASE_URL=http://127.0.0.1:8080 TURSO_AUTH_TOKEN=x \
//     pnpm --filter @pac/api exec tsx src/smoke.ts
import { app } from './app.js'

let fail = 0
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`)
  if (!cond) fail++
}
const req = (path: string, init?: RequestInit) =>
  Promise.resolve(app.request(`/api${path}`, init)).then(async (r: Response) => ({
    status: r.status,
    body: await r.json().catch(() => null),
  }))

// clean slate
await app.request('/api/reset', { method: 'DELETE' })

let r = await req('/state')
check(r.body.configured === false, 'state: not configured initially')

r = await req('/setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pacMensile: 150,
    dataAvvio: '2026-01-15',
    etfs: [
      { name: 'S&P500', targetPct: 0.4532, versatoIniziale: 2266, initialPac: 68 },
      { name: 'DEV EX-USA', targetPct: 0.24, versatoIniziale: 1200, initialPac: 36 },
      { name: 'EMERGENTS', targetPct: 0.16, versatoIniziale: 800, initialPac: 24 },
      { name: 'MOMENTUM', targetPct: 0.0734, versatoIniziale: 367, initialPac: 11 },
      { name: 'VALUE', targetPct: 0.0734, versatoIniziale: 367, initialPac: 11 },
    ],
  }),
})
check(r.status === 201 && r.body.semesterId === '2026-H1', 'setup -> 2026-H1')

r = await req('/state')
check(r.body.configured === true, 'state: configured')
check(r.body.current.id === '2026-H1', 'current semester 2026-H1')
check(r.body.currentData.rows.length === 5, '5 etf rows')
check(Math.abs(r.body.currentData.rows[0].valTeorico - 2674) < 0.01, 'S&P valTeorico 2674')

// enter VAL REALE for each
const etfIds: string[] = r.body.currentData.rows.map((x: { etfId: string }) => x.etfId)
const reali = [3500, 1500, 945, 450, 390]
for (let i = 0; i < etfIds.length; i++) {
  await req(`/snapshots/2026-H1/${etfIds[i]}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valReale: reali[i] }),
  })
}

r = await req('/semesters/2026-H1')
check(Math.abs(r.body.rows[0].performance - 826) < 0.01, 'S&P performance 826 (net)')
check(r.body.rows[0].nuovoPac === 59, 'S&P nuovoPac 150*(0.4532-0.0626)=58.58->59')
check(r.body.totals.nuovoPac === 150, 'total nuovoPac = 150 exactly (self-normalizing)')

r = await req('/semesters/2026-H1/close', { method: 'POST' })
check(r.status === 201 && r.body.nextSemesterId === '2026-H2', 'close -> 2026-H2')

r = await req('/semesters/2026-H2')
check(Math.abs(r.body.rows[0].valAttuale - 3500) < 0.01, 'H2 valAttuale = old valReale')
check(Math.abs(r.body.rows[0].totVersato - 2674) < 0.01, 'H2 totVersato +408')
check(r.body.rows[0].pac === 59, 'H2 pac = old nuovoPac (59)')

r = await req('/state')
check(r.body.current.id === '2026-H2', 'current now 2026-H2')
check(r.body.semesters.length === 2 && r.body.semesters[0].status === 'closed', 'H1 archived closed')

// closed semester is immutable
r = await req(`/snapshots/2026-H1/${etfIds[0]}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valReale: 9999 }),
})
check(r.status === 409, 'closed semester rejects edits')

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`)
process.exit(fail === 0 ? 0 : 1)
