import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {BadgeIndianRupee, Plus, RefreshCw, UserRound, Users, WalletCards} from 'lucide-react'
import {getJson, postJson} from '../api'
import {jumpTo} from '../ui'

type Employee={id:number;code:string;name:string;department:string;role:string;monthly_salary:number}
type Payroll={id:number;employee_id:number;employee_name:string;period:string;basic:number;bonus:number;commission:number;reimbursement:number;advance_deduction:number;other_deduction:number;net_payable:number;paid:boolean}
type EmployeeForm={code:string;name:string;department:string;role:string;monthly_salary:string}
type PayrollForm={employee_id:string;period:string;basic:string;bonus:string;commission:string;reimbursement:string;advance_deduction:string;other_deduction:string;paid:boolean}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0)
const currentPeriod=()=>new Date().toISOString().slice(0,7)

export default function Employees(){
 const[employees,setEmployees]=useState<Employee[]>([])
 const[payroll,setPayroll]=useState<Payroll[]>([])
 const[employeeForm,setEmployeeForm]=useState<EmployeeForm>({code:'',name:'',department:'Production',role:'Operator',monthly_salary:''})
 const[payrollForm,setPayrollForm]=useState<PayrollForm>({employee_id:'',period:currentPeriod(),basic:'',bonus:'0',commission:'0',reimbursement:'0',advance_deduction:'0',other_deduction:'0',paid:false})
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=async()=>{
  setError('')
  const [employeeRows,payrollRows]=await Promise.all([getJson<Employee[]>('/api/employees'),getJson<Payroll[]>('/api/payroll')])
  setEmployees(employeeRows);setPayroll(payrollRows)
  if(employeeRows.length&&!payrollForm.employee_id){
   const first=employeeRows[0]
   setPayrollForm(f=>({...f,employee_id:String(first.id),basic:String(first.monthly_salary||0)}))
  }
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const employeeById=useMemo(()=>Object.fromEntries(employees.map(e=>[e.id,e])),[employees])
 const monthlySalary=employees.reduce((sum,e)=>sum+e.monthly_salary,0)
 const currentRows=payroll.filter(p=>p.period===payrollForm.period)
 const currentPayable=currentRows.reduce((sum,p)=>sum+p.net_payable,0)
 const paidThisPeriod=currentRows.filter(p=>p.paid).reduce((sum,p)=>sum+p.net_payable,0)
 const draftNet=Number(payrollForm.basic||0)+Number(payrollForm.bonus||0)+Number(payrollForm.commission||0)+Number(payrollForm.reimbursement||0)-Number(payrollForm.advance_deduction||0)-Number(payrollForm.other_deduction||0)

 const addEmployee=async()=>{
  if(!employeeForm.name||!employeeForm.code){setError('Enter employee code and name.');return}
  setLoading(true);setError('');setNotice('')
  try{
   await postJson('/api/employees',{...employeeForm,monthly_salary:Number(employeeForm.monthly_salary)||0})
   setNotice(`${employeeForm.name} added to HR.`)
   setEmployeeForm({code:'',name:'',department:'Production',role:'Operator',monthly_salary:''})
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const savePayroll=async()=>{
  if(!payrollForm.employee_id){setError('Select an employee for payroll.');return}
  setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<{net_payable:number}>('/api/payroll',{employee_id:Number(payrollForm.employee_id),period:payrollForm.period,basic:Number(payrollForm.basic)||0,bonus:Number(payrollForm.bonus)||0,commission:Number(payrollForm.commission)||0,reimbursement:Number(payrollForm.reimbursement)||0,advance_deduction:Number(payrollForm.advance_deduction)||0,other_deduction:Number(payrollForm.other_deduction)||0,paid:payrollForm.paid})
   setNotice(`Payroll saved. Net payable ${money(result.net_payable)}.`)
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const selectEmployee=(id:string)=>{
  const employee=employeeById[Number(id)]
  setPayrollForm({...payrollForm,employee_id:id,basic:String(employee?.monthly_salary||0)})
 }

 return <section className="panel">
  <div className="hrHeader">
   <div><h2>Salary / HR</h2><p>Employees, payroll, bonus, commission, advances and salary deductions.</p></div>
   <button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<Users size={18}/>} label="Employees" value={employees.length} onClick={()=>jumpTo('employees-list')}/>
   <Stat icon={<BadgeIndianRupee size={18}/>} label="Monthly Salary" value={money(monthlySalary)} onClick={()=>jumpTo('employees-list')}/>
   <Stat icon={<WalletCards size={18}/>} label="Period Payable" value={money(currentPayable)} onClick={()=>jumpTo('payroll-history')}/>
   <Stat icon={<UserRound size={18}/>} label="Paid" value={money(paidThisPeriod)} onClick={()=>jumpTo('payroll-history')}/>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="hrGrid subPanel" id="employee-payroll-entry">
   <div>
    <div className="panelHead"><h2>Add Employee</h2><small>Staff master</small></div>
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
     <label>Employee<select value={payrollForm.employee_id} onChange={e=>selectEmployee(e.target.value)}>{employees.map(e=><option key={e.id} value={e.id}>{e.name} / {e.role}</option>)}</select></label>
     <label>Period<input type="month" value={payrollForm.period} onChange={e=>setPayrollForm({...payrollForm,period:e.target.value})}/></label>
     <label>Basic<input inputMode="decimal" value={payrollForm.basic} onChange={e=>setPayrollForm({...payrollForm,basic:e.target.value})}/></label>
     <label>Bonus<input inputMode="decimal" value={payrollForm.bonus} onChange={e=>setPayrollForm({...payrollForm,bonus:e.target.value})}/></label>
     <label>Commission<input inputMode="decimal" value={payrollForm.commission} onChange={e=>setPayrollForm({...payrollForm,commission:e.target.value})}/></label>
     <label>Reimbursement<input inputMode="decimal" value={payrollForm.reimbursement} onChange={e=>setPayrollForm({...payrollForm,reimbursement:e.target.value})}/></label>
     <label>Advance deduction<input inputMode="decimal" value={payrollForm.advance_deduction} onChange={e=>setPayrollForm({...payrollForm,advance_deduction:e.target.value})}/></label>
     <label>Other deduction<input inputMode="decimal" value={payrollForm.other_deduction} onChange={e=>setPayrollForm({...payrollForm,other_deduction:e.target.value})}/></label>
     <div className="payrollActions">
      <label><input type="checkbox" checked={payrollForm.paid} onChange={e=>setPayrollForm({...payrollForm,paid:e.target.checked})}/>Mark paid</label>
      <span>Net <b>{money(draftNet)}</b></span>
      <button className="primaryBtn" onClick={savePayroll} disabled={loading||!employees.length}><WalletCards size={16}/>Save Payroll</button>
     </div>
    </div>
   </div>
  </section>

  <section className="subPanel" id="employees-list">
   <div className="panelHead"><h2>Employees</h2><small>{employees.length} active</small></div>
   <div className="employeeCards">
    {employees.map(e=><article className="employeeCard" key={e.id}><UserRound size={18}/><span><b>{e.name}</b><small>{e.code} / {e.department} / {e.role}</small></span><strong>{money(e.monthly_salary)}</strong></article>)}
   </div>
  </section>

  <section className="subPanel" id="payroll-history">
   <div className="panelHead"><h2>Payroll History</h2><small>{payroll.length} record(s)</small></div>
   <table><thead><tr><th>Period</th><th>Employee</th><th>Basic</th><th>Bonus</th><th>Commission</th><th>Advance</th><th>Net</th><th>Status</th></tr></thead><tbody>{payroll.map(p=><tr key={p.id}><td>{p.period}</td><td><b>{p.employee_name}</b></td><td>{money(p.basic)}</td><td>{money(p.bonus)}</td><td>{money(p.commission)}</td><td>{money(p.advance_deduction)}</td><td>{money(p.net_payable)}</td><td><span className={p.paid?'badge success':'badge warn'}>{p.paid?'Paid':'Unpaid'}</span></td></tr>)}</tbody></table>
  </section>
 </section>
}

function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
