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

const PAC = 150
const c = computeSemester(h1, names, PAC)
const sp = c[0]

near(sp.valTeorico, 2674, 0.01, 'S&P VAL TEORICO (flat, no prior rate)')
near(sp.totVersatoOggi, 2674, 0.01, 'S&P TOTALE VERSATO AD OGGI (2266 + 68*6)')
near(sp.differenza, 826, 0.01, 'S&P DIFFERENZA')
near(sp.performance, 826, 0.01, 'S&P PERFORMANCE (net incl. this sem PAC)')
near(sp.weight6m, 0.5158, 0.0005, 'S&P %TARGET 6M')
near(sp.bilanciamento, -0.06264, 0.0005, 'S&P BILANCIAMENTO')
// nuovoPac = 150 * (targetPct + bilanciamento) = 150 * (0.4532 - 0.06264) = 58.58 -> 59
near(sp.nuovoPac, 59, 0.01, 'S&P NUOVO PAC (150*(0.4532-0.0626)=58.58->59)')

near(c[1].nuovoPac, 39, 0.01, 'DEV NUOVO PAC (38.84->39)')
near(c[2].nuovoPac, 27, 0.01, 'EM NUOVO PAC (27.11->27)')
near(c[3].nuovoPac, 12, 0.01, 'MOM NUOVO PAC (12.07->12)')
near(c[4].nuovoPac, 13, 0.01, 'VALUE NUOVO PAC (13.40->13)')

const t = totals(c)
near(t.valReale, 6785, 0.01, 'TOT VAL REALE')
near(t.valTeorico, 5900, 0.01, 'TOT VAL TEORICO')
near(t.differenza, 885, 0.01, 'TOT DIFFERENZA')
near(t.performance, 885, 0.01, 'TOT PERFORMANCE (= differenza in H1, valAtt=versatoIniz)')
// Self-normalizing: rows sum to pacMensile exactly, by construction.
near(t.nuovoPac, 150, 0.01, 'TOT NUOVO PAC = pacMensile exactly (150)')

// Rollover into 2026-H2: TOT VERSATO grows by pac_old*6 (+900 total),
// new PAC = old NUOVO PAC, and the new PAC total is again exactly 150.
const h2 = rollover(h1, names, '2026-H2', PAC)
near(h2[0].totVersato, 2674, 0.01, 'H2 S&P TOT VERSATO (+408)')
near(h2[0].valAttuale, 3500, 0.01, 'H2 S&P VAL ATTUALE = old VAL REALE')
near(h2[0].pac, 59, 0.01, 'H2 S&P PAC = old NUOVO PAC (59)')
near(h2.reduce((s, r) => s + r.totVersato, 0), 5900, 0.01, 'H2 TOT VERSATO total (+900)')
near(h2.reduce((s, r) => s + r.pac, 0), 150, 0.001, 'H2 total PAC = 150 exactly')

// VALORE TEORICO with interest: valAttuale grown at the prior semester's rate
// plus the monthly PAC compounded. 10%/sem on S&P:
//   2266 * 1.10 + 68 * 0.10 / ((1.10^(1/6)) - 1) = 2492.6 + 424.7 = 2917.3
const withRate = computeSemester(h1, names, PAC, { sp500: 0.10 })
near(withRate[0].valTeorico, 2917.3, 1, 'S&P VAL TEORICO @ 10%/sem (interest, monthly)')
near(computeSemester(h1, names, PAC, {})[0].valTeorico, 2674, 0.01, 'VAL TEORICO flat when no prior rate')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
