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

/** % Attuale cell — highlighted by distance from target (|bilanciamento|).
 *  The farther the current weight is from target, the stronger the tint:
 *  amber when overweight (drift < 0), sky when underweight (drift > 0).
 *  Full intensity at ~10 percentage points away. */
function WeightCell({ weight, distance }: { weight: number | null; distance: number | null }) {
  if (weight == null || distance == null) {
    return <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtPct(weight)}</td>
  }
  const t = Math.min(Math.abs(distance) / 0.1, 1) // 0..1, saturates at 10pp
  // overweight (distance<0) -> amber; underweight (distance>0) -> sky
  const [r, g, b] = distance < 0 ? [245, 158, 11] : [56, 189, 248]
  return (
    <td
      title={`${(Math.abs(distance) * 100).toFixed(2)}pp ${distance < 0 ? 'sopra' : 'sotto'} il target`}
      style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${(t * 0.4).toFixed(3)})` }}
      className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', t > 0.55 ? 'font-bold' : t > 0.2 ? 'font-semibold' : 'text-muted-foreground')}
    >
      {fmtPct(weight)}
    </td>
  )
}

const Signed = ({ v, kind = 'eur' }: { v: number | null; kind?: 'eur' | 'pct' }) => (
  <span className={cn('tabular-nums', v != null && v > 0 && 'text-positive', v != null && v < 0 && 'text-negative')}>
    {kind === 'eur' ? fmtSigned(v) : v == null ? '—' : (v > 0 ? '+' : '') + fmtPct(v)}
  </span>
)

const TH = ({ children, sub, className }: { children?: React.ReactNode; sub?: string; className?: string }) => (
  <th className={cn('whitespace-nowrap px-3 py-2 text-right align-bottom font-medium text-muted-foreground', className)}>
    <div className="leading-tight">{children}</div>
    {sub && <div className="text-[10px] font-normal normal-case text-muted-foreground/70">{sub}</div>}
  </th>
)
const TD = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <td className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', className)}>{children}</td>
)

export function SemesterTable({ data, editable, onPatch, pacMensile }: {
  data: SemesterData
  editable: boolean
  onPatch: (etfId: string, patch: Record<string, number | null>) => void
  pacMensile: number
}) {
  const { rows, totals } = data
  const hasNegativePac = rows.some((r) => r.nuovoPac != null && r.nuovoPac < 0)

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left align-bottom font-medium text-muted-foreground">ETF</th>
            <TH sub="strategia">% Target</TH>
            <TH sub="a inizio">Tot. versato</TH>
            <TH sub="+ PAC × 6">Totale versato ad oggi</TH>
            <TH sub="quota">% PAC</TH>
            <TH sub="questo sem.">PAC</TH>
            <TH sub="6 mesi fa">Valore iniziale</TH>
            <TH sub="oggi, con interessi">Valore teorico</TH>
            <TH sub="adesso · reale" className="text-primary">Valore oggi</TH>
            <TH sub="teorico vs oggi">Differenza</TH>
            <TH sub="netta dall'inizio">Plusvalenza</TH>
            <TH sub="peso oggi">% Attuale</TH>
            <TH sub="target − oggi">Bilanciamento</TH>
            <TH sub="pross. sem.">Nuovo PAC</TH>
            <th className="px-3 py-2 text-left align-bottom font-medium text-muted-foreground">
              Calcolo
              <span className="block text-[10px] font-normal">pac mensile × (%target + bilanciamento)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: EtfComputed, i) => (
            <tr key={`${r.semesterId}:${r.etfId}`} className={cn('border-b border-border/60', i % 2 && 'bg-muted/20')}>
              <td className="whitespace-nowrap px-3 py-2 text-left font-semibold">{r.name}</td>
              <TD className="font-semibold">{fmtPct(r.targetPct)}</TD>
              <TD>{fmtEur(r.totVersato)}</TD>
              <TD>{fmtEur(r.totVersatoOggi)}</TD>
              <TD className="text-muted-foreground">{fmtPct(r.pctPac)}</TD>
              <TD>{fmtEur(r.pac)}</TD>
              <TD>{fmtEur(r.valAttuale)}</TD>
              <TD className="text-muted-foreground">{fmtEur(r.valTeorico)}</TD>
              <TD>
                {editable
                  ? <EditCell value={r.valReale} onCommit={(v) => onPatch(r.etfId, { valReale: v })} />
                  : fmtEur(r.valReale)}
              </TD>
              <TD><Signed v={r.differenza} /></TD>
              <TD><Signed v={r.performance} /></TD>
              <WeightCell weight={r.weight6m} distance={r.bilanciamento} />
              <TD><Signed v={r.bilanciamento} kind="pct" /></TD>
              <TD className={cn('font-semibold', r.nuovoPac != null && r.nuovoPac < 0 && 'text-negative')}>
                {fmtEur0(r.nuovoPac)}
              </TD>
              <td className="whitespace-nowrap px-3 py-2 text-left text-xs text-muted-foreground tabular-nums">
                {r.nuovoPac == null || r.bilanciamento == null
                  ? '—'
                  : `${fmtEur0(pacMensile)} × (${fmtPct(r.targetPct)} ${r.bilanciamento >= 0 ? '+' : '−'} ${fmtPct(Math.abs(r.bilanciamento))}) = ${fmtEur(pacMensile * (r.targetPct + r.bilanciamento))} → ${fmtEur0(r.nuovoPac)}`}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/50 font-semibold">
            <td className="px-3 py-2 text-left">TOTALI</td>
            <TD>{fmtPct(totals.targetPct)}</TD>
            <TD>{fmtEur(totals.totVersato)}</TD>
            <TD>{fmtEur(totals.totVersatoOggi)}</TD>
            <TD>{fmtPct(totals.pctPac)}</TD>
            <TD>{fmtEur(totals.pac)}</TD>
            <TD>{fmtEur(totals.valAttuale)}</TD>
            <TD>{fmtEur(totals.valTeorico)}</TD>
            <TD>{fmtEur(totals.valReale)}</TD>
            <TD><Signed v={totals.differenza} /></TD>
            <TD><Signed v={totals.performance} /></TD>
            <TD>{fmtPct(totals.weight6m)}</TD>
            <TD />
            <TD>{fmtEur0(totals.nuovoPac)}</TD>
            <td />
          </tr>
        </tfoot>
      </table>

      {hasNegativePac && (
        <div className="flex items-center gap-2 border-t border-border bg-negative/10 px-3 py-2 text-xs text-negative">
          <AlertTriangle size={14} />
          Un NUOVO PAC è negativo: quell'ETF ha sovraperformato molto. Non si versa negativo — considera di ridurre/fermare o ribilanciare vendendo.
        </div>
      )}
    </div>
  )
}
