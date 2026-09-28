from __future__ import annotations
from datetime import datetime, date
from sqlalchemy import String, Integer, Float, Boolean, DateTime, Date, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base

class AppUser(Base):
    __tablename__ = "app_users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(150))
    role: Mapped[str] = mapped_column(String(30), default="STAFF", index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    default_rate: Mapped[float] = mapped_column(Float, default=0)
    credit_days: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    gst_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    contact: Mapped[str | None] = mapped_column(String(100), nullable=True)

class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(150), index=True)
    department: Mapped[str] = mapped_column(String(80), default="Production")
    role: Mapped[str] = mapped_column(String(80), default="Operator")
    monthly_salary: Mapped[float] = mapped_column(Float, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class Machine(Base):
    __tablename__ = "machines"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="AVAILABLE")

class InboxMessage(Base):
    __tablename__ = "inbox_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)  # gmail/whatsapp/manual
    external_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    sender: Mapped[str | None] = mapped_column(String(180), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    archived: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(30), default="RECEIVED")
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)

class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    source: Mapped[str] = mapped_column(String(20), default="manual")
    status: Mapped[str] = mapped_column(String(40), default="FILES_RECEIVED", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="NORMAL")
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    billable_weight_g: Mapped[float] = mapped_column(Float, default=0)
    reshoot_weight_g: Mapped[float] = mapped_column(Float, default=0)
    weight_recorded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    customer: Mapped[Customer] = relationship()

class JobFile(Base):
    __tablename__ = "job_files"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    file_uid: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    original_path: Mapped[str] = mapped_column(String(500))
    processed_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(40), default="RECEIVED")
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class MagicsSession(Base):
    __tablename__ = "magics_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    operator_name: Mapped[str] = mapped_column(String(120))
    workstation: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(30), default="STARTED")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    checker_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)

class Platform(Base):
    __tablename__ = "platforms"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    software_name: Mapped[str] = mapped_column(String(100), default="WaxJet")
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("machines.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT")
    is_reshoot_platform: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class PlatformFile(Base):
    __tablename__ = "platform_files"
    id: Mapped[int] = mapped_column(primary_key=True)
    platform_id: Mapped[int] = mapped_column(ForeignKey("platforms.id"), index=True)
    job_file_id: Mapped[int] = mapped_column(ForeignKey("job_files.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    __table_args__ = (UniqueConstraint("platform_id", "job_file_id", name="uq_platform_file"),)

class PrintAttempt(Base):
    __tablename__ = "print_attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_file_id: Mapped[int] = mapped_column(ForeignKey("job_files.id"), index=True)
    platform_id: Mapped[int] = mapped_column(ForeignKey("platforms.id"), index=True)
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("machines.id"), nullable=True)
    attempt_no: Mapped[int] = mapped_column(Integer, default=1)
    is_reshoot: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(30), default="PRINTING")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expected_qty: Mapped[int] = mapped_column(Integer, default=1)
    good_qty: Mapped[int] = mapped_column(Integer, default=0)
    bad_qty: Mapped[int] = mapped_column(Integer, default=0)
    qc_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    production_weight_g: Mapped[float] = mapped_column(Float, default=0)
    estimated_cost: Mapped[float] = mapped_column(Float, default=0)

class ReshootTicket(Base):
    __tablename__ = "reshoot_tickets"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    job_file_id: Mapped[int] = mapped_column(ForeignKey("job_files.id"), index=True)
    original_attempt_id: Mapped[int | None] = mapped_column(ForeignKey("print_attempts.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(30), default="INTERNAL_QC")  # INTERNAL_QC/CUSTOMER_RETURN
    reason: Mapped[str] = mapped_column(String(120))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    responsibility: Mapped[str] = mapped_column(String(40), default="OUR_PRODUCTION")
    chargeable: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(30), default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class Dispatch(Base):
    __tablename__ = "dispatches"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    courier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tracking_no: Mapped[str | None] = mapped_column(String(120), nullable=True)
    packed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    checked_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    delivered_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    packing_photo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    packing_photo_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dispatched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(30), default="DISPATCHED")

class CustomerReturn(Base):
    __tablename__ = "customer_returns"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    job_file_id: Mapped[int] = mapped_column(ForeignKey("job_files.id"), index=True)
    dispatch_id: Mapped[int | None] = mapped_column(ForeignKey("dispatches.id"), nullable=True)
    complaint: Mapped[str] = mapped_column(Text)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    responsibility: Mapped[str] = mapped_column(String(40), default="UNKNOWN")
    chargeable: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(30), default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Material(Base):
    __tablename__ = "materials"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    unit: Mapped[str] = mapped_column(String(30), default="kg")
    minimum_stock: Mapped[float] = mapped_column(Float, default=0)

class Purchase(Base):
    __tablename__ = "purchases"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    purchase_date: Mapped[date] = mapped_column(Date, default=date.today)
    quantity: Mapped[float] = mapped_column(Float)
    rate: Mapped[float] = mapped_column(Float)
    tax_amount: Mapped[float] = mapped_column(Float, default=0)
    paid_amount: Mapped[float] = mapped_column(Float, default=0)
    invoice_no: Mapped[str | None] = mapped_column(String(80), nullable=True)

class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    txn_date: Mapped[date] = mapped_column(Date, default=date.today)
    txn_type: Mapped[str] = mapped_column(String(30))  # PURCHASE/CONSUMPTION/WASTAGE/ADJUSTMENT
    quantity: Mapped[float] = mapped_column(Float)
    unit_cost: Mapped[float] = mapped_column(Float, default=0)
    value: Mapped[float] = mapped_column(Float, default=0)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    platform_id: Mapped[int | None] = mapped_column(ForeignKey("platforms.id"), nullable=True)
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("machines.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

class Expense(Base):
    __tablename__ = "expenses"
    id: Mapped[int] = mapped_column(primary_key=True)
    expense_date: Mapped[date] = mapped_column(Date, default=date.today)
    category: Mapped[str] = mapped_column(String(80), index=True)
    subcategory: Mapped[str | None] = mapped_column(String(80), nullable=True)
    description: Mapped[str] = mapped_column(String(255))
    amount: Mapped[float] = mapped_column(Float)
    tax_amount: Mapped[float] = mapped_column(Float, default=0)
    is_direct_cost: Mapped[bool] = mapped_column(Boolean, default=False)
    related_type: Mapped[str] = mapped_column(String(30), default="GENERAL")
    related_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_mode: Mapped[str] = mapped_column(String(30), default="BANK")
    approved: Mapped[bool] = mapped_column(Boolean, default=True)

class Payroll(Base):
    __tablename__ = "payroll"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM
    basic: Mapped[float] = mapped_column(Float, default=0)
    bonus: Mapped[float] = mapped_column(Float, default=0)
    commission: Mapped[float] = mapped_column(Float, default=0)
    reimbursement: Mapped[float] = mapped_column(Float, default=0)
    advance_deduction: Mapped[float] = mapped_column(Float, default=0)
    other_deduction: Mapped[float] = mapped_column(Float, default=0)
    net_payable: Mapped[float] = mapped_column(Float, default=0)
    paid: Mapped[bool] = mapped_column(Boolean, default=False)

class EmployeeAdvance(Base):
    __tablename__ = "employee_advances"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    advance_date: Mapped[date] = mapped_column(Date, default=date.today)
    amount: Mapped[float] = mapped_column(Float, default=0)
    purpose: Mapped[str] = mapped_column(String(180))
    period: Mapped[str | None] = mapped_column(String(7), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="OPEN")
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class TravelAdvance(Base):
    __tablename__ = "travel_advances"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    trip_date: Mapped[date] = mapped_column(Date, default=date.today)
    destination: Mapped[str] = mapped_column(String(120))
    purpose: Mapped[str] = mapped_column(String(180))
    advance_amount: Mapped[float] = mapped_column(Float, default=0)
    flight_amount: Mapped[float] = mapped_column(Float, default=0)
    hotel_amount: Mapped[float] = mapped_column(Float, default=0)
    taxi_amount: Mapped[float] = mapped_column(Float, default=0)
    porter_amount: Mapped[float] = mapped_column(Float, default=0)
    other_amount: Mapped[float] = mapped_column(Float, default=0)
    settled_amount: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(30), default="OPEN")
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    invoice_date: Mapped[date] = mapped_column(Date, default=date.today)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0)
    total_amount: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT")

class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    description: Mapped[str] = mapped_column(String(255))
    weight_g: Mapped[float] = mapped_column(Float, default=0)
    rate: Mapped[float] = mapped_column(Float, default=0)
    amount: Mapped[float] = mapped_column(Float, default=0)

class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    payment_date: Mapped[date] = mapped_column(Date, default=date.today)
    amount: Mapped[float] = mapped_column(Float)
    payment_mode: Mapped[str] = mapped_column(String(30), default="BANK")
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    module: Mapped[str] = mapped_column(String(50), index=True)
    record_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_name: Mapped[str] = mapped_column(String(100), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
