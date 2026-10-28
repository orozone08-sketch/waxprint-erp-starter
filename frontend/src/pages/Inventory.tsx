import {type FormEvent, useEffect, useState} from 'react'
import {Boxes, CheckCircle2, PackagePlus, RefreshCw, Scissors} from 'lucide-react'
import {getJson, postJson} from '../api'
import {Job} from '../types'

type Material={id:number;code:string;name:string;unit:string;stock:number;minimum_stock:number}
type Supplier={id:number;name:string;code:string}
type MaterialMasterForm={code:string;name:string;unit:string;minimum_stock:string}
type SupplierMasterForm={code:string;name:string;gst_number:string;contact:string}
type PurchaseForm={purchase_date:string;supplier_id:string;material_id:string;quantity:string;rate:string;tax_amount:string;paid_amount:string;invoice_no:string}
type UseForm={txn_date:string;material_id:string;quantity:string;unit_cost:string;txn_type:'CONSUMPTION'|'WASTAGE';job_id:string;notes:string}

const today=()=>new Date().toISOString().slice(0,10)
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n||0)

export default function Inventory(){
 const[materials,setMaterials]=useState<Material[]>([])
 const[suppliers,setSuppliers]=useState<Supplier[]>([])
 const[jobs,setJobs]=useState<Job[]>([])
 const[newMaterial,setNewMaterial]=useState<MaterialMasterForm>({code:'',name:'',unit:'kit',minimum_stock:'1'})
 const[newSupplier,setNewSupplier]=useState<SupplierMasterForm>({code:'',name:'',gst_number:'',contact:''})
 const[purchase,setPurchase]=useState<PurchaseForm>({purchase_date:today(),supplier_id:'',material_id:'',quantity:'',rate:'',tax_amount:'0',paid_amount:'0',invoice_no:''})
 const[useForm,setUseForm]=useState<UseForm>({txn_date:today(),material_id:'',quantity:'',unit_cost:'',txn_type:'CONSUMPTION',job_id:'',notes:''})
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=async()=>{
  const [materialRows,supplierRows,jobRows]=await Promise.all([getJson<Material[]>('/api/materials'),getJson<Supplier[]>('/api/suppliers'),getJson<Job[]>('/api/jobs')])
  setMaterials(materialRows);setSuppliers(supplierRows);setJobs(jobRows)
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const savePurchase=async(event:FormEvent)=>{
  event.preventDefault();setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<{inventory_added:number;purchase_value:number}>('/api/purchases',{purchase_date:purchase.purchase_date,supplier_id:Number(purchase.supplier_id),material_id:Number(purchase.material_id),quantity:Number(purchase.quantity),rate:Number(purchase.rate),tax_amount:Number(purchase.tax_amount)||0,paid_amount:Number(purchase.paid_amount)||0,invoice_no:purchase.invoice_no||null})
   setNotice(`Purchase recorded. Stock increased by ${result.inventory_added}. Purchase value: ${money(result.purchase_value)}.`)
   setPurchase({...purchase,quantity:'',rate:'',tax_amount:'0',paid_amount:'0',invoice_no:''})
   await load()
  }catch(x){setError(String(x))}finally{setLoading(false)}
 }

 const saveMaterial=async(event:FormEvent)=>{
  event.preventDefault();setLoading(true);setError('');setNotice('')
  try{
   await postJson('/api/materials',{code:newMaterial.code,name:newMaterial.name,unit:newMaterial.unit,minimum_stock:Number(newMaterial.minimum_stock)||0})
   setNotice(`${newMaterial.name} added to Materials & Cost.`)
   setNewMaterial({code:'',name:'',unit:'kit',minimum_stock:'1'})
   await load()
  }catch(x){setError(String(x))}finally{setLoading(false)}
 }

 const saveSupplier=async(event:FormEvent)=>{
  event.preventDefault();setLoading(true);setError('');setNotice('')
  try{
   await postJson('/api/suppliers',{code:newSupplier.code,name:newSupplier.name,gst_number:newSupplier.gst_number||null,contact:newSupplier.contact||null})
   setNotice(`${newSupplier.name} added as a supplier.`)
   setNewSupplier({code:'',name:'',gst_number:'',contact:''})
   await load()
  }catch(x){setError(String(x))}finally{setLoading(false)}
 }

 const saveUse=async(event:FormEvent)=>{
  event.preventDefault();setLoading(true);setError('');setNotice('')
  try{
   const result=await postJson<{production_cost_added:number}>('/api/inventory/consume',{txn_date:useForm.txn_date,material_id:Number(useForm.material_id),quantity:Number(useForm.quantity),unit_cost:Number(useForm.unit_cost),txn_type:useForm.txn_type,job_id:useForm.job_id?Number(useForm.job_id):null,notes:useForm.notes||null})
   setNotice(`${useForm.txn_type==='WASTAGE'?'Wastage':'Material use'} recorded. ${money(result.production_cost_added)} added to production cost.`)
   setUseForm({...useForm,quantity:'',notes:''})
   await load()
  }catch(x){setError(String(x))}finally{setLoading(false)}
 }

 const selectedMaterial=materials.find(m=>m.id===Number(purchase.material_id))
 const selectedUseMaterial=materials.find(m=>m.id===Number(useForm.material_id))
 return <section className="panel">
  <div className="settingsHeader"><div><h2>Materials &amp; Inventory</h2><p>Record purchases to add stock, then record material use or wastage against production jobs.</p></div><button className="secondaryBtn" type="button" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button></div>
  {notice&&<div className="inventoryNotice"><CheckCircle2 size={17}/>{notice}</div>}
  {error&&<div className="inventoryError" role="alert">{error}</div>}
  <div className="inventoryMasterSection">
   <div className="inventoryTableHeading"><div><h3>Materials and suppliers</h3><p>Add the items and vendors you buy from, right here.</p></div></div>
   <div className="inventoryForms inventoryMasterForms">
    <form className="inventoryForm" onSubmit={saveMaterial}>
     <div className="inventoryFormTitle"><Boxes size={18}/><div><h3>Add a material</h3><p>Create an item here before recording its stock purchase.</p></div></div>
     <div className="inventoryFields">
      <label>Material code<input value={newMaterial.code} onChange={e=>setNewMaterial({...newMaterial,code:e.target.value})} placeholder="e.g. WAX-01" required/></label>
      <label>Material name<input value={newMaterial.name} onChange={e=>setNewMaterial({...newMaterial,name:e.target.value})} placeholder="e.g. Casting wax" required/></label>
      <label>Unit<input value={newMaterial.unit} onChange={e=>setNewMaterial({...newMaterial,unit:e.target.value})} placeholder="kg, gram, kit" required/></label>
      <label>Low-stock level<input type="number" min="0" step="any" value={newMaterial.minimum_stock} onChange={e=>setNewMaterial({...newMaterial,minimum_stock:e.target.value})} required/></label>
     </div>
     <button className="secondaryBtn inventorySaveBtn" type="submit" disabled={loading}><Boxes size={16}/>{loading?'Saving…':'Add material'}</button>
    </form>
    <form className="inventoryForm" onSubmit={saveSupplier}>
     <div className="inventoryFormTitle"><PackagePlus size={18}/><div><h3>Add a supplier</h3><p>Suppliers appear in the purchase form below.</p></div></div>
     <div className="inventoryFields">
      <label>Supplier code<input value={newSupplier.code} onChange={e=>setNewSupplier({...newSupplier,code:e.target.value})} placeholder="e.g. SUP-01" required/></label>
      <label>Supplier name<input value={newSupplier.name} onChange={e=>setNewSupplier({...newSupplier,name:e.target.value})} placeholder="Business name" required/></label>
      <label>GST number (optional)<input value={newSupplier.gst_number} onChange={e=>setNewSupplier({...newSupplier,gst_number:e.target.value})}/></label>
      <label>Contact (optional)<input value={newSupplier.contact} onChange={e=>setNewSupplier({...newSupplier,contact:e.target.value})} placeholder="Phone or email"/></label>
     </div>
     <button className="secondaryBtn inventorySaveBtn" type="submit" disabled={loading}><PackagePlus size={16}/>{loading?'Saving…':'Add supplier'}</button>
    </form>
   </div>
  </div>
  <div className="inventoryForms">
   <form className="inventoryForm" onSubmit={savePurchase}>
    <div className="inventoryFormTitle"><PackagePlus size={18}/><div><h3>Record a purchase</h3><p>Use this when material arrives. Stock increases by the quantity you enter.</p></div></div>
    <div className="inventoryFields">
     <label>Purchase date<input type="date" value={purchase.purchase_date} onChange={e=>setPurchase({...purchase,purchase_date:e.target.value})} required/></label>
     <label>Supplier<select value={purchase.supplier_id} onChange={e=>setPurchase({...purchase,supplier_id:e.target.value})} required><option value="">Choose supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{s.code?` (${s.code})`:''}</option>)}</select></label>
     <label>Material<select value={purchase.material_id} onChange={e=>setPurchase({...purchase,material_id:e.target.value})} required><option value="">Choose material</option>{materials.map(m=><option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select></label>
     <label>Quantity ({selectedMaterial?.unit||'unit'})<input type="number" min="0.001" step="any" value={purchase.quantity} onChange={e=>setPurchase({...purchase,quantity:e.target.value})} required/></label>
     <label>Rate per unit (₹)<input type="number" min="0" step="0.01" value={purchase.rate} onChange={e=>setPurchase({...purchase,rate:e.target.value})} required/></label>
     <label>Invoice number (optional)<input value={purchase.invoice_no} onChange={e=>setPurchase({...purchase,invoice_no:e.target.value})} placeholder="Supplier invoice"/></label>
     <label>Tax (₹)<input type="number" min="0" step="0.01" value={purchase.tax_amount} onChange={e=>setPurchase({...purchase,tax_amount:e.target.value})}/></label>
     <label>Amount paid (₹)<input type="number" min="0" step="0.01" value={purchase.paid_amount} onChange={e=>setPurchase({...purchase,paid_amount:e.target.value})}/></label>
    </div>
    <button className="primaryBtn" type="submit" disabled={loading||!materials.length||!suppliers.length||!purchase.supplier_id||!purchase.material_id}><PackagePlus size={16}/>{loading?'Saving…':'Save purchase and add stock'}</button>
   </form>

   <form className="inventoryForm" onSubmit={saveUse}>
    <div className="inventoryFormTitle"><Scissors size={18}/><div><h3>Record material used</h3><p>Link usage to a job so its direct production cost is included in job reports.</p></div></div>
    <div className="inventoryFields">
     <label>Date<input type="date" value={useForm.txn_date} onChange={e=>setUseForm({...useForm,txn_date:e.target.value})} required/></label>
     <label>Material<select value={useForm.material_id} onChange={e=>setUseForm({...useForm,material_id:e.target.value})} required><option value="">Choose material</option>{materials.map(m=><option key={m.id} value={m.id}>{m.name} ({m.unit}; stock {m.stock})</option>)}</select></label>
     <label>Entry type<select value={useForm.txn_type} onChange={e=>setUseForm({...useForm,txn_type:e.target.value as UseForm['txn_type']})}><option value="CONSUMPTION">Used in production</option><option value="WASTAGE">Wastage</option></select></label>
     <label>Quantity ({selectedUseMaterial?.unit||'unit'})<input type="number" min="0.001" step="any" value={useForm.quantity} onChange={e=>setUseForm({...useForm,quantity:e.target.value})} required/></label>
     <label>Cost per unit (₹)<input type="number" min="0" step="0.01" value={useForm.unit_cost} onChange={e=>setUseForm({...useForm,unit_cost:e.target.value})} required/></label>
     <label>Job (optional)<select value={useForm.job_id} onChange={e=>setUseForm({...useForm,job_id:e.target.value})}><option value="">No job selected</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.number} / {j.customer}</option>)}</select></label>
     <label className="inventoryWideField">Note (optional)<input value={useForm.notes} onChange={e=>setUseForm({...useForm,notes:e.target.value})} placeholder="For example: wax used for job"/></label>
    </div>
    <button className="primaryBtn" type="submit" disabled={loading||!materials.length||!useForm.material_id}><Scissors size={16}/>{loading?'Saving…':'Save material use'}</button>
   </form>
  </div>
  <div className="inventoryTableWrap"><h3>Current stock</h3><p>Purchases increase stock. Production use and wastage reduce it.</p><table className="dataTable"><thead><tr><th>Code</th><th>Material</th><th>Stock</th><th>Minimum</th><th>Status</th></tr></thead><tbody>{materials.map(m=><tr key={m.id}><td>{m.code}</td><td>{m.name}</td><td>{m.stock} {m.unit}</td><td>{m.minimum_stock} {m.unit}</td><td><span className={`inventoryStatus ${m.stock<=m.minimum_stock?'low':'ok'}`}>{m.stock<=m.minimum_stock?'Low stock':'In stock'}</span></td></tr>)}{!materials.length&&<tr><td colSpan={5} className="inventoryEmpty">No materials yet. Add them in Settings to begin.</td></tr>}</tbody></table></div>
 </section>
}
