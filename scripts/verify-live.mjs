import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';

const base = (process.argv[2] || 'https://waxprint-erp.orozone08.workers.dev').replace(/\/$/, '');
const credentials = JSON.parse(await readFile('.secrets/initial-admin.json', 'utf8'));
const report = {url: base, checked_at: new Date().toISOString(), checks: []};
async function check(path, options = {}, expected = 200) {
  const response = await fetch(base + path, options);
  assert.equal(response.status, expected, `${path}: expected ${expected}, got ${response.status}`);
  report.checks.push({path, status: response.status});
  return response;
}
const health = await (await check('/health')).json();
assert.equal(health.ok, true);
assert.equal(health.database, 'D1');
report.health = health;
await check('/');
await check('/admin.html');
await check('/api/customers', {}, 401);
const login = await check('/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(credentials)});
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const session = await login.json();
assert.equal(session.user.role, 'ADMIN');
assert.ok(session.token);
const headers = {Authorization: `Bearer ${session.token}`};
for (const path of ['/api/auth/me', '/api/dashboard', '/api/customers', '/api/jobs', '/api/machines', '/api/platforms', '/api/print-attempts', '/api/reshoots', '/api/materials', '/api/suppliers', '/api/expenses', '/api/employees', '/api/payroll', '/api/advances', '/api/travel', '/api/invoices', '/api/reports/pnl', '/api/reports/quality', '/api/reports/job-profitability', '/api/inbox', '/api/settings/integrations', '/api/admin/all-data']) {
  const data = await (await check(path, {headers})).json();
  if (path === '/api/admin/all-data') assert.ok(data.datasets.every(group => group.rows.every(row => !('password_hash' in row))));
}
await check('/api/auth/me', {headers: {Cookie: cookie}});
const logout = await check('/api/auth/logout', {method: 'POST', headers: {Cookie: cookie}});
assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i);
await check('/api/auth/me', {}, 401);
await mkdir('test-results', {recursive: true});
await writeFile('test-results/live-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Verified ${report.checks.length} live checks. Database: ${health.database}; file storage: ${health.file_storage}. Report: test-results/live-verification.json`);
