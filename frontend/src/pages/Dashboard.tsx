import {ReactNode, useEffect, useMemo, useState} from 'react'
import {AlertTriangle, BadgeCheck, BarChart3, Boxes, BriefcaseBusiness, IndianRupee, PackageCheck, ReceiptText, RefreshCcw, Scale, TrendingUp, WalletCards} from 'lucide-react'
import {getJson} from '../api'
import {Dashboard as D, Job} from '../types'

type Quality={expected_pieces:number;good_pieces:number;bad_pieces:number;first_pass_yield_pct:number;internal_reshoot_tickets:number;customer_return_reshoots:number}
type Material={id:number;code:string;name:string;unit:string;stock:number;minimum_stock:number}
type Expense={id:number;date:string;category:string;description:string;amount:number;is_direct_cost:boolean;related_type:string;related_id?:number}
type Reshoot={id:number;number:string;source:string;reason:string;quantity:number;responsibility:string;chargeable:boolean;status:string}
type JobProfit={job:string;customer:string;weight_g:number;revenue:number;direct_cost:number;gross_profit:number;margin_pct:number}
type BusinessData={dashboard:D;quality:Quality;jobs:Job[];materials:Material[];expenses:Expense[];reshoots:Reshoot[];profitability:JobProfit[]}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const pct=(part:number,total:number)=>total?Math.round(part/total*100):0
const openStatuses=new Set(['FILES_RECEIVED','WAITING_MAGICS','MAGICS_REPAIR','READY_MACHINE_SOFTWARE','PLATFORM_READY','PRINTING','RESHOOT_PENDING','WEIGHT_PENDING','WEIGHT_COMPLETED','CUSTOMER_RETURN'])

export default function Dashboard({setPage}:{setPage:(page:string)=>void}){
 const[data,setData]=useState<BusinessData|null>(null)
 const[e,setE]=useState('')

 useEffect(()=>{
  Promise.all([
   getJson<D>('/api/dashboard'),
   getJson<Quality>('/api/reports/quality'),
   getJson<Job[]>('/api/jobs'),
   getJson<Material[]>('/api/materials'),
   getJson<Expense[]>('/api/expenses'),
   getJson<Reshoot[]>('/api/reshoots'),
   getJson<JobProfit[]>('/api/reports/job-profitability')
  ]).then(([dashboard,quality,jobs,materials,expenses,reshoots,profitability])=>setData({dashboard,quality,jobs,materials,expenses,reshoots,profitability})).catch(x=>setE(String(x)))
 },[])

 const summary=useMemo(()=>data?buildSummary(data):null,[data])
 if(e)return <div className="panel error">{e}</div>
 if(!data||!summary)return <div className="panel">Loading overall business dashboard...</div>

 const {dashboard,quality,jobs,materials,expenses,reshoots,profitability}=data
 const p=dashboard.pnl
 const today=new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date())

 return <>
  <section className="heroPanel businessHero">
   <div>
    <p className="eyebrow">Overall Business</p>
    <h1>Business Dashboard</h1>
    <span>Sales, profit, production, quality, inventory, expenses and cash position in one place.</span>
   </div>
   <div className="heroActions">
    <div className={`healthPill ${summary.healthTone}`}>{summary.healthLabel}</div>
    <div className="datePill">{today}</div>
   </div>
  </section>

  <div className="cards businessCards">
   <Card t="Net Sales" v={money(p.net_sales)} note={`${p.period} period`} icon={<IndianRupee size={21}/>} onClick={()=>setPage('reports')}/>
   <Card t="Net Profit" v={money(p.net_operating_profit)} note={`${summary.netMargin}% net margin`} icon={<TrendingUp size={21}/>} tone={p.net_operating_profit>=0?'good':'bad'} onClick={()=>setPage('reports')}/>
   <Card t="Customer Outstanding" v={money(dashboard.cash.customer_outstanding)} note="Receivable balance" icon={<WalletCards size={21}/>} tone={dashboard.cash.customer_outstanding>0?'warn':'good'} onClick={()=>setPage('billing')}/>
   <Card t="Active Jobs" v={summary.activeJobs} note={`${jobs.length} total jobs`} icon={<BriefcaseBusiness size={21}/>} onClick={()=>setPage('jobs')}/>
   <Card t="Quality Yield" v={`${quality.first_pass_yield_pct}%`} note={`${quality.good_pieces}/${quality.expected_pieces} good pieces`} icon={<BadgeCheck size={21}/>} tone={quality.first_pass_yield_pct>=90?'good':'warn'} onClick={()=>setPage('qc')}/>
   <Card t="Low Stock" v={summary.lowStock.length} note={`${materials.length} material masters`} icon={<Boxes size={21}/>} tone={summary.lowStock.length?'bad':'good'} onClick={()=>setPage('inventory')}/>
   <Card t="Open Reshoots" v={summary.openReshoots} note={`${reshoots.length} total tickets`} icon={<RefreshCcw size={21}/>} tone={summary.openReshoots?'warn':'good'} onClick={()=>setPage('reshoots')}/>
   <Card t="Billable Weight" v={`${p.successful_billable_weight_g}g`} note={`${money(p.cost_per_gram)} cost/g`} icon={<Scale size={21}/>} onClick={()=>setPage('weight')}/>
  </div>

  <div className="overviewGrid">
   <section className="panel financePanel">
    <div className="panelHead"><h2>Financial Snapshot</h2><small>{p.period}</small></div>
    <div className="financeGrid">
     <Figure label="Gross Profit" value={money(p.gross_profit)} tone={p.gross_profit>=0?'good':'bad'}/>
     <Figure label="Direct Cost" value={money(p.direct_production_cost)} sub={`${summary.directCostPct}% of sales`}/>
     <Figure label="Company Overhead" value={money(p.company_overhead)} sub={`${summary.overheadPct}% of sales`}/>
     <Figure label="Supplier Payable" value={money(dashboard.cash.supplier_payable)} tone={dashboard.cash.supplier_payable?'warn':'good'}/>
    </div>
    <div className="marginBars">
     <Meter label="Gross margin" value={summary.grossMargin} tone="green"/>
     <Meter label="Net margin" value={summary.netMargin} tone={summary.netMargin>=0?'green':'red'}/>
    </div>
   </section>

   <section className="panel actionPanel">
    <div className="panelHead"><h2>Action Needed</h2><small>Priority</small></div>
    <div className="actionList">{summary.actions.map((a,i)=><div className={`actionItem ${a.tone}`} key={i}><a.icon size={18}/><span>{a.text}</span><b>{a.value}</b></div>)}</div>
   </section>

   <section className="panel span2">
    <div className="panelHead"><h2>Operations Flow</h2><small>Jobs by stage</small></div>
    <div className="stageGrid">{summary.stages.map(s=><button className="stageCard clickableStat" type="button" onClick={()=>setPage(s.page)} key={s.label}><small>{s.label}</small><strong>{s.count}</strong><span>{s.hint}</span></button>)}</div>
   </section>

   <section className="panel">
    <div className="panelHead"><h2>Quality & Reshoots</h2><small>Live</small></div>
    <div className="qualityScore"><strong>{quality.first_pass_yield_pct}%</strong><span>First-pass yield</span></div>
    <Meter label="Good pieces" value={pct(quality.good_pieces,quality.expected_pieces)} tone="green"/>
    <div className="miniStats"><span>Expected <b>{quality.expected_pieces}</b></span><span>Bad <b>{quality.bad_pieces}</b></span><span>Internal RS <b>{quality.internal_reshoot_tickets}</b></span><span>Customer RS <b>{quality.customer_return_reshoots}</b></span></div>
   </section>

   <section className="panel">
    <div className="panelHead"><h2>Inventory Health</h2><small>{summary.lowStock.length} alerts</small></div>
    <div className="inventoryList">{materials.slice(0,5).map(m=><div className="inventoryRow" key={m.id}><span><b>{m.name}</b><small>{m.code}</small></span><strong>{m.stock} {m.unit}</strong>{m.stock<=m.minimum_stock?<em className="badText">LOW</em>:<em>OK</em>}</div>)}</div>
   </section>

   <section className="panel">
    <div className="panelHead"><h2>Expense Split</h2><small>{money(summary.totalExpenses)}</small></div>
    <div className="splitBars">
     <Meter label="Direct expenses" value={pct(summary.directExpense,summary.totalExpenses)} tone="red" caption={money(summary.directExpense)}/>
     <Meter label="Overhead expenses" value={pct(summary.overheadExpense,summary.totalExpenses)} tone="amber" caption={money(summary.overheadExpense)}/>
    </div>
    <div className="categoryList">{summary.expenseCategories.map(c=><p key={c.name}><span>{c.name}</span><b>{money(c.amount)}</b></p>)}</div>
   </section>

   <section className="panel">
    <div className="panelHead"><h2>Recent Job Profitability</h2><small>Top 5</small></div>
    <div className="profitList">{profitability.slice(0,5).map(j=><div className="profitRow" key={j.job}><span><b>{j.job}</b><small>{j.customer}</small></span><strong>{money(j.gross_profit)}</strong><em className={j.margin_pct>=0?'':'badText'}>{j.margin_pct}%</em></div>)}</div>
   </section>
  </div>
 </>
}

function buildSummary(data:BusinessData){
 const {dashboard,quality,jobs,materials,expenses,reshoots}=data
 const p=dashboard.pnl
 const activeJobs=jobs.filter(j=>openStatuses.has(j.status)).length
 const openReshoots=reshoots.filter(r=>r.status!=='CLOSED').length
 const lowStock=materials.filter(m=>m.stock<=m.minimum_stock)
 const directExpense=expenses.filter(e=>e.is_direct_cost).reduce((sum,e)=>sum+e.amount,0)
 const overheadExpense=expenses.filter(e=>!e.is_direct_cost).reduce((sum,e)=>sum+e.amount,0)
 const totalExpenses=directExpense+overheadExpense
 const grossMargin=pct(p.gross_profit,p.net_sales)
 const netMargin=pct(p.net_operating_profit,p.net_sales)
 const directCostPct=pct(p.direct_production_cost,p.net_sales)
 const overheadPct=pct(p.company_overhead,p.net_sales)
 const byCategory=expenses.reduce<Record<string,number>>((acc,e)=>({...acc,[e.category]:(acc[e.category]||0)+e.amount}),{})
 const expenseCategories=Object.entries(byCategory).map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount).slice(0,4)
 const stages=[
  {label:'Intake',count:countJobs(jobs,['FILES_RECEIVED','WAITING_MAGICS']),hint:'Files received',page:'inbox'},
  {label:'Magics',count:countJobs(jobs,['MAGICS_REPAIR','READY_MACHINE_SOFTWARE']),hint:'Repair/check',page:'magics'},
  {label:'Production',count:countJobs(jobs,['PLATFORM_READY','PRINTING']),hint:'Platform/print',page:'printing'},
  {label:'QC & Weight',count:countJobs(jobs,['RESHOOT_PENDING','WEIGHT_PENDING','WEIGHT_COMPLETED']),hint:'Finish work',page:'qc'},
  {label:'Dispatch/Billing',count:countJobs(jobs,['DISPATCHED','INVOICED']),hint:'Cash cycle',page:'dispatch'}
 ]
 const actions=[
  dashboard.cash.customer_outstanding>0?{text:'Collect pending customer payments',value:money(dashboard.cash.customer_outstanding),tone:'warn',icon:ReceiptText}:null,
  lowStock.length?{text:'Reorder low-stock materials',value:String(lowStock.length),tone:'bad',icon:Boxes}:null,
  openReshoots?{text:'Close open reshoot tickets',value:String(openReshoots),tone:'warn',icon:RefreshCcw}:null,
  dashboard.counts.printing?{text:'Monitor active prints',value:String(dashboard.counts.printing),tone:'good',icon:PackageCheck}:null,
  !dashboard.cash.customer_outstanding&&!lowStock.length&&!openReshoots?{text:'Business is clear for the next production push',value:'OK',tone:'good',icon:BadgeCheck}:null
 ].filter(Boolean) as {text:string;value:string;tone:string;icon:typeof BadgeCheck}[]
 const healthLabel=p.net_operating_profit<0?'Profit Risk':lowStock.length||openReshoots?'Needs Attention':'Healthy'
 const healthTone=p.net_operating_profit<0?'bad':lowStock.length||openReshoots?'warn':'good'
 return {activeJobs,openReshoots,lowStock,directExpense,overheadExpense,totalExpenses,grossMargin,netMargin,directCostPct,overheadPct,expenseCategories,stages,actions,healthLabel,healthTone}
}

function countJobs(jobs:Job[],statuses:string[]){return jobs.filter(j=>statuses.includes(j.status)).length}

function Card({t,v,note,icon,tone='',onClick}:{t:string;v:string|number;note:string;icon:ReactNode;tone?:'good'|'warn'|'bad'|'';onClick:()=>void}){
 return <button className={`card metricCard clickableStat ${tone}`} type="button" onClick={onClick}><div className="metricIcon">{icon}</div><small>{t}</small><strong>{v}</strong><em>{note}</em></button>
}

function Figure({label,value,sub,tone=''}:{label:string;value:string;sub?:string;tone?:'good'|'warn'|'bad'|''}){
 return <div className={`figureBox ${tone}`}><small>{label}</small><strong>{value}</strong>{sub&&<span>{sub}</span>}</div>
}

function Meter({label,value,tone,caption}:{label:string;value:number;tone:'green'|'red'|'amber';caption?:string}){
 const width=Math.max(0,Math.min(Math.abs(value),100))
 return <div className="meter"><div><span>{label}</span><b>{caption||`${value}%`}</b></div><i><em className={tone} style={{width:`${width}%`}}></em></i></div>
}
