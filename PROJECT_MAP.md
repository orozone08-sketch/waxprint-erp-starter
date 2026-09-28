# Project Map

## Production data chain
Customer -> InboxMessage -> Job -> JobFile -> MagicsSession -> Platform/PlatformFile -> PrintAttempt -> QC -> ReshootTicket -> Weight -> Dispatch -> CustomerReturn -> Invoice -> Payment

## Costing chain
Supplier -> Purchase -> InventoryTransaction(PURCHASE) -> InventoryTransaction(CONSUMPTION/WASTAGE) -> Direct Production Cost

Plus Expense(direct) + Reshoot PrintAttempt cost -> Gross Profit

Payroll + Expense(overhead) -> Company Overhead -> Net Operating Profit

## What is already functional in backend
- Customers
- Jobs + file upload
- Magics start/complete/check
- Machine-software platforms
- Print attempts
- QC + automatic internal reshoot ticket
- Weight
- Dispatch
- Customer return + automatic customer-return reshoot ticket
- Materials/suppliers/purchases
- Inventory consumption
- Expenses
- Employees/payroll
- Invoice from job weight x customer rate
- Payments/outstanding
- Admin dashboard
- P&L
- Cost per gram
- Quality / first-pass yield
- Job profitability
- Gmail status/push/reconciliation scaffolding
- Magics agent queue endpoint

## Frontend implemented screens
- Dashboard
- Jobs
- Reshoots
- Materials / Inventory
- Expenses
- Reports / Profitability
- Navigation shells for remaining modules
