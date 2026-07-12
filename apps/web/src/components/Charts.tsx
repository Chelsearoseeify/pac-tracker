import { useEffect, useMemo, useState } from 'react'
import {
  Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { Semester, Etf } from '@pac/core'
import { api, type SemesterData } from '@/lib/api'
import { fmtEur } from '@/lib/format'
import { colorFor } from '@/lib/colors'
import { Card } from './ui'

type Loaded = { semester: Semester } & SemesterData

const eurTick = (n: number) => '€' + Math.round(n / 1000) + 'k'
const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
}

export function Charts({ semesters, etfs }: { semesters: Semester[]; etfs: Etf[] }) {
  const [loaded, setLoaded] = useState<Loaded[]>([])

  useEffect(() => {
    Promise.all(semesters.map((s) => api.semester(s.id))).then((all) =>
      setLoaded(all.sort((a, b) => a.semester.id.localeCompare(b.semester.id))),
    )
  }, [semesters])

  // Per-ETF: projected end value (valTeorico, dotted) vs actual (valReale, solid),
  // one point per semester.
  const perEtfProjection = useMemo(
    () => etfs.map((e) => ({
      etf: e,
      data: loaded.map((l) => {
        const row = l.rows.find((r) => r.etfId === e.id)
        return {
          label: l.semester.id,
          teorico: row?.valTeorico ?? null,
          reale: row?.valReale ?? null,
        }
      }),
    })),
    [loaded, etfs],
  )

  if (loaded.length === 0) return <p className="text-sm text-muted-foreground">Caricamento grafici…</p>

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">Reale vs proiezione col tasso (per ETF)</h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {perEtfProjection.map(({ etf, data }, i) => (
          <Card key={etf.id}>
            <h4 className="mb-3 text-sm font-medium">{etf.name}</h4>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={eurTick} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={44} />
                <Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={tooltipStyle} />
                <Legend />
                <Line
                  type="monotone" dataKey="teorico" name="Proiezione" stroke={colorFor(i)}
                  strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls
                />
                <Line
                  type="monotone" dataKey="reale" name="Reale" stroke={colorFor(i)}
                  strokeWidth={2} dot={{ r: 3 }} connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        ))}
      </div>
    </div>
  )
}
