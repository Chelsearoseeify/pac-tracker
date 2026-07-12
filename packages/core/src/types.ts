// ─── Fixed, day-zero configuration ────────────────────────────────────────────
// These are the "bold" columns from the spreadsheet: written once at setup,
// never touched again. The photograph of day zero you want to see in 20 years.

export interface Config {
  /** Total monthly PAC budget, e.g. 150. Reference value; actual per-semester
   *  total can drift because NUOVO PAC = PAC * (1 + bilanciamento). */
  pacMensile: number
  /** ISO date the PAC was started, e.g. "2026-01-01". */
  dataAvvio: string
}

export interface Etf {
  id: string
  name: string
  /** %TARGET as a fraction 0..1 (e.g. 0.4532). The strategy allocation.
   *  Fixed — only changes if you deliberately re-strategize. */
  targetPct: number
  /** VERSATO INIZIALE — the frozen day-zero contribution snapshot. */
  versatoIniziale: number
  orderIdx: number
}

// ─── Per-semester snapshot (append-only history) ───────────────────────────────
// One row per ETF per semester. Only the RAW inputs are stored; every derived
// column is recomputed by the calc engine so history is never "stale".

export interface SnapshotRaw {
  semesterId: string // e.g. "2026-H1"
  etfId: string
  /** %TARGET carried into this snapshot (usually === Etf.targetPct, but stored
   *  per-snapshot so a future allocation change doesn't rewrite past history). */
  targetPct: number
  /** PAC — monthly contribution active during this semester. */
  pac: number
  /** VAL ATTUALE — market value at the START of the semester. */
  valAttuale: number
  /** TOT VERSATO — cumulative money contributed as of the START of the semester
   *  (NOT yet grown by this semester's pac*6). */
  totVersato: number
  /** VAL REALE 6 MESI — market value entered at the semester close.
   *  null while the semester is still open. */
  valReale: number | null
}

/** A snapshot plus every derived column. */
export interface EtfComputed extends SnapshotRaw {
  name: string
  /** %PAC = pac / totalPac. */
  pctPac: number
  /** VAL TEORICO 6 MESI = valAttuale + pac*6. */
  valTeorico: number
  /** DIFFERENZA = valReale - valTeorico (semester market gain vs flat). */
  differenza: number | null
  /** PERFORMANCE = valReale - (totVersato + pac*6): net gain since inception,
   *  every euro contributed (this semester's PAC included) subtracted. */
  performance: number | null
  /** %TARGET 6 MESI = valReale / Σ valReale (actual current weight). */
  weight6m: number | null
  /** BILANCIAMENTO = targetPct - weight6m (>0 = underweight -> buy more). */
  bilanciamento: number | null
  /** NUOVO PAC = round(pacMensile * (targetPct + bilanciamento)) — the monthly
   *  budget rebalanced toward the fixed target. Whole €; rows sum to pacMensile.
   *  Negative => fund is far overweight: "reduce/stop". */
  nuovoPac: number | null
}

export interface Semester {
  id: string // "2026-H1"
  label: string
  status: 'open' | 'closed'
  createdAt: string
  closedAt: string | null
}
