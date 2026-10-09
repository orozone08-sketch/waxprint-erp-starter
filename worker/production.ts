import { Hono, type Context } from 'hono'
import { type Env, all, one, run, insert, update, code, fail, requireRoles } from './shared'

type C = Context<Env>
type Row = Record<string, any>
const now = () => new Date().toISOString()
const files = (c: C): R2Bucket => { if (!c.env.FILES) fail(503, 'File storage is not enabled yet. Ask an administrator to activate R2 and configure the FILES binding.'); return c.env.FILES! }
const positive = (v: any, name: string, zero = false) => { const n = Number(v); if (!Number.isFinite(n) || (zero ? n < 0 : n <= 0)) fail(422, `${name} must be ${zero ? 'nonnegative' : 'positive'}`); return n }
const integer = (v: any, name: string, zero = false) => { const n = positive(v, name, zero); if (!Number.isInteger(n)) fail(422, `${name} must be an integer`); return n }
const text = (v: any, name: string) => { if (typeof v !== 'string' || !v.trim()) fail(422, `${name} is required`); return v.trim() }
const boolean = (v: any, fallback = false) => { if (v === undefined) return fallback; if (typeof v !== 'boolean') fail(422, 'Expected a boolean'); return v }
const body = async (c: C): Promise<Row> => { const v = await c.req.json(); if (!v || Array.isArray(v) || typeof v !== 'object') fail(422, 'Expected a JSON object'); return v }
const get = async (c: C, table: string, id: any, label: string): Promise<Row> => { const row = await one(c, `SELECT * FROM ${table} WHERE id=?`, integer(id, `${label} id`)); if (!row) fail(404, `${label} not found`); return row as Row }
const stmt = (c: C, sql: string, ...args: any[]) => c.env.DB.prepare(sql).bind(...args)
const set = (c: C, table: string, id: number, values: Row) => stmt(c, `UPDATE ${table} SET ${Object.keys(values).map(k => `${k}=?`).join(',')} WHERE id=?`, ...Object.values(values).map(v => typeof v === 'boolean' ? Number(v) : v), id)
const add = (c: C, table: string, values: Row) => stmt(c, `INSERT INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`, ...Object.values(values).map(v => typeof v === 'boolean' ? Number(v) : v))
async function store(c: C, upload: any, job: Row, folder: string, image = false) {
  const bucket = files(c)
  if (!(upload instanceof File) || !upload.size) fail(422, 'A nonempty upload is required')
  if (image && !upload.type.startsWith('image/')) fail(400, 'Packing photo must be an image.')
  if (upload.size > 100 * 1024 * 1024) fail(413, 'Upload exceeds 100 MB')
  const name = upload.name.split(/[\\/]/).pop() || 'file'
  const bytes = await upload.arrayBuffer()
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2, '0')).join('')
  const key = `${job.number}/${folder}/${crypto.randomUUID()}/${name}`
  await bucket.put(key, bytes, { httpMetadata: { contentType: upload.type || 'application/octet-stream' } })
  return { key, name, digest, size: upload.size }
}
async function download(c: C, key: string, name: string) {
  const obj = await files(c).get(key)
  if (!obj) fail(404, 'Stored file is missing')
  const headers = new Headers(); obj!.writeHttpMetadata(headers)
  headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
  headers.set('Cache-Control', 'private, no-store'); headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(obj!.body, { headers })
}

export function registerProduction(app: Hono<Env>) {
  app.get('/api/jobs', async c => { const status = c.req.query('status'); return c.json(await all(c, `SELECT j.id,j.number,c.name customer,j.customer_id,j.source,j.status,j.priority,j.billable_weight_g,j.reshoot_weight_g,j.received_at FROM jobs j JOIN customers c ON c.id=j.customer_id ${status ? 'WHERE j.status=?' : ''} ORDER BY j.id DESC`, ...(status ? [status] : []))) })
  app.post('/api/jobs', async c => { const b = await body(c); await get(c, 'customers', b.customer_id, 'Customer'); const j = await insert(c, 'jobs', { number: code('WJ'), customer_id: b.customer_id, source: b.source ?? 'manual', priority: b.priority ?? 'NORMAL', instructions: b.instructions ?? null }); return c.json({ id: j.id, number: j.number, status: j.status }) })
  app.get('/api/jobs/:job_id', async c => {
    const j = await get(c, 'jobs', c.req.param('job_id'), 'Job'); const customer = await get(c, 'customers', j.customer_id, 'Customer')
    const [files, magics, reshoots, dispatches, returns] = await Promise.all([
      all(c, 'SELECT id,file_uid,original_name name,status,quantity,sha256 FROM job_files WHERE job_id=?', j.id),
      all(c, 'SELECT id,operator_name operator,workstation,status,checker_name checker,approved FROM magics_sessions WHERE job_id=? ORDER BY id DESC', j.id),
      all(c, 'SELECT id,number,job_file_id file_id,source,reason,quantity,status,chargeable FROM reshoot_tickets WHERE job_id=?', j.id),
      all(c, 'SELECT * FROM dispatches WHERE job_id=?', j.id),
      all(c, 'SELECT id,number,job_file_id file_id,dispatch_id,complaint,quantity,responsibility,chargeable,status,created_at FROM customer_returns WHERE job_id=?', j.id),
    ])
    return c.json({ job: { id: j.id, number: j.number, customer: customer.name, customer_id: j.customer_id, source: j.source, status: j.status, priority: j.priority, instructions: j.instructions, billable_weight_g: j.billable_weight_g, reshoot_weight_g: j.reshoot_weight_g }, files: files.map((f: Row) => ({ ...f, download_url: `/api/job-files/${f.id}/download` })), magics: magics.map((s: Row) => ({ ...s, approved: !!s.approved })), reshoots: reshoots.map((r: Row) => ({ ...r, chargeable: !!r.chargeable })), dispatches: dispatches.map((d: Row) => ({ id: d.id, number: d.number, courier: d.courier, tracking_no: d.tracking_no, packed_by: d.packed_by, checked_by: d.checked_by, delivered_by: d.delivered_by, packing_photo_name: d.packing_photo_name, packing_photo_url: d.packing_photo_path ? `/api/dispatches/${d.id}/packing-photo` : null, status: d.status })), returns: returns.map((r: Row) => ({ ...r, chargeable: !!r.chargeable })) })
  })
  app.post('/api/jobs/:job_id/files', async c => {
    const j = await get(c, 'jobs', c.req.param('job_id'), 'Job'); const b = await c.req.parseBody(); const quantity = integer(b.quantity ?? 1, 'Quantity'); const f = await store(c, b.upload, j, 'original'); const uid = code('F')
    try { const result = await c.env.DB.batch([add(c, 'job_files', { job_id: j.id, file_uid: uid, original_name: f.name, original_path: f.key, sha256: f.digest, quantity, status: 'RECEIVED' }), set(c, 'jobs', j.id, { status: 'WAITING_MAGICS' })]); return c.json({ id: result[0].meta.last_row_id, file_uid: uid, name: f.name, sha256: f.digest, size: f.size }) } catch (e) { await files(c).delete(f.key); throw e }
  })
  app.get('/api/job-files/:file_id/download', async c => { const f = await get(c, 'job_files', c.req.param('file_id'), 'File'); return download(c, f.original_path, f.original_name) })
  app.post('/api/jobs/:job_id/magics/start', async c => { const j = await get(c, 'jobs', c.req.param('job_id'), 'Job'); const b = await body(c); const result = await c.env.DB.batch([add(c, 'magics_sessions', { job_id: j.id, operator_name: text(b.operator_name, 'Operator'), workstation: text(b.workstation, 'Workstation'), status: 'STARTED' }), set(c, 'jobs', j.id, { status: 'MAGICS_REPAIR' })]); return c.json({ session_id: result[0].meta.last_row_id, status: 'STARTED' }) })
  app.post('/api/jobs/:job_id/magics/complete', async c => { const j = await get(c, 'jobs', c.req.param('job_id'), 'Job'); const b = await body(c); const s = await one(c, 'SELECT * FROM magics_sessions WHERE job_id=? ORDER BY id DESC LIMIT 1', j.id) as Row; if (!s) fail(404, 'Magics session/job not found'); const approved = boolean(b.approved, true); const status = approved ? 'APPROVED' : 'REPAIR_REQUIRED'; const job_status = approved ? 'READY_MACHINE_SOFTWARE' : 'MAGICS_REPAIR'; await c.env.DB.batch([set(c, 'magics_sessions', s.id, { completed_at: now(), checker_name: text(b.checker_name, 'Checker'), approved, status }), set(c, 'jobs', j.id, { status: job_status })]); return c.json({ status, job_status }) })
  app.get('/api/magics/queue', async c => { const jobs = await all(c, `SELECT j.id,j.number,c.name customer,j.source,j.priority,j.status,j.received_at,(SELECT COUNT(*) FROM job_files f WHERE f.job_id=j.id) file_count FROM jobs j JOIN customers c ON c.id=j.customer_id WHERE j.status IN ('WAITING_MAGICS','MAGICS_REPAIR','READY_MACHINE_SOFTWARE') ORDER BY j.id DESC`); return c.json(await Promise.all(jobs.map(async (j: Row) => { const s = await one(c, 'SELECT id,operator_name operator,workstation,status,checker_name checker,approved,started_at,completed_at FROM magics_sessions WHERE job_id=? ORDER BY id DESC LIMIT 1', j.id) as Row; return { ...j, latest_session: s ? { ...s, approved: !!s.approved } : null } }))) })
  app.get('/api/magics/sessions', async c => c.json((await all(c, `SELECT s.id,s.job_id,j.number job_number,c.name customer,j.status job_status,s.operator_name operator,s.workstation,s.status,s.checker_name checker,s.approved,s.started_at,s.completed_at FROM magics_sessions s JOIN jobs j ON j.id=s.job_id JOIN customers c ON c.id=j.customer_id ORDER BY s.id DESC`)).map((s: Row) => ({ ...s, approved: !!s.approved }))))
  app.get('/api/magics/agent/jobs', async c => { if (!c.env.AGENT_TOKEN || c.req.header('x-agent-token') !== c.env.AGENT_TOKEN) fail(401, 'Invalid agent token'); return c.json(await all(c, `SELECT j.id,j.number,c.name customer FROM jobs j JOIN customers c ON c.id=j.customer_id WHERE j.status='WAITING_MAGICS' ORDER BY j.id`)) })
  app.get('/api/machines', async c => c.json(await all(c, 'SELECT * FROM machines ORDER BY name')))
  app.post('/api/machines', async c => { const b = await body(c); const m = await insert(c, 'machines', { code: text(b.code, 'Code'), name: text(b.name, 'Name'), model: b.model ?? null, serial_number: b.serial_number ?? null, status: b.status ?? 'AVAILABLE' }); return c.json({ id: m.id, name: m.name, status: m.status }) })
  app.get('/api/platforms', async c => c.json((await all(c, 'SELECT id,number,software_name,machine_id,status,is_reshoot_platform FROM platforms ORDER BY id DESC')).map((p: Row) => ({ ...p, is_reshoot_platform: !!p.is_reshoot_platform }))))
  app.post('/api/platforms', async c => {
    const b = await body(c); if (!Array.isArray(b.files)) fail(422, 'Files must be an array'); if (b.machine_id != null) await get(c, 'machines', b.machine_id, 'Machine'); const seen = new Set<number>(); const files: Row[] = []
    for (const x of b.files) { const f = await get(c, 'job_files', x.job_file_id, 'File'); if (seen.has(f.id)) fail(422, 'Duplicate platform file'); seen.add(f.id); files.push({ ...f, qty: integer(x.quantity ?? 1, 'Quantity') }) }
    const number = code(boolean(b.is_reshoot_platform) ? 'PL-RS' : 'PL'); const statements = [add(c, 'platforms', { number, software_name: b.software_name ?? 'WaxJet', machine_id: b.machine_id ?? null, status: 'READY', is_reshoot_platform: boolean(b.is_reshoot_platform) })]
    for (const f of files) statements.push(stmt(c, 'INSERT INTO platform_files (platform_id,job_file_id,quantity) SELECT id,?,? FROM platforms WHERE number=?', f.id, f.qty, number), set(c, 'job_files', f.id, { status: 'ON_PLATFORM' }), set(c, 'jobs', f.job_id, { status: 'PLATFORM_READY' }))
    const result = await c.env.DB.batch(statements); return c.json({ id: result[0].meta.last_row_id, number, status: 'READY' })
  })
  app.post('/api/print-attempts/start', async c => {
    const b = await body(c); const p = await get(c, 'platforms', b.platform_id, 'Platform'); await get(c, 'machines', b.machine_id, 'Machine'); if (await one(c, "SELECT id FROM print_attempts WHERE platform_id=? AND status='PRINTING' LIMIT 1", p.id)) fail(409, 'Platform is already printing'); const files = await all(c, 'SELECT pf.*,f.job_id FROM platform_files pf JOIN job_files f ON f.id=pf.job_file_id WHERE pf.platform_id=?', p.id); if (!files.length) fail(400, 'Platform has no files')
    const weight = positive(b.production_weight_g ?? 0, 'Weight', true) / files.length; const cost = positive(b.estimated_cost ?? 0, 'Cost', true) / files.length
    // A private claim exists only within this atomic batch. Every dependent write checks it.
    const claim = `START:${crypto.randomUUID()}`
    const guard = 'EXISTS (SELECT 1 FROM platforms WHERE id=? AND status=?)'
    const statements = [stmt(c, "UPDATE platforms SET status=? WHERE id=? AND NOT EXISTS (SELECT 1 FROM print_attempts WHERE platform_id=? AND status='PRINTING')", claim, p.id, p.id)]
    for (const f of files as Row[]) statements.push(stmt(c, `INSERT INTO print_attempts (job_file_id,platform_id,machine_id,attempt_no,is_reshoot,status,expected_qty,production_weight_g,estimated_cost) SELECT ?,?,?,(SELECT COALESCE(MAX(attempt_no),0)+1 FROM print_attempts WHERE job_file_id=?),?,'PRINTING',?,?,? WHERE ${guard}`, f.job_file_id, p.id, b.machine_id, f.job_file_id, Number(boolean(b.is_reshoot)), f.quantity, weight, cost, p.id, claim), stmt(c, `UPDATE job_files SET status='PRINTING' WHERE id=? AND ${guard}`, f.job_file_id, p.id, claim), stmt(c, `UPDATE jobs SET status='PRINTING' WHERE id=? AND ${guard}`, f.job_id, p.id, claim))
    statements.push(stmt(c, `UPDATE machines SET status='PRINTING' WHERE id=? AND ${guard}`, b.machine_id, p.id, claim), stmt(c, "UPDATE platforms SET status='PRINTING',machine_id=? WHERE id=? AND status=?", b.machine_id, p.id, claim))
    const result = await c.env.DB.batch(statements); if (!result[0].meta.changes) fail(409, 'Platform is already printing'); return c.json({ attempt_ids: files.map((_, i) => result[1 + i * 3].meta.last_row_id), count: files.length })
  })
  app.get('/api/print-attempts', async c => c.json((await all(c, 'SELECT id,job_file_id file_id,platform_id,machine_id,attempt_no,is_reshoot,status,expected_qty,good_qty,bad_qty,qc_reason reason,production_weight_g,estimated_cost FROM print_attempts ORDER BY id DESC')).map((a: Row) => ({ ...a, is_reshoot: !!a.is_reshoot }))))
  app.post('/api/print-attempts/:attempt_id/qc', async c => {
    const a = await get(c, 'print_attempts', c.req.param('attempt_id'), 'Attempt'); if (a.status !== 'PRINTING') fail(409, 'QC has already been recorded'); const f = await get(c, 'job_files', a.job_file_id, 'File'); const b = await body(c); const good = integer(b.good_qty, 'Good quantity', true); const bad = integer(b.bad_qty, 'Bad quantity', true); if (good + bad !== a.expected_qty) fail(422, 'Good and bad quantities must equal expected quantity'); const status = bad ? 'QC_FAILED' : 'QC_PASSED'; const job_status = bad ? 'RESHOOT_PENDING' : 'WEIGHT_PENDING'; const ticket = bad && boolean(b.create_reshoot, true) ? code('RS') : null
    const claim = `QC:${crypto.randomUUID()}`
    const guard = 'EXISTS (SELECT 1 FROM print_attempts WHERE id=? AND status=?)'
    const statements = [stmt(c, "UPDATE print_attempts SET status=? WHERE id=? AND status='PRINTING'", claim, a.id), stmt(c, `UPDATE job_files SET status=? WHERE id=? AND ${guard}`, bad ? 'RESHOOT_PENDING' : 'QC_PASSED', f.id, a.id, claim), stmt(c, `UPDATE jobs SET status=? WHERE id=? AND ${guard}`, job_status, f.job_id, a.id, claim)]
    if (ticket) statements.push(stmt(c, `INSERT INTO reshoot_tickets (number,job_id,job_file_id,original_attempt_id,source,reason,quantity,responsibility,status) SELECT ?,?,?,?,'INTERNAL_QC',?,?,?,'OPEN' WHERE ${guard}`, ticket, f.job_id, f.id, a.id, b.reason || 'BROKEN/FAILED', bad, b.responsibility ?? 'OUR_PRODUCTION', a.id, claim))
    statements.push(stmt(c, 'UPDATE print_attempts SET good_qty=?,bad_qty=?,qc_reason=?,completed_at=?,status=? WHERE id=? AND status=?', good, bad, b.reason ?? null, now(), status, a.id, claim))
    const result = await c.env.DB.batch(statements); if (!result[0].meta.changes) fail(409, 'QC has already been recorded'); return c.json(bad ? { status, reshoot: ticket } : { status, job_status })
  })
  app.get('/api/reshoots', async c => c.json((await all(c, 'SELECT id,number,job_id,job_file_id file_id,source,reason,quantity,responsibility,chargeable,status FROM reshoot_tickets ORDER BY id DESC')).map((r: Row) => ({ ...r, chargeable: !!r.chargeable }))))
  app.post('/api/jobs/:job_id/weight', async c => { const j = await get(c, 'jobs', c.req.param('job_id'), 'Job'); const b = await body(c); const billable_weight_g = positive(b.billable_weight_g, 'Weight', true); await update(c, 'jobs', j.id, { billable_weight_g, weight_recorded_at: now(), status: 'WEIGHT_COMPLETED' }); return c.json({ job: j.number, billable_weight_g, status: 'WEIGHT_COMPLETED' }) })
  const dispatch = async (c: C, b: Row, photo?: any) => {
    const j = await get(c, 'jobs', b.job_id, 'Job'); const f = photo ? await store(c, photo, j, 'packing', true) : null; const number = code('DSP'); const values: Row = { number, job_id: j.id, status: 'DISPATCHED', packing_photo_path: f?.key ?? null, packing_photo_name: f?.name ?? null }; for (const k of ['courier','tracking_no','packed_by','checked_by','delivered_by']) values[k] = b[k] || null
    try { const result = await c.env.DB.batch([add(c, 'dispatches', values), set(c, 'jobs', j.id, { status: 'DISPATCHED' })]); return c.json({ id: result[0].meta.last_row_id, number, status: 'DISPATCHED', packing_photo_name: f?.name ?? null }) } catch (e) { if (f) await files(c).delete(f.key); throw e }
  }
  app.post('/api/dispatches', async c => dispatch(c, await body(c)))
  app.post('/api/dispatches/with-photo', async c => { const b = await c.req.parseBody(); return dispatch(c, b, b.packing_photo) })
  app.get('/api/dispatches/:dispatch_id/packing-photo', async c => { const d = await get(c, 'dispatches', c.req.param('dispatch_id'), 'Dispatch'); if (!d.packing_photo_path) fail(404, 'Packing photo not found'); return download(c, d.packing_photo_path, d.packing_photo_name || 'packing-photo') })
  app.post('/api/dispatches/:dispatch_id/packing-photo', async c => { const d = await get(c, 'dispatches', c.req.param('dispatch_id'), 'Dispatch'); const j = await get(c, 'jobs', d.job_id, 'Job'); const b = await c.req.parseBody(); const f = await store(c, b.packing_photo, j, 'packing', true); try { await update(c, 'dispatches', d.id, { packing_photo_path: f.key, packing_photo_name: f.name }) } catch (e) { await files(c).delete(f.key); throw e } if (d.packing_photo_path) await files(c).delete(d.packing_photo_path); return c.json({ id: d.id, number: d.number, packing_photo_name: f.name, packing_photo_url: `/api/dispatches/${d.id}/packing-photo` }) })
  app.post('/api/returns', async c => { const b = await body(c); const j = await get(c, 'jobs', b.job_id, 'Job'); const f = await get(c, 'job_files', b.job_file_id, 'File'); if (f.job_id !== j.id) fail(422, 'File does not belong to this job'); if (b.dispatch_id != null) { const d = await get(c, 'dispatches', b.dispatch_id, 'Dispatch'); if (d.job_id !== j.id) fail(422, 'Dispatch does not belong to this job') } const number = code('CR'); const reshoot = boolean(b.create_reshoot, true) ? code('RS') : null; const values = { job_id: j.id, job_file_id: f.id, quantity: integer(b.quantity ?? 1, 'Quantity'), responsibility: b.responsibility ?? 'UNKNOWN', chargeable: boolean(b.chargeable), status: 'OPEN' }; const complaint = text(b.complaint, 'Complaint'); const statements = [add(c, 'customer_returns', { ...values, number, dispatch_id: b.dispatch_id ?? null, complaint }), set(c, 'jobs', j.id, { status: 'CUSTOMER_RETURN' })]; if (reshoot) statements.push(add(c, 'reshoot_tickets', { ...values, number: reshoot, source: 'CUSTOMER_RETURN', reason: complaint })); await c.env.DB.batch(statements); return c.json({ return_no: number, reshoot }) })
  app.get('/api/inbox', async c => c.json((await all(c, 'SELECT id,source,sender,subject,received_at,archived,status,customer_id,job_id FROM inbox_messages ORDER BY id DESC')).map((m: Row) => ({ ...m, archived: !!m.archived }))))
  app.post('/api/inbox/gmail/clear', async c => { requireRoles(c, 'ADMIN'); const result = await run(c, "DELETE FROM inbox_messages WHERE source='gmail'"); return c.json({ ok: true, deleted: result.meta.changes }) })
  app.post('/api/inbox/manual-upload', async c => {
    const b = await c.req.parseBody(); const customer = await get(c, 'customers', b.customer_id, 'Customer'); const quantity = integer(b.quantity ?? 1, 'Quantity'); const source = typeof b.source === 'string' ? b.source : 'whatsapp'; const number = code('WJ'); const uid = code('F'); const f = await store(c, b.upload, { number }, 'original')
    try { const result = await c.env.DB.batch([add(c, 'jobs', { number, customer_id: customer.id, source, status: 'WAITING_MAGICS' }), stmt(c, 'INSERT INTO inbox_messages (source,sender,subject,body,customer_id,job_id,archived,status) SELECT ?,?,?,?,?,id,1,? FROM jobs WHERE number=?', source, b.sender || customer.whatsapp || customer.email || '', `${source} file intake`, b.message || '', customer.id, 'IMPORTED', number), stmt(c, 'INSERT INTO job_files (job_id,file_uid,original_name,original_path,sha256,quantity,status) SELECT id,?,?,?,?,?,? FROM jobs WHERE number=?', uid, f.name, f.key, f.digest, quantity, 'RECEIVED', number)]); return c.json({ job_id: result[0].meta.last_row_id, job_number: number, file_id: uid, archived: true }) } catch (e) { await files(c).delete(f.key); throw e }
  })
  app.get('/api/reports/quality', async c => { const a = await one(c, "SELECT COALESCE(SUM(expected_qty),0) expected_pieces,COALESCE(SUM(good_qty),0) good_pieces,COALESCE(SUM(bad_qty),0) bad_pieces FROM print_attempts WHERE status IN ('QC_PASSED','QC_FAILED')") as Row; const r = await one(c, "SELECT SUM(CASE WHEN source='INTERNAL_QC' THEN 1 ELSE 0 END) internal_reshoot_tickets,SUM(CASE WHEN source='CUSTOMER_RETURN' THEN 1 ELSE 0 END) customer_return_reshoots FROM reshoot_tickets") as Row; return c.json({ ...a, first_pass_yield_pct: a.expected_pieces ? Math.round(a.good_pieces / a.expected_pieces * 10000) / 100 : 0, internal_reshoot_tickets: r.internal_reshoot_tickets || 0, customer_return_reshoots: r.customer_return_reshoots || 0 }) })
}



