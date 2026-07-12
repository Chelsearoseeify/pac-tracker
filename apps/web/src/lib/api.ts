import type { Config, Etf, Semester, EtfComputed } from '@pac/core'

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

export interface SemesterData {
  rows: EtfComputed[]
  totals: ReturnType<typeof import('@pac/core').totals>
}

export interface AppState {
  configured: boolean
  config?: Config
  etfs?: Etf[]
  semesters?: Semester[]
  current?: Semester | null
  currentData?: SemesterData | null
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export interface SetupPayload {
  pacMensile: number
  dataAvvio: string
  etfs: { name: string; targetPct: number; versatoIniziale: number; initialPac?: number }[]
}

export const api = {
  state: () => req<AppState>('/state'),
  setup: (p: SetupPayload) => req<{ ok: true; semesterId: string }>('/setup', { method: 'POST', body: JSON.stringify(p) }),
  semester: (id: string) => req<{ semester: Semester } & SemesterData>(`/semesters/${id}`),
  patchSnapshot: (semesterId: string, etfId: string, patch: Record<string, number | null>) =>
    req<SemesterData>(`/snapshots/${semesterId}/${etfId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  close: (id: string) => req<{ ok: true; nextSemesterId: string }>(`/semesters/${id}/close`, { method: 'POST' }),
  reset: () => req<void>('/reset', { method: 'DELETE' }),
}
