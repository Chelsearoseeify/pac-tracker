// Bundled by scripts/bundle-api.mjs into api/index.js (a self-contained Vercel
// Serverless Function). Vercel invokes it with Node's (req, res).
//
// We do NOT use @hono/node-server's getRequestListener here: on Vercel's Node
// runtime the raw request stream is left in a state where the fetch-adapter's
// Readable.toWeb(incoming) never sees 'end' for a body, so `await c.req.json()`
// hangs forever (GET works, POST/PATCH hang). See honojs/node-server#306.
// Instead we buffer the body ourselves, build a Web Request, call app.fetch,
// and write the Response back — bodies arrive intact.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { app } from './app.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET'
  const host = req.headers.host ?? 'localhost'
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https'
  const url = `${proto}://${host}${req.url ?? '/'}`

  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((val) => headers.append(k, val))
    else if (v != null) headers.set(k, v)
  }

  let body: Buffer | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    body = Buffer.concat(chunks)
  }

  const response = await app.fetch(
    new Request(url, { method, headers, body: body?.length ? new Uint8Array(body) : undefined }),
  )

  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}
