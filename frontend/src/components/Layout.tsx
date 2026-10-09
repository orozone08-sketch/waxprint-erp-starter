import {ReactNode, useMemo, useState} from 'react'
import { LayoutDashboard, Inbox, BriefcaseBusiness, Wrench, Layers3, Printer, CircleCheckBig, RefreshCcw, Scale, PackageCheck, Undo2, ReceiptIndianRupee, Boxes, WalletCards, Users, BarChart3, Settings, Search, Bell, ChevronDown } from 'lucide-react'
import {getJson, type AuthUser} from '../api'
import {canAccessPage, normalizePage, roleHomePage} from '../authz'
import {Job} from '../types'

const items=[
 ['dashboard','Dashboard',LayoutDashboard],['inbox','Files / Inbox',Inbox],['jobs','Jobs',BriefcaseBusiness],['customers','Customers',Users],['magics','Magics Repair',Wrench],['platforms','Machine Software / Platforms',Layers3],['printing','Printing',Printer],['qc','Internal QC',CircleCheckBig],['reshoots','Reshoots',RefreshCcw],['weight','Weight',Scale],['dispatch','Packing / Dispatch',PackageCheck],['returns','Customer Returns',Undo2],['billing','Billing / Payments',ReceiptIndianRupee],['inventory','Materials / Inventory',Boxes],['expenses','Expenses',WalletCards],['reports','Reports / Profit',BarChart3],['settings','Settings',Settings]
] as const

type Customer={id:number;code:string;name:string;email:string|null;whatsapp:string|null}
type InboxMessage={id:number;source:string;sender:string|null;subject:string|null;received_at:string;status:string;customer_id:number|null;job_id:number|null}
type SearchResult={id:string;page:string;kind:string;label:string;meta:string}

export default function Layout({page,setPage,children,user}:{page:string;setPage:(p:string)=>void;children:ReactNode;user:AuthUser}){
 const[query,setQuery]=useState('')
 const[searchOpen,setSearchOpen]=useState(false)
 const[searchLoaded,setSearchLoaded]=useState(false)
 const[searchLoading,setSearchLoading]=useState(false)
 const[searchError,setSearchError]=useState('')
 const[jobs,setJobs]=useState<Job[]>([])
 const[customers,setCustomers]=useState<Customer[]>([])
 const[messages,setMessages]=useState<InboxMessage[]>([])
 const visibleItems=items.filter(([id])=>canAccessPage(id,user.role))
 const loadSearchData=async()=>{
  if(searchLoaded||searchLoading)return
  setSearchLoading(true);setSearchError('')
  try{
   const[j,c,m]=await Promise.all([getJson<Job[]>('/api/jobs'),getJson<Customer[]>('/api/customers'),getJson<InboxMessage[]>('/api/inbox')])
   setJobs(j);setCustomers(c);setMessages(m);setSearchLoaded(true)
  }catch(x){setSearchError('Search data unavailable.')}
  finally{setSearchLoading(false)}
 }
 const results=useMemo<SearchResult[]>(()=>{
  const term=query.trim().toLowerCase()
  if(term.length<2)return []
  const matches=(...values:(string|number|null|undefined)[])=>values.some(value=>String(value||'').toLowerCase().includes(term))
  const found:SearchResult[]=[]
  jobs.forEach(j=>{if(matches(j.number,j.customer,j.status,j.source))found.push({id:`job-${j.id}`,page:'jobs',kind:'Job',label:j.number,meta:`${j.customer} / ${pretty(j.status)}`})})
  customers.forEach(c=>{if(matches(c.code,c.name,c.email,c.whatsapp))found.push({id:`customer-${c.id}`,page:'customers',kind:'Customer',label:c.name,meta:[c.code,c.email,c.whatsapp].filter(Boolean).join(' / ')})})
  messages.forEach(m=>{if(matches(m.sender,m.subject,m.source,m.status))found.push({id:`inbox-${m.id}`,page:'inbox',kind:'Inbox',label:m.subject||'(no subject)',meta:`${m.sender||'Unknown sender'} / ${pretty(m.status)}`})})
  return found.slice(0,8)
 },[query,jobs,customers,messages])
 const openResult=(target:string)=>{
  const next=canAccessPage(target,user.role)?target:roleHomePage(user.role)
  setPage(next);setSearchOpen(false);setQuery('')
 }
 const runSearch=()=>{
  if(results[0])openResult(results[0].page)
 }
 const isAdmin=user.role.toUpperCase()==='ADMIN'
 const userName=user.display_name||user.username
 const initials=userName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||user.username.slice(0,2).toUpperCase()
 return <div className="shell">
  <aside>
   <div className="brand adityaBrand">
    <img className="brandLogoImage" src="/aditya360-logo.png" alt="ADITYA360 - 3D Wax Printing Accounting & Operations" />
   </div>
   <nav>{visibleItems.map(([id,label,Icon])=><button key={id} className={normalizePage(page)===id?'active':''} onClick={()=>setPage(id)}><Icon size={17}/>{label}</button>)}</nav>
   <div className="asideNote"><span></span><p>Built for jewellery wax teams who need production and accounts in one place.</p></div>
  </aside>
  <main>
   <header className="topbar">
    <div className="searchWrap">
     <div className="searchBox"><Search size={17}/><input aria-label="Search" value={query} placeholder="Search orders, customers, job no..." onFocus={()=>{setSearchOpen(true);void loadSearchData()}} onBlur={()=>window.setTimeout(()=>setSearchOpen(false),120)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);if(e.target.value.trim().length>=2)void loadSearchData()}} onKeyDown={e=>{if(e.key==='Enter')runSearch();if(e.key==='Escape')setSearchOpen(false)}} /></div>
     {searchOpen&&query.trim().length>=2&&<div className="searchResults" onMouseDown={e=>e.preventDefault()}>
      {searchLoading&&<p>Loading search...</p>}
      {searchError&&<p>{searchError}</p>}
      {!searchLoading&&!searchError&&results.map(result=><button key={result.id} type="button" onClick={()=>openResult(result.page)}><small>{result.kind}</small><span><b>{result.label}</b><em>{result.meta}</em></span></button>)}
      {!searchLoading&&!searchError&&!results.length&&<p>No matching records found.</p>}
     </div>}
    </div>
    <div className="topbarActions">
     <button className="iconBtn" type="button" onClick={()=>setPage('inbox')} aria-label="Open notifications inbox"><Bell size={18}/><i></i></button>
     {isAdmin?
      <a className="userChip" href="/admin.html" aria-label="Open separate admin panel"><strong>{initials}</strong><span>{userName}<small>{pretty(user.role)}</small></span><ChevronDown size={15}/></a>:
      <div className="userChip static" aria-label="Signed in user"><strong>{initials}</strong><span>{userName}<small>{pretty(user.role)}</small></span></div>}
    </div>
   </header>
   {children}
  </main>
 </div>
}

function pretty(value:string){
 return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())
}
