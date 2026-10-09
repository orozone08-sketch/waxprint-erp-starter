import { DatabaseSync } from 'node:sqlite'
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const temporary = await mkdtemp(join(tmpdir(), 'waxerp-tests-'))
const bundled = await build({ stdin: { contents: "export {default} from './worker/index'; export {hashPassword,tokenFor} from './worker/auth'", resolveDir: resolve('.'), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false })
const bundlePath = join(temporary, 'worker.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const {default: app, hashPassword, tokenFor} = await import(pathToFileURL(bundlePath).href)
await rm(temporary, {recursive: true, force: true})

function d1(database) {
  const prepare = sql => {
    let values = []
    const execute = () => {
      const statement = database.prepare(sql)
      const rows = statement.columns().length ? statement.all(...values).map(r => ({...r})) : (statement.run(...values), [])
      const meta = database.prepare('SELECT last_insert_rowid() last_row_id, changes() changes').get()
      return {success: true, results: rows, meta: {...meta}}
    }
    return { bind(...args) { values = args; return this }, async all() { return execute() }, async first(column) { const row = execute().results[0] ?? null; return column && row ? row[column] : row }, async run() { return execute() }, execute }
  }
  return {prepare, async batch(statements) { database.exec('BEGIN'); try { const result = statements.map(s => s.execute()); database.exec('COMMIT'); return result } catch (e) { database.exec('ROLLBACK'); throw e } }}
}
function r2() {
  const objects = new Map()
  return {objects, async put(key, bytes, options) { objects.set(key, {bytes: new Uint8Array(bytes), contentType: options?.httpMetadata?.contentType}) }, async delete(key) { objects.delete(key) }, async get(key) { const obj = objects.get(key); if (!obj) return null; return {body: obj.bytes, writeHttpMetadata(headers) { headers.set('Content-Type', obj.contentType || 'application/octet-stream') }} }}
}
export async function fixture({storage = true} = {}) {
  const db = new DatabaseSync(':memory:')
  for (const file of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) db.exec(await readFile(join('migrations', file), 'utf8'))
  const env = {DB: d1(db), AUTH_SECRET: 'local-test-secret-with-more-than-thirty-two-characters', AGENT_TOKEN: 'local-agent-token', GMAIL_PUSH_TOKEN: 'local-gmail-token', ASSETS: {fetch: async () => new Response('asset')}}
  if (storage) env.FILES = r2()
  const tokens = {}
  const password = 'local-test-password-123'
  const passwordHash = await hashPassword(password)
  for (const role of ['ADMIN','ACCOUNTS','STAFF','OPERATOR']) {
    const user = db.prepare('INSERT INTO app_users(username,display_name,role,password_hash) VALUES(?,?,?,?) RETURNING *').get(role.toLowerCase(), role, role, passwordHash)
    tokens[role] = await tokenFor(user, env.AUTH_SECRET)
  }
  const request = async (path, {method = 'GET', body, token = tokens.ADMIN, role, headers = {}} = {}) => {
    if (role) token = tokens[role]
    const init = {method, headers: {...headers}}
    if (token) init.headers.Authorization = `Bearer ${token}`
    if (body !== undefined) { if (body instanceof FormData || typeof body === 'string') init.body = body; else { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json' } }
    return app.request(`http://localhost${path}`, init, env)
  }
  return {app, env, db, tokens, token: tokens.ADMIN, password, request, close: () => db.close()}
}
export const createHarness = fixture
export async function json(response, status = 200) { const payload = await response.json(); assert.equal(response.status, status, JSON.stringify(payload)); return payload }
