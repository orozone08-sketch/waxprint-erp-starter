from datetime import date, datetime
from sqlalchemy import select
from app.db import SessionLocal
from app.models import Customer, Supplier, Employee, Machine, Material, Job, Expense, InventoryTransaction, Invoice, InvoiceLine, Payment, PrintAttempt, ReshootTicket, Purchase

def seed_demo():
    db = SessionLocal()
    try:
        if db.scalar(select(Customer.id).limit(1)):
            return
        c1 = Customer(code="CUST-0001", name="ABC Jewellery", email="abc@example.com", whatsapp="+91-9000000001", default_rate=300, credit_days=30)
        c2 = Customer(code="CUST-0002", name="Poddar Jewels", email="poddar@example.com", whatsapp="+91-9000000002", default_rate=270, credit_days=15)
        s1 = Supplier(code="SUP-0001", name="Wax Material Supplier", contact="Mumbai")
        e1 = Employee(code="EMP-0001", name="Rahul", department="Production", role="Magics Operator", monthly_salary=30000)
        e2 = Employee(code="EMP-0002", name="Amit", department="Production", role="QC", monthly_salary=28000)
        m1 = Machine(code="WJ510-01", name="WaxJet 510 - 01", model="WaxJet 510", status="AVAILABLE")
        m2 = Machine(code="WJ510-02", name="WaxJet 510 - 02", model="WaxJet 510", status="PRINTING")
        mat = Material(code="WAX-510-3KG", name="WaxJet 510 3 KG Wax Kit", unit="kit", minimum_stock=2)
        db.add_all([c1,c2,s1,e1,e2,m1,m2,mat]); db.flush()
        job = Job(number="WJ-2026-00001", customer_id=c1.id, source="gmail", status="WEIGHT_COMPLETED", priority="NORMAL", billable_weight_g=38.6, reshoot_weight_g=1.2, weight_recorded_at=datetime.utcnow())
        db.add(job); db.flush()
        purchase = Purchase(supplier_id=s1.id, material_id=mat.id, purchase_date=date.today(), quantity=5, rate=42000, paid_amount=100000, invoice_no="DEMO-PO-1")
        db.add(purchase)
        db.add(InventoryTransaction(material_id=mat.id, txn_date=date.today(), txn_type="PURCHASE", quantity=5, unit_cost=42000, value=210000, notes="Demo purchase"))
        db.add(InventoryTransaction(material_id=mat.id, txn_date=date.today(), txn_type="CONSUMPTION", quantity=0.25, unit_cost=42000, value=10500, job_id=job.id, machine_id=m1.id, notes="Demo production consumption"))
        db.add(Expense(expense_date=date.today(), category="Courier", description="Customer delivery", amount=450, is_direct_cost=True, related_type="JOB", related_id=job.id))
        db.add(Expense(expense_date=date.today(), category="Rent", description="Office rent", amount=85000, is_direct_cost=False, related_type="GENERAL"))
        inv = Invoice(number="INV-2026-00001", customer_id=c1.id, invoice_date=date.today(), subtotal=11580, tax_amount=0, total_amount=11580, status="PART_PAID")
        db.add(inv); db.flush()
        db.add(InvoiceLine(invoice_id=inv.id, job_id=job.id, description="Wax printing", weight_g=38.6, rate=300, amount=11580))
        db.add(Payment(invoice_id=inv.id, payment_date=date.today(), amount=5000, payment_mode="BANK", reference="DEMO-PAY"))
        db.commit()
    finally:
        db.close()
