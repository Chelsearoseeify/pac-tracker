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

export const fmtEur = (n: number | null | undefined) => (n == null ? '—' : eur.format(n))
export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : pct.format(n))
export const fmtSigned = (n: number | null | undefined) =>
  n == null ? '—' : (n > 0 ? '+' : '') + eur.format(n)
