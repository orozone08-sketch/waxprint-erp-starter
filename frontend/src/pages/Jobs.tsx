import {useEffect,useState} from 'react'
import {Download, FileText, RefreshCw, Upload} from 'lucide-react'
import StlViewerModal, {type StlPreviewFile} from '../components/StlViewerModal'
import {downloadFile, getJson, postForm} from '../api'
import {Job} from '../types'

type JobFile={id:number;file_uid:string;name:string;status:string;quantity:number;sha256:string|null;download_url:string}
type JobDetail={job:Job;files:JobFile[]}

export default function Jobs(){
 const[jobs,setJobs]=useState<Job[]>([])
 const[filesByJob,setFilesByJob]=useState<Record<number,JobFile[]>>({})
 const[previewFile,setPreviewFile]=useState<StlPreviewFile|null>(null)
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const load=async()=>{
  setLoading(true);setError('')
  try{
   const rows=await getJson<Job[]>('/api/jobs')
   const details=await Promise.all(rows.map(j=>getJson<JobDetail>(`/api/jobs/${j.id}`)))
   setJobs(rows)
   setFilesByJob(Object.fromEntries(details.map(d=>[d.job.id,d.files])))
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }
 useEffect(()=>{load()},[])
 const uploadFile=async(jobId:number,file:File|null)=>{
  if(!file)return
  setLoading(true);setError('');setNotice('')
  try{
   const body=new FormData()
   body.append('upload',file)
   body.append('quantity','1')
   await postForm(`/api/jobs/${jobId}/files`,body)
   setNotice(`${file.name} uploaded.`)
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }
 return <section className="panel">
  <div className="titleRow">
   <div><h2>Jobs</h2><p>Every customer file remains linked to one job through all print attempts and reshoots.</p></div>
   <button className="secondaryBtn" onClick={load} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>
  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}
  <table>
   <thead><tr><th>Job</th><th>Customer</th><th>Source</th><th>Status</th><th>Files</th><th>Weight</th><th>Reshoot Weight</th></tr></thead>
   <tbody>{jobs.map(j=>{
    const files=filesByJob[j.id]||[]
    return <tr key={j.id}>
     <td><b>{j.number}</b></td><td>{j.customer}</td><td>{j.source}</td><td><span className="badge">{j.status}</span></td>
     <td><div className="jobFileActions">{files.map(f=><span key={f.id}><button className="tableLinkBtn" type="button" onClick={()=>setPreviewFile(f)}><FileText size={13}/>{f.name}</button><button className="fileDownloadBtn" type="button" onClick={()=>downloadFile(f.download_url,f.name)} aria-label={`Download ${f.name}`}><Download size={13}/></button></span>)}<label className="fileUploadBtn"><Upload size={13}/>{files.length?'Add':'Upload'} STL<input type="file" accept=".stl" disabled={loading} onChange={e=>{void uploadFile(j.id,e.target.files?.[0]||null);e.currentTarget.value=''}}/></label></div></td>
     <td>{j.billable_weight_g} g</td><td>{j.reshoot_weight_g} g</td>
    </tr>
   })}</tbody>
  </table>
  <StlViewerModal file={previewFile} onClose={()=>setPreviewFile(null)}/>
 </section>
}
