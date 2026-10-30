import {useEffect,useMemo,useState} from 'react'
import {Download,FileText,RefreshCw,Upload,Wrench} from 'lucide-react'
import StlViewerModal,{type StlPreviewFile} from '../components/StlViewerModal'
import StlRepairModal,{type RepairableStlFile} from '../components/StlRepairModal'
import {downloadFile,getJson,postForm} from '../api'
import {Job} from '../types'

type JobFile=RepairableStlFile&{file_uid:string;status:string;quantity:number;sha256:string|null;weight_g:number|null}
type DispatchRow={id:number;number:string;courier:string|null;tracking_no:string|null;delivered_by:string|null;status:string}
type JobDetail={job:Job;files:JobFile[];dispatches:DispatchRow[]}
type PrintAttempt={id:number;file_id:number;machine_id:number|null;attempt_no:number;is_reshoot:boolean;status:string;good_qty:number;bad_qty:number}
type Machine={id:number;name:string;code:string;status:string}

const stages=[
 {key:'repair',label:'Repair / prep',statuses:['FILES_RECEIVED','WAITING_MAGICS','MAGICS_REPAIR','READY_MACHINE_SOFTWARE']},
 {key:'production',label:'Platform / printing',statuses:['PLATFORM_READY','PRINTING']},
 {key:'quality',label:'QC / reshoot / weight',statuses:['RESHOOT_PENDING','WEIGHT_PENDING']},
 {key:'dispatch',label:'Ready / dispatched',statuses:['WEIGHT_COMPLETED','DISPATCHED']},
 {key:'complete',label:'Invoiced',statuses:['INVOICED']},
]
const stageName:Record<string,string>={FILES_RECEIVED:'Files received',WAITING_MAGICS:'Waiting for repair',MAGICS_REPAIR:'Repair in progress',READY_MACHINE_SOFTWARE:'Repair approved',PLATFORM_READY:'Platform ready',PRINTING:'Printing',RESHOOT_PENDING:'Reshoot needed',WEIGHT_PENDING:'Weight pending',WEIGHT_COMPLETED:'Ready to dispatch',DISPATCHED:'Dispatched',INVOICED:'Invoiced',CUSTOMER_RETURN:'Customer return'}
const pretty=(value:string)=>value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())

export default function Jobs(){
 const[jobs,setJobs]=useState<Job[]>([])
 const[details,setDetails]=useState<JobDetail[]>([])
 const[attempts,setAttempts]=useState<PrintAttempt[]>([])
 const[machines,setMachines]=useState<Machine[]>([])
 const[previewFile,setPreviewFile]=useState<StlPreviewFile|null>(null)
 const[repairTarget,setRepairTarget]=useState<{jobId:number;file:RepairableStlFile}|null>(null)
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const[search,setSearch]=useState('')
 const[stageFilter,setStageFilter]=useState('all')
 const load=async()=>{
  setLoading(true);setError('')
  try{
   const rows=await getJson<Job[]>('/api/jobs')
   const [detailRows,attemptRows,machineRows]=await Promise.all([
    Promise.all(rows.map(j=>getJson<JobDetail>(`/api/jobs/${j.id}`))),
    getJson<PrintAttempt[]>('/api/print-attempts'),
    getJson<Machine[]>('/api/machines')
   ])
   setJobs(rows);setDetails(detailRows);setAttempts(attemptRows);setMachines(machineRows)
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[])
 const detailByJob=useMemo(()=>new Map(details.map(d=>[d.job.id,d])),[details])
 const machineById=useMemo(()=>new Map(machines.map(m=>[m.id,m])),[machines])
 const attemptsByFile=useMemo(()=>{
  const grouped=new Map<number,PrintAttempt[]>()
  for(const attempt of attempts){const list=grouped.get(attempt.file_id)||[];list.push(attempt);grouped.set(attempt.file_id,list)}
  return grouped
 },[attempts])
 const visibleJobs=useMemo(()=>jobs.filter(job=>{
  const detail=detailByJob.get(job.id)
  const matchesStage=stageFilter==='all'||(stages.find(s=>s.key===stageFilter)?.statuses.includes(job.status)??(stageFilter==='returns'&&job.status==='CUSTOMER_RETURN'))
  const needle=search.trim().toLowerCase()
  const matchesSearch=!needle||[job.number,job.customer,...(detail?.files||[]).map(f=>f.name)].some(x=>x.toLowerCase().includes(needle))
  return matchesStage&&matchesSearch
 }),[jobs,detailByJob,search,stageFilter])
 const uploadFile=async(jobId:number,file:File|null)=>{
  if(!file)return
  setLoading(true);setError('');setNotice('')
  try{
   const body=new FormData();body.append('upload',file);body.append('quantity','1')
   await postForm(`/api/jobs/${jobId}/files`,body);setNotice(`${file.name} uploaded.`);await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }
 const fileStatus=(status:string)=>status==='PRINTING'?'Printing':status==='ON_PLATFORM'?'On platform':status==='QC_PASSED'?'QC passed':status==='QC_FAILED'?'QC failed':status==='RESHOOT_PENDING'?'Reshoot needed':pretty(status)
 return <section className="panel">
  <div className="titleRow">
   <div><h2>All Job Tracking</h2><p>Track every job from file intake through repair, machine printing, QC, weight and dispatch.</p></div>
   <button className="secondaryBtn" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/>{loading?'Loading…':'Refresh'}</button>
  </div>
  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}
  <div className="jobTrackerToolbar">
   <label>Search jobs<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Job number, customer, or STL file"/></label>
   <label>Workflow stage<select value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="all">All stages</option>{stages.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}<option value="returns">Customer return</option></select></label>
   <span>{visibleJobs.length} of {jobs.length} job(s)</span>
  </div>
  <div className="jobTrackerTableWrap"><table className="jobTrackerTable">
   <thead><tr><th>Job / Customer</th><th>Current stage</th><th>Files / individual status</th><th>Machine / latest print</th><th>Delivery record</th><th>Weight</th></tr></thead>
   <tbody>{visibleJobs.map(j=>{
    const detail=detailByJob.get(j.id)
    const files=detail?.files||[]
    const dispatch=detail?.dispatches?.[detail.dispatches.length-1]
    const fileAttempts=files.flatMap(f=>attemptsByFile.get(f.id)||[]).sort((a,b)=>b.id-a.id)
    const latest=fileAttempts[0]
    const machine=latest?.machine_id?machineById.get(latest.machine_id):undefined
    const repairable=new Set(['ON_PLATFORM','PRINTING','QC_PASSED','QC_FAILED','RESHOOT_PENDING'])
    return <tr key={j.id}>
     <td><b>{j.number}</b><small className="jobTrackerSub">{j.customer}</small><small className="jobTrackerSub">{pretty(j.source)}</small></td>
     <td><span className={`badge ${j.status==='DISPATCHED'||j.status==='INVOICED'?'success':['MAGICS_REPAIR','PRINTING','RESHOOT_PENDING','WEIGHT_PENDING'].includes(j.status)?'warn':''}`}>{stageName[j.status]||pretty(j.status)}</span><small className="jobTrackerSub">{pretty(j.status)}</small></td>
     <td><div className="jobTrackerFiles">{files.length?files.map(f=><div className="jobTrackerFile" key={f.id}>
      <div><button className="tableLinkBtn" type="button" onClick={()=>setPreviewFile(f)}><FileText size={13}/>{f.name}</button><small>{f.weight_g?`${f.weight_g} g saved`:'Weight pending'} · Qty {f.quantity}</small></div>
      <span className={`badge ${f.status==='QC_PASSED'?'success':['PRINTING','RESHOOT_PENDING','QC_FAILED'].includes(f.status)?'warn':''}`}>{fileStatus(f.status)}</span>
      <div className="jobTrackerFileActions"><button className="fileDownloadBtn" type="button" onClick={()=>downloadFile(f.download_url,f.name)} aria-label={`Download ${f.name}`}><Download size={13}/></button>{f.name.toLowerCase().endsWith('.stl')&&<button className="fileRepairBtn" type="button" disabled={loading||repairable.has(f.status)} onClick={()=>setRepairTarget({jobId:j.id,file:f})}><Wrench size={13}/>Repair STL</button>}</div>
     </div>):<small className="jobTrackerSub">No files attached</small>}
     <label className="fileUploadBtn"><Upload size={13}/>{files.length?'Add STL':'Upload STL'}<input type="file" accept=".stl" disabled={loading} onChange={e=>{void uploadFile(j.id,e.target.files?.[0]||null);e.currentTarget.value=''}}/></label></div></td>
     <td>{latest?<><b>{machine?.name||`Machine #${latest.machine_id||'—'}`}</b><small className="jobTrackerSub">{latest.status==='PRINTING'?'Printing now':`${pretty(latest.status)} · attempt ${latest.attempt_no}`}{latest.is_reshoot?' · reshoot':''}</small><small className="jobTrackerSub">{latest.good_qty} good / {latest.bad_qty} failed</small></>:<small className="jobTrackerSub">Not on a machine yet</small>}</td>
     <td>{dispatch?<><b>{dispatch.status==='DISPATCHED'?'Dispatched':'In delivery'}</b><small className="jobTrackerSub">{dispatch.number}{dispatch.courier?` · ${dispatch.courier}`:''}</small>{dispatch.tracking_no&&<small className="jobTrackerSub">Tracking: {dispatch.tracking_no}</small>}{dispatch.delivered_by&&<small className="jobTrackerSub">Delivered by: {dispatch.delivered_by}</small>}</>:<small className="jobTrackerSub">Not dispatched</small>}</td>
     <td>{j.billable_weight_g||0} g<small className="jobTrackerSub">{j.missing_file_weight_count?`${j.missing_file_weight_count} file weight(s) missing`:'Saved total'}</small></td>
    </tr>
   })}</tbody>
  </table></div>
  {!loading&&!visibleJobs.length&&<div className="emptyState inboxEmpty"><FileText size={28}/><p>{jobs.length?'No jobs match this search and stage.':'No jobs have been created yet.'}</p></div>}
  <StlViewerModal file={previewFile} onClose={()=>setPreviewFile(null)}/>
  {repairTarget&&<StlRepairModal key={`${repairTarget.jobId}-${repairTarget.file.id}`} jobId={repairTarget.jobId} file={repairTarget.file} onClose={()=>setRepairTarget(null)} onSaved={load}/>}
 </section>
}
