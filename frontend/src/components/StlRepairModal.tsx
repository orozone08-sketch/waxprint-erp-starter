import {useEffect,useState} from 'react'
import {AlertTriangle,CheckCircle2,Download,Eye,LoaderCircle,Save,Wrench,X} from 'lucide-react'
import {downloadFile,fetchBlob,postForm} from '../api'
import StlViewerModal,{type StlPreviewFile} from './StlViewerModal'
import {repairStl,type StlRepairReport} from '../lib/stlRepair'

export type RepairableStlFile=StlPreviewFile&{original_download_url:string}

export default function StlRepairModal({jobId,file,onClose,onSaved}:{jobId:number;file:RepairableStlFile;onClose:()=>void;onSaved:()=>Promise<void>|void}){
 const[loading,setLoading]=useState(false)
 const[error,setError]=useState('')
 const[notice,setNotice]=useState('')
 const[report,setReport]=useState<StlRepairReport|null>(null)
 const[repairBlob,setRepairBlob]=useState<Blob|null>(null)
 const[repairUrl,setRepairUrl]=useState('')
 const[preview,setPreview]=useState<StlPreviewFile|null>(null)
 const[reviewed,setReviewed]=useState(false)

 useEffect(()=>()=>{if(repairUrl)URL.revokeObjectURL(repairUrl)},[repairUrl])

 const runRepair=async()=>{
  setLoading(true);setError('');setNotice('');setReport(null);setRepairBlob(null);setRepairUrl('');setReviewed(false)
  try{
   const source=await fetchBlob(file.original_download_url)
   const result=repairStl(await source.arrayBuffer())
   const blob=new Blob([result.data],{type:'model/stl'})
   setRepairBlob(blob);setReport(result.report);setRepairUrl(URL.createObjectURL(blob))
   setNotice(result.report.watertight?'Repair candidate is ready. Preview it and confirm your review before saving.':'Some mesh problems remain. This candidate cannot be saved as production-ready.')
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const saveRepair=async()=>{
  if(!repairBlob||!report?.watertight||!reviewed)return
  setLoading(true);setError('');setNotice('')
  try{
   const form=new FormData();form.append('processed_file',new File([repairBlob],file.name,{type:'model/stl'}));form.append('repair_report',JSON.stringify(report))
   await postForm(`/api/jobs/${jobId}/files/${file.id}/stl-repair`,form)
   await onSaved();setNotice(`${file.name}: repaired STL saved. The original remains available.`)
   window.setTimeout(onClose,650)
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const candidate={id:file.id,name:`${file.name} · repaired preview`,download_url:repairUrl}
 return <>
  <div className="stlOverlay repairOverlay" role="dialog" aria-modal="true" aria-label={`Repair ${file.name}`}>
   <div className="stlModal stlRepairModal">
    <div className="stlModalHead">
     <div><h2>Repair STL in ERP</h2><p>{file.name} · original file is preserved</p></div>
     <button className="iconBtn" type="button" onClick={onClose} aria-label="Close repair"><X size={18}/></button>
    </div>
    <div className="stlRepairBody">
     <div className="infoBox"><b>Automatic basic mesh repair</b><br/>The ERP removes degenerate and duplicate triangles, corrects face direction, and caps only small planar convex openings. Review the 3D result before saving. This does not replace Magics for complex defects.</div>
     {error&&<div className="errorBox">{error}</div>}
     {notice&&<div className={report?.watertight?'successBox':'warningBox'}>{notice}</div>}
     {report&&<>
      <div className="repairReport">
       <Metric label="Triangles" value={`${report.inputTriangles.toLocaleString()} → ${report.outputTriangles.toLocaleString()}`}/>
       <Metric label="Degenerate removed" value={report.removedDegenerate.toLocaleString()}/>
       <Metric label="Duplicates removed" value={report.removedDuplicate.toLocaleString()}/>
       <Metric label="Small holes capped" value={report.filledHoles.toLocaleString()}/>
       <Metric label="Remaining open loops" value={report.unfilledBoundaries.toLocaleString()}/>
       <Metric label="Non-manifold edges" value={report.nonManifoldEdges.toLocaleString()}/>
      </div>
      <div className={report.watertight?'successBox':'warningBox'}>{report.watertight?<><CheckCircle2 size={16}/> Mesh is closed and passed the basic topology check. Visual review is still required.</>:<><AlertTriangle size={16}/> Mesh is still open or non-manifold. Do not use this candidate for production.</>}</div>
      {!!report.warnings.length&&<ul className="repairWarnings">{report.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}
     </>}
     <div className="repairActions">
      <button className="secondaryBtn" type="button" onClick={()=>setPreview({id:file.id,name:file.name,download_url:file.original_download_url})} disabled={loading}><Eye size={16}/>Preview original</button>
      {repairUrl&&<button className="secondaryBtn" type="button" onClick={()=>setPreview(candidate)} disabled={loading}><Eye size={16}/>Preview repaired</button>}
      {repairBlob&&<button className="secondaryBtn" type="button" onClick={()=>downloadFile(repairUrl,`repaired-${file.name}`)}><Download size={16}/>Download candidate</button>}
      <button className="secondaryBtn" type="button" onClick={runRepair} disabled={loading}>{loading?<LoaderCircle size={16} className="spinIcon"/>:<Wrench size={16}/>}Run repair</button>
     </div>
     {repairBlob&&report?.watertight&&<label className="repairReview"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I previewed the repaired mesh and approve this file for the next ERP step.</label>}
     <div className="repairFooter"><small>Saving creates the processed copy used by downstream ERP steps. The original download stays unchanged.</small><button className="primaryBtn" type="button" onClick={saveRepair} disabled={loading||!repairBlob||!report?.watertight||!reviewed}><Save size={16}/>{loading?'Saving…':'Accept & Save Repaired STL'}</button></div>
    </div>
   </div>
  </div>
  <StlViewerModal file={preview} onClose={()=>setPreview(null)}/>
 </>
}

function Metric({label,value}:{label:string;value:string}){return <div className="repairMetric"><small>{label}</small><b>{value}</b></div>}
