import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture, json} from './harness.mjs'

const upload = (name = 'part.stl', field = 'upload', content = 'solid part\nendsolid part', type = 'model/stl') => { const f = new FormData(); f.set(field, new File([content], name, {type})); return f }
async function job(h) { const customer = await json(await h.request('/api/customers', {method: 'POST', body: {name: 'Test customer'}})); return json(await h.request('/api/jobs', {method: 'POST', body: {customer_id: customer.id}})) }

test('complete production workflow preserves files, states, QC and return ownership', async t => {
  const h = await fixture(); t.after(h.close)
  const j = await job(h)
  const form = upload(); form.set('quantity', '3')
  const f = await json(await h.request(`/api/jobs/${j.id}/files`, {method: 'POST', body: form}))
  assert.match(f.sha256, /^[a-f0-9]{64}$/)
  const downloaded = await h.request(`/api/job-files/${f.id}/download`)
  assert.equal(await downloaded.text(), 'solid part\nendsolid part')
  assert.equal(downloaded.headers.get('Cache-Control'), 'no-store')
  await json(await h.request(`/api/jobs/${j.id}/magics/start`, {method: 'POST', body: {operator_name: 'Operator', workstation: 'MAGICS-PC'}}))
  assert.equal((await json(await h.request(`/api/jobs/${j.id}/magics/complete`, {method: 'POST', body: {checker_name: 'Checker', approved: true}}))).job_status, 'READY_MACHINE_SOFTWARE')
  const machine = await json(await h.request('/api/machines', {method: 'POST', body: {code: 'M-1', name: 'Printer'}}))
  const platform = await json(await h.request('/api/platforms', {method: 'POST', body: {files: [{job_file_id: f.id, quantity: 3}]}}))
  const printing = await json(await h.request('/api/print-attempts/start', {method: 'POST', body: {platform_id: platform.id, machine_id: machine.id, production_weight_g: 20, estimated_cost: 40}}))
  await json(await h.request('/api/print-attempts/start', {method: 'POST', body: {platform_id: platform.id, machine_id: machine.id}}), 409)
  const attempt = printing.attempt_ids[0]
  await json(await h.request(`/api/print-attempts/${attempt}/qc`, {method: 'POST', body: {good_qty: 2, bad_qty: 0}}), 422)
  assert.equal((await json(await h.request(`/api/print-attempts/${attempt}/qc`, {method: 'POST', body: {good_qty: 3, bad_qty: 0}}))).status, 'QC_PASSED')
  await json(await h.request(`/api/print-attempts/${attempt}/qc`, {method: 'POST', body: {good_qty: 3, bad_qty: 0}}), 409)
  const quality = await json(await h.request('/api/reports/quality')); assert.equal(quality.first_pass_yield_pct, 100)
  await json(await h.request(`/api/jobs/${j.id}/weight`, {method: 'POST', body: {billable_weight_g: 18.5}}))
  const photo = upload('packing.png', 'packing_photo', 'fake image', 'image/png'); photo.set('job_id', String(j.id))
  const dispatch = await json(await h.request('/api/dispatches/with-photo', {method: 'POST', body: photo}))
  assert.equal(await (await h.request(`/api/dispatches/${dispatch.id}/packing-photo`)).text(), 'fake image')
  const another = await job(h)
  await json(await h.request('/api/returns', {method: 'POST', body: {job_id: another.id, job_file_id: f.id, complaint: 'Broken'}}), 422)
  const returned = await json(await h.request('/api/returns', {method: 'POST', body: {job_id: j.id, job_file_id: f.id, dispatch_id: dispatch.id, complaint: 'Broken', quantity: 1}}))
  assert.ok(returned.reshoot)
  assert.equal((await json(await h.request(`/api/jobs/${j.id}`))).job.status, 'CUSTOMER_RETURN')
  assert.equal(h.db.prepare('SELECT COUNT(*) count FROM customer_returns').get().count, 1)
})

test('missing R2 blocks intake and photo writes without partial records', async t => {
  const h = await fixture({storage: false}); t.after(h.close)
  const j = await job(h); const customer = h.db.prepare('SELECT * FROM customers LIMIT 1').get()
  const response = await json(await h.request(`/api/jobs/${j.id}/files`, {method: 'POST', body: upload()}), 503)
  assert.match(response.detail, /File storage is not enabled/)
  const intake = upload(); intake.set('customer_id', String(customer.id))
  await json(await h.request('/api/inbox/manual-upload', {method: 'POST', body: intake}), 503)
  const photo = upload('photo.png', 'packing_photo', 'image', 'image/png'); photo.set('job_id', String(j.id))
  await json(await h.request('/api/dispatches/with-photo', {method: 'POST', body: photo}), 503)
  for (const table of ['job_files','inbox_messages','dispatches']) assert.equal(h.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count, 0)
  assert.equal(h.db.prepare('SELECT COUNT(*) count FROM jobs').get().count, 1)
  assert.equal(h.db.prepare('SELECT status FROM jobs').get().status, 'FILES_RECEIVED')
  await json(await h.request('/api/dispatches', {method: 'POST', body: {job_id: j.id}}))
})

test('authentication, authorization and service tokens enforce access', async t => {
  const h = await fixture(); t.after(h.close)
  await json(await h.request('/api/jobs', {token: null}), 401)
  await json(await h.request('/api/admin/all-data', {role: 'STAFF'}), 403)
  await json(await h.request('/api/inbox/gmail/clear', {method: 'POST', role: 'STAFF'}), 403)
  await json(await h.request('/api/magics/agent/jobs', {token: null}), 401)
  assert.deepEqual(await json(await h.request('/api/magics/agent/jobs', {token: null, headers: {'x-agent-token': h.env.AGENT_TOKEN}})), [])
  await json(await h.request('/api/auth/login', {method: 'POST', token: null, body: {username: 'admin', password: 'wrong'}}), 401)
  const login = await json(await h.request('/api/auth/login', {method: 'POST', token: null, body: {username: 'ADMIN', password: h.password}}))
  assert.ok(login.token); assert.equal(login.user.password_hash, undefined)
  await json(await h.request('/api/jobs', {method: 'POST', body: '{bad json'}), 400)
})

test('failed production transaction rolls back file records and removes R2 upload', async t => {
  const h = await fixture(); t.after(h.close)
  const j = await job(h)
  h.db.exec("CREATE TRIGGER fail_job_state BEFORE UPDATE ON jobs BEGIN SELECT RAISE(ABORT,'forced production failure'); END")
  await json(await h.request(`/api/jobs/${j.id}/files`, {method: 'POST', body: upload()}), 500)
  assert.equal(h.db.prepare('SELECT COUNT(*) count FROM job_files').get().count, 0)
  assert.equal(h.env.FILES.objects.size, 0)
  assert.equal(h.db.prepare('SELECT status FROM jobs').get().status, 'FILES_RECEIVED')
})

test('failed QC records internal reshoot and rejects repeated ticket creation', async t => {
  const h = await fixture(); t.after(h.close)
  const j = await job(h)
  const f = await json(await h.request(`/api/jobs/${j.id}/files`, {method: 'POST', body: upload()}))
  const m = await json(await h.request('/api/machines', {method: 'POST', body: {code: 'M-QC', name: 'QC printer'}}))
  const p = await json(await h.request('/api/platforms', {method: 'POST', body: {files: [{job_file_id: f.id, quantity: 3}]}}))
  const print = await json(await h.request('/api/print-attempts/start', {method: 'POST', body: {platform_id: p.id, machine_id: m.id}}))
  const path = `/api/print-attempts/${print.attempt_ids[0]}/qc`
  const qc = {good_qty: 2, bad_qty: 1, reason: 'Broken'}
  const result = await json(await h.request(path, {method: 'POST', body: qc}))
  assert.equal(result.status, 'QC_FAILED'); assert.ok(result.reshoot)
  await json(await h.request(path, {method: 'POST', body: qc}), 409)
  const tickets = await json(await h.request('/api/reshoots'))
  assert.equal(tickets.length, 1); assert.equal(tickets[0].source, 'INTERNAL_QC'); assert.equal(tickets[0].quantity, 1)
  const report = await json(await h.request('/api/reports/quality'))
  assert.equal(report.first_pass_yield_pct, 66.67); assert.equal(report.internal_reshoot_tickets, 1)
})

test('login cookie authenticates downloads and logout clears browser session', async t => {
  const h = await fixture(); t.after(h.close)
  const login = await h.app.request('https://localhost/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: 'admin', password: h.password})}, h.env)
  assert.equal(login.status, 200)
  const setCookie = login.headers.get('Set-Cookie')
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /Secure/); assert.match(setCookie, /SameSite=Strict/)
  const cookie = setCookie.split(';')[0]
  assert.equal((await json(await h.request('/api/auth/me', {token: null, headers: {Cookie: cookie}}))).username, 'admin')
  const j = await job(h)
  const file = await json(await h.request(`/api/jobs/${j.id}/files`, {method: 'POST', body: upload()}))
  assert.equal((await h.request(`/api/job-files/${file.id}/download`, {token: null, headers: {Cookie: cookie}})).status, 200)
  const logout = await h.request('/api/auth/logout', {method: 'POST', token: null, headers: {Cookie: cookie}})
  assert.deepEqual(await json(logout), {ok: true}); assert.match(logout.headers.get('Set-Cookie'), /wax_session=;.*Max-Age=0/)
  await json(await h.request('/api/auth/me', {token: null}), 401)
})

test('overlapping print and QC submissions commit exactly one attempt and ticket', async t => {
  const h = await fixture(); t.after(h.close)
  const j = await job(h)
  const f = await json(await h.request(`/api/jobs/${j.id}/files`, {method: 'POST', body: upload()}))
  const m = await json(await h.request('/api/machines', {method: 'POST', body: {code: 'M-RACE', name: 'Printer'}}))
  const p = await json(await h.request('/api/platforms', {method: 'POST', body: {files: [{job_file_id: f.id}]}}))
  // Hold both requests at the transaction boundary, after both have read the old state.
  async function overlap(path, body) {
    const original = h.env.DB.batch; let arrivals = 0; let release
    const gate = new Promise(resolve => { release = resolve })
    h.env.DB.batch = async statements => { if (++arrivals === 2) release(); await gate; return original(statements) }
    try { const responses = await Promise.all([h.request(path, {method: 'POST', body}), h.request(path, {method: 'POST', body})]); assert.deepEqual(responses.map(r => r.status).sort(), [200,409]); return json(responses.find(r => r.status === 200)) } finally { h.env.DB.batch = original }
  }
  const printing = await overlap('/api/print-attempts/start', {platform_id: p.id, machine_id: m.id})
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM print_attempts').get().n, 1)
  const qc = await overlap(`/api/print-attempts/${printing.attempt_ids[0]}/qc`, {good_qty: 0, bad_qty: 1, reason: 'Broken'})
  assert.equal(qc.status, 'QC_FAILED')
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM reshoot_tickets').get().n, 1)
  assert.equal(h.db.prepare('SELECT status FROM print_attempts').get().status, 'QC_FAILED')
  assert.equal(h.db.prepare('SELECT status FROM jobs').get().status, 'RESHOOT_PENDING')
  assert.equal(h.db.prepare('SELECT status FROM platforms').get().status, 'PRINTING')
})
