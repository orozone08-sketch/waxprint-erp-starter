import {type FormEvent, type ReactNode, type Ref, type RefObject, useEffect, useRef, useState} from 'react'
import {Boxes, CheckCircle2, Mail, Plus, Printer, RefreshCw, Save, Store, Trash2, Users, Wrench} from 'lucide-react'
import {getJson, postJson} from '../api'

type Customer={id:number;code:string;name:string;email:string|null;whatsapp:string|null;default_rate:number;credit_days:number}
type Supplier={id:number;code:string;name:string;gst_number:string|null;contact:string|null}
type Machine={id:number;code:string;name:string;model:string|null;serial_number:string|null;status:string}
type Material={id:number;code:string;name:string;unit:string;stock:number;minimum_stock:number}
type Integrations={gmail:{enabled:boolean;configured:boolean;mode:string;user:string;mailbox:string;fetch_query:string;fetch_limit:number;archive_label:string};magics:{agent_token_configured:boolean;workstation_default:string;local_agent_folder:string;queue_endpoint:string}}
type GmailSave={ok:boolean;message:string;gmail:Integrations['gmail']}
type GmailTest={ok:boolean;message:string;gmail:Integrations['gmail']}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0)

export default function SettingsPage(){
 const[customers,setCustomers]=useState<Customer[]>([])
 const[suppliers,setSuppliers]=useState<Supplier[]>([])
 const[machines,setMachines]=useState<Machine[]>([])
 const[materials,setMaterials]=useState<Material[]>([])
 const[integrations,setIntegrations]=useState<Integrations|null>(null)
 const[customer,setCustomer]=useState({name:'',email:'',whatsapp:'',default_rate:'300',credit_days:'30'})
 const[supplier,setSupplier]=useState({code:'',name:'',gst_number:'',contact:''})
 const[machine,setMachine]=useState({code:'',name:'',model:'',serial_number:'',status:'AVAILABLE'})
 const[material,setMaterial]=useState({code:'',name:'',unit:'kit',minimum_stock:'1'})
 const[gmailForm,setGmailForm]=useState({enabled:true,user:'',app_password:'',mailbox:'INBOX',fetch_query:'UNSEEN',fetch_limit:'25'})
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const[highlight,setHighlight]=useState('')
 const gmailRef=useRef<HTMLElement>(null)
 const customersRef=useRef<HTMLElement>(null)
 const suppliersRef=useRef<HTMLElement>(null)
 const machinesRef=useRef<HTMLElement>(null)
 const materialsRef=useRef<HTMLElement>(null)

 const load=async()=>{
  setError('')
  const [c,s,ma,mt,i]=await Promise.all([
   getJson<Customer[]>('/api/customers'),
   getJson<Supplier[]>('/api/suppliers'),
   getJson<Machine[]>('/api/machines'),
   getJson<Material[]>('/api/materials'),
   getJson<Integrations>('/api/settings/integrations')
  ])
  setCustomers(c);setSuppliers(s);setMachines(ma);setMaterials(mt);setIntegrations(i)
  setGmailForm(form=>({
   ...form,
   enabled:i.gmail.enabled,
   user:i.gmail.user||form.user,
   app_password:'',
   mailbox:i.gmail.mailbox||'INBOX',
   fetch_query:i.gmail.fetch_query||'UNSEEN',
   fetch_limit:String(i.gmail.fetch_limit||25)
  }))
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const run=async(action:()=>Promise<unknown>,message:string)=>{
  setLoading(true);setError('');setNotice('')
  try{await action();setNotice(message);await load()}catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const addCustomer=()=>run(()=>postJson('/api/customers',{name:customer.name,email:customer.email||null,whatsapp:customer.whatsapp||null,default_rate:Number(customer.default_rate)||0,credit_days:Number(customer.credit_days)||0}),`${customer.name} customer added.`).then(()=>setCustomer({name:'',email:'',whatsapp:'',default_rate:'300',credit_days:'30'}))
 const addSupplier=()=>run(()=>postJson('/api/suppliers',{code:supplier.code,name:supplier.name,gst_number:supplier.gst_number||null,contact:supplier.contact||null}),`${supplier.name} supplier added.`).then(()=>setSupplier({code:'',name:'',gst_number:'',contact:''}))
 const addMachine=()=>run(()=>postJson('/api/machines',{code:machine.code,name:machine.name,model:machine.model||null,serial_number:machine.serial_number||null,status:machine.status}),`${machine.name} machine added.`).then(()=>setMachine({code:'',name:'',model:'',serial_number:'',status:'AVAILABLE'}))
 const addMaterial=()=>run(()=>postJson('/api/materials',{code:material.code,name:material.name,unit:material.unit,minimum_stock:Number(material.minimum_stock)||0}),`${material.name} material added.`).then(()=>setMaterial({code:'',name:'',unit:'kit',minimum_stock:'1'}))
 const saveGmail=(event:FormEvent)=>{event.preventDefault();return run(async()=>{
  const saved=await postJson<GmailSave>('/api/settings/gmail',{
   enabled:true,
   user:gmailForm.user,
   app_password:gmailForm.app_password||null,
   clear_password:false,
   mailbox:gmailForm.mailbox||'INBOX',
   fetch_query:gmailForm.fetch_query||'UNSEEN',
   fetch_limit:Number(gmailForm.fetch_limit)||25
  })
  setIntegrations(current=>current?{...current,gmail:saved.gmail}:current)
 },'Gmail settings saved.').then(()=>setGmailForm(form=>({...form,app_password:''})))}
 const testGmail=()=>run(async()=>{
  const result=await postJson<GmailTest>('/api/settings/gmail/test',{})
  if(!result.ok)throw new Error(result.message)
  setIntegrations(current=>current?{...current,gmail:result.gmail}:current)
 },'Gmail connected successfully.')
 const removeGmail=()=>run(async()=>{
  const saved=await postJson<GmailSave>('/api/settings/gmail',{
   enabled:false,
   user:'',
   app_password:null,
   clear_password:true,
   mailbox:'INBOX',
   fetch_query:'UNSEEN',
   fetch_limit:25
  })
  await postJson('/api/inbox/gmail/clear',{})
  setIntegrations(current=>current?{...current,gmail:saved.gmail}:current)
 },'Gmail account and old imported Gmail rows removed. Add another account now.').then(()=>setGmailForm({enabled:true,user:'',app_password:'',mailbox:'INBOX',fetch_query:'UNSEEN',fetch_limit:'25'}))
 const jumpTo=(section:string, ref:RefObject<HTMLElement|null>)=>{
  setHighlight(section)
  ref.current?.scrollIntoView({behavior:'smooth',block:'start'})
  window.setTimeout(()=>setHighlight(''),1400)
 }

 return <section className="panel">
  <div className="settingsHeader">
   <div><h2>Settings</h2><p>Company masters, customer rates, suppliers, machines, materials, Gmail and Magics settings.</p></div>
   <button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<Users size={18}/>} label="Customers" value={customers.length} onClick={()=>jumpTo('customers',customersRef)}/>
   <Stat icon={<Store size={18}/>} label="Suppliers" value={suppliers.length} onClick={()=>jumpTo('suppliers',suppliersRef)}/>
   <Stat icon={<Printer size={18}/>} label="Machines" value={machines.length} onClick={()=>jumpTo('machines',machinesRef)}/>
   <Stat icon={<Boxes size={18}/>} label="Materials" value={materials.length} onClick={()=>jumpTo('materials',materialsRef)}/>
   <Stat icon={<CheckCircle2 size={18}/>} label="Gmail" value={integrations?.gmail.configured?'Saved':'Setup'} onClick={()=>jumpTo('gmail',gmailRef)}/>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="settingsGrid subPanel">
   <MasterPanel panelRef={gmailRef} active={highlight==='gmail'} icon={<Mail size={18}/>} title="Gmail Intake">
    <div className="integrationRows">
     <Info label="Enabled" value={integrations?.gmail.enabled?'Yes':'No'}/>
     <Info label="Configured" value={integrations?.gmail.configured?'Yes':'No'}/>
     <Info label="Mode" value={integrations?.gmail.mode||'none'}/>
     <Info label="Account" value={integrations?.gmail.user||'Not set'}/>
     <Info label="Mailbox" value={integrations?.gmail.mailbox||'INBOX'}/>
     <Info label="Fetch" value={`${integrations?.gmail.fetch_query||'UNSEEN'} / ${integrations?.gmail.fetch_limit||0}`}/>
    </div>
    <form className="settingsForm gmailSettingsForm" onSubmit={saveGmail}>
     <label>Email<input type="email" value={gmailForm.user} onChange={e=>setGmailForm({...gmailForm,user:e.target.value})} placeholder="name@gmail.com" required/></label>
     <label>Password<input type="password" value={gmailForm.app_password} onChange={e=>setGmailForm({...gmailForm,app_password:e.target.value})} placeholder="Enter password" autoComplete="new-password"/></label>
     <div className="settingsActions">
      <button className="primaryBtn" type="submit" disabled={loading||!gmailForm.user}><Save size={16}/>Save Gmail</button>
      <button className="secondaryBtn" type="button" onClick={testGmail} disabled={loading||!integrations?.gmail.configured}><CheckCircle2 size={16}/>Test</button>
      <button className="secondaryBtn" type="button" onClick={removeGmail} disabled={loading||!integrations?.gmail.configured}><Trash2 size={16}/>Remove Gmail</button>
     </div>
    </form>
   </MasterPanel>

   <MasterPanel icon={<Wrench size={18}/>} title="Magics Bridge">
    <div className="integrationRows">
     <Info label="Agent Token" value={integrations?.magics.agent_token_configured?'Configured':'Default'}/>
     <Info label="Workstation" value={integrations?.magics.workstation_default||'MAGICS-PC-01'}/>
     <Info label="Agent Folder" value={integrations?.magics.local_agent_folder||'magics_agent'}/>
     <Info label="Queue" value={integrations?.magics.queue_endpoint||'/api/magics/agent/jobs'}/>
    </div>
   </MasterPanel>
  </section>

  <section className="settingsGrid subPanel">
   <MasterPanel panelRef={customersRef} active={highlight==='customers'} icon={<Users size={18}/>} title="Customers / Rates">
    <div className="settingsForm customerSettingsForm">
     <label>Name<input value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label>
     <label>Email<input value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></label>
     <label>WhatsApp<input value={customer.whatsapp} onChange={e=>setCustomer({...customer,whatsapp:e.target.value})}/></label>
     <label>Rate / g<input inputMode="decimal" value={customer.default_rate} onChange={e=>setCustomer({...customer,default_rate:e.target.value})}/></label>
     <label>Credit days<input inputMode="numeric" value={customer.credit_days} onChange={e=>setCustomer({...customer,credit_days:e.target.value})}/></label>
     <button className="primaryBtn" onClick={addCustomer} disabled={loading||!customer.name}><Plus size={16}/>Add Customer</button>
    </div>
    <MiniTable rows={customers.slice(0,6).map(c=>[c.code,c.name,money(c.default_rate)+'/g',`${c.credit_days} days`])}/>
   </MasterPanel>

   <MasterPanel panelRef={suppliersRef} active={highlight==='suppliers'} icon={<Store size={18}/>} title="Suppliers">
    <div className="settingsForm">
     <label>Code<input value={supplier.code} onChange={e=>setSupplier({...supplier,code:e.target.value})}/></label>
     <label>Name<input value={supplier.name} onChange={e=>setSupplier({...supplier,name:e.target.value})}/></label>
     <label>GST<input value={supplier.gst_number} onChange={e=>setSupplier({...supplier,gst_number:e.target.value})}/></label>
     <label>Contact<input value={supplier.contact} onChange={e=>setSupplier({...supplier,contact:e.target.value})}/></label>
     <button className="primaryBtn" onClick={addSupplier} disabled={loading||!supplier.code||!supplier.name}><Plus size={16}/>Add Supplier</button>
    </div>
    <MiniTable rows={suppliers.slice(0,6).map(s=>[s.code,s.name,s.contact||'-'])}/>
   </MasterPanel>

   <MasterPanel panelRef={machinesRef} active={highlight==='machines'} icon={<Printer size={18}/>} title="Machines">
    <div className="settingsForm">
     <label>Code<input value={machine.code} onChange={e=>setMachine({...machine,code:e.target.value})}/></label>
     <label>Name<input value={machine.name} onChange={e=>setMachine({...machine,name:e.target.value})}/></label>
     <label>Model<input value={machine.model} onChange={e=>setMachine({...machine,model:e.target.value})}/></label>
     <label>Serial<input value={machine.serial_number} onChange={e=>setMachine({...machine,serial_number:e.target.value})}/></label>
     <label>Status<select value={machine.status} onChange={e=>setMachine({...machine,status:e.target.value})}><option>AVAILABLE</option><option>PRINTING</option><option>MAINTENANCE</option><option>IDLE</option></select></label>
     <button className="primaryBtn" onClick={addMachine} disabled={loading||!machine.code||!machine.name}><Plus size={16}/>Add Machine</button>
    </div>
    <MiniTable rows={machines.slice(0,6).map(m=>[m.code,m.name,m.model||'-',pretty(m.status)])}/>
   </MasterPanel>

   <MasterPanel panelRef={materialsRef} active={highlight==='materials'} icon={<Boxes size={18}/>} title="Materials">
    <div className="settingsForm">
     <label>Code<input value={material.code} onChange={e=>setMaterial({...material,code:e.target.value})}/></label>
     <label>Name<input value={material.name} onChange={e=>setMaterial({...material,name:e.target.value})}/></label>
     <label>Unit<input value={material.unit} onChange={e=>setMaterial({...material,unit:e.target.value})}/></label>
     <label>Minimum<input inputMode="decimal" value={material.minimum_stock} onChange={e=>setMaterial({...material,minimum_stock:e.target.value})}/></label>
     <button className="primaryBtn" onClick={addMaterial} disabled={loading||!material.code||!material.name}><Plus size={16}/>Add Material</button>
    </div>
    <MiniTable rows={materials.slice(0,6).map(m=>[m.code,m.name,`${m.stock} ${m.unit}`,`Min ${m.minimum_stock}`])}/>
   </MasterPanel>
  </section>
 </section>
}

function MasterPanel({icon,title,children,panelRef,active=false}:{icon:ReactNode;title:string;children:ReactNode;panelRef?:Ref<HTMLElement>;active?:boolean}){return <article ref={panelRef} className={active?'settingsPanel panelFlash':'settingsPanel'}><div className="settingsPanelHead">{icon}<h3>{title}</h3></div>{children}</article>}
function Info({label,value}:{label:string;value:string}){return <span><small>{label}</small><b>{value}</b></span>}
function MiniTable({rows}:{rows:string[][]}){return <div className="settingsMiniTable">{rows.map((r,i)=><p key={i}>{r.map((c,idx)=><span key={idx}>{c}</span>)}</p>)}</div>}
function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
