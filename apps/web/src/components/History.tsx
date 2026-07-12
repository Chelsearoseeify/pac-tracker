import { useEffect, useMemo, useState } from 'react'
import {
  Line, LineChart, Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { Semester, Etf } from '@pac/core'
import { api, type SemesterData } from '@/lib/api'
import { fmtEur } from '@/lib/format'
import { colorFor } from '@/lib/colors'
import { Card } from './ui'
import { SemesterTable } from './SemesterTable'

type Loaded = { semester: Semester } & SemesterData

const eurTick = (n: number) => '€' + Math.round(n / 1000) + 'k'

export function History({ semesters, etfs, pacMensile }: { semesters: Semester[]; etfs: Etf[]; pacMensile: number }) {
  const [loaded, setLoaded] = useState<Loaded[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all(semesters.map((s) => api.semester(s.id))).then((all) =>
      setLoaded(all.sort((a, b) => a.semester.id.localeCompare(b.semester.id))),
    )
  }, [semesters])

  // Each semester's START state: market value vs money contributed to date.
  const timeline = useMemo(
    () => loaded.map((l) => ({
      label: l.semester.id,
      patrimonio: l.totals.valAttuale ?? 0,
      versato: l.totals.totVersato ?? 0,
    })),
    [loaded],
  )

  const perEtfValue = useMemo(
    () => loaded.map((l) => {
      const row: Record<string, number | string> = { label: l.semester.id }
      l.rows.forEach((r) => { row[r.name] = r.valAttuale })
      return row
    }),
    [loaded],
  )

  const pacEvolution = useMemo(
    () => loaded.map((l) => {
      const row: Record<string, number | string> = { label: l.semester.id }
      l.rows.forEach((r) => { row[r.name] = r.pac })
      return row
    }),
    [loaded],
  )

  const latest = timeline.at(-1)
  const plusvalenza = latest ? latest.patrimonio - latest.versato : 0

  if (loaded.length === 0) return <p className="text-sm text-muted-foreground">Caricamento storico…</p>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Patrimonio attuale" value={fmtEur(latest?.patrimonio ?? 0)} />
        <Stat label="Totale versato" value={fmtEur(latest?.versato ?? 0)} />
        <Stat label="Plusvalenza" value={fmtEur(plusvalenza)} accent={plusvalenza >= 0 ? 'pos' : 'neg'} />
      </div>

      <Card>
        <h3 className="mb-4 text-sm font-semibold">Patrimonio vs versato</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={timeline} margin={{ left: 4, right: 8, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tickFormatter={eurTick} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={44} />
            <Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="versato" name="Versato" stroke="#888" fill="#8884" strokeWidth={2} />
            <Area type="monotone" dataKey="patrimonio" name="Patrimonio" stroke={colorFor(0)} fill={colorFor(0) + '33'} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold">Valore per ETF</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={perEtfValue} margin={{ left: 4, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={eurTick} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={44} />
              <Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={tooltipStyle} />
              {etfs.map((e, i) => (
                <Line key={e.id} type="monotone" dataKey={e.name} stroke={colorFor(i)} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold">Evoluzione PAC per ETF</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={pacEvolution} margin={{ left: 4, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={(n) => '€' + n} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={40} />
              <Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={tooltipStyle} />
              {etfs.map((e, i) => (
                <Line key={e.id} type="monotone" dataKey={e.name} stroke={colorFor(i)} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Semestri archiviati</h3>
        <div className="space-y-3">
          {loaded.map((l) => (
            <div key={l.semester.id}>
              <button
                onClick={() => setOpenId(openId === l.semester.id ? null : l.semester.id)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left text-sm hover:bg-muted/40"
              >
                <span className="font-medium">
                  {l.semester.id}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {l.semester.status === 'closed' ? 'chiuso' : 'in corso'}
                  </span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {fmtEur(l.totals.valReale ?? l.totals.valAttuale)}
                </span>
              </button>
              {openId === l.semester.id && (
                <div className="mt-2">
                  <SemesterTable data={l} editable={false} onPatch={() => {}} pacMensile={pacMensile} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'pos' | 'neg' }) {
  return (
    <Card className="py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent === 'pos' ? 'text-positive' : accent === 'neg' ? 'text-negative' : ''}`}>
        {value}
      </div>
    </Card>
  )
}
