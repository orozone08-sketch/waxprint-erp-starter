import {useEffect, useRef, useState} from 'react'
import {AlertTriangle, CheckCircle2, Inbox as InboxIcon, Mail, RefreshCw, Paperclip, Download, ExternalLink, BriefcaseBusiness, X} from 'lucide-react'
import {downloadFile, getJson, postJson} from '../api'
import {jumpTo} from '../ui'

type InboxAttachment={id:number;filename:string;mime_type:string;size_bytes:number}
type InboxMessage={id:number;source:string;external_message_id:string|null;sender:string|null;subject:string|null;received_at:string;archived:boolean;status:string;customer_id:number|null;job_id:number|null;attachments:InboxAttachment[]}
type GmailStatus={enabled:boolean;configured:boolean;client_configured:boolean;bridge_configured:boolean;storage_enabled:boolean;mode:string;user:string;mailbox:string;fetch_query:string;fetch_limit:number}
type GmailFetch={ok:boolean;message:string;fetched?:number;imported?:number;skipped_existing?:number;attachments_imported?:number;errors?:string[]}
type Customer={id:number;name:string;email:string|null;whatsapp:string|null}

export default function Inbox(){
 const[messages,setMessages]=useState<InboxMessage[]>([])
 const[status,setStatus]=useState<GmailStatus|null>(null)
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const[connecting,setConnecting]=useState(false)
 const[customers,setCustomers]=useState<Customer[]>([])
 const[selectedMessage,setSelectedMessage]=useState<InboxMessage|null>(null)
 const[selectedCustomer,setSelectedCustomer]=useState('')
 const autoFetchStarted=useRef(false)

 const load=()=>Promise.all([getJson<InboxMessage[]>('/api/inbox'),getJson<GmailStatus>('/api/integrations/gmail/status')]).then(([inbox,gmail])=>{setMessages(inbox);setStatus(gmail)})
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
   const result=await postJson<{job_number:string;files:number}>(`/api/inbox/${selectedMessage.id}/create-job`,{customer_id:Number(selectedCustomer)})
   setNotice(`${result.job_number} created with ${result.files} file(s) and sent to the Magics queue.`)
   setSelectedMessage(null);setSelectedCustomer('')
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
    {status?.client_configured?<><button className="secondaryBtn" onClick={connectGmail} disabled={connecting}><Mail size={16}/>{connecting?'Opening Google...':status?.configured?'Change Gmail account':'Sign in with Google'}</button><button className="primaryBtn" onClick={fetchGmail} disabled={loading||!status?.configured}><RefreshCw size={16}/>{loading?'Fetching...':'Fetch Gmail'}</button></>:<><a className="primaryBtn" href="/?page=settings#gmail">{status?.bridge_configured?'Apps Script setup':'Set up Gmail'}</a><button className="secondaryBtn" onClick={refreshInbox} disabled={loading}><RefreshCw size={16}/>{loading?'Refreshing...':'Refresh Inbox'}</button></>}
   </div>
  </div>

  <div className="gmailStatus">
   {status?.enabled&&status.configured?<CheckCircle2 size={18}/>:<AlertTriangle size={18}/>}
   <span>{status?.enabled&&status.configured?`Gmail connected: ${status.user || 'configured account'} / ${status.mailbox} / ${status.fetch_query}${status.storage_enabled?' · downloaded files are saved in ERP storage':' · file storage must be enabled before Gmail files can be archived'}`:status?.bridge_configured?'Apps Script bridge is ready. Run syncGmailToErp in Apps Script to fetch files now; Refresh Inbox only reloads files already saved. The automatic trigger runs every 15 minutes.':status?.client_configured?'Click Sign in with Google above. After you approve access, the ERP will fetch Gmail automatically.':'Set up Gmail in Settings to start importing email attachments into the ERP Inbox.'}</span>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <div className="inboxStats">
   <Stat label="Total Inbox" value={messages.length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="Gmail" value={messages.filter(m=>m.source==='gmail').length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="Matched Customer" value={messages.filter(m=>m.customer_id).length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="Job Linked" value={messages.filter(m=>m.job_id).length} onClick={()=>jumpTo('inbox-ledger')}/>
  </div>

  {selectedMessage&&<div className="inboxJobCreator">
   <div><h3>Create a job from this email</h3><p><b>{selectedMessage.subject||'(no subject)'}</b> · {selectedMessage.attachments.length} saved file(s)</p></div>
   <label>Customer<select value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)}><option value="">Choose a customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}{customer.email?` · ${customer.email}`:''}</option>)}</select></label>
   {!customers.length&&<small className="mutedCell">Add the customer in Customers first, then create this job.</small>}
   <div className="inboxJobActions"><button className="primaryBtn" type="button" onClick={createJob} disabled={loading||!selectedCustomer}><BriefcaseBusiness size={15}/>{loading?'Creating...':'Create Job'}</button><button className="secondaryBtn" type="button" onClick={()=>setSelectedMessage(null)} disabled={loading}><X size={15}/>Cancel</button></div>
  </div>}

  <table id="inbox-ledger">
   <thead><tr><th>Source</th><th>From</th><th>Subject / Files</th><th>Received</th><th>Status</th><th>Links / Action</th></tr></thead>
   <tbody>{messages.map(m=><tr key={m.id}><td><span className="sourceCell"><Mail size={14}/>{m.source}</span></td><td>{m.sender||'-'}</td><td><b>{m.subject||'(no subject)'}</b>{m.source==='gmail'&&<div><a className="emailMessageLink" href={gmailSearchUrl(m)} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Open email in Gmail</a></div>}{m.attachments?.length>0&&<div className="inboxAttachments">{m.attachments.map(file=><button key={file.id} type="button" className="attachmentLink" onClick={()=>downloadFile(`/api/inbox/attachments/${file.id}/download`,file.filename).catch(x=>setError(String(x)))}><Download size={13}/>{file.filename}<small>{formatSize(file.size_bytes)}</small></button>)}</div>}</td><td>{formatDate(m.received_at)}</td><td><span className="badge">{m.status}</span></td><td>{m.customer_id?`Customer #${m.customer_id}`:'-'}{m.job_id?` / Job #${m.job_id}`:''}{m.source==='gmail'&&<small className="attachmentCount"><Paperclip size={12}/>{m.attachments?.length??0} saved files</small>}{!m.job_id&&<button className="createInboxJobBtn" type="button" disabled={!m.attachments?.length||loading} title={m.attachments?.length?'Choose the customer and create a production job':'Fetch and save this email’s files before creating a job'} onClick={()=>void beginCreateJob(m)}><BriefcaseBusiness size={13}/>Create Job</button>}</td></tr>)}</tbody>
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
