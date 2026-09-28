from datetime import date
from pydantic import BaseModel, Field

class LoginInput(BaseModel):
    username: str
    password: str

class AppUserCreate(BaseModel):
    username: str
    password: str
    display_name: str
    role: str = "STAFF"
    active: bool = True

class GmailSettingsUpdate(BaseModel):
    enabled: bool = True
    user: str
    app_password: str | None = None
    clear_password: bool = False
    mailbox: str = "INBOX"
    fetch_query: str = "UNSEEN"
    fetch_limit: int = Field(default=25, ge=1, le=100)

class CustomerCreate(BaseModel):
    name: str
    email: str | None = None
    whatsapp: str | None = None
    gst_number: str | None = None
    default_rate: float = 0
    credit_days: int = 0

class JobCreate(BaseModel):
    customer_id: int
    source: str = "manual"
    priority: str = "NORMAL"
    instructions: str | None = None

class MagicsStart(BaseModel):
    operator_name: str
    workstation: str

class MagicsComplete(BaseModel):
    checker_name: str
    approved: bool = True

class PlatformFileInput(BaseModel):
    job_file_id: int
    quantity: int = 1

class PlatformCreate(BaseModel):
    software_name: str = "WaxJet"
    machine_id: int | None = None
    is_reshoot_platform: bool = False
    files: list[PlatformFileInput] = Field(default_factory=list)

class MachineCreate(BaseModel):
    code: str
    name: str
    model: str | None = None
    serial_number: str | None = None
    status: str = "AVAILABLE"

class PrintStart(BaseModel):
    platform_id: int
    machine_id: int
    expected_qty: int = 1
    production_weight_g: float = 0
    estimated_cost: float = 0
    is_reshoot: bool = False

class QCInput(BaseModel):
    good_qty: int
    bad_qty: int
    reason: str | None = None
    create_reshoot: bool = True
    responsibility: str = "OUR_PRODUCTION"

class WeightInput(BaseModel):
    billable_weight_g: float

class DispatchCreate(BaseModel):
    job_id: int
    courier: str | None = None
    tracking_no: str | None = None
    packed_by: str | None = None
    checked_by: str | None = None
    delivered_by: str | None = None

class ReturnCreate(BaseModel):
    job_id: int
    job_file_id: int
    dispatch_id: int | None = None
    complaint: str
    quantity: int = 1
    responsibility: str = "UNKNOWN"
    chargeable: bool = False
    create_reshoot: bool = True

class MaterialCreate(BaseModel):
    code: str
    name: str
    unit: str = "kg"
    minimum_stock: float = 0

class SupplierCreate(BaseModel):
    code: str
    name: str
    gst_number: str | None = None
    contact: str | None = None

class PurchaseCreate(BaseModel):
    supplier_id: int
    material_id: int
    purchase_date: date = Field(default_factory=date.today)
    quantity: float
    rate: float
    tax_amount: float = 0
    paid_amount: float = 0
    invoice_no: str | None = None

class ConsumptionCreate(BaseModel):
    material_id: int
    txn_date: date = Field(default_factory=date.today)
    quantity: float
    unit_cost: float
    job_id: int | None = None
    platform_id: int | None = None
    machine_id: int | None = None
    notes: str | None = None

class ExpenseCreate(BaseModel):
    expense_date: date = Field(default_factory=date.today)
    category: str
    subcategory: str | None = None
    description: str
    amount: float
    tax_amount: float = 0
    is_direct_cost: bool = False
    related_type: str = "GENERAL"
    related_id: int | None = None
    payment_mode: str = "BANK"

class EmployeeCreate(BaseModel):
    code: str
    name: str
    department: str = "Production"
    role: str = "Operator"
    monthly_salary: float = 0

class PayrollCreate(BaseModel):
    employee_id: int
    period: str
    basic: float
    bonus: float = 0
    commission: float = 0
    reimbursement: float = 0
    advance_deduction: float = 0
    other_deduction: float = 0
    paid: bool = False

class EmployeeAdvanceCreate(BaseModel):
    employee_id: int
    job_id: int | None = None
    advance_date: date = Field(default_factory=date.today)
    amount: float
    purpose: str = "Salary advance"
    period: str | None = None
    notes: str | None = None

class TravelAdvanceCreate(BaseModel):
    employee_id: int
    job_id: int | None = None
    trip_date: date = Field(default_factory=date.today)
    destination: str
    purpose: str
    advance_amount: float = 0
    flight_amount: float = 0
    hotel_amount: float = 0
    taxi_amount: float = 0
    porter_amount: float = 0
    other_amount: float = 0
    settled_amount: float = 0
    notes: str | None = None

class InvoiceFromJob(BaseModel):
    job_id: int
    tax_rate: float = 0
    extra_charge: float = 0
    extra_description: str = "Other Charges"

class PaymentCreate(BaseModel):
    invoice_id: int
    payment_date: date = Field(default_factory=date.today)
    amount: float
    payment_mode: str = "BANK"
    reference: str | None = None
