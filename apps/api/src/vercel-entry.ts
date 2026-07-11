// Entry bundled by scripts/bundle-api.mjs into api/index.js (a self-contained
// Vercel Serverless Function). A Vercel Node function is invoked with Node's
// (req, res) — getRequestListener adapts the Hono fetch app to exactly that
// signature (hono/vercel's `handle` is Next.js-only and hangs here).
import { getRequestListener } from '@hono/node-server'
import { app } from './app.js'

export default getRequestListener(app.fetch)
