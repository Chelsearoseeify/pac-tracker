import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { SemesterData } from '@/lib/api'
import { nextSemesterId } from '@pac/core'
import { fmtEur, fmtEur0 } from '@/lib/format'
import { Button } from './ui'

export function CloseDialog({ semesterId, data, onConfirm }: {
  semesterId: string
  data: SemesterData
  onConfirm: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ready = data.rows.every((r) => r.valReale != null)
  const next = (() => { try { return nextSemesterId(semesterId) } catch { return '?' } })()

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button disabled={!ready} title={ready ? '' : 'Compila tutti i VAL REALE'}>
          Chiudi semestre {semesterId}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Chiudere {semesterId}?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Rollover verso <strong>{next}</strong>. Questa operazione:
          </Dialog.Description>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>• PAC ← Nuovo PAC ({fmtEur0(data.totals.nuovoPac)} totale)</li>
            <li>• Valore iniziale ← Valore oggi ({fmtEur(data.totals.valReale)})</li>
            <li>• Tot. versato +{fmtEur((data.totals.pac ?? 0) * 6)}</li>
            <li>• {semesterId} diventa storico immutabile</li>
          </ul>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild><Button variant="ghost">Annulla</Button></Dialog.Close>
            <Button
              disabled={busy}
              onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); setOpen(false) }}
            >
              {busy ? 'Rollover…' : 'Conferma rollover'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
