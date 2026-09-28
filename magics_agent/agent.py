"""Local Windows Magics bridge starter.

This is intentionally conservative: it discovers ERP jobs waiting for Magics and creates
local folders. Deep integration with Materialise Magics should be added only after checking
your installed Magics version and Workflow Automation/SDK license.
"""
import os,time,subprocess
from pathlib import Path
import requests
from dotenv import load_dotenv
load_dotenv()
ERP=os.getenv('ERP_URL','http://localhost:8000')
TOKEN=os.getenv('AGENT_TOKEN','change-me')
WS=os.getenv('WORKSTATION','MAGICS-PC-01')
ROOT=Path(os.getenv('LOCAL_JOB_ROOT',r'C:\WaxERP\Jobs'))
MAGICS=os.getenv('MAGICS_EXE','')
POLL=int(os.getenv('POLL_SECONDS','20'))
ROOT.mkdir(parents=True,exist_ok=True)

def list_jobs():
    r=requests.get(f'{ERP}/api/magics/agent/jobs',headers={'X-Agent-Token':TOKEN},timeout=15)
    r.raise_for_status();return r.json()

def prepare_job(job):
    folder=ROOT/job['number']
    for name in ['Original','Processed','Magics','Platform','Export']:(folder/name).mkdir(parents=True,exist_ok=True)
    (folder/'README.txt').write_text(f"Job: {job['number']}\nCustomer: {job['customer']}\nWorkstation: {WS}\n",encoding='utf-8')
    return folder

def launch_magics(folder:Path):
    if not MAGICS:return
    try: subprocess.Popen([MAGICS],cwd=str(folder))
    except Exception as exc: print('Could not launch Magics:',exc)

if __name__=='__main__':
    print(f'Magics agent {WS} -> {ERP}')
    seen=set()
    while True:
        try:
            for job in list_jobs():
                if job['id'] in seen:continue
                folder=prepare_job(job)
                print('Prepared',job['number'],'at',folder)
                # Do not auto-launch every queued job; uncomment after your workflow is confirmed.
                # launch_magics(folder)
                seen.add(job['id'])
        except Exception as exc: print('Agent error:',exc)
        time.sleep(POLL)
