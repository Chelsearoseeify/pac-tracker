import * as Dialog from '@radix-ui/react-dialog'
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { api, type EtfAllocation, type EtfDetails } from '@/lib/api'
import { colorFor } from '@/lib/colors'
import { fmtPct } from '@/lib/format'
import { Button, Input } from './ui'

/** Stacked bar + legend list — mirrors the DWS "Allocazione per Paese" block. */
function Allocation({ alloc }: { alloc: EtfAllocation }) {
  const rows = alloc.data
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{alloc.title}</h4>
        {alloc.asOfDate && <span className="text-[11px] text-muted-foreground">{alloc.asOfDate}</span>}
      </div>

      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {rows.map((d, i) => (
          <div
            key={d.name}
            title={`${d.name} · ${fmtPct(d.weighting)}`}
            style={{ width: `${d.weighting * 100}%`, backgroundColor: colorFor(i) }}
          />
        ))}
      </div>

      <ul className="divide-y divide-border/60">
        {rows.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between py-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colorFor(i) }} />
              <span className="font-medium">{d.name}</span>
            </span>
            <span className="tabular-nums text-muted-foreground">{fmtPct(d.weighting)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DetailBody({ isin, culture }: { isin: string; culture?: string }) {
  const [details, setDetails] = useState<EtfDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setDetails(null)
    setError(null)
    api.etfDetails(isin, culture)
      .then((d) => alive && setDetails(d))
      .catch((e) => alive && setError((e as Error).message))
    return () => { alive = false }
  }, [isin, culture])

  if (error) return <p className="text-sm text-negative">Errore: {error}</p>
  if (!details) return <p className="text-sm text-muted-foreground">Caricamento dati fondo…</p>

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {details.identifiers.map((id) => (
            <span key={id.key} className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{id.key}: {id.value}</span>
          ))}
          {details.productUrl && (
            <a href={details.productUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline">
              Scheda DWS <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      {details.facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {details.facts.map((f, i) => (
            <div key={`${f.key}:${i}`}>
              <dt className="text-[11px] text-muted-foreground">{f.key}</dt>
              <dd className="text-sm font-semibold tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {details.allocations.map((a) => <Allocation key={a.title} alloc={a} />)}

      {details.allocations.length === 0 && details.facts.length === 0 && (
        <p className="text-sm text-muted-foreground">Nessun dato di allocazione disponibile per questo fondo.</p>
      )}
    </div>
  )
}

/** Prompt to attach an ISIN when the ETF has none (or to change it). */
function IsinForm({ etfId, current, onSaved }: {
  etfId: string
  current: string | null
  onSaved: (isin: string | null) => void
}) {
  const [value, setValue] = useState(current ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (isin: string | null) => {
    setBusy(true); setError(null)
    try {
      const r = await api.setIsin(etfId, isin)
      onSaved(r.isin)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Collega un <strong>ISIN</strong> (fondi DWS / Xtrackers) per vedere i dati live: costi, allocazioni per paese, settore e valuta.
      </p>
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="es. IE0006WW1TQ4"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && save(value.trim())}
        />
        <Button disabled={busy || !value.trim()} onClick={() => save(value.trim())}>
          {busy ? '…' : 'Salva'}
        </Button>
        {current && (
          <Button variant="ghost" disabled={busy} onClick={() => save(null)}>Rimuovi</Button>
        )}
      </div>
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  )
}

export function EtfDetail({ etf, onIsinSaved }: {
  etf: { id: string; name: string; isin?: string | null }
  onIsinSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  // Local echo so the panel flips to details immediately after saving an ISIN,
  // before the parent state round-trips.
  const [isin, setIsin] = useState<string | null>(etf.isin ?? null)
  const [editing, setEditing] = useState(false)

  useEffect(() => { setIsin(etf.isin ?? null) }, [etf.isin])

  const handleSaved = useCallback((next: string | null) => {
    setIsin(next)
    setEditing(false)
    onIsinSaved()
  }, [onIsinSaved])

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(false) }}>
      <Dialog.Trigger asChild>
        <button className="text-left font-semibold hover:text-primary hover:underline">{etf.name}</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b border-border p-5">
            <div>
              <Dialog.Title className="text-lg font-semibold leading-tight">{etf.name}</Dialog.Title>
              {isin && (
                <button className="mt-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                  onClick={() => setEditing((v) => !v)}>
                  {isin} · {editing ? 'annulla' : 'cambia ISIN'}
                </button>
              )}
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Chiudi">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="overflow-y-auto p-5">
            {!isin || editing
              ? <IsinForm etfId={etf.id} current={isin} onSaved={handleSaved} />
              : <DetailBody isin={isin} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
