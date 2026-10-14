"""Sync ERP job files to a Windows PC running Materialise Magics.

The operator opens files from Original in Magics and saves repaired output in
Processed as <file-id>__<original-name>. The bridge uploads stable output files
back to the ERP; Magics itself remains operated using its normal desktop UI.
"""
import hashlib
import json
import os
import re
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()
ERP = os.getenv('ERP_URL', '').rstrip('/')
TOKEN = os.getenv('AGENT_TOKEN', '')
COMPANY_ID = os.getenv('ERP_COMPANY_ID', '1')
WORKSTATION = os.getenv('WORKSTATION', 'MAGICS-PC-01')
ROOT = Path(os.getenv('LOCAL_JOB_ROOT', r'C:\WaxERP\Jobs'))
POLL = max(5, int(os.getenv('POLL_SECONDS', '20')))
STATE_FILE = ROOT / '.magics-agent-state.json'
HEADERS = {'X-Agent-Token': TOKEN, 'X-Company-ID': COMPANY_ID}
ROOT.mkdir(parents=True, exist_ok=True)


def safe_name(name):
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', Path(name).name).strip(' .') or 'file.stl'


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {'uploaded': {}, 'stable': {}}


def save_state(state):
    temp = STATE_FILE.with_suffix('.tmp')
    temp.write_text(json.dumps(state, indent=2), encoding='utf-8')
    temp.replace(STATE_FILE)


def list_jobs():
    response = requests.get(f'{ERP}/api/magics/agent/jobs', headers=HEADERS, timeout=30)
    response.raise_for_status()
    return response.json()


def prepare_job(job):
    folder = ROOT / safe_name(job['number'])
    for name in ('Original', 'Processed', 'Magics', 'Platform', 'Export'):
        (folder / name).mkdir(parents=True, exist_ok=True)
    readme = folder / 'README.txt'
    readme.write_text(
        f"Job: {job['number']}\nCustomer: {job['customer']}\n"
        f"Workstation: {WORKSTATION}\n\n"
        'Open a file from Original in Materialise Magics. Save the repaired file '
        'into Processed using the required name: <file-id>__<original-name>.\n',
        encoding='utf-8',
    )
    return folder


def sync_original(job, file, folder):
    target = folder / 'Original' / f"{file['id']}__{safe_name(file['name'])}"
    if target.exists() and target.stat().st_size and file.get('sha256'):
        if sha256_file(target) == file['sha256']:
            return
    response = requests.get(f"{ERP}{file['original_url']}", headers=HEADERS, timeout=120, stream=True)
    response.raise_for_status()
    temp = target.with_suffix(target.suffix + '.download')
    with temp.open('wb') as output:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                output.write(chunk)
    temp.replace(target)
    print('Downloaded', job['number'], target.name)


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def upload_processed(job, state):
    job_folder = ROOT / safe_name(job['number'])
    processed_folder = job_folder / 'Processed'
    known_ids = {str(file['id']): file for file in job.get('files', [])}
    for path in processed_folder.iterdir():
        if not path.is_file() or path.name.startswith('.') or path.suffix.lower() in ('.tmp', '.download'):
            continue
        match = re.match(r'^(\d+)__', path.name)
        if not match or match.group(1) not in known_ids:
            continue
        file = known_ids[match.group(1)]
        signature = f"{path.stat().st_size}:{path.stat().st_mtime_ns}"
        stable_key = str(path.resolve())
        if state['stable'].get(stable_key) != signature:
            state['stable'][stable_key] = signature
            continue  # allow Magics to finish writing the output
        digest = sha256_file(path)
        if state['uploaded'].get(stable_key) == digest:
            continue
        with path.open('rb') as source:
            response = requests.post(
                f"{ERP}{file['processed_url']}", headers=HEADERS,
                files={'processed_file': (safe_name(path.name), source, 'application/octet-stream')},
                timeout=180,
            )
        response.raise_for_status()
        state['uploaded'][stable_key] = digest
        print('Uploaded processed file', job['number'], path.name)


def main():
    if not ERP or not TOKEN:
        raise SystemExit('Set ERP_URL and AGENT_TOKEN in magics_agent/.env before running.')
    if COMPANY_ID not in ('1', '2'):
        raise SystemExit('ERP_COMPANY_ID must be 1 (Aditya International) or 2 (Sunmoon Technology).')
    state = load_state()
    print(f'Magics bridge {WORKSTATION} -> {ERP} (company {COMPANY_ID})')
    while True:
        try:
            for job in list_jobs():
                folder = prepare_job(job)
                for file in job.get('files', []):
                    sync_original(job, file, folder)
                upload_processed(job, state)
                save_state(state)
        except Exception as exc:
            print('Agent error:', exc)
        time.sleep(POLL)


if __name__ == '__main__':
    main()
