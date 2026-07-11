# PAC Tracker — Ribilanciamento Portafoglio

App leggera per tenere traccia di un PAC (piano di accumulo) su più ETF, con
**ribilanciamento semestrale**. Ogni 6 mesi inserisci i valori di mercato reali,
l'app calcola il nuovo PAC e archivia il semestre come storico immutabile.
Deploy gratuito su **Vercel + Turso**.

Sostituisce il foglio Excel duplicato ogni 6 mesi: niente formule ricorsive,
niente rischio di sovrascrivere le celle "fisse", storico ventennale sempre a portata.

## Cosa fa

- **Colonne fisse (giorno zero):** `% target` e `versato iniziale` — la fotografia
  di partenza, immutabile.
- **Aggiornamento semestrale:** inserisci `VAL REALE`, l'app calcola in tempo reale
  `DIFFERENZA`, `PERFORMANCE`, `% TARGET 6M`, `BILANCIAMENTO`, `NUOVO PAC`.
- **Rollover con un click:** `PAC ← NUOVO PAC`, `VAL ATTUALE ← VAL REALE`,
  `TOT VERSATO += PAC × 6`. Il semestre chiuso diventa storico non modificabile.
- **Storico:** grafici patrimonio vs versato, valore per ETF, evoluzione del PAC.

### Le formule (verificate 1:1 col foglio di riferimento)

```
VAL TEORICO   = VAL ATTUALE + PAC × 6
DIFFERENZA    = VAL REALE − VAL TEORICO          (guadagno di mercato del semestre)
PERFORMANCE   = VAL REALE − (TOT VERSATO + PAC × 6)   (netto vero: tutto il versato dall'inizio, PAC compreso)
% TARGET 6M   = VAL REALE / Σ VAL REALE          (peso reale attuale)
BILANCIAMENTO = % TARGET − % TARGET 6M           (>0 = sottopeso → compra di più)
NUOVO PAC     = PAC × (1 + BILANCIAMENTO)
```

> Nota: il totale NUOVO PAC **deriva** (es. €147,17 invece di €150), perché
> `NUOVO PAC = PAC × (1+bil)` non si somma a costante. In Setup puoi attivare
> **"Normalizza a PAC mensile"** per ricondurlo al totale ogni giro.

## Struttura

```
apps/web    Vite + React 19 + TypeScript + Tailwind (UI, tabella, grafici)
apps/api    Hono + Turso/libSQL (single source of truth)
packages/core   tipi + motore di calcolo puro, condiviso e testato
```

## Sviluppo locale

```bash
pnpm install

# 1) Terminale A — API (punta al DB Turso remoto; l'app parla hrana su HTTP)
export TURSO_DATABASE_URL=libsql://<tuo-db>.turso.io
export TURSO_AUTH_TOKEN=<token>
pnpm --filter @pac/api dev            # :3000

# 2) Terminale B — web (proxy /api -> :3000)
pnpm --filter @pac/web dev            # :5173
```

> Il layer DB (`apps/api/src/db.ts`) parla il protocollo **hrana v2 su HTTP** direttamente
> (`@libsql/client` invia male il token sul runtime Vercel → 401). Quindi in dev serve
> un URL Turso remoto: non c'è più il fallback `file:` SQLite locale.

Test del motore di calcolo:

```bash
pnpm --filter @pac/core test
```

## Deploy gratuito (Vercel + Turso)

1. **Crea il DB Turso** (free tier):
   ```bash
   turso db create pac-tracker
   turso db show pac-tracker --url          # -> TURSO_DATABASE_URL
   turso db tokens create pac-tracker        # -> TURSO_AUTH_TOKEN
   ```
2. **Push del repo** su GitHub, poi importa su Vercel.
3. **Environment variables** su Vercel (Project → Settings → Environment Variables):
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `FRONTEND_URL` = l'URL di produzione (es. `https://pac-tracker.vercel.app`)
4. Deploy. Lo schema si crea da solo al primo accesso.

Al primo avvio l'app mostra la **configurazione iniziale** (già precompilata col
portafoglio di riferimento): controlla i valori e premi *Avvia il PAC*.

## Rituale semestrale (≈2 minuti)

1. Apri la tab **Semestre corrente**.
2. Inserisci il `VAL REALE` di mercato per ogni ETF.
3. Premi **Chiudi semestre** → conferma il rollover.

Fatto. Il nuovo semestre parte già impostato; quello vecchio è nello **Storico**.
