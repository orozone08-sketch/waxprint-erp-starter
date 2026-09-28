import {useEffect,useState} from 'react'
import {getJson} from '../api'
import {Pnl} from '../types'
import {jumpTo} from '../ui'

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)

type Q={expected_pieces:number;good_pieces:number;bad_pieces:number;first_pass_yield_pct:number;internal_reshoot_tickets:number;customer_return_reshoots:number}
type J={job:string;customer:string;weight_g:number;revenue:number;direct_cost:number;gross_profit:number;margin_pct:number}

export default function Reports(){
 const[p,setP]=useState<Pnl|null>(null)
 const[q,setQ]=useState<Q|null>(null)
 const[jobs,setJobs]=useState<J[]>([])

 useEffect(()=>{
  getJson<Pnl>('/api/reports/pnl').then(setP)
  getJson<Q>('/api/reports/quality').then(setQ)
  getJson<J[]>('/api/reports/job-profitability').then(setJobs)
 },[])

 return <>
  {p&&<section className="panel" id="profit-loss">
   <h2>Profit & Loss - {p.period}</h2>
   <div className="reportGrid">
    <R l="Net Sales" v={money(p.net_sales)}/>
    <R l="Material Consumed" v={money(p.material_consumed)}/>
    <R l="Other Direct Cost" v={money(p.other_direct_cost)}/>
    <R l="Reshoot Cost" v={money(p.reshoot_cost)}/>
    <R l="Direct Production Cost" v={money(p.direct_production_cost)}/>
    <R l="Cost / Gram" v={money(p.cost_per_gram)}/>
    <R l="Gross Profit" v={money(p.gross_profit)} strong/>
    <R l="Company Overhead" v={money(p.company_overhead)}/>
    <R l="Net Operating Profit" v={money(p.net_operating_profit)} strong/>
   </div>
  </section>}

  {q&&<section className="panel" id="quality-report">
   <h2>Quality & Reshoots</h2>
   <div className="cards">
    <ReportCard label="Expected Pieces" value={q.expected_pieces}/>
    <ReportCard label="Good Pieces" value={q.good_pieces}/>
    <ReportCard label="Bad Pieces" value={q.bad_pieces}/>
    <ReportCard label="First-pass Yield" value={`${q.first_pass_yield_pct}%`} tone="good"/>
    <ReportCard label="Internal Reshoots" value={q.internal_reshoot_tickets}/>
    <ReportCard label="Customer Return Reshoots" value={q.customer_return_reshoots}/>
   </div>
  </section>}

  <section className="panel" id="job-profitability">
   <h2>Job Profitability</h2>
   <table><thead><tr><th>Job</th><th>Customer</th><th>Weight</th><th>Revenue</th><th>Direct Cost</th><th>Gross Profit</th><th>Margin</th></tr></thead><tbody>{jobs.map(j=><tr key={j.job}><td>{j.job}</td><td>{j.customer}</td><td>{j.weight_g}g</td><td>{money(j.revenue)}</td><td>{money(j.direct_cost)}</td><td>{money(j.gross_profit)}</td><td>{j.margin_pct}%</td></tr>)}</tbody></table>
  </section>
 </>
}

function R({l,v,strong=false}:{l:string;v:string;strong?:boolean}){return <button className={strong?'reportLine strong clickableStat':'reportLine clickableStat'} type="button" onClick={()=>jumpTo('profit-loss')}><span>{l}</span><b>{v}</b></button>}
function ReportCard({label,value,tone=''}:{label:string;value:string|number;tone?:'good'|''}){return <button className={`card clickableStat ${tone}`} type="button" onClick={()=>jumpTo('quality-report')}><small>{label}</small><strong>{value}</strong></button>}
