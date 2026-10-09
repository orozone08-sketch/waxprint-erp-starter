import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { schema } from './schema';

export type Row = Record<string, any>;
export type Env = {
  Bindings: {
    DB: D1Database; FILES?: R2Bucket; ASSETS: Fetcher;
    AUTH_SECRET: string; AGENT_TOKEN?: string; GMAIL_PUSH_TOKEN?: string;
    GMAIL_CLIENT_ID?: string; GMAIL_CLIENT_SECRET?: string; GMAIL_REFRESH_TOKEN?: string;
  };
  Variables: { user: Row };
};
export type Ctx = Context<Env>;
export function fail(status: number, message: string): never {
  throw new HTTPException(status as 400, { message });
}
export function requireRoles(c: Ctx, ...roles: string[]) {
  if (!roles.includes(c.get('user')?.role)) fail(403, 'Admin access required');
  return c.get('user');
}
export function code(prefix: string) {
  return `${prefix}-${new Date().getUTCFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
}
const booleans = new Set(Object.values(schema).flatMap(fields => Object.entries(fields).filter(([, spec]) => spec.type === 'boolean').map(([name]) => name)));
function normalize(row: Row): Row {
  for (const key of Object.keys(row)) if (booleans.has(key) && row[key] !== null) row[key] = Boolean(row[key]);
  return row;
}
function bindings(values: any[]): any[] { return values.map(v => typeof v === 'boolean' ? Number(v) : v === undefined ? null : v); }
export async function all(c: Ctx, sql: string, ...args: any[]): Promise<Row[]> {
  const result = await c.env.DB.prepare(sql).bind(...bindings(args)).all<Row>();
  return result.results.map(normalize);
}
export async function one(c: Ctx, sql: string, ...args: any[]): Promise<Row | null> {
  const result = await c.env.DB.prepare(sql).bind(...bindings(args)).first<Row>();
  return result ? normalize(result) : null;
}
export async function run(c: Ctx, sql: string, ...args: any[]) {
  return c.env.DB.prepare(sql).bind(...bindings(args)).run();
}
function columns(table: string, data: Row) {
  const fields = (schema as Record<string, Record<string, {type: string; nullable: boolean}>>)[table];
  if (!fields) fail(500, 'Unknown data table');
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  for (const [key, value] of entries) {
    const spec = fields[key];
    if (!spec || key === 'id') fail(400, `Invalid field: ${key}`);
    if (value === null) { if (!spec.nullable) fail(400, `${key} is required`); continue; }
    if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) fail(400, `${key} must be a number`);
    if (spec.type === 'string' && typeof value !== 'string') fail(400, `${key} must be text`);
    if (spec.type === 'boolean' && typeof value !== 'boolean' && value !== 0 && value !== 1) fail(400, `${key} must be true or false`);
  }
  return entries;
}
export async function insert(c: Ctx, table: string, data: Row): Promise<Row> {
  const entries = columns(table, data);
  const sql = entries.length ? `INSERT INTO "${table}" (${entries.map(([k]) => `"${k}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')}) RETURNING *` : `INSERT INTO "${table}" DEFAULT VALUES RETURNING *`;
  const row = await one(c, sql, ...entries.map(([, v]) => v));
  return row!;
}
export async function update(c: Ctx, table: string, id: number, data: Row): Promise<Row> {
  const entries = columns(table, data);
  if (!entries.length) fail(400, 'No fields supplied');
  const row = await one(c, `UPDATE "${table}" SET ${entries.map(([k]) => `"${k}"=?`).join(',')} WHERE id=? RETURNING *`, ...entries.map(([, v]) => v), id);
  if (!row) fail(404, 'Record not found');
  return row;
}
