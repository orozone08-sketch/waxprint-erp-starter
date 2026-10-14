import {useEffect, useState} from 'react'
import {BadgeCheck, Clock3, FolderOpen, Play, RefreshCw, Wrench, XCircle} from 'lucide-react'
import {getJson, postJson} from '../api'
import {jumpTo} from '../ui'

type MagicsSession={id:number;operator:string;workstation:string;status:string;checker:string|null;approved:boolean;started_at:string;completed_at:string|null}
type MagicsFile={id:number;name:string;processed:boolean;original_url:string;download_url:string}
type MagicsJob={id:number;number:string;customer:string;source:string;priority:string;status:string;received_at:string;file_count:number;processed_file_count:number;files:MagicsFile[];latest_session:MagicsSession|null}
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
   <div className="setupCard"><FolderOpen size={19}/><span><b>Magics PC bridge</b><small>Run the included Python bridge on the other PC where Magics is installed.</small></span></div>
   <button className="setupCard clickableStat" type="button" onClick={()=>jumpTo('magics-queue')}><BadgeCheck size={19}/><span><b>Approval gate</b><small>Each job needs a processed file before checker approval.</small></span></button>
  </div>

  <div className="magicsInstructions" style={{margin:'14px 0',lineHeight:1.65}}>
   <b>Connect the PC with Magics</b><br/>
   On that PC, copy the <code>magics_agent</code> folder from this project. In PowerShell, open that folder and run <code>py -m pip install -r requirements.txt</code>. Copy <code>.env.example</code> to <code>.env</code>, then enter the ERP URL, the same AGENT_TOKEN configured as a Cloudflare Worker secret, and company ID <code>1</code> (Aditya) or <code>2</code> (Sunmoon). Start the bridge with <code>py agent.py</code> and keep it running. Open each downloaded file from its job's <code>Original</code> folder in Magics, save the repaired version to that job's <code>Processed</code> folder as <code>file-id__original-name.stl</code>, and the bridge uploads it. Magics itself stays on its installed PC.
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
    <tbody>{queue.map(j=><tr key={j.id}><td><b>{j.number}</b><small className="mutedCell">{j.priority}</small></td><td>{j.customer}</td><td><b>{j.processed_file_count}/{j.file_count} processed</b>{j.files.map(f=><small className="mutedCell" key={f.id}>{f.name} · <a href={f.original_url}>Original</a>{f.processed&&<> · <a href={f.download_url}>Magics output</a></>}</small>)}</td><td><span className="badge">{pretty(j.status)}</span></td><td>{j.latest_session?<span>{j.latest_session.operator}<small className="mutedCell">{pretty(j.latest_session.status)}</small></span>:'-'}</td><td><Actions job={j} disabled={loading} start={()=>run(()=>postJson(`/api/jobs/${j.id}/magics/start`,{operator_name:operator,workstation}),`${j.number} Magics repair started.`)} approve={()=>run(()=>postJson(`/api/jobs/${j.id}/magics/complete`,{checker_name:checker,approved:true}),`${j.number} approved by checker.`)} reject={()=>run(()=>postJson(`/api/jobs/${j.id}/magics/complete`,{checker_name:checker,approved:false}),`${j.number} sent back for repair.`)}/></td></tr>)}</tbody>
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
 if(job.latest_session?.status==='STARTED'||job.status==='MAGICS_REPAIR')return <div className="rowActions"><button className="miniBtn good" onClick={approve} disabled={disabled||job.file_count===0||job.processed_file_count<job.file_count} title={job.processed_file_count<job.file_count?'Waiting for processed files from the Magics PC':''}><BadgeCheck size={14}/>Approve</button><button className="miniBtn warn" onClick={reject} disabled={disabled}><XCircle size={14}/>Reject</button></div>
 return <button className="miniBtn" onClick={start} disabled={disabled}><Play size={14}/>Start</button>
}

function Stat({label,value,onClick}:{label:string;value:number;onClick:()=>void}){return <button className="inboxStat clickableStat" type="button" onClick={onClick}><small>{label}</small><strong>{value}</strong></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
function formatDate(value:string){const d=new Date(value);return Number.isNaN(d.valueOf())?value:new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(d)}
