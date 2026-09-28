import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {BadgeCheck, FileText, ReceiptIndianRupee, RefreshCw, WalletCards} from 'lucide-react'
import {getJson, postJson} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'

type Customer={id:number;code:string;name:string;email:string|null;whatsapp:string|null;default_rate:number;credit_days:number}
type Invoice={id:number;number:string;customer_id:number;date:string;subtotal:number;tax:number;total:number;paid:number;outstanding:number;status:string}
type Draft={taxRate:string;extraCharge:string;extraDescription:string}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0)
const invoiceReadyStatuses=new Set(['WEIGHT_COMPLETED','DISPATCHED'])

export default function Billing(){
 const[jobs,setJobs]=useState<Job[]>([])
 const[customers,setCustomers]=useState<Customer[]>([])
 const[invoices,setInvoices]=useState<Invoice[]>([])
 const[drafts,setDrafts]=useState<Record<number,Draft>>({})
 const[selectedInvoice,setSelectedInvoice]=useState('')
 const[paymentAmount,setPaymentAmount]=useState('')
 const[paymentMode,setPaymentMode]=useState('BANK')
 const[reference,setReference]=useState('')
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=async()=>{
  setError('')
  const [jobRows,customerRows,invoiceRows]=await Promise.all([getJson<Job[]>('/api/jobs'),getJson<Customer[]>('/api/customers'),getJson<Invoice[]>('/api/invoices')])
  setJobs(jobRows);setCustomers(customerRows);setInvoices(invoiceRows)
  setDrafts(current=>({...Object.fromEntries(jobRows.map(j=>[j.id,current[j.id]||{taxRate:'0',extraCharge:'0',extraDescription:'Other Charges'}])),...current}))
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const customerById=useMemo(()=>Object.fromEntries(customers.map(c=>[c.id,c])),[customers])
 const readyJobs=jobs.filter(j=>invoiceReadyStatuses.has(j.status)&&j.billable_weight_g>0)
 const outstandingInvoices=invoices.filter(i=>i.outstanding>0)
 const totalSales=invoices.reduce((sum,i)=>sum+i.total,0)
 const totalPaid=invoices.reduce((sum,i)=>sum+i.paid,0)
 const totalOutstanding=invoices.reduce((sum,i)=>sum+i.outstanding,0)
 const activeInvoice=outstandingInvoices.find(i=>String(i.id)===selectedInvoice)||outstandingInvoices[0]

 useEffect(()=>{
  if(!activeInvoice)return
  if(!selectedInvoice)setSelectedInvoice(String(activeInvoice.id))
  if(!paymentAmount)setPaymentAmount(String(round(activeInvoice.outstanding)))
 },[activeInvoice,selectedInvoice,paymentAmount])

 const updateDraft=(jobId:number,patch:Partial<Draft>)=>setDrafts({...drafts,[jobId]:{...drafts[jobId],...patch}})

 const createInvoice=async(job:Job)=>{
  const draft=drafts[job.id]||{taxRate:'0',extraCharge:'0',extraDescription:'Other Charges'}
  setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<{number:string;total:number}>('/api/invoices/from-job',{job_id:job.id,tax_rate:Number(draft.taxRate)||0,extra_charge:Number(draft.extraCharge)||0,extra_description:draft.extraDescription||'Other Charges'})
   setNotice(`${result.number} created for ${job.number}. Total ${money(result.total)}.`)
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const recordPayment=async()=>{
  const invoiceId=Number(selectedInvoice||activeInvoice?.id)
  const amount=Number(paymentAmount)
  if(!invoiceId||!amount||amount<=0){setError('Select an invoice and enter a valid payment amount.');return}
  setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<{invoice:string;outstanding:number}>('/api/payments',{invoice_id:invoiceId,amount,payment_mode:paymentMode,reference})
   setNotice(`Payment saved for ${result.invoice}. Outstanding ${money(result.outstanding)}.`)
   setPaymentAmount('');setReference('')
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 return <section className="panel">
  <div className="billingHeader">
   <div><h2>Billing / Payments</h2><p>Weight x customer rate, invoice creation, payment receipt and outstanding tracking.</p></div>
   <button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<FileText size={18}/>} label="Ready to Invoice" value={readyJobs.length} onClick={()=>jumpTo('create-invoice')}/>
   <Stat icon={<ReceiptIndianRupee size={18}/>} label="Total Sales" value={money(totalSales)} onClick={()=>jumpTo('invoice-ledger')}/>
   <Stat icon={<WalletCards size={18}/>} label="Outstanding" value={money(totalOutstanding)} onClick={()=>jumpTo('receive-payment')}/>
   <Stat icon={<BadgeCheck size={18}/>} label="Paid" value={money(totalPaid)} onClick={()=>jumpTo('invoice-ledger')}/>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel" id="create-invoice">
   <div className="panelHead"><h2>Create Invoice</h2><small>{readyJobs.length} job(s)</small></div>
   <div className="billingCards">
    {readyJobs.map(job=>{const customer=customerById[job.customer_id];const draft=drafts[job.id]||{taxRate:'0',extraCharge:'0',extraDescription:'Other Charges'};const base=job.billable_weight_g*(customer?.default_rate||0);const extra=Number(draft.extraCharge)||0;const subtotal=base+extra;const tax=subtotal*(Number(draft.taxRate)||0)/100;return <article className="billingCard" key={job.id}>
     <div className="billingJob">
      <small>{job.number}</small><h3>{job.customer}</h3>
      <span>{job.billable_weight_g}g x {money(customer?.default_rate||0)}/g / {pretty(job.status)}</span>
     </div>
     <div className="billingInputs">
      <label>Tax %<input inputMode="decimal" value={draft.taxRate} onChange={e=>updateDraft(job.id,{taxRate:e.target.value})}/></label>
      <label>Extra charge<input inputMode="decimal" value={draft.extraCharge} onChange={e=>updateDraft(job.id,{extraCharge:e.target.value})}/></label>
      <label>Description<input value={draft.extraDescription} onChange={e=>updateDraft(job.id,{extraDescription:e.target.value})}/></label>
     </div>
     <div className="billingPreview"><span>Base <b>{money(base)}</b></span><span>Tax <b>{money(tax)}</b></span><span>Total <b>{money(subtotal+tax)}</b></span></div>
     <button className="miniBtn" disabled={loading} onClick={()=>createInvoice(job)}><ReceiptIndianRupee size={14}/>Create Invoice</button>
    </article>})}
   </div>
   {!readyJobs.length&&<div className="emptyState inboxEmpty"><ReceiptIndianRupee size={30}/><p>No jobs ready for invoice.</p></div>}
  </section>

  <section className="billingGrid subPanel" id="receive-payment">
   <div>
    <div className="panelHead"><h2>Receive Payment</h2><small>{outstandingInvoices.length} outstanding</small></div>
    <div className="paymentBox">
     <label>Invoice<select value={selectedInvoice||activeInvoice?.id||''} onChange={e=>{setSelectedInvoice(e.target.value);const inv=outstandingInvoices.find(i=>String(i.id)===e.target.value);setPaymentAmount(inv?String(round(inv.outstanding)):'')}}>{outstandingInvoices.map(i=><option key={i.id} value={i.id}>{i.number} / {customerById[i.customer_id]?.name||`Customer #${i.customer_id}`} / {money(i.outstanding)}</option>)}</select></label>
     <label>Amount<input inputMode="decimal" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label>
     <label>Mode<select value={paymentMode} onChange={e=>setPaymentMode(e.target.value)}><option>BANK</option><option>UPI</option><option>CASH</option><option>CHEQUE</option></select></label>
     <label>Reference<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="UTR / cheque / note"/></label>
     <button className="primaryBtn" onClick={recordPayment} disabled={loading||!outstandingInvoices.length}><WalletCards size={16}/>Save Payment</button>
    </div>
   </div>

   <div>
    <div className="panelHead"><h2>Outstanding Summary</h2><small>{money(totalOutstanding)}</small></div>
    <div className="outstandingList">
     {outstandingInvoices.slice(0,5).map(i=><div className="outstandingRow" key={i.id}><span><b>{i.number}</b><small>{customerById[i.customer_id]?.name||`Customer #${i.customer_id}`}</small></span><strong>{money(i.outstanding)}</strong><em>{pretty(i.status)}</em></div>)}
     {!outstandingInvoices.length&&<div className="emptyState"><WalletCards size={28}/><p>No outstanding invoices.</p></div>}
    </div>
   </div>
  </section>

  <section className="subPanel" id="invoice-ledger">
   <div className="panelHead"><h2>Invoice Ledger</h2><small>{invoices.length} invoice(s)</small></div>
   <table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td><b>{i.number}</b></td><td>{customerById[i.customer_id]?.name||`Customer #${i.customer_id}`}</td><td>{i.date}</td><td>{money(i.total)}</td><td>{money(i.paid)}</td><td>{money(i.outstanding)}</td><td><span className={i.status==='PAID'?'badge success':i.status==='PART_PAID'?'badge warn':'badge'}>{pretty(i.status)}</span></td></tr>)}</tbody></table>
  </section>
 </section>
}

function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
function round(value:number){return Number(value.toFixed(2))}
