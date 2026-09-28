import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {CheckSquare, ImagePlus, PackageCheck, RefreshCw, Truck} from 'lucide-react'
import {getJson, openFile, postForm} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'

type JobDetail={
 job:Job
 files:{id:number;name:string;quantity:number;status:string}[]
 dispatches:{id:number;number:string;courier:string|null;tracking_no:string|null;packed_by:string|null;checked_by:string|null;delivered_by:string|null;packing_photo_name:string|null;packing_photo_url:string|null;status:string}[]
}

const shipStatuses=new Set(['WEIGHT_COMPLETED','INVOICED','DISPATCHED'])
const defaultStaff={packedBy:'Packing Team',checkedBy:'Final QC',deliveredBy:'Delivery Team'}

function loadStaff(){
 try{
  const saved=window.localStorage.getItem('waxprint.dispatchStaff')
  return saved?{...defaultStaff,...JSON.parse(saved)}:defaultStaff
 }catch{
  return defaultStaff
 }
}

export default function Dispatch({role}:{role:string}){
 const[jobs,setJobs]=useState<Job[]>([])
 const[details,setDetails]=useState<JobDetail[]>([])
 const[courier,setCourier]=useState<Record<number,string>>({})
 const[tracking,setTracking]=useState<Record<number,string>>({})
 const[packingPhoto,setPackingPhoto]=useState<Record<number,File|null>>({})
 const[packedBy,setPackedBy]=useState(()=>loadStaff().packedBy)
 const[checkedBy,setCheckedBy]=useState(()=>loadStaff().checkedBy)
 const[deliveredBy,setDeliveredBy]=useState(()=>loadStaff().deliveredBy)
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const canSeeHistory=role.toUpperCase()==='ADMIN'

 const load=async()=>{
  setError('')
  const jobRows=await getJson<Job[]>('/api/jobs')
  const detailRows=await Promise.all(jobRows.map(j=>getJson<JobDetail>(`/api/jobs/${j.id}`)))
  setJobs(jobRows);setDetails(detailRows)
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])
 useEffect(()=>{window.localStorage.setItem('waxprint.dispatchStaff',JSON.stringify({packedBy,checkedBy,deliveredBy}))},[packedBy,checkedBy,deliveredBy])

 const rows=useMemo(()=>jobs.filter(j=>shipStatuses.has(j.status)||details.find(d=>d.job.id===j.id)?.dispatches.length),[jobs,details])
 const ready=rows.filter(j=>j.status==='WEIGHT_COMPLETED'||j.status==='INVOICED')
 const dispatched=rows.filter(j=>j.status==='DISPATCHED'||details.find(d=>d.job.id===j.id)?.dispatches.length)

 const createDispatch=async(job:Job)=>{
  setLoading(true);setError('');setNotice('')
  try{
   const form=new FormData()
   form.append('job_id',String(job.id))
   form.append('courier',courier[job.id]||'')
   form.append('tracking_no',tracking[job.id]||'')
   form.append('packed_by',packedBy)
   form.append('checked_by',checkedBy)
   form.append('delivered_by',deliveredBy)
   if(packingPhoto[job.id])form.append('packing_photo',packingPhoto[job.id] as File)
   const result=await postForm<{number:string;packing_photo_name?:string|null}>('/api/dispatches/with-photo',form)
   setNotice(`${result.number} created for ${job.number}${result.packing_photo_name?` with ${result.packing_photo_name}`:''}.`)
   setPackingPhoto({...packingPhoto,[job.id]:null})
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }
 const uploadHistoryPhoto=async(dispatchId:number,file:File|null)=>{
  if(!file)return
  setLoading(true);setError('');setNotice('')
  try{
   const form=new FormData()
   form.append('packing_photo',file)
   const result=await postForm<{number:string;packing_photo_name:string}>(`/api/dispatches/${dispatchId}/packing-photo`,form)
   setNotice(`${result.packing_photo_name} saved for ${result.number}.`)
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 return <section className="panel">
  <div className="dispatchHeader">
   <div><h2>Packing / Dispatch</h2><p>Packing checklist, dispatch manifest, courier and tracking for completed jobs.</p></div>
   <button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<PackageCheck size={18}/>} label="Ready to Dispatch" value={ready.length} onClick={()=>jumpTo('dispatch-queue')}/>
   {canSeeHistory&&<Stat icon={<Truck size={18}/>} label="Dispatched" value={dispatched.length} onClick={()=>jumpTo('dispatch-history')}/>}
   <Stat icon={<CheckSquare size={18}/>} label="Packed By" value={packedBy} onClick={()=>jumpTo('dispatch-staff')}/>
   <Stat icon={<Truck size={18}/>} label="Delivered By" value={deliveredBy} onClick={()=>jumpTo('dispatch-staff')}/>
  </div>

  <div className="dispatchStaff" id="dispatch-staff">
   <label>Packed by<input value={packedBy} onChange={e=>setPackedBy(e.target.value)}/></label>
   <label>Checked by<input value={checkedBy} onChange={e=>setCheckedBy(e.target.value)}/></label>
   <label>Delivered by<input value={deliveredBy} onChange={e=>setDeliveredBy(e.target.value)}/></label>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel" id="dispatch-queue">
   <div className="panelHead"><h2>Dispatch Queue</h2><small>{ready.length} job(s)</small></div>
   <div className="dispatchCards">
    {ready.map(j=>{const d=details.find(x=>x.job.id===j.id);return <article className="dispatchCard" key={j.id}>
     <div><small>{j.number}</small><h3>{j.customer}</h3><span>{j.billable_weight_g}g billable / {d?.files.length||0} file(s)</span></div>
     <label>Courier<input value={courier[j.id]||''} onChange={e=>setCourier({...courier,[j.id]:e.target.value})} placeholder="Blue Dart / hand delivery"/></label>
     <label>Tracking No<input value={tracking[j.id]||''} onChange={e=>setTracking({...tracking,[j.id]:e.target.value})} placeholder="AWB / tracking"/></label>
     <label className="packingPhotoField"><span><ImagePlus size={14}/>Packing Image</span><input type="file" accept="image/*" onChange={e=>setPackingPhoto({...packingPhoto,[j.id]:e.target.files?.[0]||null})}/><small>{packingPhoto[j.id]?.name||'Optional photo'}</small></label>
     <button className="miniBtn" onClick={()=>createDispatch(j)} disabled={loading}><Truck size={14}/>Dispatch</button>
    </article>})}
   </div>
   {!ready.length&&<div className="emptyState inboxEmpty"><PackageCheck size={30}/><p>No jobs ready for dispatch.</p></div>}
  </section>

  {canSeeHistory&&<section className="subPanel" id="dispatch-history">
   <div className="panelHead"><h2>Dispatch History</h2><small>Latest</small></div>
   <table><thead><tr><th>Job</th><th>Customer</th><th>Dispatch</th><th>Courier</th><th>Tracking</th><th>Packing</th><th>Delivered By</th><th>Photo</th><th>Status</th></tr></thead><tbody>{details.flatMap(d=>d.dispatches.map(x=><tr key={x.id}><td><b>{d.job.number}</b></td><td>{d.job.customer}</td><td>{x.number}</td><td>{x.courier||'-'}</td><td>{x.tracking_no||'-'}</td><td>{x.packed_by||'-'}<small className="mutedCell">Checked: {x.checked_by||'-'}</small></td><td>{x.delivered_by||'-'}</td><td><div className="historyPhotoCell">{x.packing_photo_url&&<button className="tableLinkBtn" type="button" onClick={()=>openFile(x.packing_photo_url as string)}>{x.packing_photo_name||'View image'}</button>}<label className="historyPhotoUpload"><ImagePlus size={13}/>{x.packing_photo_url?'Replace':'Upload'}<input type="file" accept="image/*" disabled={loading} onChange={e=>uploadHistoryPhoto(x.id,e.target.files?.[0]||null)}/></label></div></td><td><span className="badge success">{x.status}</span></td></tr>))}</tbody></table>
  </section>}
 </section>
}

function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
