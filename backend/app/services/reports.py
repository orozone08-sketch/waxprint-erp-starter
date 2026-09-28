from datetime import date, datetime
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.models import Invoice, Payment, Job, Expense, InventoryTransaction, Payroll, PrintAttempt, ReshootTicket, Purchase

def month_bounds(period: str | None):
    if not period:
        today = date.today()
        period = f"{today.year:04d}-{today.month:02d}"
    year, month = [int(x) for x in period.split("-")]
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return period, start, end

def pnl(db: Session, period: str | None = None):
    period, start, end = month_bounds(period)
    sales = db.scalar(select(func.coalesce(func.sum(Invoice.subtotal), 0.0)).where(Invoice.invoice_date >= start, Invoice.invoice_date < end)) or 0.0
    material_cost = db.scalar(select(func.coalesce(func.sum(InventoryTransaction.value), 0.0)).where(
        InventoryTransaction.txn_date >= start,
        InventoryTransaction.txn_date < end,
        InventoryTransaction.txn_type.in_(["CONSUMPTION", "WASTAGE"]),
    )) or 0.0
    direct_exp = db.scalar(select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
        Expense.expense_date >= start, Expense.expense_date < end, Expense.is_direct_cost == True, Expense.approved == True
    )) or 0.0
    overhead_exp = db.scalar(select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
        Expense.expense_date >= start, Expense.expense_date < end, Expense.is_direct_cost == False, Expense.approved == True
    )) or 0.0
    payroll = db.scalar(select(func.coalesce(func.sum(Payroll.net_payable), 0.0)).where(Payroll.period == period)) or 0.0
    total_weight = db.scalar(select(func.coalesce(func.sum(Job.billable_weight_g), 0.0)).where(
        Job.weight_recorded_at >= datetime.combine(start, datetime.min.time()),
        Job.weight_recorded_at < datetime.combine(end, datetime.min.time())
    )) or 0.0
    reshoot_cost = db.scalar(select(func.coalesce(func.sum(PrintAttempt.estimated_cost), 0.0)).where(
        PrintAttempt.started_at >= datetime.combine(start, datetime.min.time()),
        PrintAttempt.started_at < datetime.combine(end, datetime.min.time()),
        PrintAttempt.is_reshoot == True
    )) or 0.0
    direct_cost = material_cost + direct_exp + reshoot_cost
    gross_profit = sales - direct_cost
    overhead = overhead_exp + payroll
    net_profit = gross_profit - overhead
    return {
        "period": period,
        "net_sales": round(sales, 2),
        "material_consumed": round(material_cost, 2),
        "other_direct_cost": round(direct_exp, 2),
        "reshoot_cost": round(reshoot_cost, 2),
        "direct_production_cost": round(direct_cost, 2),
        "successful_billable_weight_g": round(total_weight, 3),
        "cost_per_gram": round(direct_cost / total_weight, 2) if total_weight else 0,
        "gross_profit": round(gross_profit, 2),
        "company_overhead": round(overhead, 2),
        "net_operating_profit": round(net_profit, 2),
    }

def cash_and_outstanding(db: Session):
    invoiced = db.scalar(select(func.coalesce(func.sum(Invoice.total_amount), 0.0))) or 0.0
    received = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0.0))) or 0.0
    purchases = db.scalar(select(func.coalesce(func.sum(Purchase.quantity * Purchase.rate + Purchase.tax_amount), 0.0))) or 0.0
    supplier_paid = db.scalar(select(func.coalesce(func.sum(Purchase.paid_amount), 0.0))) or 0.0
    return {
        "customer_outstanding": round(max(invoiced - received, 0), 2),
        "supplier_payable": round(max(purchases - supplier_paid, 0), 2),
    }
