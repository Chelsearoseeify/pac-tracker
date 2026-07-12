import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { EtfComputed } from '@pac/core'
import type { SemesterData } from '@/lib/api'
import { fmtEur, fmtEur0, fmtPct, fmtSigned } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Editable currency cell — commits on blur / Enter, only when changed. */
function EditCell({ value, onCommit, disabled }: {
  value: number | null
  onCommit: (v: number | null) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const commit = () => {
    const parsed = draft.trim() === '' ? null : Number(draft)
    if (parsed !== value && !(parsed != null && Number.isNaN(parsed))) onCommit(parsed)
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      disabled={disabled}
      value={draft}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    />
  )
}

/** % Attuale pill (shown under Valore oggi) — highlighted by distance from
 *  target (|bilanciamento|). The farther the current weight is from target, the
 *  stronger the tint: amber when overweight (drift < 0), sky when underweight
 *  (drift > 0). Full intensity at ~10 percentage points away. */
function WeightBadge({ weight, distance }: { weight: number | null; distance: number | null }) {
  if (weight == null || distance == null) return null
  const t = Math.min(Math.abs(distance) / 0.1, 1) // 0..1, saturates at 10pp
  const [r, g, b] = distance < 0 ? [245, 158, 11] : [56, 189, 248]
  return (
    <span
      title={`${fmtPct(weight)} · ${(Math.abs(distance) * 100).toFixed(2)}pp ${distance < 0 ? 'sopra' : 'sotto'} il target`}
      style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${(t * 0.55).toFixed(3)})` }}
      className={cn('mt-0.5 inline-block rounded px-1.5 text-[11px] tabular-nums', t > 0.55 ? 'font-bold' : t > 0.2 ? 'font-semibold' : 'text-muted-foreground')}
    >
      {distance > 0 ? '−' : ''}{fmtPct(weight)}
    </span>
  )
}

const Signed = ({ v, kind = 'eur' }: { v: number | null; kind?: 'eur' | 'pct' }) => (
  <span className={cn('tabular-nums', v != null && v > 0 && 'text-positive', v != null && v < 0 && 'text-negative')}>
    {kind === 'eur' ? fmtSigned(v) : v == null ? '—' : (v > 0 ? '+' : '') + fmtPct(v)}
  </span>
)

/** A signed euro gain with its percentage (value / base) as a small sub-line. */
const GainCell = ({ value, base }: { value: number | null; base: number | null | undefined }) => {
  const pct = value != null && base != null && base !== 0 ? value / base : null
  return (
    <TD>
      <div className="tabular-nums">{fmtSigned(value)}</div>
      {pct != null && <div className="text-[11px]"><Signed v={pct} kind="pct" /></div>}
    </TD>
  )
}

const TH = ({ children, sub, className }: { children?: React.ReactNode; sub?: string; className?: string }) => (
  <th className={cn('whitespace-nowrap px-3 py-2 text-right align-bottom font-medium text-muted-foreground', className)}>
    <div className="leading-tight">{children}</div>
    {sub && <div className="text-[10px] font-normal normal-case text-muted-foreground/70">{sub}</div>}
  </th>
)
const TD = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <td className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', className)}>{children}</td>
)

export function SemesterTable({ data, editable, onPatch }: {
  data: SemesterData
  editable: boolean
  onPatch: (etfId: string, patch: Record<string, number | null>) => void
}) {
  const { rows, totals } = data
  // A fund whose raw share (targetPct + bilanciamento) is negative was floored
  // to 0 and its budget redistributed — flag it even though nuovoPac shows 0.
  const hasCappedPac = rows.some((r) => r.bilanciamento != null && r.targetPct + r.bilanciamento < 0)

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left align-bottom font-medium text-muted-foreground">ETF</th>
            <TH sub="strategia">% Target</TH>
            <TH sub="+ PAC × 6">Totale versato ad oggi</TH>
            <TH sub="questo sem. · quota">PAC</TH>
            <TH sub="6 mesi fa">Valore iniziale</TH>
            <TH sub="oggi, con interessi">Valore teorico</TH>
            <TH sub="reale · peso oggi" className="text-primary">Valore oggi</TH>
            <TH sub="teorico vs oggi">Differenza</TH>
            <TH sub="netta dall'inizio">Plusvalenza</TH>
            <TH sub="target − oggi">Bilanciamento</TH>
            <TH sub="pross. sem.">Nuovo PAC</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: EtfComputed, i) => (
            <tr key={`${r.semesterId}:${r.etfId}`} className={cn('border-b border-border/60', i % 2 && 'bg-muted/20')}>
              <td className="whitespace-nowrap px-3 py-2 text-left font-semibold">{r.name}</td>
              <TD className="font-semibold">{fmtPct(r.targetPct)}</TD>
              <TD>{fmtEur(r.totVersatoOggi)}</TD>
              <TD>
                <div>{fmtEur(r.pac)}</div>
                <div className="text-[11px] text-muted-foreground">{fmtPct(r.pctPac)}</div>
              </TD>
              <TD>{fmtEur(r.valAttuale)}</TD>
              <TD className="text-muted-foreground">{fmtEur(r.valTeorico)}</TD>
              <TD>
                <div>
                  {editable
                    ? <EditCell value={r.valReale} onCommit={(v) => onPatch(r.etfId, { valReale: v })} />
                    : fmtEur(r.valReale)}
                </div>
                <WeightBadge weight={r.weight6m} distance={r.bilanciamento} />
              </TD>
              <GainCell value={r.differenza} base={r.valTeorico} />
              <GainCell value={r.performance} base={r.totVersatoOggi} />
              <TD><Signed v={r.bilanciamento} kind="pct" /></TD>
              <TD className={cn('font-semibold', r.nuovoPac != null && r.nuovoPac < 0 && 'text-negative')}>
                {fmtEur0(r.nuovoPac)}
              </TD>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/50 font-semibold">
            <td className="px-3 py-2 text-left">TOTALI</td>
            <TD>{fmtPct(totals.targetPct)}</TD>
            <TD>{fmtEur(totals.totVersatoOggi)}</TD>
            <TD>
              <div>{fmtEur(totals.pac)}</div>
              <div className="text-[11px] font-normal text-muted-foreground">{fmtPct(totals.pctPac)}</div>
            </TD>
            <TD>{fmtEur(totals.valAttuale)}</TD>
            <TD>{fmtEur(totals.valTeorico)}</TD>
            <TD>
              <div>{fmtEur(totals.valReale)}</div>
              <div className="text-[11px] font-normal text-muted-foreground">{fmtPct(totals.weight6m)}</div>
            </TD>
            <GainCell value={totals.differenza} base={totals.valTeorico} />
            <GainCell value={totals.performance} base={totals.totVersatoOggi} />
            <TD />
            <TD>{fmtEur0(totals.nuovoPac)}</TD>
          </tr>
        </tfoot>
      </table>

      {hasCappedPac && (
        <div className="flex items-center gap-2 border-t border-border bg-negative/10 px-3 py-2 text-xs text-negative">
          <AlertTriangle size={14} />
          Un NUOVO PAC sarebbe stato negativo: quell'ETF ha sovraperformato molto. Azzerato (non si versa negativo) e il budget ridistribuito sugli altri — considera di ribilanciare vendendo.
        </div>
      )}
    </div>
  )
}
