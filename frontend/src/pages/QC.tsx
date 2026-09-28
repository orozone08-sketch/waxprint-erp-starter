import {useEffect, useMemo, useState} from 'react'
import {BadgeCheck, CircleAlert, ClipboardCheck, RefreshCw, RotateCcw, XCircle} from 'lucide-react'
import {getJson, postJson} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'

type Quality={expected_pieces:number;good_pieces:number;bad_pieces:number;first_pass_yield_pct:number;internal_reshoot_tickets:number;customer_return_reshoots:number}
type PrintAttempt={id:number;file_id:number;platform_id:number;machine_id:number|null;attempt_no:number;is_reshoot:boolean;status:string;expected_qty:number;good_qty:number;bad_qty:number;reason:string|null;production_weight_g:number;estimated_cost:number}
type JobFile={id:number;file_uid:string;name:string;status:string;quantity:number;sha256:string|null}
type JobDetail={job:Job;files:JobFile[]}
type Reshoot={id:number;number:string;job_id:number;file_id:number;source:string;reason:string;quantity:number;responsibility:string;chargeable:boolean;status:string}

const reasons=['BROKEN','INCOMPLETE','MISSING','DEFORMED','SURFACE ISSUE','SUPPORT DAMAGE']

export default function QC(){
 const[attempts,setAttempts]=useState<PrintAttempt[]>([])
 const[jobs,setJobs]=useState<Job[]>([])
 const[details,setDetails]=useState<JobDetail[]>([])
 const[quality,setQuality]=useState<Quality|null>(null)
 const[reshoots,setReshoots]=useState<Reshoot[]>([])
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=async()=>{
  const [attemptRows,jobRows,qualityRow,reshootRows]=await Promise.all([
   getJson<PrintAttempt[]>('/api/print-attempts'),
   getJson<Job[]>('/api/jobs'),
   getJson<Quality>('/api/reports/quality'),
   getJson<Reshoot[]>('/api/reshoots')
  ])
  const detailRows=await Promise.all(jobRows.map(j=>getJson<JobDetail>(`/api/jobs/${j.id}`)))
  setAttempts(attemptRows);setJobs(jobRows);setDetails(detailRows);setQuality(qualityRow);setReshoots(reshootRows)
 }

 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const fileLookup=useMemo(()=>{
  const map:Record<number,{job:Job;file:JobFile}>={}
  details.forEach(d=>d.files.forEach(f=>{map[f.id]={job:d.job,file:f}}))
  return map
 },[details])

 const queue=attempts.filter(a=>a.status==='PRINTING')
 const failed=attempts.filter(a=>a.status==='QC_FAILED')
 const passed=attempts.filter(a=>a.status==='QC_PASSED')
 const openReshoots=reshoots.filter(r=>r.status!=='CLOSED')

 const run=async(action:()=>Promise<unknown>,message:string)=>{
  setLoading(true);setError('');setNotice('')
  try{await action();setNotice(message);await load()}catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const pass=(attempt:PrintAttempt)=>run(()=>postJson(`/api/print-attempts/${attempt.id}/qc`,{good_qty:attempt.expected_qty||1,bad_qty:0,reason:null,create_reshoot:false}),`Attempt #${attempt.id} passed internal QC.`)
 const fail=(attempt:PrintAttempt,reason:string)=>run(()=>postJson(`/api/print-attempts/${attempt.id}/qc`,{good_qty:0,bad_qty:attempt.expected_qty||1,reason,create_reshoot:true,responsibility:'OUR_PRODUCTION'}),`Attempt #${attempt.id} failed QC and reshoot ticket was created.`)

 return <section className="panel">
  <div className="qcHeader">
   <div><h2>Internal QC</h2><p>Physical wax QC for good, broken, incomplete, missing or deformed pieces with automatic reshoot creation.</p></div>
   <button className="secondaryBtn" onClick={()=>load()} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<ClipboardCheck size={18}/>} label="QC Queue" value={queue.length} onClick={()=>jumpTo('qc-queue')}/>
   <Stat icon={<BadgeCheck size={18}/>} label="Passed" value={passed.length} onClick={()=>jumpTo('qc-history')}/>
   <Stat icon={<XCircle size={18}/>} label="Failed" value={failed.length} onClick={()=>jumpTo('qc-history')}/>
   <Stat icon={<RotateCcw size={18}/>} label="Open Reshoots" value={openReshoots.length} onClick={()=>jumpTo('qc-history')}/>
   <Stat icon={<CircleAlert size={18}/>} label="Yield" value={`${quality?.first_pass_yield_pct||0}%`} onClick={()=>jumpTo('qc-history')}/>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel" id="qc-queue">
   <div className="panelHead"><h2>QC Queue</h2><small>{queue.length} print attempt(s)</small></div>
   <div className="qcQueue">
    {queue.map(a=><QcCard key={a.id} attempt={a} context={fileLookup[a.file_id]} disabled={loading} onPass={()=>pass(a)} onFail={(reason)=>fail(a,reason)}/>)}
   </div>
   {!queue.length&&<div className="emptyState inboxEmpty"><ClipboardCheck size={30}/><p>No print attempts waiting for QC.</p></div>}
  </section>

  <section className="subPanel" id="qc-history">
   <div className="panelHead"><h2>QC History</h2><small>Latest attempts</small></div>
   <table>
    <thead><tr><th>Attempt</th><th>Job</th><th>File</th><th>Status</th><th>Good</th><th>Bad</th><th>Reason</th></tr></thead>
    <tbody>{attempts.map(a=>{const ctx=fileLookup[a.file_id];return <tr key={a.id}><td><b>#{a.id}</b><small className="mutedCell">Attempt {a.attempt_no}</small></td><td>{ctx?.job.number||'-'}<small className="mutedCell">{ctx?.job.customer||''}</small></td><td>{ctx?.file.name||`File #${a.file_id}`}</td><td><span className={a.status==='QC_PASSED'?'badge success':a.status==='QC_FAILED'?'badge danger':'badge'}>{pretty(a.status)}</span></td><td>{a.good_qty}</td><td>{a.bad_qty}</td><td>{a.reason||'-'}</td></tr>})}</tbody>
   </table>
  </section>
 </section>
}

function QcCard({attempt,context,disabled,onPass,onFail}:{attempt:PrintAttempt;context?:{job:Job;file:JobFile};disabled:boolean;onPass:()=>void;onFail:(reason:string)=>void}){
 const[reason,setReason]=useState(reasons[0])
 return <article className="qcCard">
  <div>
   <small>{context?.job.number||`File #${attempt.file_id}`}</small>
   <h3>{context?.job.customer||'Unlinked job'}</h3>
   <span>{context?.file.name||'No file name'} · {attempt.expected_qty||1} expected · {attempt.production_weight_g}g</span>
  </div>
  <div className="qcActions">
   <select value={reason} onChange={e=>setReason(e.target.value)}>{reasons.map(r=><option value={r} key={r}>{r}</option>)}</select>
   <button className="miniBtn good" disabled={disabled} onClick={onPass}><BadgeCheck size={14}/>Pass</button>
   <button className="miniBtn warn" disabled={disabled} onClick={()=>onFail(reason)}><XCircle size={14}/>Fail + Reshoot</button>
  </div>
 </article>
}

function Stat({icon,label,value,onClick}:{icon:React.ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
