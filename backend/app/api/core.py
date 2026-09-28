from datetime import datetime
from pathlib import Path
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db import get_db
from app.config import settings
from app import models, schemas
from app import auth
from app.services.storage import save_upload
from app.services.reports import pnl, cash_and_outstanding
from app.services import gmail_service

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_db)]

def next_code(db: Session, model, prefix: str, field_name="number"):
    count = db.scalar(select(func.count()).select_from(model)) or 0
    return f"{prefix}-{datetime.utcnow().year}-{count+1:05d}"

def row_dict(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}

def user_payload(user: models.AppUser):
    return {"id":user.id,"username":user.username,"display_name":user.display_name,"role":user.role,"active":user.active,"created_at":user.created_at}

@router.post("/auth/login")
def login(data: schemas.LoginInput, db: Db):
    username=data.username.strip().lower()
    user=db.scalar(select(models.AppUser).where(models.AppUser.username==username))
    if not user or not user.active or not auth.verify_password(data.password,user.password_hash):
        raise HTTPException(401,"Invalid username or password")
    return {"token":auth.create_token(user),"user":user_payload(user)}

@router.get("/auth/me")
def me(user: models.AppUser = Depends(auth.current_user)):
    return user_payload(user)

@router.get("/auth/users")
def auth_users(db:Db, admin:models.AppUser=Depends(auth.require_admin)):
    rows=db.scalars(select(models.AppUser).order_by(models.AppUser.id.desc())).all()
    return [user_payload(user) for user in rows]

@router.post("/auth/users")
def create_auth_user(data:schemas.AppUserCreate, db:Db, admin:models.AppUser=Depends(auth.require_admin)):
    username=data.username.strip().lower()
    if db.scalar(select(models.AppUser.id).where(models.AppUser.username==username)):
        raise HTTPException(400,"Username already exists")
    role=data.role.strip().upper()
    if role not in {"ADMIN","ACCOUNTS","STAFF","OPERATOR"}:
        raise HTTPException(400,"Role must be ADMIN, ACCOUNTS, STAFF, or OPERATOR")
    user=models.AppUser(username=username,display_name=data.display_name.strip(),role=role,password_hash=auth.hash_password(data.password),active=data.active)
    db.add(user); db.commit(); db.refresh(user)
    return user_payload(user)

@router.get("/dashboard")
def dashboard(db: Db, admin:models.AppUser=Depends(auth.require_admin)):
    jobs = db.scalar(select(func.count()).select_from(models.Job)) or 0
    reshoots = db.scalar(select(func.count()).select_from(models.ReshootTicket).where(models.ReshootTicket.status == "OPEN")) or 0
    printing = db.scalar(select(func.count()).select_from(models.PrintAttempt).where(models.PrintAttempt.status == "PRINTING")) or 0
    qc_failed = db.scalar(select(func.count()).select_from(models.PrintAttempt).where(models.PrintAttempt.status == "QC_FAILED")) or 0
    low_stock = []
    materials = db.scalars(select(models.Material)).all()
    for m in materials:
        qty = db.scalar(select(func.coalesce(func.sum(models.InventoryTransaction.quantity), 0.0)).where(models.InventoryTransaction.material_id==m.id, models.InventoryTransaction.txn_type=="PURCHASE")) or 0
        qty -= db.scalar(select(func.coalesce(func.sum(models.InventoryTransaction.quantity), 0.0)).where(models.InventoryTransaction.material_id==m.id, models.InventoryTransaction.txn_type.in_(["CONSUMPTION","WASTAGE"]))) or 0
        if qty <= m.minimum_stock:
            low_stock.append({"material": m.name, "qty": round(qty,3), "minimum": m.minimum_stock})
    return {"counts":{"jobs":jobs,"open_reshoots":reshoots,"printing":printing,"qc_failed":qc_failed},"pnl":pnl(db),"cash":cash_and_outstanding(db),"low_stock":low_stock}

@router.get("/customers")
def customers(db: Db):
    return [{"id":c.id,"code":c.code,"name":c.name,"email":c.email,"whatsapp":c.whatsapp,"default_rate":c.default_rate,"credit_days":c.credit_days} for c in db.scalars(select(models.Customer).order_by(models.Customer.name)).all()]

@router.post("/customers")
def create_customer(data: schemas.CustomerCreate, db: Db):
    count = db.scalar(select(func.count()).select_from(models.Customer)) or 0
    c=models.Customer(code=f"CUST-{count+1:04d}",**data.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    return {"id":c.id,"code":c.code,"name":c.name}

@router.get("/jobs")
def jobs(db: Db, status: str | None = None):
    stmt=select(models.Job).order_by(models.Job.id.desc())
    if status: stmt=stmt.where(models.Job.status==status)
    rows=db.scalars(stmt).all()
    return [{"id":j.id,"number":j.number,"customer":j.customer.name,"customer_id":j.customer_id,"source":j.source,"status":j.status,"priority":j.priority,"billable_weight_g":j.billable_weight_g,"reshoot_weight_g":j.reshoot_weight_g,"received_at":j.received_at} for j in rows]

@router.post("/jobs")
def create_job(data: schemas.JobCreate, db: Db):
    number=next_code(db,models.Job,"WJ")
    j=models.Job(number=number,**data.model_dump())
    db.add(j); db.commit(); db.refresh(j)
    return {"id":j.id,"number":j.number,"status":j.status}

@router.get("/jobs/{job_id}")
def job_detail(job_id:int, db:Db):
    j=db.get(models.Job,job_id)
    if not j: raise HTTPException(404,"Job not found")
    files=db.scalars(select(models.JobFile).where(models.JobFile.job_id==job_id)).all()
    sessions=db.scalars(select(models.MagicsSession).where(models.MagicsSession.job_id==job_id).order_by(models.MagicsSession.id.desc())).all()
    reshoots=db.scalars(select(models.ReshootTicket).where(models.ReshootTicket.job_id==job_id)).all()
    dispatches=db.scalars(select(models.Dispatch).where(models.Dispatch.job_id==job_id)).all()
    returns=db.scalars(select(models.CustomerReturn).where(models.CustomerReturn.job_id==job_id)).all()
    return {"job":{"id":j.id,"number":j.number,"customer":j.customer.name,"customer_id":j.customer_id,"source":j.source,"status":j.status,"priority":j.priority,"instructions":j.instructions,"billable_weight_g":j.billable_weight_g,"reshoot_weight_g":j.reshoot_weight_g},
            "files":[{"id":f.id,"file_uid":f.file_uid,"name":f.original_name,"status":f.status,"quantity":f.quantity,"sha256":f.sha256,"download_url":f"/api/job-files/{f.id}/download"} for f in files],
            "magics":[{"id":s.id,"operator":s.operator_name,"workstation":s.workstation,"status":s.status,"checker":s.checker_name,"approved":s.approved} for s in sessions],
            "reshoots":[{"id":r.id,"number":r.number,"file_id":r.job_file_id,"source":r.source,"reason":r.reason,"quantity":r.quantity,"status":r.status,"chargeable":r.chargeable} for r in reshoots],
            "dispatches":[{"id":d.id,"number":d.number,"courier":d.courier,"tracking_no":d.tracking_no,"packed_by":d.packed_by,"checked_by":d.checked_by,"delivered_by":d.delivered_by,"packing_photo_name":d.packing_photo_name,"packing_photo_url":f"/api/dispatches/{d.id}/packing-photo" if d.packing_photo_path else None,"status":d.status} for d in dispatches],
            "returns":[{"id":r.id,"number":r.number,"file_id":r.job_file_id,"dispatch_id":r.dispatch_id,"complaint":r.complaint,"quantity":r.quantity,"responsibility":r.responsibility,"chargeable":r.chargeable,"status":r.status,"created_at":r.created_at} for r in returns]}

@router.post("/jobs/{job_id}/files")
async def upload_job_file(job_id:int, db:Db, upload:UploadFile=File(...), quantity:int=Form(1)):
    j=db.get(models.Job,job_id)
    if not j: raise HTTPException(404,"Job not found")
    path,digest,size=await save_upload(j.number,upload,"original")
    count=db.scalar(select(func.count()).select_from(models.JobFile)) or 0
    f=models.JobFile(job_id=j.id,file_uid=f"F-{count+1:06d}",original_name=upload.filename or "file",original_path=path,sha256=digest,quantity=quantity,status="RECEIVED")
    db.add(f); j.status="WAITING_MAGICS"; db.commit(); db.refresh(f)
    return {"id":f.id,"file_uid":f.file_uid,"name":f.original_name,"sha256":f.sha256,"size":size}

@router.get("/job-files/{file_id}/download")
def download_job_file(file_id:int, db:Db):
    f=db.get(models.JobFile,file_id)
    if not f: raise HTTPException(404,"File not found")
    path=Path(f.original_path)
    if not path.exists(): raise HTTPException(404,"Stored file is missing")
    media_type="model/stl" if path.suffix.lower()==".stl" else "application/octet-stream"
    return FileResponse(path, media_type=media_type, filename=f.original_name)

@router.post("/jobs/{job_id}/magics/start")
def magics_start(job_id:int, data:schemas.MagicsStart, db:Db):
    j=db.get(models.Job,job_id)
    if not j: raise HTTPException(404,"Job not found")
    s=models.MagicsSession(job_id=job_id,operator_name=data.operator_name,workstation=data.workstation,status="STARTED")
    db.add(s); j.status="MAGICS_REPAIR"; db.commit(); db.refresh(s)
    return {"session_id":s.id,"status":s.status}

@router.post("/jobs/{job_id}/magics/complete")
def magics_complete(job_id:int, data:schemas.MagicsComplete, db:Db):
    s=db.scalar(select(models.MagicsSession).where(models.MagicsSession.job_id==job_id).order_by(models.MagicsSession.id.desc()))
    j=db.get(models.Job,job_id)
    if not s or not j: raise HTTPException(404,"Magics session/job not found")
    s.completed_at=datetime.utcnow(); s.checker_name=data.checker_name; s.approved=data.approved; s.status="APPROVED" if data.approved else "REPAIR_REQUIRED"
    j.status="READY_MACHINE_SOFTWARE" if data.approved else "MAGICS_REPAIR"
    db.commit(); return {"status":s.status,"job_status":j.status}

@router.get("/magics/queue")
def magics_queue(db:Db):
    statuses=["WAITING_MAGICS","MAGICS_REPAIR","READY_MACHINE_SOFTWARE"]
    rows=db.scalars(select(models.Job).where(models.Job.status.in_(statuses)).order_by(models.Job.id.desc())).all()
    out=[]
    for j in rows:
        latest=db.scalar(select(models.MagicsSession).where(models.MagicsSession.job_id==j.id).order_by(models.MagicsSession.id.desc()))
        file_count=db.scalar(select(func.count()).select_from(models.JobFile).where(models.JobFile.job_id==j.id)) or 0
        out.append({
            "id":j.id,
            "number":j.number,
            "customer":j.customer.name,
            "source":j.source,
            "priority":j.priority,
            "status":j.status,
            "received_at":j.received_at,
            "file_count":file_count,
            "latest_session":{
                "id":latest.id,
                "operator":latest.operator_name,
                "workstation":latest.workstation,
                "status":latest.status,
                "checker":latest.checker_name,
                "approved":latest.approved,
                "started_at":latest.started_at,
                "completed_at":latest.completed_at,
            } if latest else None
        })
    return out

@router.get("/magics/sessions")
def magics_sessions(db:Db):
    rows=db.scalars(select(models.MagicsSession).order_by(models.MagicsSession.id.desc())).all()
    out=[]
    for s in rows:
        j=db.get(models.Job,s.job_id)
        out.append({
            "id":s.id,
            "job_id":s.job_id,
            "job_number":j.number if j else "",
            "customer":j.customer.name if j else "",
            "job_status":j.status if j else "",
            "operator":s.operator_name,
            "workstation":s.workstation,
            "status":s.status,
            "checker":s.checker_name,
            "approved":s.approved,
            "started_at":s.started_at,
            "completed_at":s.completed_at,
        })
    return out

@router.get("/platforms")
def platforms(db:Db):
    rows=db.scalars(select(models.Platform).order_by(models.Platform.id.desc())).all()
    return [{"id":p.id,"number":p.number,"software_name":p.software_name,"machine_id":p.machine_id,"status":p.status,"is_reshoot_platform":p.is_reshoot_platform} for p in rows]

@router.get("/machines")
def machines(db:Db):
    rows=db.scalars(select(models.Machine).order_by(models.Machine.name)).all()
    return [{"id":m.id,"code":m.code,"name":m.name,"model":m.model,"serial_number":m.serial_number,"status":m.status} for m in rows]

@router.post("/machines")
def create_machine(data:schemas.MachineCreate, db:Db):
    m=models.Machine(**data.model_dump()); db.add(m); db.commit(); db.refresh(m)
    return {"id":m.id,"name":m.name,"status":m.status}

@router.get("/settings/integrations")
def integration_settings(user:models.AppUser=Depends(auth.require_admin)):
    return {
        "gmail": gmail_service.status(),
        "magics": {
            "agent_token_configured": bool(settings.agent_token and settings.agent_token != "change-me"),
            "workstation_default": "MAGICS-PC-01",
            "local_agent_folder": "magics_agent",
            "queue_endpoint": "/api/magics/agent/jobs",
        },
    }

@router.get("/admin/all-data")
def admin_all_data(db:Db, admin:models.AppUser=Depends(auth.require_admin)):
    groups=[
        ("customers","Customers",models.Customer,models.Customer.id.desc()),
        ("suppliers","Suppliers",models.Supplier,models.Supplier.id.desc()),
        ("employees","Employees",models.Employee,models.Employee.id.desc()),
        ("machines","Machines",models.Machine,models.Machine.id.desc()),
        ("materials","Materials",models.Material,models.Material.id.desc()),
        ("jobs","Jobs",models.Job,models.Job.id.desc()),
        ("job_files","Job Files",models.JobFile,models.JobFile.id.desc()),
        ("inbox","Inbox Messages",models.InboxMessage,models.InboxMessage.id.desc()),
        ("magics_sessions","Magics Sessions",models.MagicsSession,models.MagicsSession.id.desc()),
        ("platforms","Platforms",models.Platform,models.Platform.id.desc()),
        ("platform_files","Platform Files",models.PlatformFile,models.PlatformFile.id.desc()),
        ("print_attempts","Print Attempts",models.PrintAttempt,models.PrintAttempt.id.desc()),
        ("reshoots","Reshoots",models.ReshootTicket,models.ReshootTicket.id.desc()),
        ("dispatches","Dispatches",models.Dispatch,models.Dispatch.id.desc()),
        ("customer_returns","Customer Returns",models.CustomerReturn,models.CustomerReturn.id.desc()),
        ("purchases","Purchases",models.Purchase,models.Purchase.id.desc()),
        ("inventory_transactions","Inventory Transactions",models.InventoryTransaction,models.InventoryTransaction.id.desc()),
        ("expenses","Expenses",models.Expense,models.Expense.id.desc()),
        ("payroll","Payroll",models.Payroll,models.Payroll.id.desc()),
        ("employee_advances","Employee Advances",models.EmployeeAdvance,models.EmployeeAdvance.id.desc()),
        ("travel_advances","Travel Advances",models.TravelAdvance,models.TravelAdvance.id.desc()),
        ("invoices","Invoices",models.Invoice,models.Invoice.id.desc()),
        ("invoice_lines","Invoice Lines",models.InvoiceLine,models.InvoiceLine.id.desc()),
        ("payments","Payments",models.Payment,models.Payment.id.desc()),
        ("audit_logs","Audit Logs",models.AuditLog,models.AuditLog.id.desc()),
    ]
    user_rows=[user_payload(user) for user in db.scalars(select(models.AppUser).order_by(models.AppUser.id.desc())).all()]
    datasets=[{"key":"app_users","label":"Login Users","count":len(user_rows),"rows":user_rows}]
    for key,label,model,order_by in groups:
        rows=db.scalars(select(model).order_by(order_by)).all()
        datasets.append({"key":key,"label":label,"count":len(rows),"rows":[row_dict(row) for row in rows]})
    total_records=sum(group["count"] for group in datasets)
    return {"total_records":total_records,"datasets":datasets}

@router.post("/platforms")
def create_platform(data:schemas.PlatformCreate, db:Db):
    p=models.Platform(number=next_code(db,models.Platform,"PL-RS" if data.is_reshoot_platform else "PL"),software_name=data.software_name,machine_id=data.machine_id,status="READY",is_reshoot_platform=data.is_reshoot_platform)
    db.add(p); db.flush()
    for x in data.files:
        if not db.get(models.JobFile,x.job_file_id): raise HTTPException(400,f"File {x.job_file_id} not found")
        db.add(models.PlatformFile(platform_id=p.id,job_file_id=x.job_file_id,quantity=x.quantity))
        f=db.get(models.JobFile,x.job_file_id); f.status="ON_PLATFORM"
        j=db.get(models.Job,f.job_id); j.status="PLATFORM_READY"
    db.commit(); db.refresh(p)
    return {"id":p.id,"number":p.number,"status":p.status}

@router.post("/print-attempts/start")
def start_print(data:schemas.PrintStart, db:Db):
    pf=db.scalar(select(models.PlatformFile).where(models.PlatformFile.platform_id==data.platform_id).limit(1))
    if not pf: raise HTTPException(400,"Platform has no files")
    # For MVP, start one attempt per platform file, using same supplied estimated cost/weight split equally.
    pfiles=db.scalars(select(models.PlatformFile).where(models.PlatformFile.platform_id==data.platform_id)).all()
    attempts=[]
    for item in pfiles:
        previous=db.scalar(select(func.count()).select_from(models.PrintAttempt).where(models.PrintAttempt.job_file_id==item.job_file_id)) or 0
        a=models.PrintAttempt(job_file_id=item.job_file_id,platform_id=data.platform_id,machine_id=data.machine_id,attempt_no=previous+1,is_reshoot=data.is_reshoot,status="PRINTING",expected_qty=item.quantity,production_weight_g=data.production_weight_g/max(len(pfiles),1),estimated_cost=data.estimated_cost/max(len(pfiles),1))
        db.add(a); attempts.append(a)
        f=db.get(models.JobFile,item.job_file_id); f.status="PRINTING"
        j=db.get(models.Job,f.job_id); j.status="PRINTING"
    p=db.get(models.Platform,data.platform_id); p.status="PRINTING"; p.machine_id=data.machine_id
    m=db.get(models.Machine,data.machine_id); m.status="PRINTING"
    db.commit()
    return {"attempt_ids":[a.id for a in attempts],"count":len(attempts)}

@router.get("/print-attempts")
def print_attempts(db:Db):
    rows=db.scalars(select(models.PrintAttempt).order_by(models.PrintAttempt.id.desc())).all()
    return [{"id":a.id,"file_id":a.job_file_id,"platform_id":a.platform_id,"machine_id":a.machine_id,"attempt_no":a.attempt_no,"is_reshoot":a.is_reshoot,"status":a.status,"expected_qty":a.expected_qty,"good_qty":a.good_qty,"bad_qty":a.bad_qty,"reason":a.qc_reason,"production_weight_g":a.production_weight_g,"estimated_cost":a.estimated_cost} for a in rows]

@router.post("/print-attempts/{attempt_id}/qc")
def qc_attempt(attempt_id:int, data:schemas.QCInput, db:Db):
    a=db.get(models.PrintAttempt,attempt_id)
    if not a: raise HTTPException(404,"Attempt not found")
    a.good_qty=data.good_qty; a.bad_qty=data.bad_qty; a.qc_reason=data.reason; a.completed_at=datetime.utcnow()
    f=db.get(models.JobFile,a.job_file_id); j=db.get(models.Job,f.job_id)
    if data.bad_qty>0:
        a.status="QC_FAILED"; f.status="RESHOOT_PENDING"; j.status="RESHOOT_PENDING"
        ticket=None
        if data.create_reshoot:
            ticket=models.ReshootTicket(number=next_code(db,models.ReshootTicket,"RS"),job_id=j.id,job_file_id=f.id,original_attempt_id=a.id,source="INTERNAL_QC",reason=data.reason or "BROKEN/FAILED",quantity=data.bad_qty,responsibility=data.responsibility,status="OPEN")
            db.add(ticket)
        db.commit()
        return {"status":"QC_FAILED","reshoot": ticket.number if ticket else None}
    a.status="QC_PASSED"; f.status="QC_PASSED"; j.status="WEIGHT_PENDING"
    db.commit(); return {"status":"QC_PASSED","job_status":j.status}

@router.get("/reshoots")
def reshoots(db:Db):
    rows=db.scalars(select(models.ReshootTicket).order_by(models.ReshootTicket.id.desc())).all()
    return [{"id":r.id,"number":r.number,"job_id":r.job_id,"file_id":r.job_file_id,"source":r.source,"reason":r.reason,"quantity":r.quantity,"responsibility":r.responsibility,"chargeable":r.chargeable,"status":r.status} for r in rows]

@router.post("/jobs/{job_id}/weight")
def weight(job_id:int,data:schemas.WeightInput,db:Db):
    j=db.get(models.Job,job_id)
    if not j: raise HTTPException(404,"Job not found")
    j.billable_weight_g=data.billable_weight_g; j.weight_recorded_at=datetime.utcnow(); j.status="WEIGHT_COMPLETED"; db.commit()
    return {"job":j.number,"billable_weight_g":j.billable_weight_g,"status":j.status}

@router.post("/dispatches")
def dispatch(data:schemas.DispatchCreate,db:Db):
    j=db.get(models.Job,data.job_id)
    if not j: raise HTTPException(404,"Job not found")
    d=models.Dispatch(number=next_code(db,models.Dispatch,"DSP"),**data.model_dump())
    db.add(d); j.status="DISPATCHED"; db.commit(); db.refresh(d)
    return {"id":d.id,"number":d.number,"status":d.status}

@router.post("/dispatches/with-photo")
async def dispatch_with_photo(
    db: Db,
    job_id: int = Form(...),
    courier: str | None = Form(None),
    tracking_no: str | None = Form(None),
    packed_by: str | None = Form(None),
    checked_by: str | None = Form(None),
    delivered_by: str | None = Form(None),
    packing_photo: UploadFile | None = File(None),
):
    j=db.get(models.Job,job_id)
    if not j: raise HTTPException(404,"Job not found")
    photo_path=None
    photo_name=None
    if packing_photo and packing_photo.filename:
        if packing_photo.content_type and not packing_photo.content_type.startswith("image/"):
            raise HTTPException(400,"Packing photo must be an image.")
        photo_path, _, _ = await save_upload(j.number, packing_photo, "packing")
        photo_name = Path(packing_photo.filename).name
    d=models.Dispatch(
        number=next_code(db,models.Dispatch,"DSP"),
        job_id=job_id,
        courier=courier or None,
        tracking_no=tracking_no or None,
        packed_by=packed_by or None,
        checked_by=checked_by or None,
        delivered_by=delivered_by or None,
        packing_photo_path=photo_path,
        packing_photo_name=photo_name,
    )
    db.add(d); j.status="DISPATCHED"; db.commit(); db.refresh(d)
    return {"id":d.id,"number":d.number,"status":d.status,"packing_photo_name":d.packing_photo_name}

@router.get("/dispatches/{dispatch_id}/packing-photo")
def dispatch_packing_photo(dispatch_id:int, db:Db):
    d=db.get(models.Dispatch,dispatch_id)
    if not d or not d.packing_photo_path:
        raise HTTPException(404,"Packing photo not found")
    path=Path(d.packing_photo_path)
    if not path.exists():
        raise HTTPException(404,"Packing photo file is missing")
    return FileResponse(path, filename=d.packing_photo_name or path.name)

@router.post("/dispatches/{dispatch_id}/packing-photo")
async def upload_dispatch_packing_photo(dispatch_id:int, db:Db, packing_photo:UploadFile=File(...)):
    d=db.get(models.Dispatch,dispatch_id)
    if not d:
        raise HTTPException(404,"Dispatch not found")
    j=db.get(models.Job,d.job_id)
    if not j:
        raise HTTPException(404,"Job not found")
    if packing_photo.content_type and not packing_photo.content_type.startswith("image/"):
        raise HTTPException(400,"Packing photo must be an image.")
    path, _, _ = await save_upload(j.number, packing_photo, "packing")
    d.packing_photo_path = path
    d.packing_photo_name = Path(packing_photo.filename or "packing-photo").name
    db.commit(); db.refresh(d)
    return {"id":d.id,"number":d.number,"packing_photo_name":d.packing_photo_name,"packing_photo_url":f"/api/dispatches/{d.id}/packing-photo"}

@router.post("/returns")
def customer_return(data:schemas.ReturnCreate,db:Db):
    j=db.get(models.Job,data.job_id); f=db.get(models.JobFile,data.job_file_id)
    if not j or not f: raise HTTPException(404,"Job/file not found")
    r=models.CustomerReturn(number=next_code(db,models.CustomerReturn,"CR"),job_id=data.job_id,job_file_id=data.job_file_id,dispatch_id=data.dispatch_id,complaint=data.complaint,quantity=data.quantity,responsibility=data.responsibility,chargeable=data.chargeable,status="OPEN")
    db.add(r); j.status="CUSTOMER_RETURN"
    ticket=None
    if data.create_reshoot:
        ticket=models.ReshootTicket(number=next_code(db,models.ReshootTicket,"RS"),job_id=j.id,job_file_id=f.id,source="CUSTOMER_RETURN",reason=data.complaint,quantity=data.quantity,responsibility=data.responsibility,chargeable=data.chargeable,status="OPEN")
        db.add(ticket)
    db.commit(); db.refresh(r)
    return {"return_no":r.number,"reshoot":ticket.number if ticket else None}

@router.get("/materials")
def materials(db:Db):
    out=[]
    for m in db.scalars(select(models.Material).order_by(models.Material.name)).all():
        purchased=db.scalar(select(func.coalesce(func.sum(models.InventoryTransaction.quantity),0.0)).where(models.InventoryTransaction.material_id==m.id,models.InventoryTransaction.txn_type=="PURCHASE")) or 0
        used=db.scalar(select(func.coalesce(func.sum(models.InventoryTransaction.quantity),0.0)).where(models.InventoryTransaction.material_id==m.id,models.InventoryTransaction.txn_type.in_(["CONSUMPTION","WASTAGE"]))) or 0
        out.append({"id":m.id,"code":m.code,"name":m.name,"unit":m.unit,"stock":round(purchased-used,3),"minimum_stock":m.minimum_stock})
    return out

@router.post("/materials")
def create_material(data:schemas.MaterialCreate,db:Db):
    m=models.Material(**data.model_dump()); db.add(m); db.commit(); db.refresh(m); return {"id":m.id,"name":m.name}

@router.get("/suppliers")
def suppliers(db:Db):
    return [{"id":s.id,"code":s.code,"name":s.name,"gst_number":s.gst_number,"contact":s.contact} for s in db.scalars(select(models.Supplier)).all()]

@router.post("/suppliers")
def create_supplier(data:schemas.SupplierCreate,db:Db):
    s=models.Supplier(**data.model_dump()); db.add(s); db.commit(); db.refresh(s); return {"id":s.id,"name":s.name}

@router.post("/purchases")
def purchase(data:schemas.PurchaseCreate,db:Db):
    p=models.Purchase(**data.model_dump()); db.add(p); db.flush()
    db.add(models.InventoryTransaction(material_id=data.material_id,txn_date=data.purchase_date,txn_type="PURCHASE",quantity=data.quantity,unit_cost=data.rate,value=data.quantity*data.rate,notes=f"Purchase {data.invoice_no or p.id}"))
    db.commit(); db.refresh(p); return {"id":p.id,"inventory_added":data.quantity,"purchase_value":round(data.quantity*data.rate,2)}

@router.post("/inventory/consume")
def consume(data:schemas.ConsumptionCreate,db:Db):
    value=data.quantity*data.unit_cost
    t=models.InventoryTransaction(txn_type="CONSUMPTION",value=value,**data.model_dump()); db.add(t); db.commit(); db.refresh(t)
    return {"id":t.id,"production_cost_added":round(value,2)}

@router.get("/expenses")
def expenses(db:Db, admin:models.AppUser=Depends(auth.require_admin)):
    rows=db.scalars(select(models.Expense).order_by(models.Expense.expense_date.desc(),models.Expense.id.desc())).all()
    return [{"id":e.id,"date":e.expense_date,"category":e.category,"subcategory":e.subcategory,"description":e.description,"amount":e.amount,"is_direct_cost":e.is_direct_cost,"related_type":e.related_type,"related_id":e.related_id,"approved":e.approved} for e in rows]

@router.post("/expenses")
def create_expense(data:schemas.ExpenseCreate,db:Db,user:models.AppUser=Depends(auth.require_roles("ADMIN","ACCOUNTS","STAFF","OPERATOR"))):
    e=models.Expense(**data.model_dump())
    e.approved=user.role.upper()=="ADMIN"
    db.add(e); db.commit(); db.refresh(e); return {"id":e.id,"amount":e.amount,"approved":e.approved}

@router.post("/expenses/{expense_id}/approve")
def approve_expense(expense_id:int,db:Db,admin:models.AppUser=Depends(auth.require_admin)):
    e=db.get(models.Expense,expense_id)
    if not e:
        raise HTTPException(404,"Expense not found")
    e.approved=True
    db.commit()
    return {"ok":True,"id":e.id}

@router.get("/employees")
def employees(db:Db):
    return [{"id":e.id,"code":e.code,"name":e.name,"department":e.department,"role":e.role,"monthly_salary":e.monthly_salary} for e in db.scalars(select(models.Employee)).all()]

@router.post("/employees")
def create_employee(data:schemas.EmployeeCreate,db:Db):
    e=models.Employee(**data.model_dump()); db.add(e); db.commit(); db.refresh(e); return {"id":e.id,"name":e.name}

@router.post("/payroll")
def create_payroll(data:schemas.PayrollCreate,db:Db,admin:models.AppUser=Depends(auth.require_admin)):
    net=data.basic+data.bonus+data.commission+data.reimbursement-data.advance_deduction-data.other_deduction
    p=models.Payroll(**data.model_dump(exclude={"paid"}),net_payable=net,paid=data.paid); db.add(p); db.commit(); db.refresh(p)
    return {"id":p.id,"net_payable":round(net,2)}

@router.get("/payroll")
def payroll(db:Db,admin:models.AppUser=Depends(auth.require_admin)):
    rows=db.scalars(select(models.Payroll).order_by(models.Payroll.id.desc())).all()
    out=[]
    for p in rows:
        e=db.get(models.Employee,p.employee_id)
        out.append({"id":p.id,"employee_id":p.employee_id,"employee_name":e.name if e else f"Employee #{p.employee_id}","period":p.period,"basic":p.basic,"bonus":p.bonus,"commission":p.commission,"reimbursement":p.reimbursement,"advance_deduction":p.advance_deduction,"other_deduction":p.other_deduction,"net_payable":p.net_payable,"paid":p.paid})
    return out

@router.get("/advances")
def employee_advances(db:Db,admin:models.AppUser=Depends(auth.require_admin)):
    rows=db.scalars(select(models.EmployeeAdvance).order_by(models.EmployeeAdvance.advance_date.desc(),models.EmployeeAdvance.id.desc())).all()
    out=[]
    for a in rows:
        e=db.get(models.Employee,a.employee_id)
        j=db.get(models.Job,a.job_id) if a.job_id else None
        out.append({"id":a.id,"employee_id":a.employee_id,"employee_name":e.name if e else f"Employee #{a.employee_id}","job_id":a.job_id,"job_number":j.number if j else None,"advance_date":a.advance_date,"amount":a.amount,"purpose":a.purpose,"period":a.period,"status":a.status,"notes":a.notes})
    return out

@router.post("/advances")
def create_employee_advance(data:schemas.EmployeeAdvanceCreate,db:Db,admin:models.AppUser=Depends(auth.require_admin)):
    e=db.get(models.Employee,data.employee_id)
    if not e: raise HTTPException(404,"Employee not found")
    if data.job_id and not db.get(models.Job,data.job_id): raise HTTPException(404,"Job not found")
    if data.amount <= 0: raise HTTPException(400,"Advance amount must be greater than zero")
    row=models.EmployeeAdvance(**data.model_dump(),status="OPEN")
    db.add(row); db.commit(); db.refresh(row)
    return {"id":row.id,"employee":e.name,"amount":round(row.amount,2),"status":row.status}

@router.get("/travel")
def travel_advances(db:Db,admin:models.AppUser=Depends(auth.require_admin)):
    rows=db.scalars(select(models.TravelAdvance).order_by(models.TravelAdvance.trip_date.desc(),models.TravelAdvance.id.desc())).all()
    out=[]
    for t in rows:
        e=db.get(models.Employee,t.employee_id)
        j=db.get(models.Job,t.job_id) if t.job_id else None
        expense=t.flight_amount+t.hotel_amount+t.taxi_amount+t.porter_amount+t.other_amount
        balance=t.advance_amount+t.settled_amount-expense
        out.append({"id":t.id,"employee_id":t.employee_id,"employee_name":e.name if e else f"Employee #{t.employee_id}","job_id":t.job_id,"job_number":j.number if j else None,"trip_date":t.trip_date,"destination":t.destination,"purpose":t.purpose,"advance_amount":t.advance_amount,"flight_amount":t.flight_amount,"hotel_amount":t.hotel_amount,"taxi_amount":t.taxi_amount,"porter_amount":t.porter_amount,"other_amount":t.other_amount,"settled_amount":t.settled_amount,"total_expense":round(expense,2),"balance":round(balance,2),"status":t.status,"notes":t.notes})
    return out

@router.post("/travel")
def create_travel_advance(data:schemas.TravelAdvanceCreate,db:Db,admin:models.AppUser=Depends(auth.require_admin)):
    e=db.get(models.Employee,data.employee_id)
    if not e: raise HTTPException(404,"Employee not found")
    if data.job_id and not db.get(models.Job,data.job_id): raise HTTPException(404,"Job not found")
    expense=data.flight_amount+data.hotel_amount+data.taxi_amount+data.porter_amount+data.other_amount
    balance=data.advance_amount+data.settled_amount-expense
    status="SETTLED" if abs(balance)<0.01 else "OPEN"
    row=models.TravelAdvance(**data.model_dump(),status=status)
    db.add(row); db.flush()
    if expense:
        db.add(models.Expense(expense_date=data.trip_date,category="Travel",subcategory="Trip Settlement",description=f"{data.destination} - {data.purpose}",amount=expense,is_direct_cost=bool(data.job_id),related_type="JOB" if data.job_id else "EMPLOYEE",related_id=data.job_id or data.employee_id,payment_mode="BANK"))
    db.commit(); db.refresh(row)
    return {"id":row.id,"status":row.status,"total_expense":round(expense,2),"balance":round(balance,2)}

@router.post("/invoices/from-job")
def invoice_from_job(data:schemas.InvoiceFromJob,db:Db,user:models.AppUser=Depends(auth.require_roles("ADMIN","ACCOUNTS"))):
    j=db.get(models.Job,data.job_id)
    if not j: raise HTTPException(404,"Job not found")
    rate=j.customer.default_rate
    amount=j.billable_weight_g*rate
    subtotal=amount+data.extra_charge
    tax=subtotal*data.tax_rate/100
    inv=models.Invoice(number=next_code(db,models.Invoice,"INV"),customer_id=j.customer_id,subtotal=subtotal,tax_amount=tax,total_amount=subtotal+tax,status="SENT")
    db.add(inv); db.flush()
    db.add(models.InvoiceLine(invoice_id=inv.id,job_id=j.id,description=f"Wax printing {j.number}",weight_g=j.billable_weight_g,rate=rate,amount=amount))
    if data.extra_charge:
        db.add(models.InvoiceLine(invoice_id=inv.id,job_id=j.id,description=data.extra_description,weight_g=0,rate=0,amount=data.extra_charge))
    j.status="INVOICED"; db.commit(); db.refresh(inv)
    return {"id":inv.id,"number":inv.number,"subtotal":round(subtotal,2),"tax":round(tax,2),"total":round(inv.total_amount,2)}

@router.get("/invoices")
def invoices(db:Db,user:models.AppUser=Depends(auth.require_roles("ADMIN","ACCOUNTS"))):
    rows=db.scalars(select(models.Invoice).order_by(models.Invoice.id.desc())).all()
    out=[]
    for i in rows:
        paid=db.scalar(select(func.coalesce(func.sum(models.Payment.amount),0.0)).where(models.Payment.invoice_id==i.id)) or 0
        out.append({"id":i.id,"number":i.number,"customer_id":i.customer_id,"date":i.invoice_date,"subtotal":i.subtotal,"tax":i.tax_amount,"total":i.total_amount,"paid":paid,"outstanding":max(i.total_amount-paid,0),"status":i.status})
    return out

@router.post("/payments")
def payment(data:schemas.PaymentCreate,db:Db,user:models.AppUser=Depends(auth.require_roles("ADMIN","ACCOUNTS"))):
    inv=db.get(models.Invoice,data.invoice_id)
    if not inv: raise HTTPException(404,"Invoice not found")
    p=models.Payment(**data.model_dump()); db.add(p); db.flush()
    paid=db.scalar(select(func.coalesce(func.sum(models.Payment.amount),0.0)).where(models.Payment.invoice_id==inv.id)) or 0
    inv.status="PAID" if paid>=inv.total_amount else "PART_PAID"
    db.commit(); db.refresh(p)
    return {"id":p.id,"invoice":inv.number,"paid_total":round(paid,2),"outstanding":round(max(inv.total_amount-paid,0),2)}

@router.get("/reports/pnl")
def report_pnl(db:Db, period:str|None=None,admin:models.AppUser=Depends(auth.require_admin)):
    return pnl(db,period)

@router.get("/reports/quality")
def report_quality(db:Db):
    total=db.scalar(select(func.coalesce(func.sum(models.PrintAttempt.expected_qty),0)).where(models.PrintAttempt.status.in_(["QC_PASSED","QC_FAILED"]))) or 0
    good=db.scalar(select(func.coalesce(func.sum(models.PrintAttempt.good_qty),0)).where(models.PrintAttempt.status.in_(["QC_PASSED","QC_FAILED"]))) or 0
    bad=db.scalar(select(func.coalesce(func.sum(models.PrintAttempt.bad_qty),0)).where(models.PrintAttempt.status.in_(["QC_PASSED","QC_FAILED"]))) or 0
    internal=db.scalar(select(func.count()).select_from(models.ReshootTicket).where(models.ReshootTicket.source=="INTERNAL_QC")) or 0
    customer=db.scalar(select(func.count()).select_from(models.ReshootTicket).where(models.ReshootTicket.source=="CUSTOMER_RETURN")) or 0
    return {"expected_pieces":total,"good_pieces":good,"bad_pieces":bad,"first_pass_yield_pct":round(good/total*100,2) if total else 0,"internal_reshoot_tickets":internal,"customer_return_reshoots":customer}

@router.get("/reports/job-profitability")
def job_profitability(db:Db,admin:models.AppUser=Depends(auth.require_admin)):
    rows=[]
    for j in db.scalars(select(models.Job).order_by(models.Job.id.desc())).all():
        revenue=db.scalar(select(func.coalesce(func.sum(models.InvoiceLine.amount),0.0)).where(models.InvoiceLine.job_id==j.id)) or 0
        material=db.scalar(select(func.coalesce(func.sum(models.InventoryTransaction.value),0.0)).where(models.InventoryTransaction.job_id==j.id,models.InventoryTransaction.txn_type.in_(["CONSUMPTION","WASTAGE"]))) or 0
        direct=db.scalar(select(func.coalesce(func.sum(models.Expense.amount),0.0)).where(models.Expense.related_type=="JOB",models.Expense.related_id==j.id,models.Expense.is_direct_cost==True)) or 0
        reshoot=db.scalar(select(func.coalesce(func.sum(models.PrintAttempt.estimated_cost),0.0)).join(models.JobFile,models.JobFile.id==models.PrintAttempt.job_file_id).where(models.JobFile.job_id==j.id,models.PrintAttempt.is_reshoot==True)) or 0
        cost=material+direct+reshoot
        rows.append({"job":j.number,"customer":j.customer.name,"weight_g":j.billable_weight_g,"revenue":round(revenue,2),"direct_cost":round(cost,2),"gross_profit":round(revenue-cost,2),"margin_pct":round((revenue-cost)/revenue*100,2) if revenue else 0})
    return rows

@router.get("/inbox")
def inbox(db:Db):
    rows=db.scalars(select(models.InboxMessage).order_by(models.InboxMessage.id.desc())).all()
    return [{"id":m.id,"source":m.source,"sender":m.sender,"subject":m.subject,"received_at":m.received_at,"archived":m.archived,"status":m.status,"customer_id":m.customer_id,"job_id":m.job_id} for m in rows]

@router.post("/inbox/gmail/clear")
def clear_gmail_inbox(db:Db, admin:models.AppUser=Depends(auth.require_admin)):
    deleted = db.query(models.InboxMessage).filter(models.InboxMessage.source == "gmail").delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": deleted}

@router.post("/inbox/manual-upload")
async def manual_inbox_upload(db:Db, source:str=Form("whatsapp"), customer_id:int=Form(...), sender:str=Form(""), message:str=Form(""), quantity:int=Form(1), upload:UploadFile=File(...)):
    c=db.get(models.Customer,customer_id)
    if not c: raise HTTPException(404,"Customer not found")
    j=models.Job(number=next_code(db,models.Job,"WJ"),customer_id=customer_id,source=source,status="FILES_RECEIVED")
    db.add(j); db.flush()
    msg=models.InboxMessage(source=source,sender=sender or c.whatsapp or c.email,subject=f"{source.title()} file intake",body=message,customer_id=customer_id,job_id=j.id,archived=True,status="IMPORTED")
    db.add(msg); db.flush()
    path,digest,size=await save_upload(j.number,upload,"original")
    count=db.scalar(select(func.count()).select_from(models.JobFile)) or 0
    f=models.JobFile(job_id=j.id,file_uid=f"F-{count+1:06d}",original_name=upload.filename or "file",original_path=path,sha256=digest,quantity=quantity,status="RECEIVED")
    db.add(f); j.status="WAITING_MAGICS"; db.commit(); db.refresh(j)
    return {"job_id":j.id,"job_number":j.number,"file_id":f.file_uid,"archived":True}

@router.get("/integrations/gmail/status")
def gmail_status():
    return gmail_service.status()

@router.post("/settings/gmail")
def save_gmail_settings(data: schemas.GmailSettingsUpdate, admin: models.AppUser = Depends(auth.require_admin)):
    try:
        gmail = gmail_service.configure(**data.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True, "message": "Gmail settings saved.", "gmail": gmail}

@router.post("/settings/gmail/test")
def test_gmail_settings(admin: models.AppUser = Depends(auth.require_admin)):
    return gmail_service.test_connection()

@router.post("/integrations/gmail/push")
def gmail_push(payload:dict, db:Db):
    # Pub/Sub webhook receipt is intentionally lightweight in the starter.
    db.add(models.AuditLog(module="gmail",action="PUSH_RECEIVED",details=str(payload)[:2000],user_name="gmail")); db.commit()
    return {"ok":True}

@router.post("/integrations/gmail/reconcile")
def gmail_reconcile(db:Db):
    return gmail_service.reconcile(db)

@router.get("/magics/agent/jobs")
def agent_jobs(db:Db, x_agent_token:Annotated[str|None,Header()]=None):
    if x_agent_token != settings.agent_token: raise HTTPException(401,"Invalid agent token")
    rows=db.scalars(select(models.Job).where(models.Job.status=="WAITING_MAGICS").order_by(models.Job.id)).all()
    return [{"id":j.id,"number":j.number,"customer":j.customer.name} for j in rows]
