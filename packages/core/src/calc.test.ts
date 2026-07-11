// Validation against the reference spreadsheet (2026-H1).
// Run: pnpm --filter @pac/core test
import { computeSemester, totals, rollover } from './calc.js'
import type { SnapshotRaw } from './types.js'

let failures = 0
const near = (a: number | null, b: number, tol = 0.01, msg = '') => {
  if (a == null || Math.abs(a - b) > tol) {
    console.error(`FAIL ${msg}: got ${a}, want ${b}`)
    failures++
  } else {
    console.log(`ok   ${msg}: ${a}`)
  }
}

const names: Record<string, string> = {
  sp500: 'S&P500', dev: 'DEV EX-USA', em: 'EMERGENTS', mom: 'MOMENTUM', val: 'VALUE',
}

// 2026-H1: valAttuale === totVersato === versatoIniziale (day zero),
// valReale entered at close.
const h1: SnapshotRaw[] = [
  { semesterId: '2026-H1', etfId: 'sp500', targetPct: 0.4532, pac: 68, valAttuale: 2266, totVersato: 2266, valReale: 3500 },
  { semesterId: '2026-H1', etfId: 'dev',   targetPct: 0.24,   pac: 36, valAttuale: 1200, totVersato: 1200, valReale: 1500 },
  { semesterId: '2026-H1', etfId: 'em',    targetPct: 0.16,   pac: 24, valAttuale: 800,  totVersato: 800,  valReale: 945  },
  { semesterId: '2026-H1', etfId: 'mom',   targetPct: 0.0734, pac: 11, valAttuale: 367,  totVersato: 367,  valReale: 450  },
  { semesterId: '2026-H1', etfId: 'val',   targetPct: 0.0734, pac: 11, valAttuale: 367,  totVersato: 367,  valReale: 390  },
]

const c = computeSemester(h1, names)
const sp = c[0]

near(sp.valTeorico, 2674, 0.01, 'S&P VAL TEORICO')
near(sp.differenza, 826, 0.01, 'S&P DIFFERENZA')
near(sp.performance, 826, 0.01, 'S&P PERFORMANCE (net incl. this sem PAC)')
near(sp.weight6m, 0.5158, 0.0005, 'S&P %TARGET 6M')
near(sp.bilanciamento, -0.06264, 0.0005, 'S&P BILANCIAMENTO')
near(sp.nuovoPac, 63.74, 0.02, 'S&P NUOVO PAC')

near(c[1].nuovoPac, 36.68, 0.02, 'DEV NUOVO PAC')
near(c[2].nuovoPac, 24.50, 0.02, 'EM NUOVO PAC')
near(c[3].nuovoPac, 11.08, 0.02, 'MOM NUOVO PAC')
near(c[4].nuovoPac, 11.18, 0.02, 'VALUE NUOVO PAC')

const t = totals(c)
near(t.valReale, 6785, 0.01, 'TOT VAL REALE')
near(t.valTeorico, 5900, 0.01, 'TOT VAL TEORICO')
near(t.differenza, 885, 0.01, 'TOT DIFFERENZA')
near(t.performance, 885, 0.01, 'TOT PERFORMANCE (= differenza in H1, valAtt=versatoIniz)')
near(t.nuovoPac, 147.17, 0.05, 'TOT NUOVO PAC (drifts, not 150)')

// Rollover into 2026-H2: TOT VERSATO grows by pac_old*6 (+900 total).
const h2 = rollover(h1, names, '2026-H2')
near(h2[0].totVersato, 2674, 0.01, 'H2 S&P TOT VERSATO (+408)')
near(h2[0].valAttuale, 3500, 0.01, 'H2 S&P VAL ATTUALE = old VAL REALE')
near(h2[0].pac, 63.74, 0.02, 'H2 S&P PAC = old NUOVO PAC')
near(h2.reduce((s, r) => s + r.totVersato, 0), 5900, 0.01, 'H2 TOT VERSATO total (+900)')

// Normalized DISPLAY: computeSemester with normalizeTo scales nuovoPac so the
// previewed total already equals 150 (matches what the rollover writes).
const cn = computeSemester(h1, names, 150)
near(cn.reduce((s, r) => s + (r.nuovoPac as number), 0), 150, 0.01, 'compute normalized total = 150')

// Normalized rollover writes the same normalized values.
const h2n = rollover(h1, names, '2026-H2', 150)
near(h2n.reduce((s, r) => s + r.pac, 0), 150, 0.001, 'H2 normalized total PAC = 150 exactly')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
