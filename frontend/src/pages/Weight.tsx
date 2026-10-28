import {useEffect, useMemo, useRef, useState} from 'react'
import {Calculator, RefreshCw, Scale, WalletCards} from 'lucide-react'
import {getJson, postJson, fetchBlob} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js'

type Customer={id:number;code:string;name:string;email:string|null;whatsapp:string|null;default_rate:number;credit_days:number}
type JobFile={id:number;name:string;download_url:string;quantity:number;weight_g:number|null;weight_source:string|null;weight_recorded_at:string|null}
type JobDetail={job:Job;files:JobFile[]}
type WeightSource='MAGICS'|'EASY3D'|'MANUAL'|'AUTO_STL'
type Material={id:number;code:string;name:string;density_g_cm3:number|null}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)
export default function Weight({role}:{role:string}){
 const canSeeFinancial=role.toUpperCase()==='ADMIN'
 const[jobs,setJobs]=useState<Job[]>([])
 const[details,setDetails]=useState<JobDetail[]>([])
 const[customers,setCustomers]=useState<Customer[]>([])
 const[materials,setMaterials]=useState<Material[]>([])
 const[materialId,setMaterialId]=useState('')
 const[weights,setWeights]=useState<Record<number,string>>({})
 const[sources,setSources]=useState<Record<number,WeightSource>>({})
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const automaticAttempts=useRef(new Set<string>())

 const load=async()=>{
  const jobRows=await getJson<Job[]>('/api/jobs')
  const [detailRows,customerRows,materialRows]=await Promise.all([
   Promise.all(jobRows.map(j=>getJson<JobDetail>(`/api/jobs/${j.id}`))),
   canSeeFinancial?getJson<Customer[]>('/api/customers'):Promise.resolve([] as Customer[]),
   getJson<Material[]>('/api/materials')
  ])
  setJobs(jobRows);setDetails(detailRows);setCustomers(customerRows);setMaterials(materialRows)
  setMaterialId(current=>current||String(materialRows.find(m=>m.density_g_cm3)?.id||''))
  setWeights(Object.fromEntries(detailRows.flatMap(d=>d.files.map(f=>[f.id,f.weight_g==null?'':String(f.weight_g)]))))
  setSources(Object.fromEntries(detailRows.flatMap(d=>d.files.map(f=>[f.id,(f.weight_source||'EASY3D') as WeightSource]))))
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const customerById=useMemo(()=>Object.fromEntries(customers.map(c=>[c.id,c])),[customers])
 const active=details.filter(d=>d.files.length>0&&d.job.status!=='INVOICED')
 const missing=active.reduce((sum,d)=>sum+d.files.filter(f=>!f.weight_g||f.weight_g<=0).length,0)
 const complete=active.filter(d=>d.files.length>0&&d.files.every(f=>!!f.weight_g&&f.weight_g>0))
 const billableTotal=complete.reduce((sum,d)=>sum+d.files.reduce((n,f)=>n+(f.weight_g||0)*f.quantity,0),0)
 const revenueTotal=canSeeFinancial?complete.reduce((sum,d)=>sum+d.files.reduce((n,f)=>n+(f.weight_g||0)*f.quantity,0)*(customerById[d.job.customer_id]?.default_rate||0),0):0

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
  const material=materials.find(m=>String(m.id)===materialId)
  if(!material?.density_g_cm3)throw new Error('Set this material’s density in Settings → Materials first.')
  const blob=await fetchBlob(file.download_url)
  const geometry=new STLLoader().parse(await blob.arrayBuffer())
  try{
   const positions=geometry.getAttribute('position')
   if(!positions||positions.count<3||positions.count%3)throw new Error(`${file.name}: STL has no usable triangle mesh.`)
   let sixVolume=0
   const edgeBalance=new Map<string,{count:number;direction:number}>()
   const vertexKey=(x:number,y:number,z:number)=>`${x===0?0:x},${y===0?0:y},${z===0?0:z}`
   const addEdge=(a:string,b:string)=>{const forward=a<b;const key=forward?`${a}|${b}`:`${b}|${a}`;const edge=edgeBalance.get(key)||{count:0,direction:0};edge.count++;edge.direction+=forward?1:-1;edgeBalance.set(key,edge)}
   for(let i=0;i<positions.count;i+=3){
    const ax=positions.getX(i),ay=positions.getY(i),az=positions.getZ(i)
    const bx=positions.getX(i+1),by=positions.getY(i+1),bz=positions.getZ(i+1)
    const cx=positions.getX(i+2),cy=positions.getY(i+2),cz=positions.getZ(i+2)
    if(![ax,ay,az,bx,by,bz,cx,cy,cz].every(Number.isFinite))throw new Error(`${file.name}: STL contains invalid coordinates.`)
    sixVolume+=ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx)
    const a=vertexKey(ax,ay,az),b=vertexKey(bx,by,bz),c=vertexKey(cx,cy,cz)
    addEdge(a,b);addEdge(b,c);addEdge(c,a)
   }
   for(const edge of edgeBalance.values())if(edge.count!==2||edge.direction!==0)throw new Error(`${file.name}: mesh is open or has inconsistent triangle directions. Repair it in Easy3D or Magics before calculating weight.`)
   const volumeMm3=Math.abs(sixVolume/6)
   const weightG=Number((volumeMm3*material.density_g_cm3/1000).toFixed(6))
   if(!Number.isFinite(weightG)||weightG<=0)throw new Error(`${file.name}: no positive volume. Check that the STL is closed and repaired in Easy3D or Magics.`)
   return {weightG:Number(weightG.toFixed(3)),volumeMm3:Number(volumeMm3.toFixed(3))}
  }finally{geometry.dispose()}
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
  try{const result=await calculateFile(file);setWeights(current=>({...current,[file.id]:String(result.weightG)}));setSources(current=>({...current,[file.id]:'AUTO_STL'}));await postJson(`/api/job-files/${file.id}/weight`,{weight_g:result.weightG,weight_source:'AUTO_STL'});setNotice(`${file.name}: volume ${result.volumeMm3} mm³; calculated ${result.weightG} g using the selected density. Saved to ${job.number}.`);await load()}
  catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 useEffect(()=>{
  const material=materials.find(m=>String(m.id)===materialId)
  if(!material?.density_g_cm3)return
  const pending=details
   .filter(d=>d.files.length>0&&d.job.status!=='INVOICED')
   .flatMap(d=>d.files.filter(f=>(!f.weight_g||f.weight_g<=0)&&f.name.toLowerCase().endsWith('.stl')).map(file=>({file,job:d.job})))
   .filter(({file})=>!automaticAttempts.current.has(`${file.id}:${material.id}:${material.density_g_cm3}`))
  if(!pending.length)return
  for(const {file} of pending)automaticAttempts.current.add(`${file.id}:${material.id}:${material.density_g_cm3}`)
  const calculate=async()=>{
   setLoading(true);setError('');setNotice(`Automatically calculating ${pending.length} missing STL weight(s) using ${material.name} density (${material.density_g_cm3} g/cm³)…`)
   let saved=0;const failed:string[]=[]
   try{
    for(const {file} of pending){
     try{const result=await calculateFile(file);await postJson(`/api/job-files/${file.id}/weight`,{weight_g:result.weightG,weight_source:'AUTO_STL'});saved++}
     catch(x){failed.push(`${file.name}: ${String(x)}`)}
    }
    await load()
    setNotice(`${saved} STL file weight(s) automatically calculated and saved using ${material.name}.${failed.length?` ${failed.length} file(s) need attention.`:''}`)
    if(failed.length)setError(failed.join(' · '))
   }catch(x){setError(String(x))}
   finally{setLoading(false)}
  }
  void calculate()
 },[details,materials,materialId])

 return <section className="panel">
  <div className="weightHeader">
   <div><h2>Weight</h2><p>Missing STL weights calculate and save automatically here using the selected material density. STL coordinates are treated as millimetres; billing stays blocked while any job file has no weight.</p></div>
   <div className="weightHeaderActions"><label>Material density<select value={materialId} onChange={e=>setMaterialId(e.target.value)}><option value="">Choose material</option>{materials.map(m=><option key={m.id} value={m.id}>{m.name} · {m.density_g_cm3?`${m.density_g_cm3} g/cm³`:'density not set'}</option>)}</select></label><button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button></div>
  </div>

  <div className="platformStats">
   <Stat icon={<Scale size={18}/>} label="STL Weights Missing" value={missing} onClick={()=>jumpTo('weight-entry')}/>
   <Stat icon={<Scale size={18}/>} label="Complete Billable Weight" value={`${round(billableTotal)}g`} onClick={()=>jumpTo('weight-entry')}/>
   {canSeeFinancial&&<Stat icon={<WalletCards size={18}/>} label="Billing Preview" value={money(revenueTotal)} onClick={()=>jumpTo('weight-entry')}/>}
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel" id="weight-entry">
   <div className="panelHead"><div><h2>Per-file weight checklist</h2><small>{active.length} job(s) · {missing} file(s) missing</small></div><button className="primaryBtn" type="button" onClick={calculateAllMissing} disabled={loading||!materials.find(m=>String(m.id)===materialId)?.density_g_cm3}><Calculator size={16}/>{loading?'Calculating…':'Calculate all missing STL weights'}</button></div>
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
         <div className="fileWeightActions">{file.name.toLowerCase().endsWith('.stl')&&<button className="miniBtn" disabled={loading||!materials.find(m=>String(m.id)===materialId)?.density_g_cm3} onClick={()=>calculateAndSave(file,job)}><Calculator size={14}/>Calculate STL</button>}<button className="miniBtn" disabled={loading} onClick={()=>saveFileWeight(file,job)}><Scale size={14}/>{saved?'Update':'Save'} measured weight</button></div>
        </div>
       })}
      </div>
      <div className="weightPreview"><span>Calculated total <b>{round(total)}g</b></span><span>Quantity included <b>{files.reduce((sum,f)=>sum+f.quantity,0)}</b></span>{canSeeFinancial&&<span>Bill preview <b>{money(total*(customer?.default_rate||0))}</b></span>}</div>
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
