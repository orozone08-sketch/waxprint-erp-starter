import {useEffect, useState} from 'react'
import {BadgeCheck, Clock3, FolderOpen, Play, RefreshCw, Upload, Wrench, XCircle} from 'lucide-react'
import {getJson, postForm, postJson} from '../api'
import {jumpTo} from '../ui'
import {calculateStlWeight} from '../stlWeight'

type MagicsSession={id:number;operator:string;workstation:string;status:string;checker:string|null;approved:boolean;started_at:string;completed_at:string|null}
type MagicsFile={id:number;name:string;processed:boolean;original_url:string;download_url:string}
type MagicsJob={id:number;number:string;customer:string;source:string;priority:string;status:string;received_at:string;file_count:number;processed_file_count:number;files:MagicsFile[];latest_session:MagicsSession|null}
type SessionRow=MagicsSession&{job_id:number;job_number:string;customer:string;job_status:string}
type Material={id:number;code:string;name:string;density_g_cm3:number|null}

export default function Magics(){
 const[queue,setQueue]=useState<MagicsJob[]>([])
 const[sessions,setSessions]=useState<SessionRow[]>([])
 const[materials,setMaterials]=useState<Material[]>([])
 const[materialId,setMaterialId]=useState('')
 const[operator,setOperator]=useState('Magics Operator')
 const[workstation,setWorkstation]=useState('MAGICS-PC-01')
 const[checker,setChecker]=useState('Senior Checker')
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=()=>Promise.all([getJson<MagicsJob[]>('/api/magics/queue'),getJson<SessionRow[]>('/api/magics/sessions'),getJson<Material[]>('/api/materials')]).then(([q,s,m])=>{setQueue(q);setSessions(s);setMaterials(m);setMaterialId(current=>current||String(m.find(x=>x.density_g_cm3)?.id||''))})
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const run=async(action:()=>Promise<unknown>,message:string)=>{
  setLoading(true);setError('');setNotice('')
  try{await action();setNotice(message);await load()}catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const uploadOutput=async(job:MagicsJob,source:MagicsFile,file:File)=>{
  setLoading(true);setError('');setNotice('')
  try{
   const form=new FormData();form.append('processed_file',file)
   await postForm(`/api/jobs/${job.id}/files/${source.id}/magics-processed`,form)
   let message=`${file.name} uploaded as the repaired output.`
   if(file.name.toLowerCase().endsWith('.stl')){
    const material=materials.find(item=>String(item.id)===materialId)
    if(!material?.density_g_cm3)message+=' Add a material density in Settings → Materials to calculate its weight.'
    else try{
     const result=await calculateStlWeight(file,material.density_g_cm3,file.name)
     await postJson(`/api/job-files/${source.id}/weight`,{weight_g:result.weightG,weight_source:'AUTO_STL'})
     message+=` Weight calculated and saved automatically: ${result.weightG} g (${result.volumeMm3} mm³) using ${material.name}.`
    }catch(weightError){message+=` Weight was not calculated: ${String(weightError)}. The repaired file is saved; you can retry from Weight.`}
   }
   setNotice(message);await load()
  }catch(uploadError){setError(String(uploadError))}
  finally{setLoading(false)}
 }

 const active=queue.filter(j=>j.status==='MAGICS_REPAIR'||j.latest_session?.status==='STARTED')
 const ready=queue.filter(j=>j.status==='READY_MACHINE_SOFTWARE')
 const waiting=queue.filter(j=>j.status==='WAITING_MAGICS')

 return <section className="panel">
  <div className="magicsHeader">
  <div><h2>Magics Software Integration</h2><p>Repair files in Materialise Magics, upload each output, and send the complete job for checker approval.</p></div>
   <button className="secondaryBtn" onClick={()=>load()} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="magicsSetup">
   <button className="setupCard clickableStat" type="button" onClick={()=>jumpTo('magics-queue')}><Wrench size={19}/><span><b>ERP queue</b><small>{queue.length} job(s) visible for Magics workflow</small></span></button>
   <div className="setupCard"><FolderOpen size={19}/><span><b>Upload from this page</b><small>Download each original, repair it in Magics, then upload the output below. No bridge token is needed.</small></span></div>
   <button className="setupCard clickableStat" type="button" onClick={()=>jumpTo('magics-queue')}><BadgeCheck size={19}/><span><b>Approval gate</b><small>Each job needs a processed file before checker approval.</small></span></button>
  </div>

  <div className="magicsInstructions" style={{margin:'14px 0',lineHeight:1.65}}>
   <b>Manual upload (works without the local bridge)</b><br/>
   Start the repair session, download a file using <b>Original</b>, repair and save it in Magics, then use <b>Upload output</b> next to that same file. Repeat for every file in the job. The ERP keeps each output with its matching original and only enables approval after all files have outputs. The Python bridge remains optional for automatic transfer.
  </div>

  <div className="magicsForm">
   <label>Operator<input value={operator} onChange={e=>setOperator(e.target.value)}/></label>
   <label>Workstation<input value={workstation} onChange={e=>setWorkstation(e.target.value)}/></label>
   <label>Checker<input value={checker} onChange={e=>setChecker(e.target.value)}/></label>
   <label>Weight material<select value={materialId} onChange={e=>setMaterialId(e.target.value)}><option value="">Choose material with density</option>{materials.map(m=><option key={m.id} value={m.id}>{m.name} · {m.density_g_cm3?`${m.density_g_cm3} g/cm³`:'density not set'}</option>)}</select></label>
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
    <tbody>{queue.map(j=><tr key={j.id}><td><b>{j.number}</b><small className="mutedCell">{j.priority}</small></td><td>{j.customer}</td><td><b>{j.processed_file_count}/{j.file_count} processed</b>{j.files.map(f=><small className="mutedCell" key={f.id}>{f.name} · <a href={f.original_url}>Original</a>{f.processed&&<> · <a href={f.download_url}>Processed output</a></>}<br/><label className="miniBtn" style={{display:'inline-flex',cursor:'pointer',marginTop:4}}><Upload size={13}/>{f.processed?'Replace output':'Upload output'}<input type="file" accept=".stl,.cam,.mgx,.3mf,.obj" hidden disabled={loading} onChange={e=>{const input=e.currentTarget;const file=input.files?.[0];if(file)void uploadOutput(j,f,file);input.value=''}}/></label></small>)}</td><td><span className="badge">{pretty(j.status)}</span></td><td>{j.latest_session?<span>{j.latest_session.operator}<small className="mutedCell">{pretty(j.latest_session.status)}</small></span>:'-'}</td><td><Actions job={j} disabled={loading} start={()=>run(()=>postJson(`/api/jobs/${j.id}/magics/start`,{operator_name:operator,workstation}),`${j.number} Magics repair started.`)} approve={()=>run(()=>postJson(`/api/jobs/${j.id}/magics/complete`,{checker_name:checker,approved:true}),`${j.number} approved by checker.`)} reject={()=>run(()=>postJson(`/api/jobs/${j.id}/magics/complete`,{checker_name:checker,approved:false}),`${j.number} sent back for repair.`)}/></td></tr>)}</tbody>
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
