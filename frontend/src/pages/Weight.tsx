import {useEffect, useMemo, useRef, useState} from 'react'
import {Calculator, RefreshCw, Scale, WalletCards} from 'lucide-react'
import {getJson, postJson, fetchBlob} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'
import {calculateStlWeight} from '../stlWeight'

type Customer={id:number;code:string;name:string;email:string|null;whatsapp:string|null;default_rate:number;urgent_rate:number;credit_days:number}
type JobFile={id:number;name:string;download_url:string;quantity:number;weight_g:number|null;weight_source:string|null;weight_recorded_at:string|null}
type JobDetail={job:Job;files:JobFile[]}
type WeightSource='MAGICS'|'EASY3D'|'MANUAL'|'AUTO_STL'
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
export default function Weight({role}:{role:string}){
 const canSeeFinancial=role.toUpperCase()==='ADMIN'
 const[jobs,setJobs]=useState<Job[]>([])
 const[details,setDetails]=useState<JobDetail[]>([])
 const[customers,setCustomers]=useState<Customer[]>([])
 const[weights,setWeights]=useState<Record<number,string>>({})
 const[sources,setSources]=useState<Record<number,WeightSource>>({})
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const automaticAttempts=useRef(new Set<string>())

 const load=async()=>{
  const jobRows=await getJson<Job[]>('/api/jobs')
  const [detailRows,customerRows]=await Promise.all([
   Promise.all(jobRows.map(j=>getJson<JobDetail>(`/api/jobs/${j.id}`))),
   canSeeFinancial?getJson<Customer[]>('/api/customers'):Promise.resolve([] as Customer[])
  ])
  setJobs(jobRows);setDetails(detailRows);setCustomers(customerRows)
  setWeights(Object.fromEntries(detailRows.flatMap(d=>d.files.map(f=>[f.id,f.weight_g==null?'':String(f.weight_g)]))))
  setSources(Object.fromEntries(detailRows.flatMap(d=>d.files.map(f=>[f.id,(f.weight_source||'EASY3D') as WeightSource]))))
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const customerById=useMemo(()=>Object.fromEntries(customers.map(c=>[c.id,c])),[customers])
 const active=details.filter(d=>d.files.length>0&&d.job.status!=='INVOICED')
 const missing=active.reduce((sum,d)=>sum+d.files.filter(f=>!f.weight_g||f.weight_g<=0).length,0)
 const complete=active.filter(d=>d.files.length>0&&d.files.every(f=>!!f.weight_g&&f.weight_g>0))
 const billableTotal=complete.reduce((sum,d)=>sum+d.files.reduce((n,f)=>n+(f.weight_g||0)*f.quantity,0),0)
 const revenueTotal=canSeeFinancial?complete.reduce((sum,d)=>sum+d.files.reduce((n,f)=>n+(f.weight_g||0)*f.quantity,0)*(d.job.priority==='URGENT'?(customerById[d.job.customer_id]?.urgent_rate??customerById[d.job.customer_id]?.default_rate??0):(customerById[d.job.customer_id]?.default_rate||0)),0):0

 const saveFileWeight=async(file:JobFile,job:Job)=>{
  const value=Number(weights[file.id])
  if(!Number.isFinite(value)||value<=0){setError(`Enter a weight above 0 g for ${file.name}.`);return}
  setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<{billable_weight_g:number;missing_file_weight_count:number}>(`/api/job-files/${file.id}/weight`,{weight_g:value,weight_source:sources[file.id]||'EASY3D'})
   setNotice(result.missing_file_weight_count?`${file.name} saved. ${result.missing_file_weight_count} file(s) in ${job.number} still need weight; billing stays blocked.`:`${job.number}: all ${details.find(d=>d.job.id===job.id)?.files.length||1} STL file(s) have weight. Billable total ${round(result.billable_weight_g)} g.`)
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }
 const calculateFile=async(file:JobFile)=>{
  if(!file.name.toLowerCase().endsWith('.stl'))throw new Error(`${file.name} is not an STL. Enter its measured weight from Easy3D or Magics.`)
  const blob=await fetchBlob(file.download_url)
  return calculateStlWeight(blob,file.name)
 }
 const calculateAllMissing=async()=>{
  const pending=active.flatMap(d=>d.files.filter(f=>(!f.weight_g||f.weight_g<=0)&&f.name.toLowerCase().endsWith('.stl')).map(file=>({file,job:d.job})))
  if(!pending.length){setNotice('No missing STL weights found. Any remaining non-STL files need a measured weight from Easy3D or Magics.');return}
  setLoading(true);setError('');setNotice('')
  let saved=0;const failed:string[]=[]
  try{
   for(const {file} of pending){
    try{const result=await calculateFile(file);await postJson(`/api/job-files/${file.id}/weight`,{weight_g:result.weightG,weight_source:'AUTO_STL'});saved++}
    catch(x){failed.push(`${file.name}: ${String(x)}`)}
   }
   await load()
   setNotice(`${saved} STL file weight(s) calculated and saved.${failed.length?` ${failed.length} file(s) need attention: ${failed.join(' · ')}`:''}`)
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }
 const calculateAndSave=async(file:JobFile,job:Job)=>{
  setLoading(true);setError('');setNotice('')
  try{const result=await calculateFile(file);setWeights(current=>({...current,[file.id]:String(result.weightG)}));setSources(current=>({...current,[file.id]:'AUTO_STL'}));await postJson(`/api/job-files/${file.id}/weight`,{weight_g:result.weightG,weight_source:'AUTO_STL'});setNotice(`${file.name}: volume ${result.volumeCm3} cm³ × 0.9 = ${result.weightG} g. Saved to ${job.number}.`);await load()}
  catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 useEffect(()=>{
  const pending=details
   .filter(d=>d.files.length>0&&d.job.status!=='INVOICED')
   .flatMap(d=>d.files.filter(f=>(!f.weight_g||f.weight_g<=0)&&f.name.toLowerCase().endsWith('.stl')).map(file=>({file,job:d.job})))
   .filter(({file})=>!automaticAttempts.current.has(String(file.id)))
  if(!pending.length)return
  for(const {file} of pending)automaticAttempts.current.add(String(file.id))
  const calculate=async()=>{
   setLoading(true);setError('');setNotice(`Automatically calculating ${pending.length} missing STL weight(s) using the volume × 0.9 formula…`)
   let saved=0;const failed:string[]=[]
   try{
    for(const {file} of pending){
     try{const result=await calculateFile(file);await postJson(`/api/job-files/${file.id}/weight`,{weight_g:result.weightG,weight_source:'AUTO_STL'});saved++}
     catch(x){failed.push(`${file.name}: ${String(x)}`)}
    }
    await load()
    setNotice(`${saved} STL file weight(s) automatically calculated and saved using volume × 0.9.${failed.length?` ${failed.length} file(s) need attention.`:''}`)
    if(failed.length)setError(failed.join(' · '))
   }catch(x){setError(String(x))}
   finally{setLoading(false)}
  }
  void calculate()
 },[details])

 return <section className="panel">
  <div className="weightHeader">
   <div><h2>Weight</h2><p>STL weight uses your Magics rule: enclosed mesh volume in cm³ × 0.9 = grams. Missing STL weights calculate and save automatically; billing stays blocked while any job file has no weight.</p></div>
   <div className="weightHeaderActions"><button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button></div>
  </div>

  <div className="platformStats">
   <Stat icon={<Scale size={18}/>} label="STL Weights Missing" value={missing} onClick={()=>jumpTo('weight-entry')}/>
   <Stat icon={<Scale size={18}/>} label="Complete Billable Weight" value={`${round(billableTotal)}g`} onClick={()=>jumpTo('weight-entry')}/>
   {canSeeFinancial&&<Stat icon={<WalletCards size={18}/>} label="Billing Preview" value={money(revenueTotal)} onClick={()=>jumpTo('weight-entry')}/>}
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel" id="weight-entry">
   <div className="panelHead"><div><h2>Per-file weight checklist</h2><small>{active.length} job(s) · {missing} file(s) missing</small></div><button className="primaryBtn" type="button" onClick={calculateAllMissing} disabled={loading}><Calculator size={16}/>{loading?'Calculating…':'Calculate all missing STL weights'}</button></div>
   <div className="weightCards">
    {active.map(({job,files})=>{
     const total=files.reduce((sum,f)=>sum+(Number(weights[f.id])||f.weight_g||0)*f.quantity,0)
     const customer=customerById[job.customer_id]
     return <article className="weightCard" key={job.id}>
      <div><small>{job.number}</small><h3>{job.customer}</h3><span>{files.filter(f=>f.weight_g&&f.weight_g>0).length}/{files.length} STL weights saved · {job.billable_weight_g||0} g billable total</span></div>
      <div className="fileWeightList">
       {files.map(file=>{
        const saved=!!file.weight_g&&file.weight_g>0
        return <div className="fileWeightRow" key={file.id}>
         <div className="fileWeightName"><b>{file.name}</b><small>Per-piece weight · quantity {file.quantity}{saved?` · saved from ${pretty(file.weight_source||'MANUAL')}`:' · weight missing'}</small></div>
         <label>Weight (g)<input aria-label={`${file.name} weight in grams`} value={weights[file.id]||''} onChange={e=>setWeights({...weights,[file.id]:e.target.value})} inputMode="decimal" placeholder="Enter Magics / Easy3D result"/></label>
         <label>Measured in<select value={sources[file.id]||'EASY3D'} onChange={e=>setSources({...sources,[file.id]:e.target.value as WeightSource})}><option value="MAGICS">Magics</option><option value="EASY3D">Easy3D</option><option value="MANUAL">Other / manual</option></select></label>
         <div className="fileWeightActions">{file.name.toLowerCase().endsWith('.stl')&&<button className="miniBtn" disabled={loading} onClick={()=>calculateAndSave(file,job)}><Calculator size={14}/>Calculate STL</button>}<button className="miniBtn" disabled={loading} onClick={()=>saveFileWeight(file,job)}><Scale size={14}/>{saved?'Update':'Save'} measured weight</button></div>
        </div>
       })}
      </div>
      <div className="weightPreview"><span>Calculated total <b>{round(total)}g</b></span><span>Quantity included <b>{files.reduce((sum,f)=>sum+f.quantity,0)}</b></span>{canSeeFinancial&&<span>Bill preview ({job.priority==='URGENT'?'urgent':'standard'} rate) <b>{money(total*(job.priority==='URGENT'?(customer?.urgent_rate??customer?.default_rate??0):(customer?.default_rate||0)))}</b></span>}</div>
     </article>
    })}
   </div>
   {!active.length&&<div className="emptyState inboxEmpty"><Scale size={30}/><p>No STL files are waiting for weight entry.</p></div>}
  </section>
 </section>
}

function Stat({icon,label,value,onClick}:{icon:React.ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
function round(value:number){return Number(value.toFixed(3))}
