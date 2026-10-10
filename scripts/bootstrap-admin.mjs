import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const remote = process.argv.includes('--remote');
const directory = '.secrets';
await mkdir(directory, {recursive: true});
let credentials;
try { credentials = JSON.parse(await readFile(`${directory}/initial-admin.json`, 'utf8')); }
catch {
  credentials = {username: 'admin', password: randomBytes(24).toString('base64url')};
  await writeFile(`${directory}/initial-admin.json`, JSON.stringify(credentials, null, 2) + '\n', {mode: 0o600});
}
const salt = randomBytes(16).toString('hex');
const hash = `pbkdf2_sha256_cf$${salt}$${pbkdf2Sync(credentials.password, salt, 100000, 32, 'sha256').toString('hex')}`;
const sql = `INSERT INTO app_users(username,display_name,role,password_hash,active,company_id) VALUES('admin','Administrator','SUPER_ADMIN','${hash}',1,NULL) ON CONFLICT(username) DO NOTHING;\n`;
await writeFile(`${directory}/bootstrap.sql`, sql, {mode: 0o600});
const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execFileSync(executable, ['wrangler', 'd1', 'execute', 'DB', remote ? '--remote' : '--local', '--file', `${directory}/bootstrap.sql`], {stdio: 'inherit', shell: process.platform === 'win32'});
console.log('Admin bootstrap complete. Credentials are in the git-ignored .secrets/initial-admin.json. Existing admin credentials are never changed.');
