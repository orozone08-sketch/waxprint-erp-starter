import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Env, activeCompanyId, all, database, one, requireRoles } from './shared';
import { registerAuth, registerAuthRoutes } from './auth';
import { registerProduction } from './production';
import { registerFinance } from './finance';
import { registerWhatsapp } from './whatsapp';
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
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || ['/api/auth/login', '/api/auth/logout', '/api/integrations/gmail/push', '/api/integrations/whatsapp/webhook'].includes(c.req.path) || c.req.path.startsWith('/api/integrations/gmail/bridge/')) return next();
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
    let rows = table === 'jobs'
      ? await all(c, 'SELECT jobs.*,customers.name customer_name FROM jobs JOIN customers ON customers.id=jobs.customer_id ORDER BY jobs.id DESC')
      : await all(c, `SELECT * FROM "${table}" ORDER BY id DESC`);
    datasets.push({key: aliases[table] || table, label: table === 'app_users' ? 'Login Users' : table.replaceAll('_', ' '), count: rows.length, rows});
  }
  return c.json({total_records: datasets.reduce((sum, d) => sum + d.count, 0), datasets});
});
app.delete('/api/admin/data/:table/:record_id', async c => {
  requireRoles(c, 'ADMIN');
  const table = c.req.param('table');
  const recordId = Number(c.req.param('record_id'));
  const protectedTables = new Set(['app_users', 'audit_logs']);
  if (!Object.hasOwn(schema, table) || protectedTables.has(table)) return c.json({detail: 'This admin data entry cannot be deleted here'}, 400);
  if (!Number.isSafeInteger(recordId) || recordId <= 0) return c.json({detail: 'A valid record id is required'}, 400);
  const db = database(c);
  const found = await db.prepare(`SELECT id FROM "${table}" WHERE id=?`).bind(recordId).first();
  if (!found) return c.json({detail: 'Record not found'}, 404);

  try {
    if (table === 'invoices') {
      await db.batch([
        db.prepare('DELETE FROM payments WHERE invoice_id=?').bind(recordId),
        db.prepare('DELETE FROM invoice_lines WHERE invoice_id=?').bind(recordId),
        db.prepare('DELETE FROM invoices WHERE id=?').bind(recordId),
      ]);
    } else if (table === 'invoice_lines') {
      const line = await db.prepare('SELECT invoice_id FROM invoice_lines WHERE id=?').bind(recordId).first<{invoice_id:number}>();
      await db.batch([
        db.prepare('DELETE FROM invoice_lines WHERE id=?').bind(recordId),
        db.prepare(`UPDATE invoices SET
          subtotal=COALESCE((SELECT SUM(amount) FROM invoice_lines WHERE invoice_id=?),0),
          tax_amount=CASE WHEN subtotal>0 THEN tax_amount*COALESCE((SELECT SUM(amount) FROM invoice_lines WHERE invoice_id=?),0)/subtotal ELSE 0 END,
          total_amount=COALESCE((SELECT SUM(amount) FROM invoice_lines WHERE invoice_id=?),0)+CASE WHEN subtotal>0 THEN tax_amount*COALESCE((SELECT SUM(amount) FROM invoice_lines WHERE invoice_id=?),0)/subtotal ELSE 0 END
          WHERE id=?`).bind(line?.invoice_id,line?.invoice_id,line?.invoice_id,line?.invoice_id,line?.invoice_id),
      ]);
    } else if (table === 'payments') {
      const payment = await db.prepare('SELECT invoice_id FROM payments WHERE id=?').bind(recordId).first<{invoice_id:number}>();
      await db.batch([
        db.prepare('DELETE FROM payments WHERE id=?').bind(recordId),
        db.prepare(`UPDATE invoices SET status=CASE
          WHEN (SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=?)>=total_amount THEN 'PAID'
          WHEN (SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=?)>0 THEN 'PART_PAID'
          ELSE 'SENT' END WHERE id=?`).bind(payment?.invoice_id,payment?.invoice_id,payment?.invoice_id),
      ]);
    } else if (table === 'inbox_messages') {
      const attachments = await db.prepare('SELECT storage_key FROM inbox_attachments WHERE inbox_message_id=?').bind(recordId).all<{storage_key:string}>();
      await db.batch([
        db.prepare('DELETE FROM inbox_attachments WHERE inbox_message_id=?').bind(recordId),
        db.prepare('DELETE FROM inbox_messages WHERE id=?').bind(recordId),
      ]);
      if (c.env.FILES) await Promise.allSettled((attachments.results||[]).map(item=>c.env.FILES!.delete(item.storage_key)));
    } else if (table === 'inbox_attachments') {
      const attachment = await db.prepare('SELECT storage_key FROM inbox_attachments WHERE id=?').bind(recordId).first<{storage_key:string}>();
      await db.prepare('DELETE FROM inbox_attachments WHERE id=?').bind(recordId).run();
      if (attachment?.storage_key && c.env.FILES) await c.env.FILES.delete(attachment.storage_key);
    } else if (table === 'job_files') {
      return c.json({detail: 'Delete the parent job from the Jobs module to remove this file and its production history safely'}, 409);
    } else {
      await db.prepare(`DELETE FROM "${table}" WHERE id=?`).bind(recordId).run();
    }
  } catch (error) {
    if (/FOREIGN KEY constraint failed/i.test(String(error))) return c.json({detail: 'This record is linked to other ERP records. Delete its dependent records first, or delete the parent from its module.'}, 409);
    throw error;
  }
  return c.json({ok:true,table, id:recordId});
});
registerProduction(app);
registerFinance(app);
registerWhatsapp(app);
app.all('/api/*', c => c.json({detail: 'Endpoint not found'}, 404));
app.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default app;
