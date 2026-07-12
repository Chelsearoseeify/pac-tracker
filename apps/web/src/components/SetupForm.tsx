import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api, type SetupPayload } from '@/lib/api'
import { Button, Card, Field, Input } from './ui'

interface Row {
  name: string
  targetPct: string // percent as typed, e.g. "45.32"
  versatoIniziale: string
  initialPac: string
}

// Prefilled with the reference portfolio so the first run is one click away.
const DEFAULT_ROWS: Row[] = [
  { name: 'S&P500', targetPct: '45.32', versatoIniziale: '2266', initialPac: '68' },
  { name: 'DEV EX-USA', targetPct: '24', versatoIniziale: '1200', initialPac: '36' },
  { name: 'EMERGENTS', targetPct: '16', versatoIniziale: '800', initialPac: '24' },
  { name: 'MOMENTUM', targetPct: '7.34', versatoIniziale: '367', initialPac: '11' },
  { name: 'VALUE', targetPct: '7.34', versatoIniziale: '367', initialPac: '11' },
]

export function SetupForm({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>(DEFAULT_ROWS)
  const [pacMensile, setPacMensile] = useState('150')
  const [dataAvvio, setDataAvvio] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (i: number, key: keyof Row, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)))
  const add = () => setRows((rs) => [...rs, { name: '', targetPct: '', versatoIniziale: '', initialPac: '' }])
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i))

  const sumPct = rows.reduce((s, r) => s + (Number(r.targetPct) || 0), 0)
  const pctOk = Math.abs(sumPct - 100) < 0.5

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const payload: SetupPayload = {
        pacMensile: Number(pacMensile),
        dataAvvio,
        etfs: rows
          .filter((r) => r.name.trim())
          .map((r) => ({
            name: r.name.trim(),
            targetPct: Number(r.targetPct) / 100,
            versatoIniziale: Number(r.versatoIniziale) || 0,
            initialPac: r.initialPac ? Number(r.initialPac) : undefined,
          })),
      }
      await api.setup(payload)
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <h2 className="text-lg font-semibold">Configurazione iniziale (giorno zero)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Questi valori sono la fotografia di partenza: <strong>% target</strong> e{' '}
        <strong>versato iniziale</strong> restano fissi per sempre. Li rivedrai tra 20 anni.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="PAC mensile totale (€)" hint="ribilanciato sui target ogni semestre">
          <Input type="number" value={pacMensile} onChange={(e) => setPacMensile(e.target.value)} />
        </Field>
        <Field label="Data avvio PAC">
          <Input type="date" value={dataAvvio} onChange={(e) => setDataAvvio(e.target.value)} />
        </Field>
      </div>

      <div className="mt-6 space-y-2">
        <div className="grid grid-cols-[1fr_5rem_7rem_6rem_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
          <span>ETF</span><span>% Target</span><span>Versato iniz.</span><span>PAC iniz.</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_7rem_6rem_2rem] items-center gap-2">
            <Input value={r.name} placeholder="Nome ETF" onChange={(e) => set(i, 'name', e.target.value)} />
            <Input type="number" value={r.targetPct} onChange={(e) => set(i, 'targetPct', e.target.value)} />
            <Input type="number" value={r.versatoIniziale} onChange={(e) => set(i, 'versatoIniziale', e.target.value)} />
            <Input type="number" value={r.initialPac} onChange={(e) => set(i, 'initialPac', e.target.value)} />
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-negative" aria-label="Rimuovi">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <Button variant="ghost" onClick={add} className="mt-1">
          <Plus size={16} /> Aggiungi ETF
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className={pctOk ? 'text-sm text-muted-foreground' : 'text-sm text-negative'}>
          Somma % target: {sumPct.toFixed(2)}% {pctOk ? '✓' : '(dovrebbe fare 100%)'}
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}

      <div className="mt-5 flex justify-end">
        <Button onClick={submit} disabled={busy}>{busy ? 'Avvio…' : 'Avvia il PAC'}</Button>
      </div>
    </Card>
  )
}
