import {useEffect, useState} from 'react'
import {AlertTriangle, CheckCircle2, Inbox as InboxIcon, Mail, RefreshCw} from 'lucide-react'
import {getJson, postJson} from '../api'
import {jumpTo} from '../ui'

type InboxMessage={id:number;source:string;sender:string|null;subject:string|null;received_at:string;archived:boolean;status:string;customer_id:number|null;job_id:number|null}
type GmailStatus={enabled:boolean;configured:boolean;mode:string;user:string;mailbox:string;fetch_query:string;fetch_limit:number}
type GmailFetch={ok:boolean;message:string;fetched?:number;imported?:number;skipped_existing?:number;errors?:string[]}

export default function Inbox(){
 const[messages,setMessages]=useState<InboxMessage[]>([])
 const[status,setStatus]=useState<GmailStatus|null>(null)
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

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

 return <section className="panel">
  <div className="inboxHeader">
   <div><h2>Files / Inbox</h2><p>Fetch Gmail enquiries, customer files and WhatsApp/manual intake records before production.</p></div>
   <button className="primaryBtn" onClick={fetchGmail} disabled={loading}><RefreshCw size={16}/>{loading?'Fetching...':'Fetch Gmail'}</button>
  </div>

  <div className="gmailStatus">
   {status?.enabled&&status.configured?<CheckCircle2 size={18}/>:<AlertTriangle size={18}/>}
   <span>{status?.enabled&&status.configured?`Gmail saved: ${status.user || 'configured account'} / ${status.mailbox} / ${status.fetch_query}`:'Gmail not configured yet. Add Gmail from Settings > Gmail Intake.'}</span>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <div className="inboxStats">
   <Stat label="Total Inbox" value={messages.length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="Gmail" value={messages.filter(m=>m.source==='gmail').length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="Matched Customer" value={messages.filter(m=>m.customer_id).length} onClick={()=>jumpTo('inbox-ledger')}/>
   <Stat label="Job Linked" value={messages.filter(m=>m.job_id).length} onClick={()=>jumpTo('inbox-ledger')}/>
  </div>

  <table id="inbox-ledger">
   <thead><tr><th>Source</th><th>From</th><th>Subject</th><th>Received</th><th>Status</th><th>Links</th></tr></thead>
   <tbody>{messages.map(m=><tr key={m.id}><td><span className="sourceCell"><Mail size={14}/>{m.source}</span></td><td>{m.sender||'-'}</td><td><b>{m.subject||'(no subject)'}</b></td><td>{formatDate(m.received_at)}</td><td><span className="badge">{m.status}</span></td><td>{m.customer_id?`Customer #${m.customer_id}`:'-'}{m.job_id?` / Job #${m.job_id}`:''}</td></tr>)}</tbody>
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
