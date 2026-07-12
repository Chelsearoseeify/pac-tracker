import { useCallback, useEffect, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { RotateCcw } from 'lucide-react'
import { api, type AppState } from '@/lib/api'
import { SetupForm } from './components/SetupForm'
import { SemesterTable } from './components/SemesterTable'
import { History } from './components/History'
import { Charts } from './components/Charts'
import { CloseDialog } from './components/CloseDialog'
import { Button } from './components/ui'

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setState(await api.state()) } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => { void load() }, [load])

  const patch = useCallback(async (etfId: string, p: Record<string, number | null>) => {
    if (!state?.current) return
    try {
      const data = await api.patchSnapshot(state.current.id, etfId, p)
      setState((s) => (s ? { ...s, currentData: data } : s))
    } catch (e) { setError((e as Error).message) }
  }, [state?.current])

  const close = useCallback(async () => {
    if (!state?.current) return
    await api.close(state.current.id)
    await load()
  }, [state?.current, load])

  const reset = useCallback(async () => {
    if (!confirm('Cancellare TUTTO e ricominciare da zero? Irreversibile.')) return
    await api.reset()
    await load()
  }, [load])

  if (error) return <Shell><p className="text-negative">Errore: {error}</p></Shell>
  if (!state) return <Shell><p className="text-muted-foreground">Caricamento…</p></Shell>
  if (!state.configured) return <Shell><SetupForm onDone={load} /></Shell>

  const { current, currentData, semesters = [], etfs = [] } = state

  return (
    <Shell onReset={reset}>
      <Tabs.Root defaultValue="current">
        <Tabs.List className="mb-5 flex gap-1 border-b border-border">
          <TabTrigger value="current">Semestre corrente</TabTrigger>
          <TabTrigger value="charts">Grafici</TabTrigger>
          <TabTrigger value="history">Storico</TabTrigger>
        </Tabs.List>

        <Tabs.Content value="current" className="space-y-4">
          {current && currentData ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{current.id}</h2>
                  <p className="text-sm text-muted-foreground">
                    Inserisci il <strong>Valore oggi</strong> (mercato reale) di ogni ETF, poi chiudi il semestre.
                  </p>
                </div>
                <CloseDialog semesterId={current.id} data={currentData} onConfirm={close} />
              </div>
              <SemesterTable data={currentData} editable onPatch={patch} pacMensile={state.config?.pacMensile ?? 150} />
            </>
          ) : (
            <p className="text-muted-foreground">Nessun semestre aperto.</p>
          )}
        </Tabs.Content>

        <Tabs.Content value="charts">
          <Charts semesters={semesters} etfs={etfs} />
        </Tabs.Content>

        <Tabs.Content value="history">
          <History semesters={semesters} etfs={etfs} pacMensile={state.config?.pacMensile ?? 150} />
        </Tabs.Content>
      </Tabs.Root>
    </Shell>
  )
}

function TabTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground"
    >
      {children}
    </Tabs.Trigger>
  )
}

function Shell({ children, onReset }: { children: React.ReactNode; onReset?: () => void }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="flex w-full items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">PAC Tracker</h1>
            <p className="text-xs text-muted-foreground">Ribilanciamento portafoglio · aggiornamento semestrale</p>
          </div>
          {onReset && (
            <Button variant="ghost" onClick={onReset} className="text-xs">
              <RotateCcw size={14} /> Reset
            </Button>
          )}
        </div>
      </header>
      <main className="w-full px-4 py-6">{children}</main>
    </div>
  )
}
