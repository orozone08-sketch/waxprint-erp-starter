import {type Dispatch, type FormEvent, type MouseEvent, type ReactNode, type SetStateAction, useEffect, useMemo, useState} from 'react'
import {createPortal} from 'react-dom'
import {Activity, AlertTriangle, BadgeCheck, Boxes, BriefcaseBusiness, CheckCircle2, Database, IndianRupee, LockKeyhole, Mail, PackageCheck, ReceiptText, RefreshCcw, RefreshCw, Save, Scale, Search, Settings, ShieldCheck, Trash2, TrendingUp, UserPlus, Users, WalletCards, Wrench} from 'lucide-react'
import {getJson, getStoredAuth, setStoredAuth, postJson, type AuthUser} from '../api'
import {Dashboard as DashboardData, Job} from '../types'

type Customer={id:number;code:string;name:string;email:string|null;whatsapp:string|null;default_rate:number;credit_days:number}
type Employee={id:number;code:string;name:string;department:string;role:string;monthly_salary:number}
type Machine={id:number;code:string;name:string;model:string|null;serial_number:string|null;status:string}
type Material={id:number;code:string;name:string;unit:string;stock:number;minimum_stock:number}
type Expense={id:number;date:string;category:string;description:string;amount:number;is_direct_cost:boolean;related_type:string;related_id?:number|null}
type Invoice={id:number;number:string;customer_id:number;date:string;subtotal:number;tax:number;total:number;paid:number;outstanding:number;status:string}
type Integrations={gmail:{enabled:boolean;configured:boolean;mode:string;user:string;mailbox:string;fetch_query:string;fetch_limit:number;archive_label:string};magics:{agent_token_configured:boolean;workstation_default:string;local_agent_folder:string;queue_endpoint:string}}
type AdminDataset={key:string;label:string;count:number;rows:Record<string,unknown>[]}
type AdminAllData={total_records:number;datasets:AdminDataset[]}
type Company={id:number;slug:string;name:string}
type AuditEvent={id:number;company_name:string;module:string;record_id:number|null;action:string;details:string|null;user_name:string;created_at:string}
type Quality={expected_pieces:number;good_pieces:number;bad_pieces:number;first_pass_yield_pct:number;internal_reshoot_tickets:number;customer_return_reshoots:number}
type Reshoot={id:number;number:string;source:string;reason:string;quantity:number;responsibility:string;chargeable:boolean;status:string}
type JobProfit={job:string;customer:string;weight_g:number;revenue:number;direct_cost:number;gross_profit:number;margin_pct:number}
type AdminData={customers:Customer[];employees:Employee[];jobs:Job[];machines:Machine[];materials:Material[];expenses:Expense[];invoices:Invoice[];integrations:Integrations;health:{ok:boolean;app:string;file_storage?:string};allData:AdminAllData;users:AuthUser[];dashboard:DashboardData;quality:Quality;reshoots:Reshoot[];profitability:JobProfit[];companies:Company[];auditLogs:AuditEvent[]}
type GmailFormState={enabled:boolean;user:string;mailbox:string;fetch_query:string;fetch_limit:string}
type GmailSave={ok:boolean;message:string;gmail:Integrations['gmail']}
type GmailTest={ok:boolean;message:string;gmail:Integrations['gmail']}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0)
const pct=(part:number,total:number)=>total?Math.round(part/total*100):0
const openStatuses=new Set(['FILES_RECEIVED','WAITING_MAGICS','MAGICS_REPAIR','READY_MACHINE_SOFTWARE','PLATFORM_READY','PRINTING','RESHOOT_PENDING','WEIGHT_PENDING','WEIGHT_COMPLETED','CUSTOMER_RETURN'])
const initialModuleKey=()=>new URLSearchParams(window.location.search).get('module')||''
const moduleHref=(key:string)=>`/admin.html?module=${encodeURIComponent(key)}`

export default function AdminPanel({setPage}:{setPage:(page:string)=>void}){
 const initialModule=initialModuleKey()
 const[data,setData]=useState<AdminData|null>(null)
 const[activeDatasetKey,setActiveDatasetKey]=useState(initialModule||'all_records')
 const[modulePageKey,setModulePageKey]=useState(initialModule)
 const[dataSearch,setDataSearch]=useState('')
 const[userForm,setUserForm]=useState({username:'',display_name:'',password:'',role:'STAFF',active:true})
 const[gmailForm,setGmailForm]=useState<GmailFormState>({enabled:true,user:'',mailbox:'INBOX',fetch_query:'is:unread',fetch_limit:'25'})
 const[gmailNotice,setGmailNotice]=useState('')
 const[gmailError,setGmailError]=useState('')
 const[userNotice,setUserNotice]=useState('')
 const[userError,setUserError]=useState('')
 const[moduleSlot,setModuleSlot]=useState<HTMLElement|null>(null)
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const[activeCompanyId,setActiveCompanyId]=useState(()=>getStoredAuth()?.active_company_id||1)

 const load=async()=>{
  setLoading(true);setError('')
  try{
   const [customers,employees,jobs,machines,materials,expenses,invoices,integrations,health,allData,users,dashboard,quality,reshoots,profitability,companies,auditLogs]=await Promise.all([
    getJson<Customer[]>('/api/customers'),
    getJson<Employee[]>('/api/employees'),
    getJson<Job[]>('/api/jobs'),
    getJson<Machine[]>('/api/machines'),
    getJson<Material[]>('/api/materials'),
    getJson<Expense[]>('/api/expenses'),
    getJson<Invoice[]>('/api/invoices'),
    getJson<Integrations>('/api/settings/integrations'),
    getJson<{ok:boolean;app:string;file_storage?:string}>('/health'),
    getJson<AdminAllData>('/api/admin/all-data'),
    getJson<AuthUser[]>('/api/auth/users'),
    getJson<DashboardData>('/api/dashboard'),
    getJson<Quality>('/api/reports/quality'),
    getJson<Reshoot[]>('/api/reshoots'),
    getJson<JobProfit[]>('/api/reports/job-profitability'),
    getJson<Company[]>('/api/companies'),
    getJson<AuditEvent[]>('/api/admin/audit-logs')
   ])
   setData({customers,employees,jobs,machines,materials,expenses,invoices,integrations,health,allData,users,dashboard,quality,reshoots,profitability,companies,auditLogs})
   setGmailForm(form=>({
    ...form,
    enabled:integrations.gmail.enabled,
    user:integrations.gmail.user||form.user,
    mailbox:integrations.gmail.mailbox||'INBOX',
    fetch_query:integrations.gmail.fetch_query||'is:unread',
    fetch_limit:String(integrations.gmail.fetch_limit||25)
   }))
   if(activeDatasetKey!=='all_records'&&!allData.datasets.some(dataset=>dataset.key===activeDatasetKey))setActiveDatasetKey('all_records')
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }
 useEffect(()=>{load()},[])
 useEffect(()=>{setModuleSlot(document.getElementById('admin-data-modules-slot'))},[])
 useEffect(()=>{
  const onPop=()=>{
   const key=initialModuleKey()
   setModulePageKey(key)
   if(key)setActiveDatasetKey(key)
  }
  window.addEventListener('popstate',onPop)
  return ()=>window.removeEventListener('popstate',onPop)
 },[])

 const openModulePage=(key:string,event?:MouseEvent<HTMLAnchorElement>)=>{
  event?.preventDefault()
  setActiveDatasetKey(key)
  setModulePageKey(key)
  setDataSearch('')
  const url=new URL(window.location.href)
  url.searchParams.set('module',key)
  url.hash=''
  window.history.pushState(null,'',url)
  window.scrollTo({top:0,behavior:'smooth'})
 }

 const closeModulePage=()=>{
  setModulePageKey('')
  setDataSearch('')
  const url=new URL(window.location.href)
  url.searchParams.delete('module')
  url.hash='all-website-data'
  window.history.pushState(null,'',url)
  window.setTimeout(()=>document.getElementById('all-website-data')?.scrollIntoView({behavior:'smooth',block:'start'}),0)
 }

 const createUser=async(event:FormEvent)=>{
  event.preventDefault()
  setLoading(true);setUserError('');setUserNotice('')
  try{
   const created=await postJson<AuthUser>('/api/auth/users',userForm)
   setUserNotice(`${created.display_name} login created.`)
   setUserForm({username:'',display_name:'',password:'',role:'STAFF',active:true})
   await load()
  }catch(x){setUserError(String(x))}
  finally{setLoading(false)}
 }

 const switchCompany=async(companyId:number)=>{
  const session=getStoredAuth()
  if(!session||session.user.role!=='SUPER_ADMIN')return
  const company=data?.companies.find(item=>item.id===companyId)
  if(!company)return
  const updated={...session,active_company_id:company.id,active_company_name:company.name}
  setStoredAuth(updated);setActiveCompanyId(company.id)
  await load()
 }

 const updateGmailState=(gmail:Integrations['gmail'])=>{
  setData(current=>current?{...current,integrations:{...current.integrations,gmail}}:current)
 }

 const saveGmail=async(event:FormEvent)=>{
  event.preventDefault()
  setLoading(true);setGmailNotice('');setGmailError('')
  try{
   const saved=await postJson<GmailSave>('/api/settings/gmail',{
    enabled:true,
    user:gmailForm.user,
    mailbox:gmailForm.mailbox||'INBOX',
    fetch_query:gmailForm.fetch_query||'is:unread',
    fetch_limit:Number(gmailForm.fetch_limit)||25
   })
   updateGmailState(saved.gmail)
   setGmailNotice(saved.message)
  }catch(x){setGmailError(String(x))}
  finally{setLoading(false)}
 }

 const testGmail=async()=>{
  setLoading(true);setGmailNotice('');setGmailError('')
  try{
   const result=await postJson<GmailTest>('/api/settings/gmail/test',{})
   updateGmailState(result.gmail)
   if(!result.ok)throw new Error(result.message)
   setGmailNotice(result.message)
  }catch(x){setGmailError(String(x))}
  finally{setLoading(false)}
 }

 const removeGmail=async()=>{
  setLoading(true);setGmailNotice('');setGmailError('')
  try{
   const saved=await postJson<GmailSave>('/api/settings/gmail',{
    enabled:false,
    user:'',
    mailbox:'INBOX',
    fetch_query:'is:unread',
    fetch_limit:25
   })
   await postJson('/api/inbox/gmail/clear',{})
   updateGmailState(saved.gmail)
   setGmailNotice('Gmail intake disabled and imported Gmail rows cleared. OAuth connection remains managed by your administrator.')
   setGmailForm({enabled:true,user:'',mailbox:'INBOX',fetch_query:'is:unread',fetch_limit:'25'})
   await load()
  }catch(x){setGmailError(String(x))}
  finally{setLoading(false)}
 }

 const summary=useMemo(()=>data?buildSummary(data):null,[data])
 const business=useMemo(()=>data?buildBusiness(data):null,[data])
 const datasets=useMemo(()=>data?withAllRecords(data.allData):[],[data])
 const activeDataset=datasets.find(dataset=>dataset.key===activeDatasetKey)||datasets[0]
 const moduleDataset=modulePageKey?datasets.find(dataset=>dataset.key===modulePageKey):null
 const filteredRows=useMemo(()=>filterRows(activeDataset?.rows||[],dataSearch),[activeDataset,dataSearch])
 if(error)return <div className="panel error">{error}</div>
 if(!data||!summary||!business)return <div className="panel">Loading admin panel...</div>
 const p=data.dashboard.pnl

 return <section className="panel" id="admin-overview">
  {moduleSlot&&datasets.length?createPortal(<div className="adminSideDataModules">
   {datasets.map(dataset=><a key={dataset.key} href={moduleHref(dataset.key)} className={modulePageKey===dataset.key?'active':''} onClick={event=>openModulePage(dataset.key,event)}><span>{dataset.label}</span><b>{dataset.count}</b></a>)}
  </div>,moduleSlot):null}
  {moduleDataset?<>
  {moduleDataset.key==='inbox'&&<GmailAdminSetup gmail={data.integrations.gmail} form={gmailForm} setForm={setGmailForm} notice={gmailNotice} error={gmailError} loading={loading} onSave={saveGmail} onTest={testGmail} onRemove={removeGmail}/>}
  <ModulePage dataset={moduleDataset} rows={filteredRows} search={dataSearch} setSearch={setDataSearch} onBack={closeModulePage}/>
  </>:<>
  <div className="adminHeader">
   <div><p className="eyebrow">Admin</p><h2>Admin Panel</h2><span>Control center for users, masters, system health and financial checks.</span></div>
   <div className="adminHeaderActions">
    {getStoredAuth()?.user.role==='SUPER_ADMIN'&&<label className="adminCompanyPicker">Company<select value={activeCompanyId} onChange={e=>void switchCompany(Number(e.target.value))}>{data.companies.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
    <button className="secondaryBtn" onClick={load} disabled={loading}><RefreshCw size={16}/>Refresh</button>
   </div>
  </div>

  <div className="platformStats">
   <Stat icon={<Users size={18}/>} label="Login Users" value={data.users.length} onClick={()=>document.getElementById('login-users')?.scrollIntoView({behavior:'smooth'})}/>
   <Stat icon={<BriefcaseBusiness size={18}/>} label="Active Jobs" value={summary.activeJobs} onClick={()=>setPage('jobs')}/>
   <Stat icon={<WalletCards size={18}/>} label="Outstanding" value={money(summary.outstanding)} onClick={()=>setPage('billing')}/>
   <Stat icon={<Boxes size={18}/>} label="Low Stock" value={summary.lowStock.length} onClick={()=>setPage('inventory')}/>
   <Stat icon={<Activity size={18}/>} label="Backend" value={data.health.ok?'Live':'Check'} onClick={()=>setPage('settings')}/>
  </div>

  <section className="adminActionGrid subPanel">
   <AdminAction icon={<Settings size={19}/>} title="Master Settings" text="Customers, suppliers, machines and materials." onClick={()=>setPage('settings')}/>
   <AdminAction icon={<WalletCards size={19}/>} title="People Costs" text="Salary, travel, advances and commission." onClick={()=>setPage('expenses')}/>
   <AdminAction icon={<ReceiptText size={19}/>} title="Billing Control" text="Invoices, receipts and outstanding balances." onClick={()=>setPage('billing')}/>
   <AdminAction icon={<Database size={19}/>} title="Reports" text="P&L, quality and job profitability." onClick={()=>setPage('reports')}/>
  </section>

  <GmailAdminSetup gmail={data.integrations.gmail} form={gmailForm} setForm={setGmailForm} notice={gmailNotice} error={gmailError} loading={loading} onSave={saveGmail} onTest={testGmail} onRemove={removeGmail}/>

  <section className="subPanel" id="admin-business-overall">
   <div className="panelHead">
    <div><h2>Overall Business Data</h2><small>{p.period} live business snapshot</small></div>
    <button className="secondaryBtn" type="button" onClick={()=>setPage('reports')}><TrendingUp size={16}/>Reports</button>
   </div>
   <div className="adminBusinessCards">
    <BusinessCard icon={<IndianRupee size={19}/>} label="Net Sales" value={money(p.net_sales)} detail={`${business.grossMargin}% gross margin`}/>
    <BusinessCard icon={<TrendingUp size={19}/>} label="Net Profit" value={money(p.net_operating_profit)} detail={`${business.netMargin}% net margin`} tone={p.net_operating_profit>=0?'good':'bad'}/>
    <BusinessCard icon={<WalletCards size={19}/>} label="Customer Outstanding" value={money(data.dashboard.cash.customer_outstanding)} detail="Receivable balance" tone={data.dashboard.cash.customer_outstanding?'warn':'good'}/>
    <BusinessCard icon={<ReceiptText size={19}/>} label="Supplier Payable" value={money(data.dashboard.cash.supplier_payable)} detail="Purchase liability" tone={data.dashboard.cash.supplier_payable?'warn':'good'}/>
    <BusinessCard icon={<BriefcaseBusiness size={19}/>} label="Active Jobs" value={business.activeJobs} detail={`${data.jobs.length} total jobs`}/>
    <BusinessCard icon={<BadgeCheck size={19}/>} label="Quality Yield" value={`${data.quality.first_pass_yield_pct}%`} detail={`${data.quality.good_pieces}/${data.quality.expected_pieces} good pieces`} tone={data.quality.first_pass_yield_pct>=90?'good':'warn'}/>
    <BusinessCard icon={<Boxes size={19}/>} label="Low Stock" value={business.lowStock.length} detail={`${data.materials.length} material master(s)`} tone={business.lowStock.length?'bad':'good'}/>
    <BusinessCard icon={<RefreshCcw size={19}/>} label="Open Reshoots" value={business.openReshoots} detail={`${data.reshoots.length} total ticket(s)`} tone={business.openReshoots?'warn':'good'}/>
   </div>
   <div className="adminBusinessGrid">
    <div className="adminBusinessBox">
     <h3>Financial Detail</h3>
     <div className="financeGrid">
      <Figure label="Direct Production Cost" value={money(p.direct_production_cost)} sub={`${business.directCostPct}% of sales`}/>
      <Figure label="Company Overhead" value={money(p.company_overhead)} sub={`${business.overheadPct}% of sales`}/>
      <Figure label="Cost / Gram" value={money(p.cost_per_gram)} sub={`${p.successful_billable_weight_g}g billable`}/>
      <Figure label="This Month Expenses" value={money(summary.monthExpenses)} sub={`${money(business.totalExpenses)} all expenses`}/>
     </div>
    </div>
    <div className="adminBusinessBox">
     <h3>Operations Detail</h3>
     <div className="miniStats">
      <span>Printing <b>{data.dashboard.counts.printing}</b></span>
      <span>QC Failed <b>{data.dashboard.counts.qc_failed}</b></span>
      <span>Open Reshoots <b>{business.openReshoots}</b></span>
      <span>Low Stock <b>{business.lowStock.length}</b></span>
     </div>
    </div>
    <div className="adminBusinessBox span2">
     <div className="panelHead"><h3>Recent Job Profitability</h3><small>{data.profitability.length} job(s)</small></div>
     <div className="profitList">{data.profitability.slice(0,6).map(job=><div className="profitRow" key={job.job}><span><b>{job.job}</b><small>{job.customer}</small></span><strong>{money(job.gross_profit)}</strong><em className={job.margin_pct>=0?'':'badText'}>{job.margin_pct}%</em></div>)}</div>
    </div>
   </div>
  </section>

  <section className="subPanel" id="all-website-data">
   <div className="panelHead adminDataHead">
    <div><h2>All Website Data</h2><small>{data.allData.total_records} total record(s)</small></div>
   </div>
   <p className="adminDataHint">Each website module now opens as a separate page. Use the Data Modules list in the left sidebar to open Customers, Jobs, Expenses, Payments and other records.</p>
   <div className="adminModuleLanding">
    <div><Database size={24}/><span><b>{datasets.length}</b><small>Separated module pages</small></span></div>
    <div><Activity size={24}/><span><b>{data.allData.total_records}</b><small>Total records available</small></span></div>
    <button type="button" className="primaryBtn" onClick={()=>openModulePage(datasets[0]?.key||'app_users')}><Database size={16}/>Open First Module</button>
   </div>
  </section>

  <div className="adminGrid">
   <section className="subPanel" id="admin-system-health">
    <div className="panelHead"><h2>System Health</h2><small>{data.health.app}</small></div>
    <div className="adminHealth">
     <Health icon={<Activity size={18}/>} label="File Storage" value={data.health.file_storage==='R2'?'Enabled':'Not enabled'} tone={data.health.file_storage==='R2'?'good':'warn'}/>
     <Health icon={<Activity size={18}/>} label="Backend API" value={data.health.ok?'Online':'Offline'} tone={data.health.ok?'good':'bad'}/>
     <Health icon={<Mail size={18}/>} label="Gmail Intake" value={data.integrations.gmail.configured?'Saved':'Setup'} tone={data.integrations.gmail.configured?'good':'warn'}/>
     <Health icon={<Wrench size={18}/>} label="Magics Agent" value={data.integrations.magics.agent_token_configured?'Ready':'Default'} tone={data.integrations.magics.agent_token_configured?'good':'warn'}/>
     <Health icon={<LockKeyhole size={18}/>} label="Access Mode" value="Role Based" tone="good"/>
    </div>
   </section>

   <section className="subPanel" id="admin-attention">
    <div className="panelHead"><h2>Admin Attention</h2><small>{summary.attention.length} item(s)</small></div>
    <div className="adminAttention">
     {summary.attention.map(item=><button key={item.label} type="button" onClick={()=>setPage(item.page)}><item.icon size={18}/><span><b>{item.label}</b><small>{item.detail}</small></span><strong>{item.value}</strong></button>)}
    </div>
   </section>
  </div>

  <section className="adminGrid subPanel" id="login-users">
   <div>
    <div className="panelHead"><h2>Login Users</h2><small>{data.users.length} account(s)</small></div>
    <form className="adminUserForm" onSubmit={createUser}>
     <label>Name<input value={userForm.display_name} onChange={e=>setUserForm({...userForm,display_name:e.target.value})} placeholder="Staff name" required /></label>
     <label>Username<input value={userForm.username} onChange={e=>setUserForm({...userForm,username:e.target.value})} placeholder="login id" required /></label>
     <label>Password<input type="password" value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} placeholder="Set password" required /></label>
     <label>Role<select value={userForm.role} onChange={e=>setUserForm({...userForm,role:e.target.value})}><option value="STAFF">Staff</option><option value="OPERATOR">Operator</option><option value="ACCOUNTS">Accounts</option><option value="ADMIN">Admin</option></select></label>
     <label className="adminUserActive"><input type="checkbox" checked={userForm.active} onChange={e=>setUserForm({...userForm,active:e.target.checked})}/>Active</label>
     <button className="primaryBtn" type="submit" disabled={loading}><UserPlus size={16}/>Create Login</button>
    </form>
    {userNotice&&<div className="successBox">{userNotice}</div>}
    {userError&&<div className="errorBox">{userError}</div>}
    <div className="adminUsers">
     {data.users.map(user=><article key={user.id}>
      <span><b>{user.display_name}</b><small>{user.username}</small></span>
      <em>{prettyRole(user.role)}</em>
      <strong className={user.active?'':'inactive'}>{user.active?'Active':'Off'}</strong>
     </article>)}
    </div>
   </div>

   <div>
    <div className="panelHead"><h2>Master Data</h2><small>Setup snapshot</small></div>
    <div className="adminMasters">
     <Master label="Customers" value={data.customers.length} detail={data.customers.slice(0,3).map(c=>c.name).join(' / ')||'No customers'}/>
     <Master label="Machines" value={data.machines.length} detail={`${summary.availableMachines} available / ${data.machines.length} total`}/>
     <Master label="Materials" value={data.materials.length} detail={`${summary.lowStock.length} low stock alert(s)`}/>
     <Master label="Expenses" value={money(summary.monthExpenses)} detail="This month"/>
    </div>
   </div>
  </section>

  <section className="subPanel" id="change-history">
   <div className="panelHead"><h2>Change History</h2><small>{data.auditLogs.length} recent changes</small></div>
   <p className="auditHint">Successful changes show the employee, company, action and submitted fields. Passwords and tokens are redacted.</p>
   <div className="adminAuditLogs">
    {data.auditLogs.map(event=><article key={event.id}>
     <div><b>{event.user_name}</b><small>{event.company_name} · {event.module}</small></div>
     <strong>{event.action}</strong>
     <time>{new Date(event.created_at+'Z').toLocaleString('en-IN')}</time>
     {event.details&&<details><summary>Details</summary><pre>{event.details}</pre></details>}
    </article>)}
    {!data.auditLogs.length&&<div className="emptyState">No changes have been recorded yet.</div>}
   </div>
  </section>
  </>}
 </section>
}

function buildSummary(data:AdminData){
 const activeJobs=data.jobs.filter(j=>openStatuses.has(j.status)).length
 const outstanding=data.invoices.reduce((sum,i)=>sum+i.outstanding,0)
 const lowStock=data.materials.filter(m=>m.stock<=m.minimum_stock)
 const availableMachines=data.machines.filter(m=>m.status==='AVAILABLE').length
 const month=new Date().toISOString().slice(0,7)
 const monthExpenses=data.expenses.filter(e=>String(e.date).slice(0,7)===month).reduce((sum,e)=>sum+e.amount,0)
 const attention=[
  outstanding>0?{label:'Collect Receivables',detail:'Customer payment follow-up',value:money(outstanding),page:'billing',icon:WalletCards}:null,
  lowStock.length?{label:'Reorder Materials',detail:'Stock below minimum',value:String(lowStock.length),page:'inventory',icon:Boxes}:null,
  activeJobs?{label:'Track Active Jobs',detail:'Open production flow',value:String(activeJobs),page:'jobs',icon:BriefcaseBusiness}:null,
  !data.integrations.gmail.configured?{label:'Gmail Setup',detail:'Inbox integration pending',value:'Setup',page:'settings',icon:AlertTriangle}:null,
  !outstanding&&!lowStock.length&&!activeJobs&&data.integrations.gmail.configured?{label:'No Admin Alerts',detail:'System checks are clear',value:'OK',page:'dashboard',icon:ShieldCheck}:null
 ].filter(Boolean) as {label:string;detail:string;value:string;page:string;icon:typeof ShieldCheck}[]
 return {activeJobs,outstanding,lowStock,availableMachines,monthExpenses,attention}
}

function buildBusiness(data:AdminData){
 const p=data.dashboard.pnl
 const activeJobs=data.jobs.filter(j=>openStatuses.has(j.status)).length
 const lowStock=data.materials.filter(m=>m.stock<=m.minimum_stock)
 const openReshoots=data.reshoots.filter(r=>r.status!=='CLOSED').length
 const totalExpenses=data.expenses.reduce((sum,e)=>sum+e.amount,0)
 return {
  activeJobs,
  lowStock,
  openReshoots,
  totalExpenses,
  grossMargin:pct(p.gross_profit,p.net_sales),
  netMargin:pct(p.net_operating_profit,p.net_sales),
  directCostPct:pct(p.direct_production_cost,p.net_sales),
  overheadPct:pct(p.company_overhead,p.net_sales)
 }
}

function prettyRole(role:string){
 return role.toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase())
}

function withAllRecords(allData:AdminAllData):AdminDataset[]{
 const allRows=allData.datasets.flatMap(dataset=>dataset.rows.map(row=>({module:dataset.label,...row})))
 return [{key:'all_records',label:'All Records',count:allData.total_records,rows:allRows},...allData.datasets]
}

function filterRows(rows:Record<string,unknown>[],term:string){
 const query=term.trim().toLowerCase()
 if(!query)return rows
 return rows.filter(row=>Object.values(row).some(value=>String(value??'').toLowerCase().includes(query)))
}

function DataTable({dataset,rows}:{dataset:AdminDataset;rows:Record<string,unknown>[]}){
 const columns=Array.from(new Set(rows.flatMap(row=>Object.keys(row))))
 return <div className="adminDataTableWrap">
  <div className="adminDataTableMeta"><b>{dataset.label}</b><span>{rows.length} of {dataset.count} row(s)</span></div>
  {rows.length?<table className="adminDataTable"><thead><tr>{columns.map(column=><th key={column}>{formatColumn(column)}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={`${dataset.key}-${index}`}>{columns.map(column=><td key={column}>{formatValue(row[column])}</td>)}</tr>)}</tbody></table>:<div className="emptyState"><Database size={28}/><p>No records found.</p></div>}
 </div>
}

function ModulePage({dataset,rows,search,setSearch,onBack}:{dataset:AdminDataset;rows:Record<string,unknown>[];search:string;setSearch:(value:string)=>void;onBack:()=>void}){
 return <section className="adminModulePage" id={`module-${dataset.key}`}>
  <div className="adminHeader">
   <div><p className="eyebrow">Data Module</p><h2>{dataset.label}</h2><span>Separate page for {dataset.count} record(s) from this module.</span></div>
   <button type="button" className="secondaryBtn" onClick={onBack}><Database size={16}/>All Website Data</button>
  </div>
  <div className="adminModuleToolbar">
   <div><b>{dataset.label}</b><small>{rows.length} visible / {dataset.count} total</small></div>
   <label><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${dataset.label.toLowerCase()}...`}/></label>
  </div>
  <DataTable dataset={dataset} rows={rows}/>
 </section>
}

function GmailAdminSetup({gmail,form,setForm,notice,error,loading,onSave,onTest,onRemove}:{gmail:Integrations['gmail'];form:GmailFormState;setForm:Dispatch<SetStateAction<GmailFormState>>;notice:string;error:string;loading:boolean;onSave:(event:FormEvent)=>void;onTest:()=>void;onRemove:()=>void}){
 return <section className="subPanel adminGmailSetup" id="admin-gmail-setup">
  <div className="panelHead">
   <div><h2>Gmail Intake Setup</h2><small>{gmail.configured?'Connected settings saved':'Set up the Gmail OAuth connection'}</small></div>
   <span className={`healthPill ${gmail.configured?'good':'warn'}`}>{gmail.configured?'Saved':'Setup'}</span>
  </div>
  <div className="integrationRows">
   <GmailInfo label="Enabled" value={gmail.enabled?'Yes':'No'}/>
   <GmailInfo label="Configured" value={gmail.configured?'Yes':'No'}/>
   <GmailInfo label="Account" value={gmail.user||'Not set'}/>
   <GmailInfo label="Fetch" value={`${gmail.fetch_query||'is:unread'} / ${gmail.fetch_limit||0}`}/>
  </div>
  <p>Gmail uses a secure OAuth connection. Your administrator must configure the Gmail client ID, client secret and refresh token in Cloudflare. Then save the account and intake filters here.</p>
  <form className="settingsForm gmailSettingsForm" onSubmit={onSave}>
   <label>Email<input type="email" value={form.user} onChange={event=>setForm({...form,user:event.target.value})} placeholder="name@gmail.com" required/></label>
   <label>Gmail label<input value={form.mailbox} onChange={e=>setForm({...form,mailbox:e.target.value})} placeholder="INBOX"/></label>
   <label>Search query<input value={form.fetch_query} onChange={e=>setForm({...form,fetch_query:e.target.value})} placeholder="is:unread"/></label>
   <label>Fetch limit<input type="number" min="1" max="100" value={form.fetch_limit} onChange={e=>setForm({...form,fetch_limit:e.target.value})}/></label>
   <div className="settingsActions">
    <button className="primaryBtn" type="submit" disabled={loading||!form.user}><Save size={16}/>Save Gmail</button>
    <button className="secondaryBtn" type="button" onClick={onTest} disabled={loading||!gmail.configured}><CheckCircle2 size={16}/>Test</button>
   <button className="secondaryBtn" type="button" onClick={onRemove} disabled={loading||!gmail.configured}><Trash2 size={16}/>Disable and clear imports</button>
   </div>
  </form>
  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}
 </section>
}

function GmailInfo({label,value}:{label:string;value:string}){return <span><small>{label}</small><b>{value}</b></span>}

function formatColumn(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase())}
function formatValue(value:unknown){
 if(value===null||value===undefined||value==='')return '-'
 if(typeof value==='boolean')return value?'Yes':'No'
 if(typeof value==='number')return Number.isInteger(value)?String(value):String(Number(value.toFixed(2)))
 return String(value)
}

function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function AdminAction({icon,title,text,onClick}:{icon:ReactNode;title:string;text:string;onClick:()=>void}){return <button type="button" onClick={onClick}>{icon}<span><b>{title}</b><small>{text}</small></span></button>}
function BusinessCard({icon,label,value,detail,tone=''}:{icon:ReactNode;label:string;value:string|number;detail:string;tone?:'good'|'warn'|'bad'|''}){return <div className={`adminBusinessCard ${tone}`}>{icon}<span><small>{label}</small><b>{value}</b><em>{detail}</em></span></div>}
function Figure({label,value,sub}:{label:string;value:string;sub?:string}){return <div className="figureBox"><small>{label}</small><strong>{value}</strong>{sub&&<span>{sub}</span>}</div>}
function Health({icon,label,value,tone}:{icon:ReactNode;label:string;value:string;tone:'good'|'warn'|'bad'}){return <div className={`adminHealthCard ${tone}`}>{icon}<span><small>{label}</small><b>{value}</b></span></div>}
function Master({label,value,detail}:{label:string;value:string|number;detail:string}){return <div><small>{label}</small><b>{value}</b><span>{detail}</span></div>}
