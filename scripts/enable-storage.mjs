import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Run only after activating R2. No billing/account activation is performed here.
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
const bucketName = 'waxprint-erp-files';
const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const options = {env: {...process.env, CLOUDFLARE_ACCOUNT_ID: config.account_id}, shell: process.platform === 'win32'};
const buckets = execFileSync(executable, ['wrangler', 'r2', 'bucket', 'list'], {...options, encoding: 'utf8'});
if (!new RegExp(`^name:\\s*${bucketName}\\s*$`, 'm').test(buckets.replace(/\u001b\[[0-9;]*m/g, ''))) execFileSync(executable, ['wrangler', 'r2', 'bucket', 'create', bucketName], {...options, stdio: 'inherit'});
config.r2_buckets = [{binding: 'FILES', bucket_name: bucketName}];
await writeFile('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
console.log('R2 binding ready. Commit and push wrangler.jsonc to deploy it through the existing Git integration.');
