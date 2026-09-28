# WaxPrint ERP Starter

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
