import type { Etf, SnapshotRaw, EtfComputed } from './types.js'

/** Months per PAC semester. */
export const MONTHS = 6

/** "2026-H1" -> "2026-H2" -> "2027-H1". */
export function nextSemesterId(id: string): string {
  const m = /^(\d{4})-H([12])$/.exec(id)
  if (!m) throw new Error(`Bad semester id: ${id}`)
  const year = Number(m[1])
  const half = Number(m[2])
  return half === 1 ? `${year}-H2` : `${year + 1}-H1`
}

/** ISO date -> semester id, e.g. "2026-01-15" -> "2026-H1". */
export function semesterIdFromDate(iso: string): string {
  const [y, mo] = iso.split('-')
  const half = Number(mo) <= 6 ? 1 : 2
  return `${y}-H${half}`
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Compute every derived column for one semester's snapshots.
 * Pure: same inputs -> same outputs, no side effects. This is the single
 * source of truth for the spreadsheet math, shared by API and web.
 *
 * NUOVO PAC rebalances the monthly budget toward the FIXED target weights:
 * underweight funds get more, overweight get less, and the split is derived
 * purely from targetPct + current drift — it does NOT depend on last
 * semester's pac. Because Σ targetPct = 1 and Σ bilanciamento = 0, the row
 * totals sum to pacMensile by construction (no normalization step needed).
 *
 * Formulas (S&P500 example, pacMensile = 150, Σ valReale = 6785):
 *   valTeorico    = valAttuale + pac*6            2266 + 68*6      = 2674
 *   differenza    = valReale - valTeorico         3500 - 2674      =  826
 *   performance   = valReale - (totVersato+pac*6) 3500 - (2266+408)=  826
 *   weight6m      = valReale / Σ valReale         3500 / 6785      = 51.58%
 *   bilanciamento = targetPct - weight6m          45.32% - 51.58%  = -6.264%
 *   nuovoPac      = round(pacMensile*(targetPct+bilanciamento))
 *                                                 150*(0.4532-0.0626) -> 59
 *
 * @param pacMensile  the fixed total monthly budget to split (e.g. 150).
 * @param prevRate    per-ETF realized return of the PREVIOUS semester,
 *   `valReale_prev / (valAttuale_prev + pac_prev*6) - 1`. Used to project
 *   VALORE TEORICO forward WITH compounding interest (monthly contributions).
 *   Omit / 0 (e.g. the first semester) => flat projection `valAttuale + pac*6`.
 */
export function computeSemester(
  snapshots: SnapshotRaw[],
  names: Record<string, string>,
  pacMensile: number,
  prevRate?: Record<string, number>,
): EtfComputed[] {
  const totalPac = snapshots.reduce((s, r) => s + r.pac, 0)
  const allReale = snapshots.every((r) => r.valReale != null)
  const sumReale = allReale ? snapshots.reduce((s, r) => s + (r.valReale as number), 0) : null

  const rows = snapshots.map((r) => {
    // VALORE TEORICO: previous semester's start value grown at last realized
    // rate, plus this semester's monthly contributions compounded as an annuity.
    // Monthly rate rM with (1+rM)^6 = 1+rate, so the annuity FV simplifies to
    // pac * rate / rM (-> pac*6 as rate -> 0).
    const rate = prevRate?.[r.etfId] ?? 0
    const valTeorico = rate === 0 || rate <= -1
      ? r.valAttuale + r.pac * MONTHS
      : r.valAttuale * (1 + rate) + r.pac * rate / (Math.pow(1 + rate, 1 / MONTHS) - 1)
    // Cumulative money actually contributed as of today (start total + this sem).
    const totVersatoOggi = r.totVersato + r.pac * MONTHS
    const pctPac = totalPac > 0 ? r.pac / totalPac : 0

    let differenza: number | null = null
    let performance: number | null = null
    let weight6m: number | null = null
    let bilanciamento: number | null = null
    let nuovoPac: number | null = null

    if (r.valReale != null && sumReale != null && sumReale > 0) {
      differenza = r.valReale - valTeorico
      // Net gain since inception: subtract EVERYTHING contributed to date,
      // including this semester's pac*6 (not just the start-of-semester total).
      performance = r.valReale - (r.totVersato + r.pac * MONTHS)
      weight6m = r.valReale / sumReale
      bilanciamento = r.targetPct - weight6m
      // Rebalance the budget toward the fixed target, correcting the drift.
      nuovoPac = pacMensile * (r.targetPct + bilanciamento)
    }

    return {
      ...r,
      name: names[r.etfId] ?? r.etfId,
      pctPac,
      totVersatoOggi,
      valTeorico,
      differenza,
      performance,
      weight6m,
      bilanciamento,
      nuovoPac,
    }
  })

  // Finalize NUOVO PAC. You can't contribute a negative amount, so any fund
  // whose raw share is negative (very overweight) is floored to 0 and the full
  // budget is redistributed proportionally across the funds that still get a
  // positive share (scale factor pacMensile / Σ positives). Then round to whole
  // euros and absorb the rounding residual into the largest PAC so the total is
  // EXACTLY pacMensile. rollover consumes these values directly.
  const withPac = rows.filter((r) => r.nuovoPac != null)
  if (withPac.length) {
    const posSum = withPac.reduce((s, r) => s + Math.max(r.nuovoPac as number, 0), 0)
    for (const r of withPac) {
      const raw = r.nuovoPac as number
      r.nuovoPac = raw <= 0 || posSum <= 0 ? 0 : (raw * pacMensile) / posSum
    }
    for (const r of withPac) r.nuovoPac = Math.round(r.nuovoPac as number)
    const residual = Math.round(pacMensile) - withPac.reduce((s, r) => s + (r.nuovoPac as number), 0)
    if (residual !== 0) {
      const big = withPac.reduce((a, b) => ((b.nuovoPac as number) > (a.nuovoPac as number) ? b : a))
      big.nuovoPac = (big.nuovoPac as number) + residual
    }
  }

  return rows
}

/** Column totals for the TOTALI row. Nulls when the semester is still open. */
export function totals(rows: EtfComputed[]) {
  const sum = (pick: (r: EtfComputed) => number | null) => {
    if (rows.some((r) => pick(r) == null)) return null
    return rows.reduce((s, r) => s + (pick(r) as number), 0)
  }
  return {
    targetPct: sum((r) => r.targetPct),
    totVersato: sum((r) => r.totVersato),
    totVersatoOggi: sum((r) => r.totVersatoOggi),
    pctPac: sum((r) => r.pctPac),
    pac: sum((r) => r.pac),
    valAttuale: sum((r) => r.valAttuale),
    valTeorico: sum((r) => r.valTeorico),
    valReale: sum((r) => r.valReale),
    differenza: sum((r) => r.differenza),
    performance: sum((r) => r.performance),
    weight6m: sum((r) => r.weight6m),
    nuovoPac: sum((r) => r.nuovoPac),
  }
}

/**
 * Roll a CLOSED semester (every valReale filled) forward into the next one.
 * Mirrors the manual "rituale semestrale":
 *   PAC        <- NUOVO PAC
 *   VAL ATTUALE<- VAL REALE
 *   TOT VERSATO<- TOT VERSATO + PAC(old) * 6   (+900 total in the example)
 *   %TARGET      carried unchanged (edit later only to re-strategize)
 *   VAL REALE    cleared (null) for the new semester
 *
 * @param pacMensile  the fixed monthly budget the new PAC split sums to.
 */
export function rollover(
  closed: SnapshotRaw[],
  names: Record<string, string>,
  nextSemesterId: string,
  pacMensile: number,
): SnapshotRaw[] {
  const computed = computeSemester(closed, names, pacMensile)
  if (computed.some((r) => r.nuovoPac == null)) {
    throw new Error('Cannot roll over: some VAL REALE are still empty')
  }

  // nuovoPac is already a residual-adjusted integer from computeSemester, so
  // the new PAC is written verbatim — display and history match exactly.
  return computed.map((etf) => ({
    semesterId: nextSemesterId,
    etfId: etf.etfId,
    targetPct: etf.targetPct,
    pac: etf.nuovoPac as number,
    valAttuale: etf.valReale as number,
    totVersato: etf.totVersato + etf.pac * MONTHS,
    valReale: null,
  }))
}

/** Build the first semester's snapshots from the fixed day-zero config. */
export function initialSnapshots(
  etfs: Etf[],
  semesterId: string,
  initialPac?: Record<string, number>,
  pacMensile = 150,
): SnapshotRaw[] {
  return etfs.map((e) => ({
    semesterId,
    etfId: e.id,
    targetPct: e.targetPct,
    // Default initial PAC = target share of the monthly budget.
    pac: initialPac?.[e.id] ?? round2(e.targetPct * pacMensile),
    valAttuale: e.versatoIniziale,
    totVersato: e.versatoIniziale,
    valReale: null,
  }))
}
