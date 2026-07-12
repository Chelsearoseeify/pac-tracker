const eur = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const pct = new Intl.NumberFormat('it-IT', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Whole-euro variant — NUOVO PAC is always an integer, shown without cents.
const eur0 = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export const fmtEur = (n: number | null | undefined) => (n == null ? '—' : eur.format(n))
export const fmtEur0 = (n: number | null | undefined) => (n == null ? '—' : eur0.format(n))
export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : pct.format(n))
export const fmtSigned = (n: number | null | undefined) =>
  n == null ? '—' : (n > 0 ? '+' : '') + eur.format(n)
