import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {Download, FileSpreadsheet, Mail, MessageCircle, Plus, RefreshCw, ReceiptIndianRupee, Search, Upload, Users} from 'lucide-react'
import {getJson, postJson} from '../api'
import {strFromU8, unzipSync} from 'fflate'

type Customer={id:number;code:string;name:string;email:string|null;whatsapp:string|null;default_rate:number;credit_days:number}
type ImportCustomer={name:string;email:string|null;whatsapp:string|null;default_rate:number;credit_days:number;gst_number?:string|null}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0)

export default function Customers(){
 const[customers,setCustomers]=useState<Customer[]>([])
 const[form,setForm]=useState({name:'',email:'',whatsapp:'',default_rate:'300',credit_days:'30'})
 const[query,setQuery]=useState('')
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const[importRows,setImportRows]=useState<ImportCustomer[]>([])
 const[importName,setImportName]=useState('')

 const load=async()=>{setError('');setCustomers(await getJson<Customer[]>('/api/customers'))}
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const filtered=useMemo(()=>{
  const term=query.trim().toLowerCase()
  if(!term)return customers
  return customers.filter(c=>[c.code,c.name,c.email,c.whatsapp,money(c.default_rate),`${c.credit_days}`].some(v=>String(v||'').toLowerCase().includes(term)))
 },[customers,query])

 const averageRate=customers.length?customers.reduce((sum,c)=>sum+(c.default_rate||0),0)/customers.length:0
 const addCustomer=async()=>{
  if(!form.name.trim())return
  setLoading(true);setError('');setNotice('')
  try{
   await postJson('/api/customers',{
    name:form.name.trim(),
    email:form.email.trim()||null,
    whatsapp:form.whatsapp.trim()||null,
    default_rate:Number(form.default_rate)||0,
    credit_days:Number(form.credit_days)||0
   })
   setNotice(`${form.name.trim()} customer added.`)
   setForm({name:'',email:'',whatsapp:'',default_rate:'300',credit_days:'30'})
   await load()
   document.getElementById('customer-list')?.scrollIntoView({behavior:'smooth',block:'start'})
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const readImportFile=async(file:File)=>{
  setError('');setNotice('');setImportRows([]);setImportName(file.name)
  try{
   const matrix=file.name.toLowerCase().endsWith('.csv')?parseCsv(await file.text()):await parseXlsx(file)
   const rows=mapCustomerRows(matrix)
   if(!rows.length)throw new Error('No customer rows found. Make sure the sheet has a Name/Customer Name column and customer data below it.')
   if(rows.length>500)throw new Error('This sheet has more than 500 customer rows. Split it into smaller files and upload each one.')
   setImportRows(rows)
  }catch(e){setError(e instanceof Error?e.message:String(e));setImportName('')}
 }
 const importCustomers=async()=>{
  if(!importRows.length)return
  setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<{imported:number;duplicates:number;errors:string[]}>('/api/customers/import',{rows:importRows})
   const summary=`Imported ${result.imported} customer(s); skipped ${result.duplicates} duplicate(s).${result.errors.length?` ${result.errors.length} row(s) need correction.`:''}`
   setNotice(summary);setImportRows([]);setImportName('');await load()
   if(result.errors.length)setError(result.errors.slice(0,8).join(' · ')+(result.errors.length>8?' · See first 8 row errors.':''))
  }catch(e){setError(String(e))}finally{setLoading(false)}
 }

 return <section className="panel">
  <div className="customersHeader">
   <div><h2>Customers</h2><p>Add customer accounts, rates and contact details used by jobs and billing.</p></div>
   <button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats customerStats">
   <Stat icon={<Users size={18}/>} label="Customers" value={customers.length} onClick={()=>jumpTo('customer-list')}/>
   <Stat icon={<Mail size={18}/>} label="Email Saved" value={customers.filter(c=>c.email).length} onClick={()=>jumpTo('customer-list')}/>
   <Stat icon={<MessageCircle size={18}/>} label="WhatsApp Saved" value={customers.filter(c=>c.whatsapp).length} onClick={()=>jumpTo('customer-list')}/>
   <Stat icon={<ReceiptIndianRupee size={18}/>} label="Average Rate / g" value={money(averageRate)} onClick={()=>jumpTo('add-customer')}/>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel customerImportPanel" id="import-customers">
   <div className="panelHead"><div><h2>Import Customers from Excel</h2><p>Upload an .xlsx Excel sheet or .csv file. Existing customers with the same email or WhatsApp number are skipped.</p></div></div>
   <div className="customerImportActions">
    <label className="secondaryBtn customerImportChoose"><Upload size={16}/>{importName||'Choose Excel / CSV'}<input type="file" accept=".xlsx,.csv" disabled={loading} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void readImportFile(file);e.currentTarget.value=''}}/></label>
    <button className="secondaryBtn" type="button" onClick={downloadTemplate}><Download size={16}/>Download template</button>
    {importRows.length>0&&<button className="primaryBtn" type="button" onClick={()=>void importCustomers()} disabled={loading}><FileSpreadsheet size={16}/>{loading?'Importing…':`Import ${importRows.length} customers`}</button>}
   </div>
   {importRows.length>0&&<><p className="mutedCell">Preview: first {Math.min(importRows.length,5)} of {importRows.length} rows. Rate / g and credit days default to 0 and 0 when blank.</p><div className="tableScroll"><table><thead><tr><th>Name</th><th>Email</th><th>WhatsApp</th><th>Rate / g</th><th>Credit days</th></tr></thead><tbody>{importRows.slice(0,5).map((row,i)=><tr key={`${row.name}-${i}`}><td>{row.name}</td><td>{row.email||'-'}</td><td>{row.whatsapp||'-'}</td><td>{row.default_rate}</td><td>{row.credit_days}</td></tr>)}</tbody></table></div></>}
   <small className="mutedCell">Expected columns: Name, Email, WhatsApp/Phone, Rate per gram, Credit days, GST number. The header row can use common alternatives such as Customer Name or Mobile.</small>
  </section>

  <section id="add-customer" className="subPanel">
   <div className="panelHead"><div><h2>Add Customer</h2><p>Create a customer once, then use the same account in job intake and billing.</p></div></div>
   <div className="settingsForm customerSettingsForm">
    <label>Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label>WhatsApp<input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/></label>
    <label>Rate / g<input inputMode="decimal" value={form.default_rate} onChange={e=>setForm({...form,default_rate:e.target.value})}/></label>
    <label>Credit days<input inputMode="numeric" value={form.credit_days} onChange={e=>setForm({...form,credit_days:e.target.value})}/></label>
    <button className="primaryBtn" onClick={addCustomer} disabled={loading||!form.name.trim()}><Plus size={16}/>Add Customer</button>
   </div>
  </section>

  <section id="customer-list" className="subPanel">
   <div className="customersListHead">
    <div><h2>Customer List</h2><p>{filtered.length} customer(s)</p></div>
    <label className="customerSearch"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search customers..." /></label>
   </div>
   <table>
    <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>WhatsApp</th><th>Rate / g</th><th>Credit</th></tr></thead>
    <tbody>
     {filtered.map(c=><tr key={c.id}><td><b>{c.code}</b></td><td>{c.name}</td><td>{c.email||'-'}</td><td>{c.whatsapp||'-'}</td><td>{money(c.default_rate)}</td><td>{c.credit_days} days</td></tr>)}
     {!filtered.length&&<tr><td colSpan={6}>No customers found.</td></tr>}
    </tbody>
   </table>
  </section>
 </section>
}

function downloadTemplate(){
 const csv='Name,Email,WhatsApp,Rate per gram,Credit days,GST number\r\nExample Customer,customer@example.com,9876543210,150,30,\r\n'
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='customer-import-template.csv';a.click();URL.revokeObjectURL(url)
}
function normalizeHeader(value:string){return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
const HEADER_ALIASES:Record<string,string[]>={name:['name','customer','customer name','client name','party name','account name'],email:['email','email address','e mail'],whatsapp:['whatsapp','whatsapp number','phone','phone number','mobile','mobile number','contact','contact number'],default_rate:['rate','rate g','rate per g','rate per gram','default rate','default rate g','price per gram'],credit_days:['credit','credit days','payment days','due days'],gst_number:['gst','gst no','gst number','gstin','gst registration number']}
function mapCustomerRows(matrix:string[][]):ImportCustomer[]{
 let headerIndex=-1,columns:Record<string,number>={};let best=0
 for(let i=0;i<Math.min(matrix.length,15);i++){
  const found:Record<string,number>={}
  matrix[i].forEach((value,index)=>{const header=normalizeHeader(value);for(const [field,aliases] of Object.entries(HEADER_ALIASES))if(aliases.includes(header)){found[field]=index;break}})
  if(found.name!==undefined&&Object.keys(found).length>best){headerIndex=i;columns=found;best=Object.keys(found).length}
 }
 if(headerIndex<0)return []
 const cell=(row:string[],key:string)=>columns[key]===undefined?'':String(row[columns[key]]??'').trim()
 return matrix.slice(headerIndex+1).map((row,index)=>{
  const rawRate=cell(row,'default_rate'),rawCredit=cell(row,'credit_days'),rate=toNonnegative(rawRate),credit=toNonnegative(rawCredit)
  if(Number.isNaN(rate)||Number.isNaN(credit))throw new Error(`Row ${headerIndex+index+2}: Rate / g and Credit days must be nonnegative numbers.`)
  return {name:cell(row,'name'),email:cell(row,'email')||null,whatsapp:cell(row,'whatsapp')||null,default_rate:rate,credit_days:Math.floor(credit),gst_number:cell(row,'gst_number')||null}
 }).filter(row=>row.name)
}
function toNonnegative(value:string){if(!value)return 0;const n=Number(value.replace(/[₹,\s]/g,''));return Number.isFinite(n)&&n>=0?n:NaN}
function parseCsv(source:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false
 for(let i=0;i<source.length;i++){
  const ch=source[i]
  if(quoted){if(ch==='"'&&source[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch}
  else if(ch==='"')quoted=true
  else if(ch===','){row.push(cell);cell=''}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(value=>value.trim()))rows.push(row);row=[];cell=''}
  else cell+=ch
 }
 row.push(cell);if(row.some(value=>value.trim()))rows.push(row)
 return rows
}
async function parseXlsx(file:File):Promise<string[][]>{
 const files=unzipSync(new Uint8Array(await file.arrayBuffer()));const read=(path:string)=>files[path]?strFromU8(files[path]):''
 const workbook=new DOMParser().parseFromString(read('xl/workbook.xml'),'application/xml');const sheet=workbook.getElementsByTagName('sheet')[0]
 if(!sheet)throw new Error('This Excel workbook does not contain a worksheet.')
 const relationshipId=sheet.getAttribute('r:id');const relationships=new DOMParser().parseFromString(read('xl/_rels/workbook.xml.rels'),'application/xml');const relation=Array.from(relationships.getElementsByTagName('Relationship')).find(item=>item.getAttribute('Id')===relationshipId)
 let path=relation?.getAttribute('Target')||'worksheets/sheet1.xml';path=path.startsWith('/')?path.slice(1):path.startsWith('xl/')?path:`xl/${path}`
 const sheetXml=new DOMParser().parseFromString(read(path),'application/xml');if(sheetXml.getElementsByTagName('parsererror').length)throw new Error('Could not read this .xlsx file. Save it as a standard Excel workbook and try again.')
 const stringsXml=read('xl/sharedStrings.xml'),shared:string[]=[]
 if(stringsXml){const doc=new DOMParser().parseFromString(stringsXml,'application/xml');for(const item of Array.from(doc.getElementsByTagName('si')))shared.push(Array.from(item.getElementsByTagName('t')).map(t=>t.textContent||'').join(''))}
 const rows:string[][]=[]
 for(const rowNode of Array.from(sheetXml.getElementsByTagName('row'))){const row:string[]=[]
  for(const cellNode of Array.from(rowNode.getElementsByTagName('c'))){const ref=cellNode.getAttribute('r')||'',letters=ref.match(/[A-Z]+/i)?.[0]||'';let col=0;for(const letter of letters.toUpperCase())col=col*26+letter.charCodeAt(0)-64;col=Math.max(0,col-1);const value=cellNode.getElementsByTagName('v')[0]?.textContent||'';const inline=Array.from(cellNode.getElementsByTagName('t')).map(t=>t.textContent||'').join('');row[col]=cellNode.getAttribute('t')==='s'?shared[Number(value)]||'':cellNode.getAttribute('t')==='inlineStr'?inline:value
  }
  rows.push(row.map(value=>value||''))
 }
 return rows
}

function jumpTo(id:string){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}
function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
