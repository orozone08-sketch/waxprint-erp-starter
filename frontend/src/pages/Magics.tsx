import {useEffect, useState} from 'react'
import {BadgeCheck, Clock3, FolderOpen, Play, RefreshCw, Wrench, XCircle} from 'lucide-react'
import {getJson, postJson} from '../api'
import {jumpTo} from '../ui'

type MagicsSession={id:number;operator:string;workstation:string;status:string;checker:string|null;approved:boolean;started_at:string;completed_at:string|null}
type MagicsJob={id:number;number:string;customer:string;source:string;priority:string;status:string;received_at:string;file_count:number;latest_session:MagicsSession|null}
type SessionRow=MagicsSession&{job_id:number;job_number:string;customer:string;job_status:string}

export default function Magics(){
 const[queue,setQueue]=useState<MagicsJob[]>([])
 const[sessions,setSessions]=useState<SessionRow[]>([])
 const[operator,setOperator]=useState('Magics Operator')
 const[workstation,setWorkstation]=useState('MAGICS-PC-01')
 const[checker,setChecker]=useState('Senior Checker')
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=()=>Promise.all([getJson<MagicsJob[]>('/api/magics/queue'),getJson<SessionRow[]>('/api/magics/sessions')]).then(([q,s])=>{setQueue(q);setSessions(s)})
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const run=async(action:()=>Promise<unknown>,message:string)=>{
  setLoading(true);setError('');setNotice('')
  try{await action();setNotice(message);await load()}catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const active=queue.filter(j=>j.status==='MAGICS_REPAIR'||j.latest_session?.status==='STARTED')
 const ready=queue.filter(j=>j.status==='READY_MACHINE_SOFTWARE')
 const waiting=queue.filter(j=>j.status==='WAITING_MAGICS')

 return <section className="panel">
  <div className="magicsHeader">
   <div><h2>Magics Software Integration</h2><p>Local bridge for Materialise Magics repair, operator sessions and senior checker approval.</p></div>
   <button className="secondaryBtn" onClick={()=>load()} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="magicsSetup">
   <button className="setupCard clickableStat" type="button" onClick={()=>jumpTo('magics-queue')}><Wrench size={19}/><span><b>ERP queue</b><small>{queue.length} job(s) visible for Magics workflow</small></span></button>
   <button className="setupCard clickableStat" type="button" onClick={()=>jumpTo('magics-history')}><FolderOpen size={19}/><span><b>Local agent</b><small>Run `python agent.py` from `magics_agent` on the Magics PC</small></span></button>
   <button className="setupCard clickableStat" type="button" onClick={()=>jumpTo('magics-queue')}><BadgeCheck size={19}/><span><b>Approval gate</b><small>Approved jobs move to machine-software platform preparation</small></span></button>
  </div>

  <div className="magicsForm">
   <label>Operator<input value={operator} onChange={e=>setOperator(e.target.value)}/></label>
   <label>Workstation<input value={workstation} onChange={e=>setWorkstation(e.target.value)}/></label>
   <label>Checker<input value={checker} onChange={e=>setChecker(e.target.value)}/></label>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <div className="magicsStats">
   <Stat label="Waiting" value={waiting.length} onClick={()=>jumpTo('magics-queue')}/>
   <Stat label="In Repair" value={active.length} onClick={()=>jumpTo('magics-queue')}/>
   <Stat label="Approved" value={ready.length} onClick={()=>jumpTo('magics-queue')}/>
   <Stat label="Sessions" value={sessions.length} onClick={()=>jumpTo('magics-history')}/>
  </div>

  <section className="subPanel" id="magics-queue">
   <div className="panelHead"><h2>Repair Queue</h2><small>Waiting and active jobs</small></div>
   <table>
    <thead><tr><th>Job</th><th>Customer</th><th>Files</th><th>Status</th><th>Latest Session</th><th>Action</th></tr></thead>
    <tbody>{queue.map(j=><tr key={j.id}><td><b>{j.number}</b><small className="mutedCell">{j.priority}</small></td><td>{j.customer}</td><td>{j.file_count}</td><td><span className="badge">{pretty(j.status)}</span></td><td>{j.latest_session?<span>{j.latest_session.operator}<small className="mutedCell">{pretty(j.latest_session.status)}</small></span>:'-'}</td><td><Actions job={j} disabled={loading} start={()=>run(()=>postJson(`/api/jobs/${j.id}/magics/start`,{operator_name:operator,workstation}),`${j.number} Magics repair started.`)} approve={()=>run(()=>postJson(`/api/jobs/${j.id}/magics/complete`,{checker_name:checker,approved:true}),`${j.number} approved by checker.`)} reject={()=>run(()=>postJson(`/api/jobs/${j.id}/magics/complete`,{checker_name:checker,approved:false}),`${j.number} sent back for repair.`)}/></td></tr>)}</tbody>
   </table>
   {!queue.length&&<div className="emptyState inboxEmpty"><Clock3 size={30}/><p>No jobs waiting for Magics.</p></div>}
  </section>

  <section className="subPanel" id="magics-history">
   <div className="panelHead"><h2>Session History</h2><small>Latest first</small></div>
   <table>
    <thead><tr><th>Job</th><th>Customer</th><th>Operator</th><th>Workstation</th><th>Status</th><th>Checker</th><th>Started</th></tr></thead>
    <tbody>{sessions.map(s=><tr key={s.id}><td><b>{s.job_number}</b></td><td>{s.customer}</td><td>{s.operator}</td><td>{s.workstation}</td><td><span className={s.status==='APPROVED'?'badge success':s.status==='REPAIR_REQUIRED'?'badge warn':'badge'}>{pretty(s.status)}</span></td><td>{s.checker||'-'}</td><td>{formatDate(s.started_at)}</td></tr>)}</tbody>
   </table>
  </section>
 </section>
}

function Actions({job,disabled,start,approve,reject}:{job:MagicsJob;disabled:boolean;start:()=>void;approve:()=>void;reject:()=>void}){
 if(job.status==='READY_MACHINE_SOFTWARE')return <span className="ok">Approved</span>
 if(job.latest_session?.status==='STARTED'||job.status==='MAGICS_REPAIR')return <div className="rowActions"><button className="miniBtn good" onClick={approve} disabled={disabled}><BadgeCheck size={14}/>Approve</button><button className="miniBtn warn" onClick={reject} disabled={disabled}><XCircle size={14}/>Reject</button></div>
 return <button className="miniBtn" onClick={start} disabled={disabled}><Play size={14}/>Start</button>
}

function Stat({label,value,onClick}:{label:string;value:number;onClick:()=>void}){return <button className="inboxStat clickableStat" type="button" onClick={onClick}><small>{label}</small><strong>{value}</strong></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
function formatDate(value:string){const d=new Date(value);return Number.isNaN(d.valueOf())?value:new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(d)}
