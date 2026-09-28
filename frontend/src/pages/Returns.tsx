import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {ClipboardList, RefreshCw, RotateCcw, Undo2, WalletCards} from 'lucide-react'
import {getJson, postJson} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'

type JobFile={id:number;file_uid:string;name:string;status:string;quantity:number;sha256:string|null}
type DispatchRow={id:number;number:string;courier:string|null;tracking_no:string|null;status:string}
type ReturnRow={id:number;number:string;file_id:number;dispatch_id:number|null;complaint:string;quantity:number;responsibility:string;chargeable:boolean;status:string;created_at:string}
type JobDetail={job:Job;files:JobFile[];dispatches:DispatchRow[];returns:ReturnRow[]}
type Reshoot={id:number;number:string;job_id:number;file_id:number;source:string;reason:string;quantity:number;responsibility:string;chargeable:boolean;status:string}
type Draft={fileId:number;dispatchId:number|null;complaint:string;quantity:number;responsibility:string;chargeable:boolean;createReshoot:boolean}

const responsibilities=['UNKNOWN','OUR_PRODUCTION','CUSTOMER','COURIER','DESIGN_FILE']
const defaultComplaint='Broken / missing pieces reported by customer'

export default function Returns(){
 const[jobs,setJobs]=useState<Job[]>([])
 const[details,setDetails]=useState<JobDetail[]>([])
 const[reshoots,setReshoots]=useState<Reshoot[]>([])
 const[drafts,setDrafts]=useState<Record<number,Draft>>({})
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=async()=>{
  setError('')
  const [jobRows,reshootRows]=await Promise.all([getJson<Job[]>('/api/jobs'),getJson<Reshoot[]>('/api/reshoots')])
  const detailRows=await Promise.all(jobRows.map(j=>getJson<JobDetail>(`/api/jobs/${j.id}`)))
  setJobs(jobRows);setDetails(detailRows);setReshoots(reshootRows)
  setDrafts(current=>{
   const next={...current}
   detailRows.forEach(d=>{
    if(!next[d.job.id]&&d.files.length){
     next[d.job.id]={fileId:d.files[0].id,dispatchId:d.dispatches[0]?.id||null,complaint:defaultComplaint,quantity:1,responsibility:'UNKNOWN',chargeable:false,createReshoot:true}
    }
   })
   return next
  })
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const returnJobs=useMemo(()=>jobs.filter(j=>{
  const d=details.find(x=>x.job.id===j.id)
  return j.status==='DISPATCHED'||j.status==='CUSTOMER_RETURN'||Boolean(d?.dispatches.length)||Boolean(d?.returns.length)
 }),[jobs,details])
 const allReturns=details.flatMap(d=>d.returns.map(r=>({return:r,job:d.job,files:d.files,dispatches:d.dispatches})))
 const customerReshoots=reshoots.filter(r=>r.source==='CUSTOMER_RETURN')
 const chargeable=allReturns.filter(r=>r.return.chargeable)

 const updateDraft=(jobId:number,patch:Partial<Draft>)=>setDrafts({...drafts,[jobId]:{...drafts[jobId],...patch}})

 const createReturn=async(job:Job)=>{
  const draft=drafts[job.id]
  if(!draft?.fileId){setError('Select a file before creating a return.');return}
  setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<{return_no:string;reshoot:string|null}>('/api/returns',{
    job_id:job.id,
    job_file_id:draft.fileId,
    dispatch_id:draft.dispatchId,
    complaint:draft.complaint,
    quantity:draft.quantity,
    responsibility:draft.responsibility,
    chargeable:draft.chargeable,
    create_reshoot:draft.createReshoot
   })
   setNotice(`${result.return_no} created for ${job.number}${result.reshoot?` with ${result.reshoot} replacement reshoot`:''}.`)
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 return <section className="panel">
  <div className="returnsHeader">
   <div><h2>Customer Returns</h2><p>Customer complaint, responsibility decision and replacement reshoot linked to the original file.</p></div>
   <button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<Undo2 size={18}/>} label="Open Returns" value={allReturns.filter(r=>r.return.status!=='CLOSED').length} onClick={()=>jumpTo('return-history')}/>
   <Stat icon={<RotateCcw size={18}/>} label="Replacement Reshoots" value={customerReshoots.length} onClick={()=>jumpTo('return-history')}/>
   <Stat icon={<WalletCards size={18}/>} label="Chargeable" value={chargeable.length} onClick={()=>jumpTo('return-history')}/>
   <Stat icon={<ClipboardList size={18}/>} label="Dispatched Jobs" value={returnJobs.length} onClick={()=>jumpTo('register-return')}/>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel" id="register-return">
   <div className="panelHead"><h2>Register Return</h2><small>{returnJobs.length} job(s)</small></div>
   <div className="returnsCards">
    {returnJobs.map(job=>{const detail=details.find(d=>d.job.id===job.id);const draft=drafts[job.id];return <article className="returnsCard" key={job.id}>
     <div className="returnsCardHead">
      <div><small>{job.number}</small><h3>{job.customer}</h3><span>{pretty(job.status)} / {detail?.dispatches[0]?.number||'No dispatch number'}</span></div>
      <span className={job.status==='CUSTOMER_RETURN'?'badge warn':'badge success'}>{detail?.returns.length||0} return(s)</span>
     </div>
     <div className="returnsForm">
      <label>Returned file<select value={draft?.fileId||''} onChange={e=>updateDraft(job.id,{fileId:Number(e.target.value)})}>{(detail?.files||[]).map(f=><option key={f.id} value={f.id}>{f.name} / Qty {f.quantity}</option>)}</select></label>
      <label>Dispatch<select value={draft?.dispatchId||''} onChange={e=>updateDraft(job.id,{dispatchId:e.target.value?Number(e.target.value):null})}><option value="">No dispatch link</option>{(detail?.dispatches||[]).map(d=><option key={d.id} value={d.id}>{d.number} / {d.courier||'Courier'}</option>)}</select></label>
      <label>Qty<input type="number" min="1" value={draft?.quantity||1} onChange={e=>updateDraft(job.id,{quantity:Number(e.target.value)||1})}/></label>
      <label>Responsibility<select value={draft?.responsibility||'UNKNOWN'} onChange={e=>updateDraft(job.id,{responsibility:e.target.value})}>{responsibilities.map(r=><option key={r} value={r}>{pretty(r)}</option>)}</select></label>
      <label className="wideField">Complaint<input value={draft?.complaint||''} onChange={e=>updateDraft(job.id,{complaint:e.target.value})}/></label>
      <div className="returnToggles">
       <label><input type="checkbox" checked={Boolean(draft?.chargeable)} onChange={e=>updateDraft(job.id,{chargeable:e.target.checked})}/>Charge customer</label>
       <label><input type="checkbox" checked={draft?.createReshoot!==false} onChange={e=>updateDraft(job.id,{createReshoot:e.target.checked})}/>Create reshoot</label>
      </div>
      <button className="miniBtn" onClick={()=>createReturn(job)} disabled={loading||!detail?.files.length}><Undo2 size={14}/>Create Return</button>
     </div>
    </article>})}
   </div>
   {!returnJobs.length&&<div className="emptyState inboxEmpty"><Undo2 size={30}/><p>No dispatched jobs available for customer return.</p></div>}
  </section>

  <section className="subPanel" id="return-history">
   <div className="panelHead"><h2>Return History</h2><small>Latest complaints</small></div>
   <table><thead><tr><th>Return</th><th>Job</th><th>File</th><th>Complaint</th><th>Qty</th><th>Responsibility</th><th>Chargeable</th><th>Status</th></tr></thead><tbody>{allReturns.map(row=>{const file=row.files.find(f=>f.id===row.return.file_id);return <tr key={row.return.id}><td><b>{row.return.number}</b></td><td>{row.job.number}<small className="mutedCell">{row.job.customer}</small></td><td>{file?.name||`File #${row.return.file_id}`}</td><td>{row.return.complaint}</td><td>{row.return.quantity}</td><td>{pretty(row.return.responsibility)}</td><td>{row.return.chargeable?'Yes':'No'}</td><td><span className="badge warn">{pretty(row.return.status)}</span></td></tr>})}</tbody></table>
  </section>
 </section>
}

function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
