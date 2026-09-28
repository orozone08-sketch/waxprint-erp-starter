import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {BadgeCheck, BadgeIndianRupee, IndianRupee, Plane, Plus, RefreshCw, Users, WalletCards} from 'lucide-react'
import {getJson, postJson} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'

type Employee={id:number;code:string;name:string;department:string;role:string;monthly_salary:number}
type Payroll={id:number;employee_id:number;employee_name:string;period:string;basic:number;bonus:number;commission:number;reimbursement:number;advance_deduction:number;other_deduction:number;net_payable:number;paid:boolean}
type StaffAdvance={id:number;employee_id:number;employee_name:string;job_id:number|null;job_number:string|null;advance_date:string;amount:number;purpose:string;period:string|null;status:string;notes:string|null}
type TravelRow={id:number;employee_id:number;employee_name:string;job_id:number|null;job_number:string|null;trip_date:string;destination:string;purpose:string;advance_amount:number;flight_amount:number;hotel_amount:number;taxi_amount:number;porter_amount:number;other_amount:number;settled_amount:number;total_expense:number;balance:number;status:string;notes:string|null}
type EmployeeForm={code:string;name:string;department:string;role:string;monthly_salary:string}
type PayrollForm={employee_id:string;period:string;basic:string;bonus:string;commission:string;reimbursement:string;advance_deduction:string;other_deduction:string;paid:boolean}
type AdvanceForm={employee_id:string;job_id:string;advance_date:string;amount:string;purpose:string;period:string;notes:string}
type TravelForm={employee_id:string;job_id:string;trip_date:string;destination:string;purpose:string;advance_amount:string;flight_amount:string;hotel_amount:string;taxi_amount:string;porter_amount:string;other_amount:string;settled_amount:string;notes:string}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0)
const today=()=>new Date().toISOString().slice(0,10)
const currentPeriod=()=>new Date().toISOString().slice(0,7)

export default function Travel({embedded=false}:{embedded?:boolean}={}){
 const[employees,setEmployees]=useState<Employee[]>([])
 const[jobs,setJobs]=useState<Job[]>([])
 const[payroll,setPayroll]=useState<Payroll[]>([])
 const[advances,setAdvances]=useState<StaffAdvance[]>([])
 const[travel,setTravel]=useState<TravelRow[]>([])
 const[employeeForm,setEmployeeForm]=useState<EmployeeForm>({code:'',name:'',department:'Production',role:'Operator',monthly_salary:''})
 const[payrollForm,setPayrollForm]=useState<PayrollForm>({employee_id:'',period:currentPeriod(),basic:'',bonus:'0',commission:'0',reimbursement:'0',advance_deduction:'0',other_deduction:'0',paid:false})
 const[commissionForm,setCommissionForm]=useState({employee_id:'',period:currentPeriod(),amount:'',paid:false})
 const[advanceForm,setAdvanceForm]=useState<AdvanceForm>({employee_id:'',job_id:'',advance_date:today(),amount:'',purpose:'Salary advance',period:currentPeriod(),notes:''})
 const[travelForm,setTravelForm]=useState<TravelForm>({employee_id:'',job_id:'',trip_date:today(),destination:'',purpose:'Customer visit',advance_amount:'0',flight_amount:'0',hotel_amount:'0',taxi_amount:'0',porter_amount:'0',other_amount:'0',settled_amount:'0',notes:''})
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=async()=>{
  setError('')
  const [employeeRows,jobRows,payrollRows,advanceRows,travelRows]=await Promise.all([getJson<Employee[]>('/api/employees'),getJson<Job[]>('/api/jobs'),getJson<Payroll[]>('/api/payroll'),getJson<StaffAdvance[]>('/api/advances'),getJson<TravelRow[]>('/api/travel')])
  setEmployees(employeeRows);setJobs(jobRows);setPayroll(payrollRows);setAdvances(advanceRows);setTravel(travelRows)
  if(employeeRows.length){
   const first=employeeRows[0]
   if(!payrollForm.employee_id)setPayrollForm(f=>({...f,employee_id:String(first.id),basic:String(first.monthly_salary||0)}))
   if(!commissionForm.employee_id)setCommissionForm(f=>({...f,employee_id:String(first.id)}))
   if(!advanceForm.employee_id)setAdvanceForm(f=>({...f,employee_id:String(first.id)}))
   if(!travelForm.employee_id)setTravelForm(f=>({...f,employee_id:String(first.id)}))
  }
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const employeeById=useMemo(()=>Object.fromEntries(employees.map(e=>[e.id,e])),[employees])
 const currentRows=payroll.filter(p=>p.period===payrollForm.period)
 const currentPayable=currentRows.reduce((sum,p)=>sum+p.net_payable,0)
 const payrollCommission=payroll.reduce((sum,p)=>sum+p.commission,0)
 const recoveredAdvance=payroll.reduce((sum,p)=>sum+p.advance_deduction,0)
 const staffAdvanceTotal=advances.reduce((sum,a)=>sum+a.amount,0)
 const staffAdvanceOutstanding=staffAdvanceTotal-recoveredAdvance
 const totalTravelAdvance=travel.reduce((sum,t)=>sum+t.advance_amount,0)
 const openTrips=travel.filter(t=>t.status!=='SETTLED')
 const draftPayrollNet=Number(payrollForm.basic||0)+Number(payrollForm.bonus||0)+Number(payrollForm.commission||0)+Number(payrollForm.reimbursement||0)-Number(payrollForm.advance_deduction||0)-Number(payrollForm.other_deduction||0)
 const draftTravelExpense=Number(travelForm.flight_amount||0)+Number(travelForm.hotel_amount||0)+Number(travelForm.taxi_amount||0)+Number(travelForm.porter_amount||0)+Number(travelForm.other_amount||0)
 const draftTravelBalance=Number(travelForm.advance_amount||0)+Number(travelForm.settled_amount||0)-draftTravelExpense

 const run=async(action:()=>Promise<unknown>,message:string)=>{
  setLoading(true);setError('');setNotice('')
  try{await action();setNotice(message);await load()}
  catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const selectPayrollEmployee=(id:string)=>{
  const employee=employeeById[Number(id)]
  setPayrollForm({...payrollForm,employee_id:id,basic:String(employee?.monthly_salary||0)})
 }

 const addEmployee=()=>{
  if(!employeeForm.name||!employeeForm.code){setError('Enter employee code and name.');return}
  return run(()=>postJson('/api/employees',{...employeeForm,monthly_salary:Number(employeeForm.monthly_salary)||0}),`${employeeForm.name} added to HR.`).then(()=>setEmployeeForm({code:'',name:'',department:'Production',role:'Operator',monthly_salary:''}))
 }

 const savePayroll=()=>{
  if(!payrollForm.employee_id){setError('Select an employee for payroll.');return}
  return run(()=>postJson('/api/payroll',{employee_id:Number(payrollForm.employee_id),period:payrollForm.period,basic:Number(payrollForm.basic)||0,bonus:Number(payrollForm.bonus)||0,commission:Number(payrollForm.commission)||0,reimbursement:Number(payrollForm.reimbursement)||0,advance_deduction:Number(payrollForm.advance_deduction)||0,other_deduction:Number(payrollForm.other_deduction)||0,paid:payrollForm.paid}),`Payroll saved. Net payable ${money(draftPayrollNet)}.`)
 }

 const saveCommission=()=>{
  const amount=Number(commissionForm.amount)||0
  if(!commissionForm.employee_id||amount<=0){setError('Select employee and enter commission amount.');return}
  const employee=employeeById[Number(commissionForm.employee_id)]
  return run(()=>postJson('/api/payroll',{employee_id:Number(commissionForm.employee_id),period:commissionForm.period,basic:0,bonus:0,commission:amount,reimbursement:0,advance_deduction:0,other_deduction:0,paid:commissionForm.paid}),`Commission saved for ${employee?.name||'employee'}.`).then(()=>setCommissionForm({...commissionForm,amount:'',paid:false}))
 }

 const saveAdvance=()=>{
  const amount=Number(advanceForm.amount)||0
  if(!advanceForm.employee_id||amount<=0){setError('Select employee and enter advance amount.');return}
  return run(()=>postJson('/api/advances',{employee_id:Number(advanceForm.employee_id),job_id:advanceForm.job_id?Number(advanceForm.job_id):null,advance_date:advanceForm.advance_date,amount,purpose:advanceForm.purpose,period:advanceForm.period||null,notes:advanceForm.notes||null}),`Advance of ${money(amount)} saved.`).then(()=>setAdvanceForm({...advanceForm,amount:'',purpose:'Salary advance',notes:''}))
 }

 const saveTravel=()=>{
  if(!travelForm.employee_id||!travelForm.destination||!travelForm.purpose){setError('Select employee and enter destination and purpose.');return}
  return run(()=>postJson('/api/travel',{employee_id:Number(travelForm.employee_id),job_id:travelForm.job_id?Number(travelForm.job_id):null,trip_date:travelForm.trip_date,destination:travelForm.destination,purpose:travelForm.purpose,advance_amount:Number(travelForm.advance_amount)||0,flight_amount:Number(travelForm.flight_amount)||0,hotel_amount:Number(travelForm.hotel_amount)||0,taxi_amount:Number(travelForm.taxi_amount)||0,porter_amount:Number(travelForm.porter_amount)||0,other_amount:Number(travelForm.other_amount)||0,settled_amount:Number(travelForm.settled_amount)||0,notes:travelForm.notes||null}),`Travel entry saved. ${draftTravelBalance===0?'Settled':'Balance '+money(draftTravelBalance)}.`).then(()=>setTravelForm({...travelForm,destination:'',purpose:'Customer visit',advance_amount:'0',flight_amount:'0',hotel_amount:'0',taxi_amount:'0',porter_amount:'0',other_amount:'0',settled_amount:'0',notes:''}))
 }

 return <section className={embedded?'expensePeopleCosts':'panel'}>
  <div className="travelHeader">
   <div><h2>{embedded?'Salary, Travel, Advance & Commission':'Advances'}</h2><p>Salary / HR, travel, staff advances and commission in one place.</p></div>
   <button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<Users size={18}/>} label="Employees" value={employees.length} onClick={()=>jumpTo('salary-hr')}/>
   <Stat icon={<BadgeIndianRupee size={18}/>} label="Salary Payable" value={money(currentPayable)} onClick={()=>jumpTo('salary-hr')}/>
   <Stat icon={<Plane size={18}/>} label="Travel Advances" value={money(totalTravelAdvance)} onClick={()=>jumpTo('travel-advances')}/>
   <Stat icon={<WalletCards size={18}/>} label="Staff Advances" value={money(staffAdvanceOutstanding)} onClick={()=>jumpTo('staff-advances')}/>
   <Stat icon={<IndianRupee size={18}/>} label="Commission" value={money(payrollCommission)} onClick={()=>jumpTo('commission')}/>
  </div>

  <div className="advanceTabs">
   <button type="button" onClick={()=>jumpTo('salary-hr')}><Users size={15}/>Salary / HR</button>
   <button type="button" onClick={()=>jumpTo('travel-advances')}><Plane size={15}/>Travel</button>
   <button type="button" onClick={()=>jumpTo('staff-advances')}><WalletCards size={15}/>Advance</button>
   <button type="button" onClick={()=>jumpTo('commission')}><IndianRupee size={15}/>Commission</button>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="hrGrid subPanel" id="salary-hr">
   <div>
    <div className="panelHead"><h2>Salary / HR</h2><small>{employees.length} employee(s)</small></div>
    <div className="employeeForm">
     <label>Code<input value={employeeForm.code} onChange={e=>setEmployeeForm({...employeeForm,code:e.target.value})} placeholder="EMP-0003"/></label>
     <label>Name<input value={employeeForm.name} onChange={e=>setEmployeeForm({...employeeForm,name:e.target.value})} placeholder="Employee name"/></label>
     <label>Department<input value={employeeForm.department} onChange={e=>setEmployeeForm({...employeeForm,department:e.target.value})}/></label>
     <label>Role<input value={employeeForm.role} onChange={e=>setEmployeeForm({...employeeForm,role:e.target.value})}/></label>
     <label>Monthly salary<input inputMode="decimal" value={employeeForm.monthly_salary} onChange={e=>setEmployeeForm({...employeeForm,monthly_salary:e.target.value})}/></label>
     <button className="primaryBtn" onClick={addEmployee} disabled={loading}><Plus size={16}/>Add Employee</button>
    </div>
   </div>

   <div>
    <div className="panelHead"><h2>Payroll Entry</h2><small>{payrollForm.period}</small></div>
    <div className="payrollBox">
     <label>Employee<select value={payrollForm.employee_id} onChange={e=>selectPayrollEmployee(e.target.value)}>{employees.map(e=><option key={e.id} value={e.id}>{e.name} / {e.role}</option>)}</select></label>
     <label>Period<input type="month" value={payrollForm.period} onChange={e=>setPayrollForm({...payrollForm,period:e.target.value})}/></label>
     <label>Basic salary<input inputMode="decimal" value={payrollForm.basic} onChange={e=>setPayrollForm({...payrollForm,basic:e.target.value})}/></label>
     <label>Bonus<input inputMode="decimal" value={payrollForm.bonus} onChange={e=>setPayrollForm({...payrollForm,bonus:e.target.value})}/></label>
     <label>Commission<input inputMode="decimal" value={payrollForm.commission} onChange={e=>setPayrollForm({...payrollForm,commission:e.target.value})}/></label>
     <label>Travel / reimbursement<input inputMode="decimal" value={payrollForm.reimbursement} onChange={e=>setPayrollForm({...payrollForm,reimbursement:e.target.value})}/></label>
     <label>Advance deduction<input inputMode="decimal" value={payrollForm.advance_deduction} onChange={e=>setPayrollForm({...payrollForm,advance_deduction:e.target.value})}/></label>
     <label>Other deduction<input inputMode="decimal" value={payrollForm.other_deduction} onChange={e=>setPayrollForm({...payrollForm,other_deduction:e.target.value})}/></label>
     <div className="payrollActions">
      <label><input type="checkbox" checked={payrollForm.paid} onChange={e=>setPayrollForm({...payrollForm,paid:e.target.checked})}/>Mark paid</label>
      <span>Net <b>{money(draftPayrollNet)}</b></span>
      <button className="primaryBtn" onClick={savePayroll} disabled={loading||!employees.length}><WalletCards size={16}/>Save Payroll</button>
     </div>
    </div>
   </div>
  </section>

  <section className="advanceGrid subPanel" id="staff-advances">
   <div>
    <div className="panelHead"><h2>Advance Entry</h2><small>Outstanding {money(staffAdvanceOutstanding)}</small></div>
    <div className="advanceForm">
     <label>Employee<select value={advanceForm.employee_id} onChange={e=>setAdvanceForm({...advanceForm,employee_id:e.target.value})}>{employees.map(e=><option key={e.id} value={e.id}>{e.name} / {e.role}</option>)}</select></label>
     <label>Job link<select value={advanceForm.job_id} onChange={e=>setAdvanceForm({...advanceForm,job_id:e.target.value})}><option value="">General advance</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.number} / {j.customer}</option>)}</select></label>
     <label>Date<input type="date" value={advanceForm.advance_date} onChange={e=>setAdvanceForm({...advanceForm,advance_date:e.target.value})}/></label>
     <label>Amount<input inputMode="decimal" value={advanceForm.amount} onChange={e=>setAdvanceForm({...advanceForm,amount:e.target.value})}/></label>
     <label>Deduct month<input type="month" value={advanceForm.period} onChange={e=>setAdvanceForm({...advanceForm,period:e.target.value})}/></label>
     <label className="wideField">Purpose<input value={advanceForm.purpose} onChange={e=>setAdvanceForm({...advanceForm,purpose:e.target.value})}/></label>
     <label className="wideField">Notes<input value={advanceForm.notes} onChange={e=>setAdvanceForm({...advanceForm,notes:e.target.value})} placeholder="Approval, payment mode, reference"/></label>
     <div className="advanceTotals"><span>Paid <b>{money(staffAdvanceTotal)}</b></span><span>Recovered <b>{money(recoveredAdvance)}</b></span><span>Outstanding <b>{money(staffAdvanceOutstanding)}</b></span></div>
     <button className="primaryBtn" onClick={saveAdvance} disabled={loading||!employees.length}><WalletCards size={16}/>Save Advance</button>
    </div>
   </div>

   <div>
    <div className="panelHead"><h2>Open Advances</h2><small>{advances.length} record(s)</small></div>
    <div className="travelCards">
     {advances.slice(0,6).map(a=><article className="travelCard" key={a.id}><WalletCards size={18}/><span><b>{a.employee_name}</b><small>{a.purpose} / {a.advance_date}</small></span><strong>{money(a.amount)}</strong></article>)}
     {!advances.length&&<div className="emptyState"><BadgeCheck size={28}/><p>No staff advances yet.</p></div>}
    </div>
   </div>
  </section>

  <section className="advanceGrid subPanel" id="commission">
   <div>
    <div className="panelHead"><h2>Commission</h2><small>Total {money(payrollCommission)}</small></div>
    <div className="commissionForm">
     <label>Employee<select value={commissionForm.employee_id} onChange={e=>setCommissionForm({...commissionForm,employee_id:e.target.value})}>{employees.map(e=><option key={e.id} value={e.id}>{e.name} / {e.role}</option>)}</select></label>
     <label>Period<input type="month" value={commissionForm.period} onChange={e=>setCommissionForm({...commissionForm,period:e.target.value})}/></label>
     <label>Commission amount<input inputMode="decimal" value={commissionForm.amount} onChange={e=>setCommissionForm({...commissionForm,amount:e.target.value})}/></label>
     <label><input type="checkbox" checked={commissionForm.paid} onChange={e=>setCommissionForm({...commissionForm,paid:e.target.checked})}/>Mark paid</label>
     <button className="primaryBtn" onClick={saveCommission} disabled={loading||!employees.length}><IndianRupee size={16}/>Save Commission</button>
    </div>
   </div>
   <div>
    <div className="panelHead"><h2>Commission Ledger</h2><small>{payroll.filter(p=>p.commission>0).length} entry(s)</small></div>
    <div className="travelCards">
     {payroll.filter(p=>p.commission>0).slice(0,6).map(p=><article className="travelCard" key={p.id}><IndianRupee size={18}/><span><b>{p.employee_name}</b><small>{p.period} / {p.paid?'Paid':'Unpaid'}</small></span><strong>{money(p.commission)}</strong></article>)}
     {!payroll.some(p=>p.commission>0)&&<div className="emptyState"><BadgeCheck size={28}/><p>No commission entries yet.</p></div>}
    </div>
   </div>
  </section>

  <section className="travelGrid subPanel" id="travel-advances">
   <div>
    <div className="panelHead"><h2>Travel Entry</h2><small>{openTrips.length} open trip(s)</small></div>
    <div className="travelForm">
     <label>Employee<select value={travelForm.employee_id} onChange={e=>setTravelForm({...travelForm,employee_id:e.target.value})}>{employees.map(e=><option key={e.id} value={e.id}>{e.name} / {e.role}</option>)}</select></label>
     <label>Job link<select value={travelForm.job_id} onChange={e=>setTravelForm({...travelForm,job_id:e.target.value})}><option value="">General company trip</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.number} / {j.customer}</option>)}</select></label>
     <label>Date<input type="date" value={travelForm.trip_date} onChange={e=>setTravelForm({...travelForm,trip_date:e.target.value})}/></label>
     <label>Destination<input value={travelForm.destination} onChange={e=>setTravelForm({...travelForm,destination:e.target.value})} placeholder="Mumbai / Surat / Jaipur"/></label>
     <label className="wideField">Purpose<input value={travelForm.purpose} onChange={e=>setTravelForm({...travelForm,purpose:e.target.value})}/></label>
     <label>Advance<input inputMode="decimal" value={travelForm.advance_amount} onChange={e=>setTravelForm({...travelForm,advance_amount:e.target.value})}/></label>
     <label>Flight<input inputMode="decimal" value={travelForm.flight_amount} onChange={e=>setTravelForm({...travelForm,flight_amount:e.target.value})}/></label>
     <label>Hotel<input inputMode="decimal" value={travelForm.hotel_amount} onChange={e=>setTravelForm({...travelForm,hotel_amount:e.target.value})}/></label>
     <label>Taxi<input inputMode="decimal" value={travelForm.taxi_amount} onChange={e=>setTravelForm({...travelForm,taxi_amount:e.target.value})}/></label>
     <label>Porter<input inputMode="decimal" value={travelForm.porter_amount} onChange={e=>setTravelForm({...travelForm,porter_amount:e.target.value})}/></label>
     <label>Other<input inputMode="decimal" value={travelForm.other_amount} onChange={e=>setTravelForm({...travelForm,other_amount:e.target.value})}/></label>
     <label>Settled / returned<input inputMode="decimal" value={travelForm.settled_amount} onChange={e=>setTravelForm({...travelForm,settled_amount:e.target.value})}/></label>
     <label className="wideField">Notes<input value={travelForm.notes} onChange={e=>setTravelForm({...travelForm,notes:e.target.value})} placeholder="Bill no, approval, trip note"/></label>
     <div className="travelPreview"><span>Total expense <b>{money(draftTravelExpense)}</b></span><span>Balance <b>{money(draftTravelBalance)}</b></span><span>{draftTravelBalance>=0?'Return due':'Claim due'} <b>{money(Math.abs(draftTravelBalance))}</b></span></div>
     <button className="primaryBtn" onClick={saveTravel} disabled={loading||!employees.length}><Plane size={16}/>Save Travel</button>
    </div>
   </div>

   <div>
    <div className="panelHead"><h2>Open Travel</h2><small>{openTrips.length} open</small></div>
    <div className="travelCards">
     {openTrips.slice(0,6).map(t=><article className="travelCard" key={t.id}><Plane size={18}/><span><b>{t.destination}</b><small>{t.employee_name} / {t.trip_date}</small></span><strong className={t.balance<0?'badAmount':''}>{money(t.balance)}</strong></article>)}
     {!openTrips.length&&<div className="emptyState"><BadgeCheck size={28}/><p>No open travel settlements.</p></div>}
    </div>
   </div>
  </section>

  <section className="ledgerSplit subPanel">
   <div>
    <div className="panelHead"><h2>Payroll History</h2><small>{payroll.length} record(s)</small></div>
    <table><thead><tr><th>Period</th><th>Employee</th><th>Salary</th><th>Commission</th><th>Advance</th><th>Net</th><th>Status</th></tr></thead><tbody>{payroll.map(p=><tr key={p.id}><td>{p.period}</td><td><b>{p.employee_name}</b></td><td>{money(p.basic)}</td><td>{money(p.commission)}</td><td>{money(p.advance_deduction)}</td><td>{money(p.net_payable)}</td><td><span className={p.paid?'badge success':'badge warn'}>{p.paid?'Paid':'Unpaid'}</span></td></tr>)}</tbody></table>
   </div>
   <div>
    <div className="panelHead"><h2>Advance Ledger</h2><small>{advances.length} record(s)</small></div>
    <table><thead><tr><th>Date</th><th>Employee</th><th>Purpose</th><th>Amount</th><th>Month</th></tr></thead><tbody>{advances.map(a=><tr key={a.id}><td>{a.advance_date}</td><td><b>{a.employee_name}</b><small className="mutedCell">{a.job_number||'General'}</small></td><td>{a.purpose}</td><td>{money(a.amount)}</td><td>{a.period||'-'}</td></tr>)}</tbody></table>
   </div>
  </section>

  <section className="subPanel">
   <div className="panelHead"><h2>Travel Ledger</h2><small>{travel.length} trip(s)</small></div>
   <table><thead><tr><th>Date</th><th>Employee</th><th>Destination</th><th>Job</th><th>Advance</th><th>Expense</th><th>Balance</th><th>Status</th></tr></thead><tbody>{travel.map(t=><tr key={t.id}><td>{t.trip_date}</td><td><b>{t.employee_name}</b><small className="mutedCell">{employeeById[t.employee_id]?.role||''}</small></td><td>{t.destination}<small className="mutedCell">{t.purpose}</small></td><td>{t.job_number||'General'}</td><td>{money(t.advance_amount)}</td><td>{money(t.total_expense)}</td><td>{money(t.balance)}</td><td><span className={t.status==='SETTLED'?'badge success':'badge warn'}>{pretty(t.status)}</span></td></tr>)}</tbody></table>
  </section>
 </section>
}

function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
