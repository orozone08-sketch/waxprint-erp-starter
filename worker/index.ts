import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Env, all, one, requireRoles } from './shared';
import { registerAuth, userPayload } from './auth';
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
app.get('/api/health', health);
app.get('/api/admin/all-data', async c => {
  requireRoles(c, 'ADMIN');
  const datasets = [];
  const aliases: Record<string,string> = {inbox_messages: 'inbox', reshoot_tickets: 'reshoots'};
  for (const table of Object.keys(schema)) {
    let rows = await all(c, `SELECT * FROM "${table}" ORDER BY id DESC`);
    if (table === 'app_users') rows = rows.map(userPayload);
    datasets.push({key: aliases[table] || table, label: table === 'app_users' ? 'Login Users' : table.replaceAll('_', ' '), count: rows.length, rows});
  }
  return c.json({total_records: datasets.reduce((sum, d) => sum + d.count, 0), datasets});
});
registerProduction(app);
registerFinance(app);
app.all('/api/*', c => c.json({detail: 'Endpoint not found'}, 404));
app.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default app;
