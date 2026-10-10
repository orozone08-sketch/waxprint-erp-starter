import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Ctx, Env, Row, all, activeCompanyId, run, requireRoles, fail } from './shared';

const enc = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const unb64 = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), x => x.charCodeAt(0));
export async function hashPassword(password: string, salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  // Workers Web Crypto permits a maximum of 100,000 PBKDF2 iterations.
  const digest = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000}, key, 256);
  return `pbkdf2_sha256_cf$${salt}$${hex(digest)}`;
}
async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt] = stored.split('$');
  if (algorithm !== 'pbkdf2_sha256_cf' || !salt) return false;
  const candidate = await hashPassword(password, salt);
  let difference = candidate.length ^ stored.length;
  for (let i = 0; i < stored.length; i++) difference |= stored.charCodeAt(i) ^ (candidate.charCodeAt(i) || 0);
  return difference === 0;
}
async function signingKey(secret: string) {
  if (!secret || secret.length < 32) fail(503, 'Authentication is not configured');
  return crypto.subtle.importKey('raw', enc.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
export async function tokenFor(user: Row, secret: string, selectedCompanyId: number) {
  const body = b64(enc.encode(JSON.stringify({uid: user.id, cid: selectedCompanyId, sv: Number(user.session_version ?? 1), exp: Math.floor(Date.now()/1000) + 43200})));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), enc.encode(body));
  return `${body}.${b64(new Uint8Array(signature))}`;
}
export async function userFor(token: string | undefined, c: Ctx): Promise<Row | null> {
  if (!token) return null;
  try {
    const [body, signature, extra] = token.split('.');
    if (extra || !body || !signature || !await crypto.subtle.verify('HMAC', await signingKey(c.env.AUTH_SECRET), unb64(signature), enc.encode(body))) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64(body)));
    if (!Number.isInteger(payload.uid) || !Number.isInteger(payload.cid) || !Number.isInteger(payload.sv) || payload.exp <= Date.now()/1000) return null;
    const user = await c.env.DB.prepare('SELECT * FROM app_users WHERE id=? AND active=1').bind(payload.uid).first<Row>();
    if (!user || Number(user.session_version ?? 1) !== payload.sv || (user.role !== 'SUPER_ADMIN' && Number(user.company_id) !== payload.cid)) return null;
    return {...user, active_company_id: payload.cid};
  } catch { return null; }
}
export function userPayload(user: Row) {
  const { password_hash, session_version, ...publicUser } = user;
  return publicUser;
}
export function registerAuth(app: Hono<Env>) {
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/auth/login' || c.req.path === '/api/auth/logout' || c.req.path === '/api/companies' || c.req.path === '/api/health' || c.req.path === '/api/magics/agent/jobs') return next();
    if (c.req.path === '/api/integrations/gmail/push') {
      if (!c.env.GMAIL_PUSH_TOKEN || c.req.header('authorization') !== `Bearer ${c.env.GMAIL_PUSH_TOKEN}`) fail(401, 'Invalid webhook token');
      return next();
    }
    const token = c.req.header('authorization')?.replace(/^Bearer /, '') || getCookie(c, 'wax_session');
    const user = await userFor(token, c);
    if (!user) fail(401, 'Login required');
    const requestedCompany = Number(c.req.header('x-company-id') || user.active_company_id);
    if (!Number.isInteger(requestedCompany) || requestedCompany < 1) fail(400, 'A valid company must be selected');
    if (user.role !== 'SUPER_ADMIN' && requestedCompany !== Number(user.company_id)) fail(403, 'You do not have access to this company');
    const company = await c.env.DB.prepare('SELECT id FROM companies WHERE id=? AND active=1').bind(requestedCompany).first<Row>();
    if (!company) fail(403, 'The selected company is not available');
    c.set('companyId', requestedCompany);
    c.set('user', user);
    await next();
  });
}

export function registerAuthRoutes(app: Hono<Env>) {
  app.get('/api/companies', async c => c.json(await all(c, 'SELECT id,slug,name FROM companies WHERE active=1 ORDER BY id')));
  app.post('/api/auth/login', async c => {
    const data = await c.req.json();
    if (!data || typeof data.username !== 'string' || typeof data.password !== 'string' || data.username.length > 80 || data.password.length > 256) fail(400, 'Username and password are required');
    const username = data.username.trim().toLowerCase();
    const companySlug = typeof data.company_slug === 'string' ? data.company_slug : 'aditya';
    const company = await c.env.DB.prepare('SELECT id,slug,name FROM companies WHERE slug=? AND active=1').bind(companySlug).first<Row>();
    if (!company) fail(400, 'Choose a valid company');
    const now = Math.floor(Date.now()/1000);
    const keys = [`company:${company.id}:user:${username}`, `ip:${c.req.header('CF-Connecting-IP') || 'local'}`];
    const result = await c.env.DB.batch(keys.map(key => c.env.DB.prepare('INSERT INTO login_attempts(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts').bind(key, now, now-900, now-900)));
    if (result.some(r => Number((r.results[0] as Row)?.attempts) > 30)) fail(429, 'Too many login attempts. Try again in 15 minutes.');
    const user = await c.env.DB.prepare('SELECT * FROM app_users WHERE username=? AND active=1 AND (company_id=? OR role=?)').bind(username, company.id, 'SUPER_ADMIN').first<Row>();
    if (!await verifyPassword(data.password, user?.password_hash || 'pbkdf2_sha256_cf$invalid$invalid') || !user) fail(401, 'Invalid username or password');
    await run(c, 'DELETE FROM login_attempts WHERE key=?', keys[0]);
    const token = await tokenFor(user, c.env.AUTH_SECRET, Number(company.id));
    setCookie(c, 'wax_session', token, {httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: 43200});
    return c.json({token, user: userPayload(user), active_company_id: Number(company.id), active_company_name: company.name});
  });
  app.get('/api/auth/me', c => c.json(userPayload(c.get('user'))));
  app.post('/api/auth/logout', c => {
    deleteCookie(c, 'wax_session', {path: '/'});
    return c.json({ok: true});
  });
  app.get('/api/auth/users', async c => {
    requireRoles(c, 'ADMIN');
    const companyId = activeCompanyId(c);
    const user = c.get('user');
    const statement = user.role === 'SUPER_ADMIN'
      ? c.env.DB.prepare('SELECT * FROM app_users WHERE company_id=? OR role=? ORDER BY id DESC').bind(companyId, 'SUPER_ADMIN')
      : c.env.DB.prepare('SELECT * FROM app_users WHERE company_id=? ORDER BY id DESC').bind(companyId);
    return c.json((await statement.all<Row>()).results.map(userPayload));
  });
  app.post('/api/auth/users', async c => {
    requireRoles(c, 'ADMIN');
    const data = await c.req.json();
    if (typeof data.username !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(data.username.trim()) || typeof data.password !== 'string' || data.password.length < 1 || data.password.length > 256 || typeof data.display_name !== 'string' || !data.display_name.trim()) fail(400, 'Provide a username, display name, and a password of 1–256 characters');
    const role = (data.role || 'STAFF').toUpperCase();
    if (!['ADMIN', 'ACCOUNTS', 'STAFF', 'OPERATOR'].includes(role)) fail(400, 'Invalid role');
    const username = data.username.trim().toLowerCase();
    if (await c.env.DB.prepare('SELECT id FROM app_users WHERE username=?').bind(username).first<Row>()) fail(400, 'Username already exists');
    const companyId = activeCompanyId(c);
    const user = await c.env.DB.prepare('INSERT INTO app_users(username,display_name,role,password_hash,active,company_id) VALUES(?,?,?,?,?,?) RETURNING *').bind(username, data.display_name.trim(), role, await hashPassword(data.password), data.active ?? true, companyId).first<Row>();
    return c.json(userPayload(user!));
  });
  app.post('/api/auth/users/:id/password', async c => {
    requireRoles(c, 'ADMIN');
    const targetId = Number(c.req.param('id'));
    if (!Number.isInteger(targetId) || targetId < 1) fail(400, 'Invalid user ID');
    const data = await c.req.json();
    if (typeof data.password !== 'string' || data.password.length < 1 || data.password.length > 256) fail(400, 'Password must be 1–256 characters');
    const target = await c.env.DB.prepare('SELECT id,username,company_id,role FROM app_users WHERE id=?').bind(targetId).first<Row>();
    if (!target) fail(404, 'Login account not found');
    const actor = c.get('user');
    if (actor.role !== 'SUPER_ADMIN' && Number(target.company_id) !== activeCompanyId(c)) fail(403, 'You can only change passwords for your company');
    if (actor.role !== 'SUPER_ADMIN' && target.role === 'SUPER_ADMIN') fail(403, 'You cannot change a central administrator password');
    if (Number(actor.id) === Number(target.id)) fail(400, 'Use Change My Password and enter your current password');
    await c.env.DB.prepare('UPDATE app_users SET password_hash=?,session_version=session_version+1 WHERE id=?')
      .bind(await hashPassword(data.password), target.id).run();
    return c.json({ok: true});
  });
  app.post('/api/auth/password', async c => {
    const data = await c.req.json();
    if (typeof data.current_password !== 'string' || typeof data.new_password !== 'string' || data.new_password.length < 1 || data.new_password.length > 256) fail(400, 'Enter your current password and a new password of 1–256 characters');
    const actor = c.get('user');
    const current = await c.env.DB.prepare('SELECT * FROM app_users WHERE id=? AND active=1').bind(actor.id).first<Row>();
    if (!current || !await verifyPassword(data.current_password, current.password_hash)) fail(401, 'Current password is incorrect');
    const updated = {...current, password_hash: await hashPassword(data.new_password), session_version: Number(current.session_version ?? 1) + 1};
    await c.env.DB.prepare('UPDATE app_users SET password_hash=?,session_version=? WHERE id=?')
      .bind(updated.password_hash, updated.session_version, actor.id).run();
    const companyId = activeCompanyId(c);
    const company = await c.env.DB.prepare('SELECT name FROM companies WHERE id=?').bind(companyId).first<Row>();
    const token = await tokenFor(updated, c.env.AUTH_SECRET, companyId);
    setCookie(c, 'wax_session', token, {httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: 43200});
    return c.json({ok: true, token, user: userPayload(updated), active_company_id: companyId, active_company_name: company?.name});
  });
}
