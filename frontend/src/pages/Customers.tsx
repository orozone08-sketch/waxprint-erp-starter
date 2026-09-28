import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {Mail, MessageCircle, Plus, RefreshCw, ReceiptIndianRupee, Search, Users} from 'lucide-react'
import {getJson, postJson} from '../api'

type Customer={id:number;code:string;name:string;email:string|null;whatsapp:string|null;default_rate:number;credit_days:number}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0)

export default function Customers(){
 const[customers,setCustomers]=useState<Customer[]>([])
 const[form,setForm]=useState({name:'',email:'',whatsapp:'',default_rate:'300',credit_days:'30'})
 const[query,setQuery]=useState('')
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=async()=>{setError('');setCustomers(await getJson<Customer[]>('/api/customers'))}
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const filtered=useMemo(()=>{
  const term=query.trim().toLowerCase()
  if(!term)return customers
  return customers.filter(c=>[c.code,c.name,c.email,c.whatsapp,money(c.default_rate),`${c.credit_days}`].some(v=>String(v||'').toLowerCase().includes(term)))
 },[customers,query])

 const averageRate=customers.length?customers.reduce((sum,c)=>sum+(c.default_rate||0),0)/customers.length:0
 const addCustomer=async()=>{
  if(!form.name.trim())return
  setLoading(true);setError('');setNotice('')
  try{
   await postJson('/api/customers',{
    name:form.name.trim(),
    email:form.email.trim()||null,
    whatsapp:form.whatsapp.trim()||null,
    default_rate:Number(form.default_rate)||0,
    credit_days:Number(form.credit_days)||0
   })
   setNotice(`${form.name.trim()} customer added.`)
   setForm({name:'',email:'',whatsapp:'',default_rate:'300',credit_days:'30'})
   await load()
   document.getElementById('customer-list')?.scrollIntoView({behavior:'smooth',block:'start'})
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 return <section className="panel">
  <div className="customersHeader">
   <div><h2>Customers</h2><p>Add customer accounts, rates and contact details used by jobs and billing.</p></div>
   <button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats customerStats">
   <Stat icon={<Users size={18}/>} label="Customers" value={customers.length} onClick={()=>jumpTo('customer-list')}/>
   <Stat icon={<Mail size={18}/>} label="Email Saved" value={customers.filter(c=>c.email).length} onClick={()=>jumpTo('customer-list')}/>
   <Stat icon={<MessageCircle size={18}/>} label="WhatsApp Saved" value={customers.filter(c=>c.whatsapp).length} onClick={()=>jumpTo('customer-list')}/>
   <Stat icon={<ReceiptIndianRupee size={18}/>} label="Average Rate / g" value={money(averageRate)} onClick={()=>jumpTo('add-customer')}/>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section id="add-customer" className="subPanel">
   <div className="panelHead"><div><h2>Add Customer</h2><p>Create a customer once, then use the same account in job intake and billing.</p></div></div>
   <div className="settingsForm customerSettingsForm">
    <label>Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label>WhatsApp<input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/></label>
    <label>Rate / g<input inputMode="decimal" value={form.default_rate} onChange={e=>setForm({...form,default_rate:e.target.value})}/></label>
    <label>Credit days<input inputMode="numeric" value={form.credit_days} onChange={e=>setForm({...form,credit_days:e.target.value})}/></label>
    <button className="primaryBtn" onClick={addCustomer} disabled={loading||!form.name.trim()}><Plus size={16}/>Add Customer</button>
   </div>
  </section>

  <section id="customer-list" className="subPanel">
   <div className="customersListHead">
    <div><h2>Customer List</h2><p>{filtered.length} customer(s)</p></div>
    <label className="customerSearch"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search customers..." /></label>
   </div>
   <table>
    <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>WhatsApp</th><th>Rate / g</th><th>Credit</th></tr></thead>
    <tbody>
     {filtered.map(c=><tr key={c.id}><td><b>{c.code}</b></td><td>{c.name}</td><td>{c.email||'-'}</td><td>{c.whatsapp||'-'}</td><td>{money(c.default_rate)}</td><td>{c.credit_days} days</td></tr>)}
     {!filtered.length&&<tr><td colSpan={6}>No customers found.</td></tr>}
    </tbody>
   </table>
  </section>
 </section>
}

function jumpTo(id:string){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}
function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
