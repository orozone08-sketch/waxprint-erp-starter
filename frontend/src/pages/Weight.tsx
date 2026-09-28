import {useEffect, useMemo, useState} from 'react'
import {RefreshCw, Scale, WalletCards} from 'lucide-react'
import {getJson, postJson} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'

type Customer={id:number;code:string;name:string;email:string|null;whatsapp:string|null;default_rate:number;credit_days:number}
type JobProfit={job:string;customer:string;weight_g:number;revenue:number;direct_cost:number;gross_profit:number;margin_pct:number}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const weightStatuses=new Set(['WEIGHT_PENDING','WEIGHT_COMPLETED','QC_PASSED','PRINTING','RESHOOT_PENDING'])

export default function Weight({role}:{role:string}){
 const canSeeFinancial=role.toUpperCase()==='ADMIN'
 const[jobs,setJobs]=useState<Job[]>([])
 const[customers,setCustomers]=useState<Customer[]>([])
 const[profits,setProfits]=useState<JobProfit[]>([])
 const[weights,setWeights]=useState<Record<number,string>>({})
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=async()=>{
  const jobRows=await getJson<Job[]>('/api/jobs')
  const [customerRows,profitRows]=canSeeFinancial?await Promise.all([
   getJson<Customer[]>('/api/customers'),
   getJson<JobProfit[]>('/api/reports/job-profitability')
  ]):[[],[]] as [Customer[],JobProfit[]]
  setJobs(jobRows)
  setCustomers(customerRows)
  setProfits(profitRows)
  setWeights(Object.fromEntries(jobRows.map(job=>[job.id,job.billable_weight_g?String(job.billable_weight_g):''])))
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const customerById=useMemo(()=>Object.fromEntries(customers.map(c=>[c.id,c])),[customers])
 const active=jobs.filter(j=>weightStatuses.has(j.status)||j.billable_weight_g>0)
 const pending=active.filter(j=>!j.billable_weight_g||j.status==='WEIGHT_PENDING')
 const completed=jobs.filter(j=>j.billable_weight_g>0)
 const billableTotal=completed.reduce((sum,j)=>sum+j.billable_weight_g,0)
 const revenueTotal=canSeeFinancial?completed.reduce((sum,j)=>sum+j.billable_weight_g*(customerById[j.customer_id]?.default_rate||0),0):0

 const saveWeight=async(job:Job)=>{
  const value=Number(weights[job.id])
  if(!value||value<=0){setError('Enter a valid billable weight.');return}
  setLoading(true);setError('');setNotice('')
  try{await postJson(`/api/jobs/${job.id}/weight`,{billable_weight_g:value});setNotice(`${job.number} weight saved.`);await load()}catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 return <section className="panel">
  <div className="weightHeader">
   <div><h2>Weight</h2><p>{canSeeFinancial?'Enter final billable customer weight separately from reshoot production weight and preview billing.':'Enter final billable customer weight separately from reshoot production weight.'}</p></div>
   <button className="secondaryBtn" onClick={()=>load()} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<Scale size={18}/>} label="Pending Weight" value={pending.length} onClick={()=>jumpTo('weight-entry')}/>
   <Stat icon={<Scale size={18}/>} label="Billable Weight" value={`${round(billableTotal)}g`} onClick={()=>jumpTo('weight-history')}/>
   <Stat icon={<RefreshCw size={18}/>} label="Reshoot Weight" value={`${round(jobs.reduce((s,j)=>s+j.reshoot_weight_g,0))}g`} onClick={()=>jumpTo('weight-history')}/>
   {canSeeFinancial&&<Stat icon={<WalletCards size={18}/>} label="Billing Preview" value={money(revenueTotal)} onClick={()=>jumpTo('weight-history')}/>}
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel" id="weight-entry">
   <div className="panelHead"><h2>Weight Entry</h2><small>{active.length} job(s)</small></div>
   <div className="weightCards">
    {active.map(j=>{
     const customer=customerById[j.customer_id]
     const rate=customer?.default_rate||0
     const preview=(Number(weights[j.id])||0)*rate
     const profit=profits.find(p=>p.job===j.number)
     return <article className="weightCard" key={j.id}>
      <div><small>{j.number}</small><h3>{j.customer}</h3><span>{pretty(j.status)} - Reshoot production {j.reshoot_weight_g}g</span></div>
      <label>Billable weight (g)<input value={weights[j.id]||''} onChange={e=>setWeights({...weights,[j.id]:e.target.value})} inputMode="decimal"/></label>
      {canSeeFinancial?
       <div className="weightPreview"><span>Rate <b>{money(rate)}/g</b></span><span>Bill <b>{money(preview)}</b></span><span>Profit <b>{money(profit?.gross_profit||0)}</b></span></div>:
       <div className="weightPreview"><span>Billable <b>{Number(weights[j.id])||0}g</b></span><span>Reshoot <b>{j.reshoot_weight_g}g</b></span><span>Status <b>{pretty(j.status)}</b></span></div>}
      <button className="miniBtn" disabled={loading} onClick={()=>saveWeight(j)}><Scale size={14}/>Save Weight</button>
     </article>
    })}
   </div>
   {!active.length&&<div className="emptyState inboxEmpty"><Scale size={30}/><p>No jobs ready for weight entry.</p></div>}
  </section>

  <section className="subPanel" id="weight-history">
   <div className="panelHead"><h2>Weight History</h2><small>Completed jobs</small></div>
   <table>
    <thead><tr><th>Job</th><th>Customer</th><th>Billable</th><th>Reshoot</th>{canSeeFinancial&&<th>Rate</th>}{canSeeFinancial&&<th>Billing</th>}<th>Status</th></tr></thead>
    <tbody>{completed.map(j=>{const c=customerById[j.customer_id];return <tr key={j.id}><td><b>{j.number}</b></td><td>{j.customer}</td><td>{j.billable_weight_g}g</td><td>{j.reshoot_weight_g}g</td>{canSeeFinancial&&<td>{money(c?.default_rate||0)}/g</td>}{canSeeFinancial&&<td>{money(j.billable_weight_g*(c?.default_rate||0))}</td>}<td><span className="badge success">{pretty(j.status)}</span></td></tr>})}</tbody>
   </table>
  </section>
 </section>
}

function Stat({icon,label,value,onClick}:{icon:React.ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
function round(value:number){return Number(value.toFixed(2))}
