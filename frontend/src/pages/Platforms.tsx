import {useEffect, useMemo, useState} from 'react'
import {Boxes, Calculator, FileText, History, Layers3, Mail, PackagePlus, RefreshCw, Scale, Wrench} from 'lucide-react'
import {getJson, postJson} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'
import StlViewerModal, {type StlPreviewFile} from '../components/StlViewerModal'

type InboxMessage={id:number;source:string;sender:string|null;subject:string|null;received_at:string;archived:boolean;status:string;customer_id:number|null;job_id:number|null}
type JobFile={id:number;file_uid:string;name:string;status:string;quantity:number;sha256:string|null;download_url:string}
type MagicsSession={id:number;operator:string;workstation:string;status:string;checker:string|null;approved:boolean}
type JobDetail={job:Job&{instructions?:string|null};files:JobFile[];magics:MagicsSession[];reshoots:{id:number;number:string;status:string;quantity:number;source:string;reason:string;chargeable:boolean}[]}
type Platform={id:number;number:string;software_name:string;machine_id:number|null;status:string;is_reshoot_platform:boolean}
type PrintAttempt={id:number;file_id:number;platform_id:number;machine_id:number|null;attempt_no:number;is_reshoot:boolean;status:string;good_qty:number;bad_qty:number;reason:string|null;estimated_cost:number}
type Material={id:number;code:string;name:string;unit:string;stock:number;minimum_stock:number}
type JobProfit={job:string;customer:string;weight_g:number;revenue:number;direct_cost:number;gross_profit:number;margin_pct:number}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
const closedPrintStatuses=new Set(['QC_PASSED','QC_FAILED'])

export default function Platforms({role}:{role:string}){
 const canSeeFinancial=role.toUpperCase()==='ADMIN'
 const[jobs,setJobs]=useState<Job[]>([])
 const[details,setDetails]=useState<JobDetail[]>([])
 const[inbox,setInbox]=useState<InboxMessage[]>([])
 const[platforms,setPlatforms]=useState<Platform[]>([])
 const[attempts,setAttempts]=useState<PrintAttempt[]>([])
 const[materials,setMaterials]=useState<Material[]>([])
 const[profits,setProfits]=useState<JobProfit[]>([])
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const[previewFile,setPreviewFile]=useState<StlPreviewFile|null>(null)

 const load=async()=>{
  const [jobRows,inboxRows,platformRows,attemptRows,materialRows]=await Promise.all([
   getJson<Job[]>('/api/jobs'),
   getJson<InboxMessage[]>('/api/inbox'),
   getJson<Platform[]>('/api/platforms'),
   getJson<PrintAttempt[]>('/api/print-attempts'),
   getJson<Material[]>('/api/materials')
  ])
  const profitRows=canSeeFinancial?await getJson<JobProfit[]>('/api/reports/job-profitability'):[]
  const detailRows=await Promise.all(jobRows.map(j=>getJson<JobDetail>(`/api/jobs/${j.id}`)))
  setJobs(jobRows);setInbox(inboxRows);setPlatforms(platformRows);setAttempts(attemptRows);setMaterials(materialRows);setProfits(profitRows);setDetails(detailRows)
 }

 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const rows=useMemo(()=>jobs.map(job=>{
  const detail=details.find(d=>d.job.id===job.id)
  const messages=inbox.filter(m=>m.job_id===job.id||m.customer_id===job.customer_id)
  const profit=profits.find(p=>p.job===job.number)
  const fileQty=detail?.files.reduce((sum,f)=>sum+f.quantity,0)||0
  const magics=detail?.magics[0]
  const reshoots=detail?.reshoots.filter(r=>r.status!=='CLOSED')||[]
  const printAttempts=attempts.filter(a=>detail?.files.some(f=>f.id===a.file_id))
  const outstandingPrint=Math.max(fileQty - printAttempts.filter(a=>closedPrintStatuses.has(a.status)).reduce((sum,a)=>sum+a.good_qty+a.bad_qty,0),0)
  const autoWeight=autoPrintWeight(job,fileQty)
  const kit=kitEstimate(materials,autoWeight)
  return {job,detail,messages,profit,fileQty,magics,reshoots,printAttempts,outstandingPrint,autoWeight,kit}
 }),[jobs,details,inbox,profits,attempts,materials])

 const createPlatform=async(jobId:number)=>{
  const detail=details.find(d=>d.job.id===jobId)
  if(!detail?.files.length){setError('This job has no STL/files attached yet. Import or upload files first.');return}
  setLoading(true);setNotice('');setError('')
  try{
   const result=await postJson<{number:string}>('/api/platforms',{software_name:'WaxJet',machine_id:null,is_reshoot_platform:Boolean(detail.reshoots.length),files:detail.files.map(f=>({job_file_id:f.id,quantity:f.quantity}))})
   setNotice(`Platform ${result.number} created from ${detail.job.number}.`)
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const totalWeight=rows.reduce((sum,r)=>sum+r.autoWeight,0)
 const totalBilling=canSeeFinancial?rows.reduce((sum,r)=>sum+(r.profit?.revenue||0),0):0
 const totalOutstanding=rows.reduce((sum,r)=>sum+r.outstandingPrint,0)
 const totalReshoots=rows.reduce((sum,r)=>sum+r.reshoots.length,0)

 return <section className="panel">
  <div className="platformHeader">
   <div><h2>Machine Software / Platforms</h2><p>{canSeeFinancial?'Gmail-to-STL job preparation with customer history, Magics approval, platform planning, material estimate, billing and reshoot visibility.':'Gmail-to-STL job preparation with customer history, Magics approval, platform planning, material estimate and reshoot visibility.'}</p></div>
   <button className="secondaryBtn" onClick={()=>load()} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<Layers3 size={18}/>} label="Platforms" value={platforms.length} onClick={()=>jumpTo('platform-workbench')}/>
   <Stat icon={<Scale size={18}/>} label="Auto Weight" value={`${round(totalWeight)}g`} onClick={()=>jumpTo('platform-workbench')}/>
   {canSeeFinancial&&<Stat icon={<FileText size={18}/>} label="Billing" value={money(totalBilling)} onClick={()=>jumpTo('platform-workbench')}/>}
   <Stat icon={<PackagePlus size={18}/>} label="Outstanding Print" value={totalOutstanding} onClick={()=>jumpTo('platform-workbench')}/>
   <Stat icon={<RefreshCw size={18}/>} label="Reshoots" value={totalReshoots} onClick={()=>jumpTo('platform-workbench')}/>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <div className="platformWorkbench" id="platform-workbench">
   {rows.map(r=><article className="platformJob" key={r.job.id}>
    <div className="platformJobHead">
     <div><small>{r.job.source.toUpperCase()} / {r.job.number}</small><h3>{r.job.customer}</h3><span>{pretty(r.job.status)} - {r.fileQty} STL/file piece(s)</span></div>
     <button className="miniBtn" disabled={loading||!r.detail?.files.length} onClick={()=>createPlatform(r.job.id)}><Layers3 size={14}/>Create Platform</button>
    </div>

    <div className="platformGrid">
     <Info title="Gmail / Customer" icon={<Mail size={16}/>}>
      <b>{r.messages[0]?.subject||'No linked Gmail yet'}</b>
      <span>{r.messages[0]?.sender||'Use Files / Inbox to fetch Gmail and attach files'}</span>
     </Info>
     <Info title="History" icon={<History size={16}/>}>
      <b>{r.messages.length} inbox item(s)</b>
      <span>{r.detail?.magics.length||0} Magics session(s), {r.printAttempts.length} print attempt(s)</span>
     </Info>
     <Info title="Magics" icon={<Wrench size={16}/>}>
      <b>{r.magics?pretty(r.magics.status):'Waiting for Magics'}</b>
      <span>{r.magics?.checker?`Checker: ${r.magics.checker}`:'Approve in Magics Repair page'}</span>
     </Info>
     <Info title="Auto Weight" icon={<Calculator size={16}/>}>
      <b>{round(r.autoWeight)}g estimated</b>
      <span>{r.job.billable_weight_g?`${r.job.billable_weight_g}g billable + ${r.job.reshoot_weight_g}g reshoot`:'Fallback: file quantity x 0.65g'}</span>
     </Info>
     <Info title="Material / Kit" icon={<Boxes size={16}/>}>
      <b>{r.kit.label}</b>
      <span>{r.kit.stock}</span>
     </Info>
     <Info title={canSeeFinancial?'Billing / Outstanding':'Print Outstanding'} icon={<FileText size={16}/>}>
      <b>{canSeeFinancial?money(r.profit?.revenue||0):`${r.outstandingPrint} pending piece(s)`}</b>
      <span>{r.outstandingPrint} outstanding print - {r.reshoots.length} reshoot(s)</span>
     </Info>
    </div>

    <div className="fileStrip">
     {(r.detail?.files.length?r.detail.files:[]).map(f=><button key={f.id} type="button" onClick={()=>setPreviewFile(f)}><FileText size={13}/>{f.name}<b>{f.quantity} pcs</b></button>)}
     {!r.detail?.files.length&&<span><FileText size={13}/>No STL/files linked yet<b>Upload first</b></span>}
    </div>
   </article>)}
  </div>
  <StlViewerModal file={previewFile} onClose={()=>setPreviewFile(null)}/>
 </section>
}

function autoPrintWeight(job:Job,fileQty:number){
 if(job.billable_weight_g||job.reshoot_weight_g)return job.billable_weight_g+job.reshoot_weight_g
 return fileQty*.65
}

function kitEstimate(materials:Material[],weightG:number){
 const wax=materials.find(m=>m.name.toLowerCase().includes('wax'))||materials[0]
 if(!wax)return {label:'No material master',stock:'Create material first'}
 const kitSizeG=wax.name.includes('3 KG')||wax.unit==='kit'?3000:1000
 const kits=weightG/kitSizeG
 return {label:`${round(kits,3)} ${wax.unit} planned`,stock:`${wax.name}: ${wax.stock} ${wax.unit} in stock`}
}

function Stat({icon,label,value,onClick}:{icon:React.ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function Info({title,icon,children}:{title:string;icon:React.ReactNode;children:React.ReactNode}){return <div className="platformInfo"><small>{icon}{title}</small>{children}</div>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
function round(value:number,digits=2){return Number(value.toFixed(digits))}
