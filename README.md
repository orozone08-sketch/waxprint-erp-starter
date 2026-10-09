# WaxPrint ERP — Cloudflare

Production runs on **Hono + Cloudflare Workers + D1**, with React/Vite assets served by the same Worker. The Python backend below is retained as the legacy reference, not used by Cloudflare.

- Cloudflare account: Orozone08@gmail.com's Account (`1a970a489b3675156722383f7ce0fffd`).
- Worker: `waxprint-erp`. Database: `waxprint-erp` (`e7a2d654-5471-4bb7-89b1-299ad45218e7`).
- R2 is intentionally disabled until the account owner activates it. Upload/download endpoints return HTTP 503 with a clear explanation; all other modules remain available. No demo records or default passwords are deployed.
- Gmail uses its HTTPS OAuth API. No IMAP daemon or separate server is required. Imports preserve the starter's inbox behavior: message metadata/body and customer matching, without changing the mailbox or automatically creating attachment jobs.

## Development and verification

Use Node.js 24 or newer:

```sh
npm ci
npm --prefix frontend ci
npm run db:local
npm run admin:local
npm run build
npm run dev
```

Copy `.dev.vars.example` to `.dev.vars` and replace the placeholder secrets. Open `http://localhost:8787`. For frontend hot reload, run `npm --prefix frontend run dev` in a second terminal; Vite proxies API requests to Wrangler.

`npm run ci` runs type checks, isolated integration tests, and the production frontend build. Tests use SQLite plus a fake R2 bucket and do not contact production, Gmail, or a billing service. `npx wrangler deploy --dry-run` checks the Worker bundle and assets.

## Git deployment flow

Work on a feature branch, open a pull request to `main`, and run the GitHub validation workflow. Push/merge to `main` triggers the connected **Cloudflare Workers Builds** pipeline. There is no Cloudflare token stored in GitHub.

Workers Builds configuration:

- Repository: `orozone08-sketch/waxprint-erp-starter`; production branch: `main`; root: `/`.
- Build: `npm --prefix frontend ci && npm run ci` (root dependencies are installed by Workers Builds).
- Deploy: `npm run deploy:worker` (applies append-only D1 migrations before deploying).
- Node version: `24`. Non-production branch builds disabled to avoid binding PR previews to production D1.

For a manual release, `npm run deploy` builds the frontend, applies remote migrations, and deploys. Worker secrets are preserved. Roll back code through Cloudflare's deployment/version history; do not reverse applied schema migrations or delete production records. Migrations must remain backward compatible with the previously deployed code.

## Initial administrator

`npm run admin:remote` creates an administrator only if one does not already exist. The generated password is stored locally in `.secrets/initial-admin.json`, which is ignored by Git. The deploy process never resets or reseeds users. Add additional accounts from the administrator UI; passwords must contain at least 12 characters.

Runtime secrets (`npx wrangler secret put NAME`):

- `AUTH_SECRET`: random secret of at least 32 characters, required for sessions.
- `AGENT_TOKEN`: random token for the optional local Magics bridge. Put the same value in that bridge's local configuration and point its API URL at the deployed Worker.

## Enable R2 later

Activate R2 in the same Orozone account, then:

```sh
npm run storage:enable
git add wrangler.jsonc
git commit -m "feat: enable R2 file storage"
git push origin main
```

The helper checks/creates the dedicated `waxprint-erp-files` bucket and adds the `FILES` binding. It does not activate R2 or change billing. The existing Git pipeline deploys that binding. Verify `/health` reports `file_storage: "R2"`, then verify a file upload/download. The code for STL files and packing photos is already included and tested locally.

## Connect Gmail

Enable the Gmail API in a Google Cloud project. Create a desktop OAuth client and obtain a refresh token for the intended mailbox using the read-only Gmail scope `https://www.googleapis.com/auth/gmail.readonly`. Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` as Worker secrets. Do not commit OAuth credentials or put them in frontend code.

In Settings, enable Gmail, enter the connected mailbox address, label ID (e.g. `INBOX`), search query (e.g. `is:unread`), and import limit. Test Connection verifies Google's configured mailbox; Fetch Gmail imports matching messages idempotently. Google testing-mode refresh tokens can expire; configure the OAuth app's publication/access policy for a durable connection. Live mailbox testing requires credentials and is separate from the mocked OAuth integration tests.

The optional push endpoint requires `GMAIL_PUSH_TOKEN` as a Bearer token and only records receipts. Manual fetch is the default; no Pub/Sub setup or background mailbox polling is required.

## Legacy starter reference

A working MVP/starter for a jewellery wax-printing production and business management system.

**Stack**
- Backend: Python 3.11+ / FastAPI / SQLAlchemy
- Database: SQLite by default (easy local start), PostgreSQL-ready via `DATABASE_URL`
- Frontend: React + TypeScript + Vite
- Local Magics bridge: Python agent skeleton
- Gmail: API/Push/Reconciliation integration scaffold

## Business flow implemented

`Gmail / WhatsApp -> Customer + Job -> Magics Repair -> Magics Check -> Machine Software Platform -> Print -> Physical QC -> Reshoot if required -> Weight -> Packing/Dispatch -> Customer Return/Reshoot if required -> Invoice -> Payment -> Profit`

Supporting modules: Materials, Purchases, Inventory Consumption, Expenses, Employees/Payroll, Machines, Suppliers, Receivables, P&L, Cost/gram, Quality/Reshoots.

## Important accounting rules in this starter

1. Material purchase adds inventory; it does **not** automatically become production cost.
2. Material consumption is what enters direct production cost.
3. Free reshoots add cost but no extra revenue.
4. Direct production cost and company overhead are separate.
5. P&L and cash movement are separate concepts.
6. Original files are retained; processed versions are stored separately.

## Quick start - Windows

### Backend
```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```
Open API docs: http://localhost:8000/docs

### Frontend
```bat
cd frontend
npm install
npm run dev
```
Open: http://localhost:5173

The frontend expects the API at `http://localhost:8000`. Change with `VITE_API_URL`.

### Demo data
The backend seeds sample data on first start when `AUTO_SEED=true` (default).

## Gmail
Core Gmail endpoints and a service scaffold are included. To activate live Gmail:
1. Create a Google Cloud project.
2. Enable Gmail API and Pub/Sub.
3. Create OAuth credentials.
4. Set values in `backend/.env`.
5. Configure the Pub/Sub push endpoint to `/api/integrations/gmail/push`.
6. Schedule `/api/integrations/gmail/reconcile` as a backup reconciliation job.

For production, use a protected archive/routing mailbox so normal staff deletion cannot remove the only copy.

## WhatsApp
This starter supports manual WhatsApp intake/upload. Official WhatsApp Business Cloud API can be connected later to the same inbox tables.

## Magics
`magics_agent/agent.py` is a local Windows bridge skeleton. It polls ERP jobs assigned to a workstation, downloads files into local job folders and exposes a hook for opening Materialise Magics. Deep Magics automation requires the appropriate Materialise Workflow Automation / SDK licensing and project-specific scripting.

## Production warning
This is a **starter/MVP**, not a finished production deployment. Before live customer use, add: hardened authentication/RBAC, HTTPS, encrypted secrets, object storage, backups, malware scanning, file access controls, Google OAuth token storage, structured migrations, audit retention, and formal accounting/GST review.
