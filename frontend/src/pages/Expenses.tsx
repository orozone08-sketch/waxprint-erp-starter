import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {BriefcaseBusiness, CheckCircle2, IndianRupee, Plus, ReceiptText, RefreshCw, WalletCards} from 'lucide-react'
import {getJson, postJson, type AppRole} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'
import Travel from './Travel'

type Expense={id:number;date:string;category:string;subcategory?:string|null;description:string;amount:number;is_direct_cost:boolean;related_type:string;related_id?:number|null;approved:boolean}
type Machine={id:number;code:string;name:string;model:string|null;serial_number:string|null;status:string}
type Employee={id:number;code:string;name:string;department:string;role:string;monthly_salary:number}
type ExpenseForm={expense_date:string;category:string;subcategory:string;description:string;amount:string;tax_amount:string;is_direct_cost:boolean;related_type:string;related_id:string;payment_mode:string}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n||0)
const today=()=>new Date().toISOString().slice(0,10)
const adminCategories=['Courier','Rent','Electricity','Machine Maintenance','Tools','Office','Salary / HR','Travel','Advance','Commission','Other']
const userCategories=['Courier','Electricity','Machine Maintenance','Tools','Office','Travel','Other']
const adminRelatedTypes=['GENERAL','JOB','MACHINE','EMPLOYEE']
const userRelatedTypes=['GENERAL','JOB','MACHINE']

export default function Expenses({role}:{role:AppRole|string}){
 const isAdmin=role.toUpperCase()==='ADMIN'
 const categories=isAdmin?adminCategories:userCategories
 const relatedTypes=isAdmin?adminRelatedTypes:userRelatedTypes
 const[expenses,setExpenses]=useState<Expense[]>([])
 const[jobs,setJobs]=useState<Job[]>([])
 const[machines,setMachines]=useState<Machine[]>([])
 const[employees,setEmployees]=useState<Employee[]>([])
 const[form,setForm]=useState<ExpenseForm>({expense_date:today(),category:'Courier',subcategory:'',description:'',amount:'',tax_amount:'0',is_direct_cost:true,related_type:'JOB',related_id:'',payment_mode:'BANK'})
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=async()=>{
  setError('')
  if(isAdmin){
   const [expenseRows,jobRows,machineRows,employeeRows]=await Promise.all([getJson<Expense[]>('/api/expenses'),getJson<Job[]>('/api/jobs'),getJson<Machine[]>('/api/machines'),getJson<Employee[]>('/api/employees')])
   setExpenses(expenseRows);setJobs(jobRows);setMachines(machineRows);setEmployees(employeeRows)
   return
  }
  const [jobRows,machineRows]=await Promise.all([getJson<Job[]>('/api/jobs'),getJson<Machine[]>('/api/machines')])
  setExpenses([]);setJobs(jobRows);setMachines(machineRows);setEmployees([])
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[isAdmin])

 const directTotal=expenses.filter(e=>e.is_direct_cost).reduce((s,e)=>s+e.amount,0)
 const overheadTotal=expenses.filter(e=>!e.is_direct_cost).reduce((s,e)=>s+e.amount,0)
 const monthTotal=expenses.filter(e=>String(e.date).slice(0,7)===today().slice(0,7)).reduce((s,e)=>s+e.amount,0)
 const relatedOptions=useMemo(()=>{
  if(form.related_type==='JOB')return jobs.map(j=>({id:j.id,label:`${j.number} / ${j.customer}`}))
  if(form.related_type==='MACHINE')return machines.map(m=>({id:m.id,label:`${m.name} / ${m.code}`}))
  if(form.related_type==='EMPLOYEE')return employees.map(e=>({id:e.id,label:`${e.name} / ${e.role}`}))
  return []
 },[form.related_type,jobs,machines,employees])

 const changeRelatedType=(value:string)=>{
  const direct=value==='JOB'||value==='MACHINE'
  setForm({...form,related_type:value,related_id:'',is_direct_cost:direct})
 }

 const saveExpense=async()=>{
  const amount=Number(form.amount)
  if(!form.description||!Number.isFinite(amount)||amount<=0){setError('Enter description and valid amount.');return}
  setLoading(true);setError('');setNotice('')
  try{
   await postJson('/api/expenses',{expense_date:form.expense_date,category:form.category,subcategory:form.subcategory||null,description:form.description,amount,tax_amount:Number(form.tax_amount)||0,is_direct_cost:form.is_direct_cost,related_type:form.related_type,related_id:form.related_id?Number(form.related_id):null,payment_mode:form.payment_mode})
   setNotice(isAdmin?`${form.category} expense saved.`:`${form.category} expense submitted for admin approval.`)
   setForm({...form,description:'',amount:'',tax_amount:'0',subcategory:''})
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const approveExpense=async(id:number)=>{
  setLoading(true);setError('');setNotice('')
  try{
   await postJson(`/api/expenses/${id}/approve`,{})
   setNotice('Expense approved.')
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 return <section className="panel">
  <div className="expensesHeader">
   <div><h2>Expenses</h2><p>{isAdmin?'Classify every expense as direct production cost or company overhead and link it where applicable.':'Submit production and office expenses for admin review.'}</p></div>
   <button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  {isAdmin&&<div className="platformStats">
   <Stat icon={<ReceiptText size={18}/>} label="Entries" value={expenses.length} onClick={()=>jumpTo('expense-ledger')}/>
   <Stat icon={<BriefcaseBusiness size={18}/>} label="Direct Cost" value={money(directTotal)} onClick={()=>jumpTo('expense-ledger')}/>
   <Stat icon={<WalletCards size={18}/>} label="Overhead" value={money(overheadTotal)} onClick={()=>jumpTo('expense-ledger')}/>
   <Stat icon={<IndianRupee size={18}/>} label="This Month" value={money(monthTotal)} onClick={()=>jumpTo('expense-ledger')}/>
   <Stat icon={<WalletCards size={18}/>} label="Staff Costs" value="Open" onClick={()=>jumpTo('expense-staff-costs')}/>
  </div>}

  {isAdmin&&<div className="advanceTabs expenseQuickTabs">
   <button type="button" onClick={()=>jumpTo('add-expense')}><ReceiptText size={15}/>General Expense</button>
   <button type="button" onClick={()=>jumpTo('salary-hr')}><WalletCards size={15}/>Salary / HR</button>
   <button type="button" onClick={()=>jumpTo('travel-advances')}><WalletCards size={15}/>Travel</button>
   <button type="button" onClick={()=>jumpTo('staff-advances')}><WalletCards size={15}/>Advance</button>
   <button type="button" onClick={()=>jumpTo('commission')}><IndianRupee size={15}/>Commission</button>
  </div>}

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel" id="add-expense">
   <div className="panelHead"><h2>Add Expense</h2><small>Direct or overhead</small></div>
   <div className="expenseForm">
    <label>Date<input type="date" value={form.expense_date} onChange={e=>setForm({...form,expense_date:e.target.value})}/></label>
    <label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
    <label>Subcategory<input value={form.subcategory} onChange={e=>setForm({...form,subcategory:e.target.value})} placeholder="Optional"/></label>
    <label>Amount<input inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
    <label>Tax<input inputMode="decimal" value={form.tax_amount} onChange={e=>setForm({...form,tax_amount:e.target.value})}/></label>
    <label>Payment<select value={form.payment_mode} onChange={e=>setForm({...form,payment_mode:e.target.value})}><option>BANK</option><option>UPI</option><option>CASH</option><option>CHEQUE</option></select></label>
    <label>Related to<select value={form.related_type} onChange={e=>changeRelatedType(e.target.value)}>{relatedTypes.map(type=><option key={type}>{type}</option>)}</select></label>
    <label>Record<select value={form.related_id} onChange={e=>setForm({...form,related_id:e.target.value})} disabled={!relatedOptions.length}><option value="">No specific record</option>{relatedOptions.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    <label className="wideField">Description<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Office rent / wax courier / machine repair"/></label>
    <div className="expenseActions">
     <label><input type="checkbox" checked={form.is_direct_cost} onChange={e=>setForm({...form,is_direct_cost:e.target.checked})}/>Direct production cost</label>
     <span>{form.is_direct_cost?'Job / production cost':'Company overhead'}</span>
     <button className="primaryBtn" onClick={saveExpense} disabled={loading}><Plus size={16}/>Add Expense</button>
    </div>
   </div>
  </section>

  {isAdmin&&<section className="subPanel" id="expense-ledger">
   <div className="panelHead"><h2>Expense Ledger</h2><small>{expenses.length} record(s)</small></div>
   <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Cost Type</th><th>Related To</th><th>Status</th><th>Action</th></tr></thead><tbody>{expenses.map(e=><tr key={e.id}><td>{e.date}</td><td>{e.category}<small className="mutedCell">{e.subcategory||''}</small></td><td>{e.description}</td><td>{money(e.amount)}</td><td>{e.is_direct_cost?'Direct':'Overhead'}</td><td>{e.related_type}{e.related_id?` #${e.related_id}`:''}</td><td><span className={e.approved?'badge success':'badge warn'}>{e.approved?'Approved':'Pending'}</span></td><td>{e.approved?'-':<button className="miniBtn good" type="button" disabled={loading} onClick={()=>approveExpense(e.id)}><CheckCircle2 size={14}/>Approve</button>}</td></tr>)}</tbody></table>
  </section>}

  {isAdmin&&<section className="subPanel" id="expense-staff-costs">
   <Travel embedded/>
  </section>}
 </section>
}

function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
