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
 * Formulas (verified 1:1 against the reference sheet, S&P500 example):
 *   valTeorico    = valAttuale + pac*6            2266 + 68*6       = 2674
 *   differenza    = valReale - valTeorico         3500 - 2674       =  826
 *   performance   = valReale - (totVersato+pac*6) 3500 - (2266+408) =  826
 *   weight6m      = valReale / Σ valReale         3500 / 6785       = 51.58%
 *   bilanciamento = targetPct - weight6m          45.32% - 51.58%  = -6.264%
 *   nuovoPac      = pac * (1 + bilanciamento)      68 * 0.93736     = 63.74
 *
 * @param normalizeTo  when set (e.g. 150), scales every nuovoPac so the total
 *   equals it — the display then matches exactly what the rollover will write.
 */
export function computeSemester(
  snapshots: SnapshotRaw[],
  names: Record<string, string>,
  normalizeTo?: number,
): EtfComputed[] {
  const totalPac = snapshots.reduce((s, r) => s + r.pac, 0)
  const allReale = snapshots.every((r) => r.valReale != null)
  const sumReale = allReale ? snapshots.reduce((s, r) => s + (r.valReale as number), 0) : null

  // Raw nuovoPac total, needed to compute the normalization factor.
  const sumNuovo = sumReale
    ? snapshots.reduce((s, r) => s + r.pac * (1 + (r.targetPct - (r.valReale as number) / sumReale)), 0)
    : 0
  const factor = normalizeTo != null && sumNuovo !== 0 ? normalizeTo / sumNuovo : 1

  return snapshots.map((r) => {
    const valTeorico = r.valAttuale + r.pac * MONTHS
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
      nuovoPac = r.pac * (1 + bilanciamento) * factor
    }

    return {
      ...r,
      name: names[r.etfId] ?? r.etfId,
      pctPac,
      valTeorico,
      differenza,
      performance,
      weight6m,
      bilanciamento,
      nuovoPac,
    }
  })
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
 * @param normalizeTo  if set, scales nuovoPac so the new total equals this
 *   value (e.g. 150). Omit to stay faithful to the sheet, where the total
 *   drifts (147.17 in the example).
 */
export function rollover(
  closed: SnapshotRaw[],
  names: Record<string, string>,
  nextSemesterId: string,
  normalizeTo?: number,
): SnapshotRaw[] {
  // nuovoPac already carries the normalization factor when normalizeTo is set,
  // so rollover writes exactly what the preview shows — no second scaling.
  const computed = computeSemester(closed, names, normalizeTo)
  if (computed.some((r) => r.nuovoPac == null)) {
    throw new Error('Cannot roll over: some VAL REALE are still empty')
  }

  const next = computed.map((etf) => ({
    semesterId: nextSemesterId,
    etfId: etf.etfId,
    targetPct: etf.targetPct,
    pac: round2(etf.nuovoPac as number),
    valAttuale: etf.valReale as number,
    totVersato: etf.totVersato + etf.pac * MONTHS,
    valReale: null,
  }))

  // Absorb per-row rounding residual into the largest PAC so the normalized
  // total is EXACTLY normalizeTo (e.g. 150.00, not 150.01).
  if (normalizeTo != null && next.length > 0) {
    const residual = round2(normalizeTo - next.reduce((s, r) => s + r.pac, 0))
    if (residual !== 0) {
      const big = next.reduce((a, b) => (b.pac > a.pac ? b : a))
      big.pac = round2(big.pac + residual)
    }
  }

  return next
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
