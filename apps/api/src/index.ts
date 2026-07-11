import { handle } from 'hono/vercel'
import { app } from './app.js'

export const config = { runtime: 'nodejs' }

export default handle(app)
export const GET = handle(app)
export const POST = handle(app)
export const PATCH = handle(app)
export const DELETE = handle(app)
