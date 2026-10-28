import {type FormEvent, useEffect, useRef, useState} from 'react'
import {AlertTriangle, CheckCircle2, Inbox as InboxIcon, Mail, MessageCircle, RefreshCw, Paperclip, Download, ExternalLink, BriefcaseBusiness, X, Upload} from 'lucide-react'
import {downloadFile, fetchBlob, getJson, postForm, postJson, type AuthUser} from '../api'
import {jumpTo} from '../ui'
import {unzipSync} from 'fflate'

type InboxAttachment={id:number;filename:string;mime_type:string;size_bytes:number}
type InboxMessage={id:number;source:string;external_message_id:string|null;sender:string|null;subject:string|null;received_at:string;archived:boolean;status:string;customer_id:number|null;job_id:number|null;attachments:InboxAttachment[]}
type GmailStatus={enabled:boolean;configured:boolean;client_configured:boolean;bridge_configured:boolean;storage_enabled:boolean;mode:string;user:string;mailbox:string;fetch_query:string;fetch_limit:number}
type GmailFetch={ok:boolean;message:string;fetched?:number;imported?:number;skipped_existing?:number;attachments_imported?:number;errors?:string[]}
type Customer={id:number;name:string;email:string|null;whatsapp:string|null}
type WhatsAppStatus={configured:boolean;storage_enabled:boolean;waba_id:string;phone_number_id:string;api_version:string;app_secret_configured:boolean;access_token_configured:boolean;verify_token?:string;webhook_url:string;can_manage?:boolean}

export default function Inbox(){
 const[messages,setMessages]=useState<InboxMessage[]>([])
 const[status,setStatus]=useState<GmailStatus|null>(null)
 const[whatsappStatus,setWhatsappStatus]=useState<WhatsAppStatus|null>(null)
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const[connecting,setConnecting]=useState(false)
 const[showWhatsappSetup,setShowWhatsappSetup]=useState(false)
 const[whatsappForm,setWhatsappForm]=useState({waba_id:'',phone_number_id:'',api_version:'v23.0',access_token:'',app_secret:''})
 const[customers,setCustomers]=useState<Customer[]>([])
 const[selectedMessage,setSelectedMessage]=useState<InboxMessage|null>(null)
 const[selectedCustomer,setSelectedCustomer]=useState('')
 const[showManualUpload,setShowManualUpload]=useState(false)
 const[manualFiles,setManualFiles]=useState<File[]>([])
 const[manualCustomer,setManualCustomer]=useState('')
 const[manualSender,setManualSender]=useState('')
 const[manualMessage,setManualMessage]=useState('')
 const[manualSource,setManualSource]=useState<'whatsapp'|'manual'>('whatsapp')
 const autoFetchStarted=useRef(false)

 const load=async()=>{
  const[inbox,gmail,whatsapp,user]=await Promise.all([getJson<InboxMessage[]>('/api/inbox'),getJson<GmailStatus>('/api/integrations/gmail/status'),getJson<WhatsAppStatus>('/api/integrations/whatsapp/status'),getJson<AuthUser>('/api/auth/me')])
  const canManage=['ADMIN','SUPER_ADMIN'].includes(String(user.role||'').trim().toUpperCase())
  const fullWhatsapp=canManage?{...await getJson<WhatsAppStatus>('/api/settings/whatsapp'),can_manage:true}:{...whatsapp,can_manage:false}
  setMessages(inbox);setStatus(gmail);setWhatsappStatus(fullWhatsapp)
  setWhatsappForm(form=>({...form,waba_id:fullWhatsapp.waba_id||form.waba_id,phone_number_id:fullWhatsapp.phone_number_id||form.phone_number_id,api_version:fullWhatsapp.api_version||'v23.0'}))
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const fetchGmail=async()=>{
  setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<GmailFetch>('/api/integrations/gmail/reconcile',{})
   result.ok?setNotice(result.message):setError(result.message)
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const connectGmail=async()=>{
  setConnecting(true);setError('');setNotice('')
  try{
   const result=await getJson<{url:string}>('/api/settings/gmail/connect-url?return_to=inbox')
   window.location.assign(result.url)
  }catch(x){setError(String(x));setConnecting(false)}
 }

 const saveWhatsapp=async(event:FormEvent)=>{
  event.preventDefault();setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<{ok:boolean;message:string;whatsapp:WhatsAppStatus}>('/api/settings/whatsapp',whatsappForm)
   setWhatsappStatus(result.whatsapp);setWhatsappForm(form=>({...form,access_token:'',app_secret:''}));setNotice(result.message);setShowWhatsappSetup(true)
  }catch(x){setError(String(x))}finally{setLoading(false)}
 }

 const testWhatsapp=async()=>{
  setLoading(true);setError('');setNotice('')
  try{const result=await postJson<{phone_number:string;verified_name:string}>('/api/settings/whatsapp/test',{});setNotice(`WhatsApp connection verified${result.verified_name?`: ${result.verified_name}`:result.phone_number?`: ${result.phone_number}`:''}.`)}catch(x){setError(String(x))}finally{setLoading(false)}
 }

 const subscribeWhatsapp=async()=>{
  setLoading(true);setError('');setNotice('')
  try{const result=await postJson<{message:string}>('/api/settings/whatsapp/subscribe',{});setNotice(result.message)}catch(x){setError(String(x))}finally{setLoading(false)}
 }

 const refreshInbox=async()=>{setLoading(true);setError('');try{await load();setNotice('Inbox refreshed.')}catch(x){setError(String(x))}finally{setLoading(false)}}

 const beginCreateJob=async(message:InboxMessage)=>{
  setError('');setNotice('')
  try{
   const rows=await getJson<Customer[]>('/api/customers')
   setCustomers(rows)
   setSelectedCustomer(message.customer_id?String(message.customer_id):'')
   setSelectedMessage(message)
  }catch(x){setError(String(x))}
 }

 const createJob=async()=>{
  if(!selectedMessage||!selectedCustomer)return
  setLoading(true);setError('');setNotice('')
  try{
   const rarAttachments=selectedMessage.attachments.filter(file=>file.filename.toLowerCase().endsWith('.rar'))
   let result:{job_number:string;files:number}
   if(rarAttachments.length){
    setNotice('Downloading and extracting RAR archive(s). This can take a minute...')
    const expanded=[] as Awaited<ReturnType<typeof extractCadFilesFromRar>>[]
    let expandedBytes=0
    for(const attachment of rarAttachments){
     const result=await extractCadFilesFromRar(attachment)
     expandedBytes+=result.files.reduce((total,file)=>total+file.file.size,0)
     if(expandedBytes>200*1024*1024)throw new Error('RAR files in this email expand beyond the 200 MB total limit. Split the archives into smaller emails.')
     expanded.push(result)
    }
    const extracted=expanded.flatMap(item=>item.files)
    const form=new FormData()
    form.append('customer_id',String(Number(selectedCustomer)))
    form.append('expanded_archives',JSON.stringify(expanded.map(item=>item.attachmentId)))
    form.append('expanded_files',JSON.stringify(extracted.map(file=>({name:file.name,archive_id:file.archiveId}))))
    extracted.forEach(file=>form.append('expanded_file',file.file,file.name))
    setNotice(`Extracted ${extracted.length} STL/CAM file(s). Creating the job...`)
    result=await postForm<{job_number:string;files:number}>(`/api/inbox/${selectedMessage.id}/create-job-from-rar`,form)
   }else{
    result=await postJson<{job_number:string;files:number}>(`/api/inbox/${selectedMessage.id}/create-job`,{customer_id:Number(selectedCustomer)})
   }
   setNotice(`${result.job_number} created with ${result.files} file(s) and sent to the Magics queue.`)
   setSelectedMessage(null);setSelectedCustomer('')
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const openManualUpload=async()=>{
  setError('');setNotice('')
  try{if(!customers.length)setCustomers(await getJson<Customer[]>('/api/customers'));setShowManualUpload(value=>!value)}catch(x){setError(String(x))}
 }

 const createManualUploadJob=async(event:FormEvent)=>{
  event.preventDefault()
  if(!manualCustomer||!manualFiles.length)return
  setLoading(true);setError('');setNotice('Preparing uploads and extracting archives...')
  try{
   const entries:File[]=[]
   const usedNames=new Set<string>()
   for(const file of manualFiles){
    const extension=file.name.toLowerCase().split('.').pop()
    let unpacked:File[]=[]
    if(extension==='rar')unpacked=await extractUploadedRar(file)
    else if(extension==='zip')unpacked=await extractUploadedZip(file)
    if(unpacked.length){
     for(const unpackedFile of unpacked)entries.push(uniqueUploadName(unpackedFile,usedNames))
    }else entries.push(uniqueUploadName(file,usedNames))
    if(entries.length>200)throw new Error('The selected files and extracted archive contents exceed 200 files.')
    if(entries.reduce((total,entry)=>total+entry.size,0)>200*1024*1024)throw new Error('The selected files expand beyond the 200 MB total upload limit.')
   }
   const form=new FormData()
   form.append('customer_id',manualCustomer)
   form.append('source',manualSource)
   form.append('sender',manualSender)
   form.append('message',manualMessage)
   entries.forEach(file=>form.append('upload',file,file.name))
   setNotice(`Uploading ${entries.length} file(s) and creating the job...`)
   const result=await postForm<{job_number:string;files:number}>('/api/inbox/manual-upload-job',form)
   setNotice(`${result.job_number} created with ${result.files} file(s) and sent to the Magics queue.`)
   setShowManualUpload(false);setManualFiles([]);setManualCustomer('');setManualSender('');setManualMessage('');setManualSource('whatsapp')
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 useEffect(()=>{
  const result=new URLSearchParams(window.location.search).get('gmail')
  if(result==='connected'&&!autoFetchStarted.current){
   autoFetchStarted.current=true
   window.history.replaceState(null,'','/?page=inbox')
   setNotice('Google sign-in succeeded. Fetching Gmail now...')
   void fetchGmail()
  }else if(result==='error')setError('Google could not connect Gmail. Complete the one-time OAuth setup in Settings and try again.')
  else if(result==='cancelled')setNotice('Google sign-in was cancelled.')
 },[])

 return <section className="panel">
  <div className="inboxHeader">
   <div><h2>Files / Inbox</h2><p>Fetch Gmail enquiries, customer files and WhatsApp/manual intake records before production.</p></div>
   <div className="inboxHeaderActions">
    <button className="primaryBtn" type="button" onClick={()=>void openManualUpload()} disabled={loading}><Upload size={16}/>Upload Files / Create Job</button>
    <button className="secondaryBtn" type="button" onClick={()=>setShowWhatsappSetup(value=>!value)}><MessageCircle size={16}/>{showWhatsappSetup?'Close WhatsApp setup':whatsappStatus?.configured?'WhatsApp connected':'Connect WhatsApp'}</button>
    {status?.client_configured?<><button className="secondaryBtn" onClick={connectGmail} disabled={connecting}><Mail size={16}/>{connecting?'Opening Google...':status?.configured?'Change Gmail account':'Sign in with Google'}</button><button className="primaryBtn" onClick={fetchGmail} disabled={loading||!status?.configured}><RefreshCw size={16}/>{loading?'Fetching...':'Fetch Gmail'}</button></>:<><a className="primaryBtn" href="/?page=settings#gmail">{status?.bridge_configured?'Apps Script setup':'Set up Gmail'}</a><button className="secondaryBtn" onClick={refreshInbox} disabled={loading}><RefreshCw size={16}/>{loading?'Refreshing...':'Refresh Inbox'}</button></>}
   </div>
  </div>

  <div className="gmailStatus">
   {status?.enabled&&status.configured?<CheckCircle2 size={18}/>:<AlertTriangle size={18}/>}
   <span>{status?.enabled&&status.configured?`Gmail connected: ${status.user || 'configured account'} / ${status.mailbox} / ${status.fetch_query}${status.storage_enabled?' · downloaded files are saved in ERP storage':' · file storage must be enabled before Gmail files can be archived'}`:status?.bridge_configured?'Apps Script bridge is ready. Run syncGmailToErp in Apps Script to fetch files now; Refresh Inbox only reloads files already saved. The automatic trigger runs every 15 minutes.':status?.client_configured?'Click Sign in with Google above. After you approve access, the ERP will fetch Gmail automatically.':'Set up Gmail in Settings to start importing email attachments into the ERP Inbox.'}</span>
  </div>

  {showWhatsappSetup&&<div className="inboxJobCreator whatsappInboxSetup">
   <div><h3>Connect WhatsApp Business</h3><p>Incoming documents, STL/CAM files and RAR archives will appear in this inbox.</p></div>
   {!whatsappStatus?.can_manage?<div className="gmailSetupHelp">WhatsApp connection details are available to ERP administrators. Sign in with an Admin or Super Admin account to configure it here.</div>:<>
   <ol><li>Use Meta's official WhatsApp Business Cloud API with a business phone number.</li><li>Enter the WABA ID, Phone Number ID, API version, access token and Meta app secret below, then save.</li><li>In Meta webhook settings, use the callback URL and verify token shown here; subscribe to the <b>messages</b> field.</li><li>Test the connection, then subscribe the WhatsApp Business Account here. New incoming media will be saved automatically.</li></ol>
   <form className="settingsForm" onSubmit={saveWhatsapp}>
    <label>WhatsApp Business Account ID<input inputMode="numeric" value={whatsappForm.waba_id} onChange={e=>setWhatsappForm({...whatsappForm,waba_id:e.target.value})} required/></label>
    <label>Phone Number ID<input inputMode="numeric" value={whatsappForm.phone_number_id} onChange={e=>setWhatsappForm({...whatsappForm,phone_number_id:e.target.value})} required/></label>
    <label>Graph API version<input value={whatsappForm.api_version} onChange={e=>setWhatsappForm({...whatsappForm,api_version:e.target.value})} placeholder="v23.0" required/></label>
    <label>Permanent access token<input type="password" autoComplete="new-password" value={whatsappForm.access_token} onChange={e=>setWhatsappForm({...whatsappForm,access_token:e.target.value})} placeholder={whatsappStatus?.access_token_configured?'Saved; leave blank to keep current token':'Paste Meta access token'} required={!whatsappStatus?.access_token_configured}/></label>
    <label>Meta app secret<input type="password" autoComplete="new-password" value={whatsappForm.app_secret} onChange={e=>setWhatsappForm({...whatsappForm,app_secret:e.target.value})} placeholder={whatsappStatus?.app_secret_configured?'Saved; leave blank to keep current secret':'Paste Meta app secret'} required={!whatsappStatus?.app_secret_configured}/></label>
    <button className="primaryBtn" type="submit" disabled={loading||!whatsappStatus?.storage_enabled}><CheckCircle2 size={16}/>Save WhatsApp</button>
   </form>
   <div className="gmailSetupHelp"><b>Meta webhook configuration</b><label>Callback URL<input readOnly value={whatsappStatus?.webhook_url||''}/></label><label>Verify token<input readOnly value={whatsappStatus?.verify_token||'Save WhatsApp settings to generate this token'}/></label><small>Access token and app secret are encrypted in ERP storage. Keep the verify token available while setting up Meta.</small></div>
   <div className="inboxJobActions"><button className="secondaryBtn" type="button" onClick={testWhatsapp} disabled={loading||!whatsappStatus?.configured}><CheckCircle2 size={16}/>Test Connection</button><button className="secondaryBtn" type="button" onClick={subscribeWhatsapp} disabled={loading||!whatsappStatus?.configured}><MessageCircle size={16}/>Subscribe WhatsApp Account</button></div>
   </>}
  </div>}

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  {showManualUpload&&<form className="inboxJobCreator manualUploadPanel" onSubmit={createManualUploadJob}>
   <div><h3>Upload files and create a job</h3><p>Select files saved from WhatsApp or your computer. RAR and ZIP archives are opened and their contents are added as individual job files.</p></div>
   <label>Customer<select value={manualCustomer} onChange={e=>setManualCustomer(e.target.value)} required><option value="">Choose a customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}{customer.whatsapp?` · ${customer.whatsapp}`:''}</option>)}</select></label>
   <label>File source<select value={manualSource} onChange={e=>setManualSource(e.target.value as 'whatsapp'|'manual')}><option value="whatsapp">WhatsApp</option><option value="manual">Manual / other</option></select></label>
   <label className="manualFilePicker">Choose files<input type="file" multiple onChange={e=>setManualFiles(Array.from(e.target.files||[]))}/></label>
   <label>Sender name / WhatsApp number<input value={manualSender} onChange={e=>setManualSender(e.target.value)} placeholder="Optional"/></label>
   <label className="manualMessageField">Job notes<textarea value={manualMessage} onChange={e=>setManualMessage(e.target.value)} rows={2} placeholder="Optional production instructions"/></label>
   {manualFiles.length>0&&<div className="manualSelectedFiles"><b>{manualFiles.length} selected · {formatSize(manualFiles.reduce((total,file)=>total+file.size,0))}</b><div>{manualFiles.map((file,index)=><span key={`${file.name}-${index}`}>{file.name} · {formatSize(file.size)}</span>)}</div></div>}
   {!customers.length&&<small className="mutedCell">Add a customer before creating a job.</small>}
   <div className="inboxJobActions"><button className="primaryBtn" type="submit" disabled={loading||!manualCustomer||!manualFiles.length}><BriefcaseBusiness size={15}/>{loading?'Uploading...':'Create Job'}</button><button className="secondaryBtn" type="button" onClick={()=>setShowManualUpload(false)} disabled={loading}><X size={15}/>Cancel</button></div>
  </form>}

  <div className="inboxStats">
   <Stat label="Total Inbox" value={messages.length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="Gmail" value={messages.filter(m=>m.source==='gmail').length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="WhatsApp" value={messages.filter(m=>m.source==='whatsapp').length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="Matched Customer" value={messages.filter(m=>m.customer_id).length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="Job Linked" value={messages.filter(m=>m.job_id).length} onClick={()=>jumpTo('inbox-ledger')}/>
  </div>

  {selectedMessage&&<div className="inboxJobCreator">
   <div><h3>Create a job from this email</h3><p><b>{selectedMessage.subject||'(no subject)'}</b> · {selectedMessage.attachments.length} saved file(s){selectedMessage.attachments.some(file=>file.filename.toLowerCase().endsWith('.rar'))&&' · RAR archives will be opened and each STL/CAM added separately'}</p></div>
   <label>Customer<select value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)}><option value="">Choose a customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}{customer.email?` · ${customer.email}`:''}</option>)}</select></label>
   {!customers.length&&<small className="mutedCell">Add the customer in Customers first, then create this job.</small>}
   <div className="inboxJobActions"><button className="primaryBtn" type="button" onClick={createJob} disabled={loading||!selectedCustomer}><BriefcaseBusiness size={15}/>{loading?'Creating...':'Create Job'}</button><button className="secondaryBtn" type="button" onClick={()=>setSelectedMessage(null)} disabled={loading}><X size={15}/>Cancel</button></div>
  </div>}

  <table id="inbox-ledger">
   <thead><tr><th>Source</th><th>From</th><th>Subject / Files</th><th>Received</th><th>Status</th><th>Links / Action</th></tr></thead>
   <tbody>{messages.map(m=><tr key={m.id}><td><span className="sourceCell">{m.source==='whatsapp'||m.source==='manual'?<MessageCircle size={14}/>:<Mail size={14}/>}{m.source}</span></td><td>{m.sender||'-'}</td><td><b>{m.subject||'(no subject)'}</b>{m.source==='gmail'&&<div><a className="emailMessageLink" href={gmailSearchUrl(m)} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Open email in Gmail</a></div>}{m.attachments?.length>0&&<div className="inboxAttachments">{m.attachments.map(file=><button key={file.id} type="button" className="attachmentLink" onClick={()=>downloadFile(`/api/inbox/attachments/${file.id}/download`,file.filename).catch(x=>setError(String(x)))}><Download size={13}/>{file.filename}<small>{formatSize(file.size_bytes)}</small></button>)}</div>}</td><td>{formatDate(m.received_at)}</td><td><span className="badge">{m.status}</span></td><td>{m.customer_id?`Customer #${m.customer_id}`:'-'}{m.job_id?` / Job #${m.job_id}`:''}{['gmail','whatsapp','manual'].includes(m.source)&&<small className="attachmentCount"><Paperclip size={12}/>{m.attachments?.length??0} saved files</small>}{!m.job_id&&<button className="createInboxJobBtn" type="button" disabled={!m.attachments?.length||loading} title={m.attachments?.length?'Choose the customer and create a production job':'Fetch and save this message’s files before creating a job'} onClick={()=>void beginCreateJob(m)}><BriefcaseBusiness size={13}/>Create Job</button>}</td></tr>)}</tbody>
  </table>
  {!messages.length&&<div className="emptyState inboxEmpty"><InboxIcon size={30}/><p>No inbox messages yet.</p></div>}
 </section>
}

function Stat({label,value,onClick}:{label:string;value:number;onClick:()=>void}){
 return <button className="inboxStat clickableStat" type="button" onClick={onClick}><small>{label}</small><strong>{value}</strong></button>
}

function formatDate(value:string){
 const date=new Date(value)
 return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(date)
}

function formatSize(size:number){
 if(size<1024)return `${size} B`
 if(size<1024*1024)return `${(size/1024).toFixed(1)} KB`
 return `${(size/1024/1024).toFixed(1)} MB`
}

function gmailSearchUrl(message:InboxMessage){
 const terms:string[]=[]
 if(message.subject)terms.push(`subject:"${message.subject.replace(/["\\]/g,' ').trim()}"`)
 const email=message.sender?.match(/<([^>]+)>/)?.[1]||message.sender?.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]
 if(email)terms.push(`from:${email}`)
 const date=new Date(message.received_at)
 if(!Number.isNaN(date.valueOf())){
  const floor=new Date(date);floor.setDate(floor.getDate()-1)
  const ceil=new Date(date);ceil.setDate(ceil.getDate()+2)
  const day=(value:Date)=>`${value.getFullYear()}/${String(value.getMonth()+1).padStart(2,'0')}/${String(value.getDate()).padStart(2,'0')}`
  terms.push(`after:${day(floor)}`,`before:${day(ceil)}`)
 }
 return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(terms.join(' ')||message.external_message_id||'in:inbox')}`
}

function safeArchiveEntryName(value:string,index:number){
 const parts=value.replace(/\\/g,'/').split('/').filter(part=>part&&part!=='.'&&part!=='..')
 const cleaned=parts.map(part=>part.replace(/[<>:"|?*\x00-\x1f]/g,'_')).filter(Boolean)
 return cleaned.join('__')||`archive-file-${index+1}.bin`
}

function uniqueUploadName(file:File,used:Set<string>){
 const original=file.name||'upload.bin'
 const dot=original.lastIndexOf('.')
 const stem=dot>0?original.slice(0,dot):original
 const extension=dot>0?original.slice(dot):''
 let name=original,index=2
 while(used.has(name.toLowerCase()))name=`${stem} (${index++})${extension}`
 used.add(name.toLowerCase())
 return name===file.name?file:new File([file],name,{type:file.type||'application/octet-stream',lastModified:file.lastModified})
}

async function extractUploadedRar(archive:File):Promise<File[]>{
 if(archive.size>50*1024*1024)throw new Error(`${archive.name} exceeds the 50 MB RAR extraction limit.`)
 const [{createExtractorFromData},wasmResponse]=await Promise.all([
  import('node-unrar-js/esm/index.esm.js'),
  import('node-unrar-js/esm/js/unrar.wasm?url').then(({default:url})=>fetch(url))
 ])
 if(!wasmResponse.ok)throw new Error('Could not load the RAR extractor.')
 const extractor=await createExtractorFromData({data:await archive.arrayBuffer(),wasmBinary:await wasmResponse.arrayBuffer()})
 const header=extractor.getFileList()
 if(header.arcHeader.flags.volume)throw new Error('Multi-part RAR archives are not supported. Select a single-volume RAR archive.')
 const entries=[...header.fileHeaders].filter(entry=>!entry.flags.directory)
 if(entries.some(entry=>entry.flags.encrypted))throw new Error(`${archive.name} contains password-protected files. Remove the password and upload it again.`)
 if(entries.length>200||entries.some(entry=>entry.unpSize>100*1024*1024)||entries.reduce((sum,entry)=>sum+entry.unpSize,0)>200*1024*1024)throw new Error(`${archive.name} expands beyond the 200 MB / 200 file limits.`)
 const extracted=[...extractor.extract({files:entry=>!entry.flags.directory}).files]
 const files=extracted.filter(entry=>entry.extraction).map((entry,index)=>new File([Uint8Array.from(entry.extraction!).buffer as ArrayBuffer],safeArchiveEntryName(entry.fileHeader.name,index),{type:'application/octet-stream'}))
 if(files.length!==entries.length)throw new Error(`Only ${files.length} of ${entries.length} files could be extracted from ${archive.name}.`)
 return files
}

async function extractUploadedZip(archive:File):Promise<File[]>{
 if(archive.size>50*1024*1024)throw new Error(`${archive.name} exceeds the 50 MB ZIP extraction limit.`)
 let count=0,total=0
 try{
  const archiveData=new Uint8Array(await archive.arrayBuffer())
  const data=unzipSync(archiveData,{filter:entry=>{
   if(entry.name.endsWith('/'))return false
   count++;total+=entry.originalSize
   if(count>200||entry.originalSize>100*1024*1024||total>200*1024*1024)throw new Error(`${archive.name} expands beyond the 200 MB / 200 file limits.`)
   return true
  }})
  const files=Object.entries(data).map(([name,bytes],index)=>new File([bytes.buffer as ArrayBuffer],safeArchiveEntryName(name,index),{type:'application/octet-stream'}))
  if(!files.length)return []
  return files
 }catch(error){throw error}
}

async function extractCadFilesFromRar(attachment:InboxAttachment):Promise<{attachmentId:number;files:{name:string;archiveId:number;file:File}[]}>{
 const archive=await fetchBlob(`/api/inbox/attachments/${attachment.id}/download`)
 if(archive.size>50*1024*1024)throw new Error(`${attachment.filename} is over the 50 MB RAR extraction limit.`)
 try{
  const [{createExtractorFromData},wasmResponse]=await Promise.all([
   import('node-unrar-js/esm/index.esm.js'),
   import('node-unrar-js/esm/js/unrar.wasm?url').then(({default:url})=>fetch(url))
  ])
  if(!wasmResponse.ok)throw new Error('Could not load the RAR extractor.')
  const extractor=await createExtractorFromData({data:await archive.arrayBuffer(),wasmBinary:await wasmResponse.arrayBuffer()})
  const header=extractor.getFileList()
  if(header.arcHeader.flags.volume)throw new Error('Multi-part RAR archives are not supported yet. Please attach a single-volume RAR.')
  const cadFiles=[...header.fileHeaders].filter(file=>!file.flags.directory&&/\.(stl|cam)$/i.test(file.name))
  if(!cadFiles.length)throw new Error(`No .stl or .cam files were found inside ${attachment.filename}.`)
  if(cadFiles.length>200)throw new Error(`${attachment.filename} contains more than 200 STL/CAM files. Split the archive into smaller parts.`)
  const totalSize=cadFiles.reduce((total,file)=>total+file.unpSize,0)
  if(cadFiles.some(file=>file.flags.encrypted))throw new Error(`${attachment.filename} contains password-protected CAD files. Remove the password and import it again.`)
  if(cadFiles.some(file=>file.unpSize>100*1024*1024)||totalSize>200*1024*1024)throw new Error(`${attachment.filename} expands beyond the 200 MB safety limit.`)
  const extracted=[...extractor.extract({files:file=>!file.flags.directory&&/\.(stl|cam)$/i.test(file.name)}).files]
  const files=extracted.filter(file=>file.extraction).map((entry,index)=>{
   const relative=entry.fileHeader.name.replace(/\\/g,'/')
   const basename=relative.split('/').filter(Boolean).pop()||`cad-file-${index+1}.stl`
   const name=basename.replace(/[<>:"|?*\x00-\x1f]/g,'_')
   const bytes=Uint8Array.from(entry.extraction!).buffer as ArrayBuffer
   return {name,archiveId:attachment.id,file:new File([bytes],name,{type:'application/octet-stream'})}
  })
  if(files.length!==cadFiles.length)throw new Error(`Only ${files.length} of ${cadFiles.length} CAD files could be extracted from ${attachment.filename}.`)
  return {attachmentId:attachment.id,files}
 }catch(error){
  const message=String(error instanceof Error?error.message:error)
  if(/password|bad data|bad archive|unknown format|missing password/i.test(message))throw new Error(`${attachment.filename} could not be opened: ${message}`)
  throw error
 }
}
