import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { serve } from '@hono/node-server'

// Load repo-root .env.local before app.ts imports db.ts (which reads env).
const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env.local')
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const { app } = await import('./app.js')

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port })
console.log(`API on http://localhost:${port}/api`)
