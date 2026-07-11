// Bundle the Hono API (+ @pac/core, routes, db, hono) into a single fully
// self-contained ESM function at api/index.js — zero external deps.
//
// Why a custom bundle instead of @vercel/node tracing: the workspace is
// consumed as raw TypeScript source (@pac/core main -> src/index.ts, imports
// use .js specifiers), which the plain-Node lambda runtime can't load. esbuild
// inlines everything so the deployed function has no local/TS/node_modules
// resolution at runtime. (Turso is reached via plain HTTP fetch, so there's no
// @libsql/client native dependency to keep external.)
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Map ".js" import specifiers to their ".ts" source (NodeNext-style imports).
const jsToTs = {
  name: 'js-to-ts',
  setup(b) {
    b.onResolve({ filter: /\.js$/ }, (args) => {
      if (args.kind === 'entry-point' || !args.path.startsWith('.')) return
      const ts = path.resolve(args.resolveDir, args.path.replace(/\.js$/, '.ts'))
      return existsSync(ts) ? { path: ts } : undefined
    })
  },
}

await build({
  entryPoints: ['apps/api/src/vercel-entry.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  plugins: [jsToTs],
  logLevel: 'info',
})
console.log('bundled -> api/index.js')
