import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Env, activeCompanyId, all, database, one, requireRoles } from './shared';
import { registerAuth, registerAuthRoutes } from './auth';
import { registerProduction } from './production';
import { registerFinance } from './finance';
import { schema } from './schema';

const app = new Hono<Env>();
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
  if (c.req.path.startsWith('/api') || c.req.path === '/health') c.header('Cache-Control', 'no-store');
});
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({detail: error.message}, error.status);
  if (error instanceof SyntaxError) return c.json({detail: 'Invalid JSON'}, 400);
  const message = String(error.message);
  if (/UNIQUE constraint failed/i.test(message)) return c.json({detail: 'A record with this value already exists'}, 409);
  if (/FOREIGN KEY constraint failed/i.test(message)) return c.json({detail: 'Referenced record does not exist'}, 400);
  if (/NOT NULL constraint failed/i.test(message)) return c.json({detail: 'A required field is missing'}, 400);
  console.error('ERP request failed', c.req.method, c.req.path, message);
  return c.json({detail: 'The request could not be completed'}, 500);
});
const health = async (c: any) => {
  await one(c, 'SELECT 1 AS ok');
  return c.json({ok: true, app: 'WaxPrint ERP', database: 'D1', file_storage: c.env.FILES ? 'R2' : 'not_enabled'});
};
app.get('/health', health);
registerAuth(app);
app.use('/api/*', async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || ['/api/auth/login', '/api/auth/logout', '/api/integrations/gmail/push'].includes(c.req.path)) return next();
  const originalRequest = c.req.raw.clone();
  await next();
  const actor = c.get('user');
  if (c.res.status >= 400 || !actor?.id) return;
  try {
    const contentType = c.req.header('content-type') || '';
    let input: unknown = {content_type: contentType};
    if (contentType.includes('application/json')) {
      input = await originalRequest.json().catch(() => ({}));
      const scrub = (value: any): any => {
        if (Array.isArray(value)) return value.map(scrub);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /password|token|secret|credential/i.test(key) ? '[redacted]' : scrub(child)]));
      };
      input = scrub(input);
    }
    const path = c.req.path;
    const module = path.split('/')[2] || 'api';
    const record = c.res.clone();
    const result = await record.json().catch(() => null) as Record<string, unknown> | null;
    const recordId = Number(result?.id ?? result?.job_id ?? result?.invoice_id);
    await c.env.DB.prepare(`INSERT INTO audit_logs(company_id,actor_user_id,module,record_id,action,details,user_name,created_at)
      VALUES(?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%f','now'))`)
      .bind(activeCompanyId(c), actor.id, module, Number.isInteger(recordId) && recordId > 0 ? recordId : null,
        `${method} ${path}`, JSON.stringify(input).slice(0, 8000), actor.display_name || actor.username).run();
  } catch (error) {
    console.error('Audit log write failed', String(error));
  }
});
registerAuthRoutes(app);
app.get('/api/health', health);
app.get('/api/admin/audit-logs', async c => {
  requireRoles(c, 'ADMIN');
  const user = c.get('user');
  const rows = user.role === 'SUPER_ADMIN'
    ? await c.env.DB.prepare(`SELECT a.*,co.name company_name FROM audit_logs a JOIN companies co ON co.id=a.company_id ORDER BY a.id DESC LIMIT 500`).all()
    : await c.env.DB.prepare(`SELECT a.*,co.name company_name FROM audit_logs a JOIN companies co ON co.id=a.company_id WHERE a.company_id=? ORDER BY a.id DESC LIMIT 500`).bind(activeCompanyId(c)).all();
  return c.json(rows.results);
});
app.get('/api/admin/all-data', async c => {
  requireRoles(c, 'ADMIN');
  const datasets = [];
  const aliases: Record<string,string> = {inbox_messages: 'inbox', reshoot_tickets: 'reshoots'};
  const centralOnly = new Set(['app_users', 'audit_logs']);
  for (const table of Object.keys(schema)) {
    if (centralOnly.has(table)) continue;
    let rows = await all(c, `SELECT * FROM "${table}" ORDER BY id DESC`);
    datasets.push({key: aliases[table] || table, label: table === 'app_users' ? 'Login Users' : table.replaceAll('_', ' '), count: rows.length, rows});
  }
  return c.json({total_records: datasets.reduce((sum, d) => sum + d.count, 0), datasets});
});
registerProduction(app);
registerFinance(app);
app.all('/api/*', c => c.json({detail: 'Endpoint not found'}, 404));
app.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default app;
