import type { Hono } from 'hono';
import { activeCompanyId, all, database, Env, fail, insert, one, requireRoles, run } from './shared';

type C = import('hono').Context<Env>;
type Data = Record<string, any>;
type WhatsAppSettings = {
  waba_id?: string;
  phone_number_id?: string;
  api_version?: string;
  access_token_encrypted?: string;
  app_secret_encrypted?: string;
  verify_token_encrypted?: string;
};

const encoder = new TextEncoder();
const MAX_MEDIA_BYTES = 45 * 1024 * 1024;
const databases = (c: C): Array<[number, D1Database | undefined]> => [[1, c.env.DB], [2, c.env.DB_SUNMOON]];

function toB64(value: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < value.length; offset += 0x8000) binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function fromB64(value: string) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}

async function seal(c: C, value: string) {
  const rawKey = await crypto.subtle.digest('SHA-256', encoder.encode(`whatsapp-settings-v1:${c.env.AUTH_SECRET}`));
  const key = await crypto.subtle.importKey('raw', rawKey, {name: 'AES-GCM'}, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, encoder.encode(value));
  return `${toB64(iv)}.${toB64(new Uint8Array(ciphertext))}`;
}

async function open(c: C, sealed?: string) {
  if (!sealed) return '';
  try {
    const [iv, ciphertext] = sealed.split('.');
    const rawKey = await crypto.subtle.digest('SHA-256', encoder.encode(`whatsapp-settings-v1:${c.env.AUTH_SECRET}`));
    const key = await crypto.subtle.importKey('raw', rawKey, {name: 'AES-GCM'}, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromB64(iv)}, key, fromB64(ciphertext));
    return new TextDecoder().decode(plaintext);
  } catch {
    return '';
  }
}

async function settingsFor(c: C) {
  const row = await one(c, "SELECT value FROM integration_settings WHERE key='whatsapp'") as Data | null;
  return row ? JSON.parse(row.value) as WhatsAppSettings : {};
}

async function saveSettings(c: C, settings: WhatsAppSettings) {
  await run(c, "INSERT INTO integration_settings(key,value) VALUES('whatsapp',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(settings));
}

async function status(c: C) {
  const settings = await settingsFor(c);
  return {
    configured: !!(settings.phone_number_id && settings.access_token_encrypted && settings.app_secret_encrypted && settings.verify_token_encrypted),
    storage_enabled: !!c.env.FILES,
    waba_id: settings.waba_id || '',
    phone_number_id: settings.phone_number_id || '',
    api_version: settings.api_version || 'v23.0',
    app_secret_configured: !!settings.app_secret_encrypted,
    access_token_configured: !!settings.access_token_encrypted,
    verify_token: await open(c, settings.verify_token_encrypted),
    webhook_url: `${new URL(c.req.url).origin}/api/integrations/whatsapp/webhook`
  };
}

async function sha256Hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('');
}

function normalizePhone(value: string) { return value.replace(/\D/g, ''); }

async function findCompanyByVerifyToken(c: C, verifyToken: string) {
  for (const [companyId, db] of databases(c)) {
    if (!db) continue;
    const row = await db.prepare("SELECT value FROM integration_settings WHERE key='whatsapp'").first<Data>();
    if (!row) continue;
    const settings = JSON.parse(row.value) as WhatsAppSettings;
    if ((await open(c, settings.verify_token_encrypted)) === verifyToken && settings.phone_number_id) return {companyId, settings};
  }
  return null;
}

async function verifySignature(raw: ArrayBuffer, signature: string, secret: string) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, raw));
  const provided = signature.slice(7).toLowerCase();
  const actual = Array.from(expected).map(byte => byte.toString(16).padStart(2, '0')).join('');
  let mismatch = 0;
  for (let index = 0; index < actual.length; index++) mismatch |= actual.charCodeAt(index) ^ provided.charCodeAt(index);
  return mismatch === 0;
}

async function receiveMedia(c: C, settings: WhatsAppSettings, media: Data) {
  const mediaId = typeof media.id === 'string' ? media.id : '';
  if (!mediaId) throw fail(422, 'WhatsApp did not include a media ID.');
  const accessToken = await open(c, settings.access_token_encrypted);
  const version = settings.api_version || 'v23.0';
  const detailsResponse = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}`, {
    headers: {Authorization: `Bearer ${accessToken}`}
  });
  const details = await detailsResponse.json() as Data;
  if (!detailsResponse.ok || typeof details.url !== 'string') throw fail(502, 'Meta could not provide a download URL for this WhatsApp attachment.');
  const mediaUrl = new URL(details.url);
  const trustedHost = mediaUrl.hostname === 'facebook.com' || mediaUrl.hostname.endsWith('.facebook.com') || mediaUrl.hostname.endsWith('.fbcdn.net') || mediaUrl.hostname.endsWith('.fbsbx.com');
  if (mediaUrl.protocol !== 'https:' || !trustedHost) throw fail(502, 'Meta returned an untrusted WhatsApp media URL.');
  const fileResponse = await fetch(mediaUrl, {headers: {Authorization: `Bearer ${accessToken}`}});
  if (!fileResponse.ok) throw fail(502, 'Meta could not download this WhatsApp attachment.');
  const declaredSize = Number(details.file_size || media.file_size || fileResponse.headers.get('content-length') || 0);
  if (declaredSize > MAX_MEDIA_BYTES) throw fail(413, 'WhatsApp attachments must be 45 MB or smaller to save into the ERP Inbox.');
  const bytes = await fileResponse.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_MEDIA_BYTES) throw fail(413, 'WhatsApp attachments must be between 1 byte and 45 MB.');
  const filename = (typeof media.filename === 'string' ? media.filename : '').split(/[\\/]/).pop()?.replace(/[\r\n\0]/g, '_').slice(0, 240) || `whatsapp-${mediaId}`;
  const mime = typeof media.mime_type === 'string' && /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(media.mime_type) ? media.mime_type : details.mime_type || 'application/octet-stream';
  return {mediaId, filename, mime, bytes, digest: await sha256Hex(bytes)};
}

async function importMessage(c: C, settings: WhatsAppSettings, message: Data) {
  const messageId = typeof message.id === 'string' ? message.id : '';
  const sender = typeof message.from === 'string' ? message.from : '';
  if (!messageId || !sender) return;
  const externalId = `whatsapp:${messageId}`;
  let inbox = await one(c, 'SELECT * FROM inbox_messages WHERE external_message_id=?', externalId) as Data | null;
  const mediaType = typeof message.type === 'string' ? message.type : '';
  const media = ['document', 'image', 'video', 'audio', 'sticker'].includes(mediaType) ? message[mediaType] as Data | undefined : undefined;
  const caption = typeof media?.caption === 'string' ? media.caption : '';
  const text = typeof message.text?.body === 'string' ? message.text.body : caption;
  if (!inbox) {
    const digits = normalizePhone(sender);
    const customers = digits ? await all(c, "SELECT id,whatsapp FROM customers WHERE whatsapp IS NOT NULL AND whatsapp<>''") : [];
    const customer = customers.find(row => normalizePhone(String(row.whatsapp)) === digits);
    const receivedAt = Number(message.timestamp) > 0 ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString();
    const subject = typeof media?.filename === 'string' ? media.filename : media ? `WhatsApp ${mediaType} attachment` : text.slice(0, 120) || `WhatsApp ${mediaType || 'message'}`;
    try {
      inbox = await insert(c, 'inbox_messages', {source: 'whatsapp', external_message_id: externalId, sender, subject, body: text.slice(0, 10000), received_at: receivedAt, archived: false, status: customer ? 'MATCHED' : 'RECEIVED', customer_id: customer?.id ?? null});
    } catch (error) {
      if (!/UNIQUE constraint failed/i.test(String(error))) throw error;
      inbox = await one(c, 'SELECT * FROM inbox_messages WHERE external_message_id=?', externalId) as Data | null;
    }
  }
  if (!inbox || !media || !c.env.FILES) return;
  const partKey = `whatsapp:${String(media.id || messageId)}`;
  const exists = await one(c, 'SELECT id FROM inbox_attachments WHERE inbox_message_id=? AND gmail_part_key=?', inbox.id, partKey);
  if (exists) return;
  const downloaded = await receiveMedia(c, settings, media);
  const storageKey = `whatsapp/${activeCompanyId(c)}/${inbox.id}/${crypto.randomUUID()}/${downloaded.filename}`;
  await c.env.FILES.put(storageKey, downloaded.bytes, {httpMetadata: {contentType: downloaded.mime}});
  try {
    await insert(c, 'inbox_attachments', {inbox_message_id: inbox.id, filename: downloaded.filename, mime_type: downloaded.mime, size_bytes: downloaded.bytes.byteLength, sha256: downloaded.digest, storage_key: storageKey, gmail_part_key: partKey});
  } catch (error) {
    await c.env.FILES.delete(storageKey);
    if (!/UNIQUE constraint failed/i.test(String(error))) throw error;
  }
  await run(c, 'UPDATE inbox_messages SET attachments_archived=1 WHERE id=?', inbox.id);
}

export function registerWhatsapp(app: Hono<Env>) {
  app.get('/api/integrations/whatsapp/status', async c => {
    const current = await status(c);
    const {verify_token: _verifyToken, ...publicStatus} = current;
    const role = String(c.get('user')?.role || '').trim().toUpperCase();
    return c.json({...publicStatus, can_manage: role === 'ADMIN' || role === 'SUPER_ADMIN'});
  });

  app.get('/api/settings/whatsapp', async c => {
    requireRoles(c, 'ADMIN');
    return c.json(await status(c));
  });

  app.post('/api/settings/whatsapp', async c => {
    requireRoles(c, 'ADMIN');
    if (!c.env.FILES) throw fail(503, 'Enable R2 attachment storage before connecting WhatsApp.');
    const data = await c.req.json() as Data;
    const previous = await settingsFor(c);
    const wabaId = typeof data.waba_id === 'string' ? data.waba_id.trim() : previous.waba_id || '';
    const phoneId = typeof data.phone_number_id === 'string' ? data.phone_number_id.trim() : previous.phone_number_id || '';
    if (!/^\d{5,30}$/.test(wabaId)) throw fail(422, 'Enter the numeric WhatsApp Business Account ID from Meta.');
    if (!/^\d{5,30}$/.test(phoneId)) throw fail(422, 'Enter the numeric WhatsApp Phone Number ID from Meta.');
    const version = typeof data.api_version === 'string' && data.api_version.trim() ? data.api_version.trim() : previous.api_version || 'v23.0';
    if (!/^v\d+\.\d+$/.test(version)) throw fail(422, 'API version must look like v23.0.');
    const accessToken = typeof data.access_token === 'string' ? data.access_token.trim() : '';
    const appSecret = typeof data.app_secret === 'string' ? data.app_secret.trim() : '';
    if (!previous.access_token_encrypted && accessToken.length < 20) throw fail(422, 'Enter a valid WhatsApp Cloud API access token.');
    if (!previous.app_secret_encrypted && appSecret.length < 16) throw fail(422, 'Enter the Meta app secret.');
    const verifyToken = previous.verify_token_encrypted ? await open(c, previous.verify_token_encrypted) : toB64(crypto.getRandomValues(new Uint8Array(24)));
    const next: WhatsAppSettings = {
      waba_id: wabaId,
      phone_number_id: phoneId,
      api_version: version,
      access_token_encrypted: accessToken ? await seal(c, accessToken) : previous.access_token_encrypted,
      app_secret_encrypted: appSecret ? await seal(c, appSecret) : previous.app_secret_encrypted,
      verify_token_encrypted: await seal(c, verifyToken)
    };
    await saveSettings(c, next);
    return c.json({ok: true, message: 'WhatsApp connection settings saved.', whatsapp: await status(c)});
  });

  app.post('/api/settings/whatsapp/subscribe', async c => {
    requireRoles(c, 'ADMIN');
    const settings = await settingsFor(c);
    if (!settings.waba_id || !settings.access_token_encrypted) throw fail(400, 'Save the WhatsApp Business Account ID and access token first.');
    const token = await open(c, settings.access_token_encrypted);
    const response = await fetch(`https://graph.facebook.com/${settings.api_version || 'v23.0'}/${encodeURIComponent(settings.waba_id)}/subscribed_apps`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${token}`}
    });
    const result = await response.json() as Data;
    if (!response.ok || result.success !== true) throw fail(502, 'Meta could not subscribe this WhatsApp Business Account. Check the token permissions and webhook setup.');
    return c.json({ok: true, message: 'ERP is subscribed to this WhatsApp Business Account.'});
  });

  app.post('/api/settings/whatsapp/test', async c => {
    requireRoles(c, 'ADMIN');
    const settings = await settingsFor(c);
    if (!settings.phone_number_id || !settings.access_token_encrypted) throw fail(400, 'Save the WhatsApp Phone Number ID and access token first.');
    const token = await open(c, settings.access_token_encrypted);
    const response = await fetch(`https://graph.facebook.com/${settings.api_version || 'v23.0'}/${encodeURIComponent(settings.phone_number_id)}?fields=display_phone_number,verified_name`, {headers: {Authorization: `Bearer ${token}`}});
    const result = await response.json() as Data;
    if (!response.ok) throw fail(502, 'Meta could not verify this phone number ID and access token.');
    return c.json({ok: true, phone_number: result.display_phone_number || '', verified_name: result.verified_name || ''});
  });

  app.get('/api/integrations/whatsapp/webhook', async c => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token') || '';
    const challenge = c.req.query('hub.challenge') || '';
    if (mode !== 'subscribe' || !challenge || !(await findCompanyByVerifyToken(c, token))) return c.text('Webhook verification failed', 403);
    return c.text(challenge);
  });

  app.post('/api/integrations/whatsapp/webhook', async c => {
    const raw = await c.req.raw.arrayBuffer();
    const signature = c.req.header('x-hub-signature-256') || '';
    let matched: {companyId: number; settings: WhatsAppSettings} | null = null;
    for (const [companyId, db] of databases(c)) {
      if (!db) continue;
      const row = await db.prepare("SELECT value FROM integration_settings WHERE key='whatsapp'").first<Data>();
      if (!row) continue;
      const settings = JSON.parse(row.value) as WhatsAppSettings;
      const appSecret = await open(c, settings.app_secret_encrypted);
      if (settings.phone_number_id && appSecret && await verifySignature(raw, signature, appSecret)) {
        matched = {companyId, settings};
        break;
      }
    }
    if (!matched) return c.text('Invalid WhatsApp webhook signature', 401);
    c.set('companyId', matched.companyId);
    const payload = JSON.parse(new TextDecoder().decode(raw)) as Data;
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const phoneId = String(value.metadata?.phone_number_id || '');
        if (change.field !== 'messages' || phoneId !== matched.settings.phone_number_id) continue;
        for (const message of value.messages || []) await importMessage(c, matched.settings, message);
      }
    }
    return c.json({ok: true});
  });
}
