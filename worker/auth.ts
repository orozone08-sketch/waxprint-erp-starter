import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Env, Row, all, one, run, insert, requireRoles, fail } from './shared';

const ALLOW_PUBLIC_ACCESS = true; // Temporary development mode; set false before production.
const PUBLIC_USER: Row = {id: 0, username: 'public', display_name: 'WaxPrint Team', role: 'STAFF', active: 1};
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
export async function tokenFor(user: Row, secret: string) {
  const body = b64(enc.encode(JSON.stringify({uid: user.id, exp: Math.floor(Date.now()/1000) + 43200})));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), enc.encode(body));
  return `${body}.${b64(new Uint8Array(signature))}`;
}
export async function userFor(token: string | undefined, c: any): Promise<Row | null> {
  if (!token) return null;
  try {
    const [body, signature, extra] = token.split('.');
    if (extra || !body || !signature || !await crypto.subtle.verify('HMAC', await signingKey(c.env.AUTH_SECRET), unb64(signature), enc.encode(body))) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64(body)));
    if (!Number.isInteger(payload.uid) || payload.exp <= Date.now()/1000) return null;
    return one(c, 'SELECT * FROM app_users WHERE id=? AND active=1', payload.uid);
  } catch { return null; }
}
export function userPayload(user: Row) {
  const { password_hash, ...publicUser } = user;
  return publicUser;
}
export function registerAuth(app: Hono<Env>) {
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/auth/login' || c.req.path === '/api/auth/logout' || c.req.path === '/api/health' || c.req.path === '/api/magics/agent/jobs') return next();
    if (c.req.path === '/api/integrations/gmail/push') {
      if (!c.env.GMAIL_PUSH_TOKEN || c.req.header('authorization') !== `Bearer ${c.env.GMAIL_PUSH_TOKEN}`) fail(401, 'Invalid webhook token');
      return next();
    }
    const token = c.req.header('authorization')?.replace(/^Bearer /, '') || getCookie(c, 'wax_session');
    if (ALLOW_PUBLIC_ACCESS) {
      const user = await userFor(token, c);
      c.set('user', user || PUBLIC_USER);
      return next();
    }
    const user = await userFor(token, c);
    if (!user) fail(401, 'Login required');
    c.set('user', user);
    await next();
  });
  app.post('/api/auth/login', async c => {
    const data = await c.req.json();
    if (!data || typeof data.username !== 'string' || typeof data.password !== 'string' || data.username.length > 80 || data.password.length > 256) fail(400, 'Username and password are required');
    const username = data.username.trim().toLowerCase();
    const now = Math.floor(Date.now()/1000);
    const keys = [`user:${username}`, `ip:${c.req.header('CF-Connecting-IP') || 'local'}`];
    const result = await c.env.DB.batch(keys.map(key => c.env.DB.prepare('INSERT INTO login_attempts(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts').bind(key, now, now-900, now-900)));
    if (result.some(r => Number((r.results[0] as Row)?.attempts) > 30)) fail(429, 'Too many login attempts. Try again in 15 minutes.');
    const user = await one(c, 'SELECT * FROM app_users WHERE username=? AND active=1', username);
    if (!await verifyPassword(data.password, user?.password_hash || 'pbkdf2_sha256_cf$invalid$invalid') || !user) fail(401, 'Invalid username or password');
    await run(c, 'DELETE FROM login_attempts WHERE key=?', keys[0]);
    const token = await tokenFor(user, c.env.AUTH_SECRET);
    setCookie(c, 'wax_session', token, {httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: 43200});
    return c.json({token, user: userPayload(user)});
  });
  app.get('/api/auth/me', c => c.json(userPayload(c.get('user'))));
  app.post('/api/auth/logout', c => {
    deleteCookie(c, 'wax_session', {path: '/'});
    return c.json({ok: true});
  });
  app.get('/api/auth/users', async c => {
    requireRoles(c, 'ADMIN');
    return c.json((await all(c, 'SELECT * FROM app_users ORDER BY id DESC')).map(userPayload));
  });
  app.post('/api/auth/users', async c => {
    requireRoles(c, 'ADMIN');
    const data = await c.req.json();
    if (typeof data.username !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(data.username.trim()) || typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 256 || typeof data.display_name !== 'string' || !data.display_name.trim()) fail(400, 'Provide a username, display name, and a password of 12–256 characters');
    const role = (data.role || 'STAFF').toUpperCase();
    if (!['ADMIN', 'ACCOUNTS', 'STAFF', 'OPERATOR'].includes(role)) fail(400, 'Invalid role');
    const username = data.username.trim().toLowerCase();
    if (await one(c, 'SELECT id FROM app_users WHERE username=?', username)) fail(400, 'Username already exists');
    const user = await insert(c, 'app_users', {username, display_name: data.display_name.trim(), role, active: data.active ?? true, password_hash: await hashPassword(data.password)});
    return c.json(userPayload(user));
  });
}
