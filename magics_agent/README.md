# Materialise Magics PC bridge

Run this bridge on the Windows PC that has Materialise Magics installed. The bridge pulls original job files from the ERP and uploads processed files from a local folder. The operator continues to use Magics normally; this bridge does not automate Magics or require a Magics SDK license.

## One-time setup

1. Copy this `magics_agent` folder to the Magics PC.
2. Install Python 3 if it is not already installed.
3. Open PowerShell in this folder and install the two Python packages:

   ```powershell
   py -m pip install -r requirements.txt
   ```

4. Copy `.env.example` to `.env` and edit it:
   - `ERP_URL` is the ERP Worker URL.
   - `AGENT_TOKEN` must be the same value as the Cloudflare Worker secret named `AGENT_TOKEN`.
   - Set `ERP_COMPANY_ID=1` for Aditya International or `2` for Sunmoon Technology.
   - Change `LOCAL_JOB_ROOT` if you want the job folders somewhere else.
5. Start it from PowerShell:

   ```powershell
   py agent.py
   ```

Keep the bridge running while processing jobs. It checks the ERP every 20 seconds. Create or replace the Worker secret from the ERP project folder using `npx.cmd wrangler secret put AGENT_TOKEN`; enter the same private token in `.env`. Do not put the token in GitHub or share it publicly.

## Process each job

1. The bridge creates a folder for each queued job under `LOCAL_JOB_ROOT` and downloads its source file(s) into `Original`.
2. Open a source file in Magics and perform the repair.
3. Save/export the repaired file under that job's `Processed` folder. Its filename must start with the ERP file ID and two underscores, followed by the source name, for example `42__ring.stl`.
4. After the output stops changing, the bridge uploads it automatically. The Magics page shows the processed count and a download link.
5. When every job file has a Magics output, start or continue the ERP session and have the checker approve it. Approval unlocks the next machine-software/platform step. The usual download buttons in Jobs and Platforms then serve the processed version; `Original` remains available from the Magics page.

The worker retains each source file in R2. If an output is saved again with the same local path, the changed file is uploaded as the new processed version. Do not save repaired output over the file in `Original`.
