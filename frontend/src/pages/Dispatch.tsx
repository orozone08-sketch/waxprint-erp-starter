import {type ReactNode, useEffect, useMemo, useState} from 'react'
import {CheckSquare, ImagePlus, PackageCheck, Printer, RefreshCw, Truck} from 'lucide-react'
import {getJson, openFile, postForm} from '../api'
import {Job} from '../types'
import {jumpTo} from '../ui'
import {strToU8,unzipSync,zipSync} from 'fflate'

type JobDetail={
 job:Job
 files:{id:number;name:string;quantity:number;status:string;weight_g:number|null}[]
 dispatches:{id:number;number:string;courier:string|null;tracking_no:string|null;packed_by:string|null;checked_by:string|null;delivered_by:string|null;packing_photo_name:string|null;packing_photo_url:string|null;status:string}[]
}

const shipStatuses=new Set(['WEIGHT_COMPLETED','INVOICED','DISPATCHED'])
const defaultStaff={packedBy:'Packing Team',checkedBy:'Final QC',deliveredBy:'Delivery Team'}
const challanAddress=[
 '214/B, Gokul Industrial Estate, Marol Co-operative Industrial Area,',
 'Sagbaug Road, Opp. Andheri Kurla Road,',
 'Marol, Andheri East, Mumbai - 400059',
 'Contact: 7977139755 / 7506045737',
]

function escapeHtml(value:unknown){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] as string))
}

type ChallanData={customer:string;jobNumber?:string;challanNumber:string;courier?:string;date:string;files:{name:string;weight_g:number|null;quantity:number}[]}

function localDateInput(){
 const date=new Date();date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,10)
}

function printChallan(data:ChallanData){
 const printWindow=window.open('','_blank','width=900,height=720')
 if(!printWindow){window.alert('Allow pop-ups for WaxPrint ERP to print the challan.');return}
 const completeWeights=data.files.every(file=>file.weight_g!==null&&Number(file.weight_g)>0)
 const total=data.files.reduce((sum,file)=>sum+(Number(file.weight_g)||0)*Math.max(1,Number(file.quantity)||1),0)
 const fileRows=data.files.map((file,index)=>{
  const quantity=Math.max(1,Number(file.quantity)||1)
  const weight=file.weight_g!==null&&Number(file.weight_g)>0?`${(Number(file.weight_g)*quantity).toFixed(2)} g${quantity>1?` (×${quantity})`:''}`:'WEIGHT PENDING'
  return `<tr><td class="sr">${index+1}</td><td>${escapeHtml(file.name)}</td><td class="weight">${weight}</td></tr>`
 })
 while(fileRows.length<12)fileRows.push(`<tr><td class="sr">${fileRows.length+1}</td><td>&nbsp;</td><td></td></tr>`)
 printWindow.document.open()
 printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Delivery Challan ${escapeHtml(data.challanNumber)}</title><style>
  @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#111;margin:0}.challan{width:100%;border:1px solid #111}.company{text-align:center;padding:12px 16px 10px;border-bottom:1px solid #111}.company h1{font-size:25px;letter-spacing:1px;margin:0 0 8px}.company p{margin:3px 0;font-size:13px;line-height:1.35}.meta{width:100%;border-collapse:collapse}.meta td{border-bottom:1px solid #111;padding:8px 10px}.meta .right{text-align:right}.files{width:100%;border-collapse:collapse;table-layout:fixed}.files th,.files td{border:1px solid #111;padding:7px 9px;height:30px}.files th{font-weight:600;text-align:center}.files .sr{width:64px;text-align:center}.files .weight{width:150px;text-align:center}.total td{font-weight:bold;height:36px}.total .label{text-align:right}.sign{min-height:82px;display:flex;align-items:flex-end;justify-content:flex-end;padding:12px;border-top:1px solid #111}.sign span{font-weight:bold}.signature{height:76px;padding:12px;text-align:right;border-top:1px solid #111;display:flex;flex-direction:column;justify-content:space-between}.signature b{font-weight:600}.pending{color:#9b1c1c}@media print{.challan{break-inside:auto}.files tr{break-inside:avoid;page-break-inside:avoid}}</style></head><body>
  <article class="challan"><header class="company"><h1>ADITYA INTERNATIONAL</h1>${challanAddress.slice(0,3).map(line=>`<p>${escapeHtml(line)}</p>`).join('')}<p>${escapeHtml(challanAddress[3])}</p></header>
  <table class="meta"><tr><td colspan="2"><b>CUSTOMER:</b> ${escapeHtml(data.customer)}</td></tr><tr><td><b>Job:</b> ${escapeHtml(data.jobNumber||'-')}</td><td class="right"><b>Delivery Challan:</b> ${escapeHtml(data.challanNumber)}</td></tr><tr><td><b>Courier:</b> ${escapeHtml(data.courier||'-')}</td><td class="right"><b>Date:</b> ${new Date(`${data.date}T00:00:00`).toLocaleDateString('en-GB')}</td></tr></table>
  <table class="files"><thead><tr><th class="sr">SR NO</th><th>Name</th><th class="weight">Weight</th></tr></thead><tbody>${fileRows.join('')}</tbody><tfoot><tr class="total"><td colspan="2" class="label">TOTAL</td><td class="weight ${completeWeights?'':'pending'}">${completeWeights?`${total.toFixed(2)} g`:'WEIGHT INCOMPLETE'}</td></tr></tfoot></table>
  <div class="sign"><span>for&nbsp; ADITYA INTERNATIONAL</span></div><div class="signature"><span></span><b>Authorised Signatory</b></div></article>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`)
 printWindow.document.close()
}

function downloadChallanExcel(data:ChallanData,blankTemplate=false){
 const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char] as string))
 const cell=(ref:string,value:string|number,style:number,formula?:string)=>{
  if(formula)return `<c r="${ref}" s="${style}"><f>${esc(formula)}</f><v>${esc(value)}</v></c>`
  if(typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
 }
 const row=(index:number,cells:string[],height=25)=>`<row r="${index}" ht="${height}" customHeight="1">${cells.join('')}</row>`
 const xmlRows:string[]=[]
 xmlRows.push(row(1,[cell('A1','ADITYA INTERNATIONAL',1)],34))
 challanAddress.forEach((address,index)=>xmlRows.push(row(index+2,[cell(`A${index+2}`,address,2)],24)))
 xmlRows.push(row(6,[cell('A6','CUSTOMER:',3),cell('B6',data.customer,2)],28))
 xmlRows.push(row(7,[cell('A7',`Job: ${data.jobNumber||''}`,2),cell('C7',`Delivery Challan: ${data.challanNumber|| (blankTemplate?'Enter challan no.':'')}`,3)],28))
 xmlRows.push(row(8,[cell('A8',`Courier: ${data.courier||(blankTemplate?'Enter courier':'')}`,2),cell('C8',`Date: ${data.date?new Date(`${data.date}T00:00:00`).toLocaleDateString('en-GB'):(blankTemplate?'Enter date':'')}`,3)],28))
 xmlRows.push(row(9,[cell('A9','SR NO',4),cell('B9','Name',4),cell('C9','Weight (g)',4)],28))
 const itemRowStart=10
 const lineCount=Math.max(12,data.files.length)
 data.files.forEach((file,index)=>{
  const rowNumber=itemRowStart+index
  const quantity=Math.max(1,Number(file.quantity)||1)
  const name=quantity>1?`${file.name} (×${quantity})`:file.name
  const weight=file.weight_g!==null&&Number(file.weight_g)>0?Number(file.weight_g)*quantity:(blankTemplate?'':'WEIGHT PENDING')
  xmlRows.push(row(rowNumber,[cell(`A${rowNumber}`,index+1,5),cell(`B${rowNumber}`,name,5),cell(`C${rowNumber}`,weight,typeof weight==='number'?6:5)],30))
 })
 for(let index=data.files.length;index<lineCount;index++){
  const rowNumber=itemRowStart+index
  xmlRows.push(row(rowNumber,[cell(`A${rowNumber}`,index+1,5),cell(`B${rowNumber}`,'',5),cell(`C${rowNumber}`,'',6)],30))
 }
 const totalRow=itemRowStart+lineCount
 const totalWeight=data.files.reduce((sum,file)=>sum+(Number(file.weight_g)||0)*Math.max(1,Number(file.quantity)||1),0)
 const complete=data.files.length>0&&data.files.every(file=>file.weight_g!==null&&Number(file.weight_g)>0)
 xmlRows.push(row(totalRow,[cell(`A${totalRow}`,'TOTAL',7),cell(`C${totalRow}`,blankTemplate?'':complete?totalWeight:'WEIGHT INCOMPLETE',complete?8:7,complete?`SUM(C${itemRowStart}:C${itemRowStart+data.files.length-1})`:undefined)],30))
 xmlRows.push(row(totalRow+1,[cell(`A${totalRow+1}`,'for  ADITYA INTERNATIONAL',9)],36))
 xmlRows.push(row(totalRow+2,[cell(`A${totalRow+2}`,'Authorised Signatory',9)],54))
 const merges=['A1:C1','A2:C2','A3:C3','A4:C4','A5:C5','B6:C6','A7:B7','A8:B8',`A${totalRow}:B${totalRow}`,`A${totalRow+1}:C${totalRow+1}`,`A${totalRow+2}:C${totalRow+2}`].map(ref=>`<mergeCell ref="${ref}"/>`).join('')
 const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="2" width="72" customWidth="1"/><col min="3" max="3" width="24" customWidth="1"/></cols><sheetData>${xmlRows.join('')}</sheetData><mergeCells count="${11}">${merges}</mergeCells><pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="16"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FF111111"/></left><right style="thin"><color rgb="FF111111"/></right><top style="thin"><color rgb="FF111111"/></top><bottom style="thin"><color rgb="FF111111"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
 const files:Record<string,Uint8Array>={
  '[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
  '_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
  'xl/workbook.xml':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Delivery Challan" sheetId="1" r:id="rId1"/></sheets><calcPr calcMode="auto"/></workbook>'),
  'xl/_rels/workbook.xml.rels':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml':strToU8(sheet),
  'xl/styles.xml':strToU8(styles),
 }
 const bytes=zipSync(files,{level:6})
 const blob=new Blob([bytes.slice().buffer as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
 const url=URL.createObjectURL(blob),link=document.createElement('a')
 link.href=url;link.download=blankTemplate?'Delivery-Challan-Template.xlsx':`Delivery-Challan-${data.challanNumber.replace(/[^a-z0-9_-]/gi,'-')}.xlsx`;link.click();URL.revokeObjectURL(url)
}

function parseChallanExcel(buffer:ArrayBuffer){
 const archive=unzipSync(new Uint8Array(buffer)),decode=(path:string)=>{const file=archive[path];return file?new TextDecoder().decode(file):''}
 const sheetXml=decode('xl/worksheets/sheet1.xml')
 if(!sheetXml)throw new Error('The workbook does not contain the challan worksheet.')
 const parser=new DOMParser(),sheet=parser.parseFromString(sheetXml,'application/xml')
 if(sheet.getElementsByTagName('parsererror').length)throw new Error('The Excel worksheet could not be read.')
 const sharedDoc=parser.parseFromString(decode('xl/sharedStrings.xml'),'application/xml')
 const shared=[...Array.from(sharedDoc.getElementsByTagName('si'))].map(item=>item.textContent||'')
 const cellValue=(cell:Element)=>{
  const type=cell.getAttribute('t'),raw=cell.getElementsByTagName('v')[0]?.textContent||''
  if(type==='s')return shared[Number(raw)]||''
  if(type==='inlineStr')return cell.getElementsByTagName('is')[0]?.textContent||''
  return raw
 }
 const rows=new Map<number,Record<string,string>>()
 for(const rowEl of Array.from(sheet.getElementsByTagName('row'))){
  const rowNumber=Number(rowEl.getAttribute('r'));if(!rowNumber)continue
  const values:Record<string,string>={}
  for(const cell of Array.from(rowEl.getElementsByTagName('c'))){const ref=cell.getAttribute('r')||'',column=ref.match(/^[A-Z]+/)?.[0];if(column)values[column]=cellValue(cell)}
  rows.set(rowNumber,values)
 }
 const value=(row:number,column:string)=>rows.get(row)?.[column]||''
 const afterLabel=(text:string,label:string)=>text.replace(new RegExp(`^${label}\\s*:?\\s*`,'i'),'').trim()
 const dateText=afterLabel(value(8,'C'),'Date')
 let date=''
 const iso=dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/),dmy=dateText.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/)
 if(iso)date=`${iso[1]}-${iso[2]}-${iso[3]}`
 else if(dmy)date=`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
 else if(Number(dateText)>20000){const d=new Date(Date.UTC(1899,11,30)+Number(dateText)*86400000);date=d.toISOString().slice(0,10)}
 const fileRows:{name:string;weight:string;quantity:string}[]=[]
 for(const [rowNumber,cells] of rows){
  if(rowNumber<10)continue
  if((cells.A||'').trim().toUpperCase()==='TOTAL'||(cells.B||'').trim().toUpperCase()==='TOTAL')break
  let name=(cells.B||'').trim();if(!name)continue
  let quantity='1';const quantityMatch=name.match(/\s+\(×(\d+)\)$/);if(quantityMatch){quantity=quantityMatch[1];name=name.replace(/\s+\(×\d+\)$/,'')}
  const rawWeight=(cells.C||'').trim();const numericWeight=Number(rawWeight)
  fileRows.push({name,weight:rawWeight&&Number.isFinite(numericWeight)?String(numericWeight):'',quantity})
 }
 return {customer:value(6,'B').trim(),jobNumber:afterLabel(value(7,'A'),'Job'),challanNumber:afterLabel(value(7,'C'),'Delivery Challan'),courier:afterLabel(value(8,'A'),'Courier'),date,rows:fileRows}
}

function loadStaff(){
 try{
  const saved=window.localStorage.getItem('waxprint.dispatchStaff')
  return saved?{...defaultStaff,...JSON.parse(saved)}:defaultStaff
 }catch{
  return defaultStaff
 }
}

export default function Dispatch({role}:{role:string}){
 const[jobs,setJobs]=useState<Job[]>([])
 const[details,setDetails]=useState<JobDetail[]>([])
 const[courier,setCourier]=useState<Record<number,string>>({})
 const[tracking,setTracking]=useState<Record<number,string>>({})
 const[packingPhoto,setPackingPhoto]=useState<Record<number,File|null>>({})
 const[packedBy,setPackedBy]=useState(()=>loadStaff().packedBy)
 const[checkedBy,setCheckedBy]=useState(()=>loadStaff().checkedBy)
 const[deliveredBy,setDeliveredBy]=useState(()=>loadStaff().deliveredBy)
 const[showChallanForm,setShowChallanForm]=useState(false)
 const[manualChallan,setManualChallan]=useState<{customer:string;jobId:string;number:string;date:string;courier:string;rows:{name:string;weight:string;quantity:string}[]}>(()=>({customer:'',jobId:'',number:`DC-${Date.now().toString().slice(-6)}`,date:localDateInput(),courier:'',rows:[{name:'',weight:'',quantity:'1'}]}))
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)
 const canSeeHistory=role.toUpperCase()==='ADMIN'

 const load=async()=>{
  setError('')
  const jobRows=await getJson<Job[]>('/api/jobs')
  const detailRows=await Promise.all(jobRows.map(j=>getJson<JobDetail>(`/api/jobs/${j.id}`)))
  setJobs(jobRows);setDetails(detailRows)
 }
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])
 useEffect(()=>{window.localStorage.setItem('waxprint.dispatchStaff',JSON.stringify({packedBy,checkedBy,deliveredBy}))},[packedBy,checkedBy,deliveredBy])

 const rows=useMemo(()=>jobs.filter(j=>shipStatuses.has(j.status)||details.find(d=>d.job.id===j.id)?.dispatches.length),[jobs,details])
 const ready=rows.filter(j=>j.status==='WEIGHT_COMPLETED'||j.status==='INVOICED')
 const dispatched=rows.filter(j=>j.status==='DISPATCHED'||details.find(d=>d.job.id===j.id)?.dispatches.length)

 const selectChallanJob=(jobId:string)=>{
  const detail=details.find(item=>String(item.job.id)===jobId)
  if(!detail){setManualChallan(value=>({...value,jobId}));return}
  const dispatch=detail.dispatches[detail.dispatches.length-1]
  setManualChallan(value=>({...value,jobId,customer:detail.job.customer,number:dispatch?.number||`DC-${detail.job.number}`,courier:dispatch?.courier||'',rows:detail.files.length?detail.files.map(file=>({name:file.name,weight:file.weight_g?String(file.weight_g):'',quantity:String(file.quantity||1)})):[{name:'',weight:'',quantity:'1'}]}))
 }
 const getManualChallanData=():ChallanData|null=>{
  const files=manualChallan.rows.filter(row=>row.name.trim()).map(row=>({name:row.name.trim(),weight_g:row.weight.trim()?Number(row.weight):null,quantity:Math.max(1,Number(row.quantity)||1)}))
  if(!manualChallan.customer.trim()){setError('Enter a customer name to create the challan.');return null}
  if(!files.length){setError('Add at least one file or item row to create the challan.');return null}
  setError('')
  const job=details.find(item=>String(item.job.id)===manualChallan.jobId)?.job
  return {customer:manualChallan.customer.trim(),jobNumber:job?.number,challanNumber:manualChallan.number.trim()||`DC-${Date.now().toString().slice(-6)}`,courier:manualChallan.courier,date:manualChallan.date,files}
 }
 const printManualChallan=()=>{const data=getManualChallanData();if(data)printChallan(data)}
 const downloadManualChallan=()=>{const data=getManualChallanData();if(data)downloadChallanExcel(data)}
 const downloadBlankChallanTemplate=()=>downloadChallanExcel({customer:'',challanNumber:'',courier:'',date:'',files:[]},true)
 const loadChallanExcel=async(file:File|null)=>{
  if(!file)return
  setError('');setNotice('')
  try{
   const imported=parseChallanExcel(await file.arrayBuffer())
   const matchedJob=details.find(item=>item.job.number.trim().toLowerCase()===imported.jobNumber.trim().toLowerCase())
   setManualChallan(current=>({
    ...current,
    customer:imported.customer||matchedJob?.job.customer||current.customer,
    jobId:matchedJob?String(matchedJob.job.id):'',
    number:imported.challanNumber||current.number,
    date:imported.date||current.date,
    courier:imported.courier,
    rows:imported.rows.length?imported.rows:[{name:'',weight:'',quantity:'1'}],
   }))
   setShowChallanForm(true)
   setNotice(`Loaded ${imported.rows.filter(row=>row.name.trim()).length} item row(s) from ${file.name}. Review the challan, then print or save it.`)
  }catch(reason){setError(`Could not read this Excel challan: ${String(reason)}`)}
 }

 const createDispatch=async(job:Job)=>{
  setLoading(true);setError('');setNotice('')
  try{
   const form=new FormData()
   form.append('job_id',String(job.id))
   form.append('courier',courier[job.id]||'')
   form.append('tracking_no',tracking[job.id]||'')
   form.append('packed_by',packedBy)
   form.append('checked_by',checkedBy)
   form.append('delivered_by',deliveredBy)
   if(packingPhoto[job.id])form.append('packing_photo',packingPhoto[job.id] as File)
   const result=await postForm<{number:string;packing_photo_name?:string|null}>('/api/dispatches/with-photo',form)
   setNotice(`${result.number} created for ${job.number}${result.packing_photo_name?` with ${result.packing_photo_name}`:''}.`)
   setPackingPhoto({...packingPhoto,[job.id]:null})
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }
 const uploadHistoryPhoto=async(dispatchId:number,file:File|null)=>{
  if(!file)return
  setLoading(true);setError('');setNotice('')
  try{
   const form=new FormData()
   form.append('packing_photo',file)
   const result=await postForm<{number:string;packing_photo_name:string}>(`/api/dispatches/${dispatchId}/packing-photo`,form)
   setNotice(`${result.packing_photo_name} saved for ${result.number}.`)
   await load()
  }catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 return <section className="panel">
  <div className="dispatchHeader">
   <div><h2>Packing / Dispatch</h2><p>Packing checklist, dispatch manifest, courier and tracking for completed jobs.</p></div>
   <div className="dispatchHeaderActions"><button className="primaryBtn" type="button" onClick={()=>{setError('');setShowChallanForm(value=>!value)}}><Printer size={16}/>{showChallanForm?'Close Challan':'Print Challan'}</button><button className="secondaryBtn" onClick={()=>load().catch(x=>setError(String(x)))} disabled={loading}><RefreshCw size={16}/>Refresh</button></div>
  </div>

  {showChallanForm&&<section className="subPanel challanBuilder" id="create-challan">
   <div className="panelHead"><h2>Create Customer Challan</h2><small>Works with or without a job</small></div>
   <div className="challanBuilderFields">
    <label>Existing job (optional)<select value={manualChallan.jobId} onChange={e=>selectChallanJob(e.target.value)}><option value="">Manual challan — no job</option>{jobs.map(job=><option key={job.id} value={job.id}>{job.number} · {job.customer}</option>)}</select></label>
    <label>Customer name<input value={manualChallan.customer} onChange={e=>setManualChallan({...manualChallan,customer:e.target.value})} placeholder="Customer name"/></label>
    <label>Delivery challan no.<input value={manualChallan.number} onChange={e=>setManualChallan({...manualChallan,number:e.target.value})}/></label>
    <label>Date<input type="date" value={manualChallan.date} onChange={e=>setManualChallan({...manualChallan,date:e.target.value})}/></label>
    <label>Courier<input value={manualChallan.courier} onChange={e=>setManualChallan({...manualChallan,courier:e.target.value})} placeholder="Optional"/></label>
   </div>
   <p>Choose a job to fill its files and saved weights automatically. Without a job, enter the customer and file names and weights below.</p>
   <div className="challanBuilderRows"><div className="challanBuilderRow challanBuilderRowHead"><b>Sr. No.</b><b>File / item name</b><b>Weight (g)</b><b>Qty</b><span/></div>
    {manualChallan.rows.map((row,index)=><div className="challanBuilderRow" key={index}><b>{index+1}</b><input aria-label={`File or item name ${index+1}`} value={row.name} onChange={e=>setManualChallan({...manualChallan,rows:manualChallan.rows.map((item,i)=>i===index?{...item,name:e.target.value}:item)})} placeholder="STL / CAM / item name"/><input aria-label={`Weight in grams ${index+1}`} inputMode="decimal" value={row.weight} onChange={e=>setManualChallan({...manualChallan,rows:manualChallan.rows.map((item,i)=>i===index?{...item,weight:e.target.value}:item)})} placeholder="Weight in grams"/><input aria-label={`Quantity ${index+1}`} type="number" min="1" step="1" value={row.quantity} onChange={e=>setManualChallan({...manualChallan,rows:manualChallan.rows.map((item,i)=>i===index?{...item,quantity:e.target.value}:item)})}/><button type="button" className="secondaryBtn" onClick={()=>setManualChallan({...manualChallan,rows:manualChallan.rows.filter((_,i)=>i!==index)})} disabled={manualChallan.rows.length===1}>Remove</button></div>)}
   </div>
   <div className="challanBuilderActions"><button type="button" className="secondaryBtn" onClick={()=>setManualChallan({...manualChallan,rows:[...manualChallan.rows,{name:'',weight:'',quantity:'1'}]})}>+ Add file row</button><div className="challanOutputActions"><button type="button" className="secondaryBtn" onClick={downloadBlankChallanTemplate}>Download Excel template</button><label className="secondaryBtn challanExcelUpload">Upload filled Excel<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>{void loadChallanExcel(event.target.files?.[0]||null);event.currentTarget.value=''}}/></label><button type="button" className="secondaryBtn" onClick={downloadManualChallan}>Download Excel</button><button type="button" className="primaryBtn" onClick={printManualChallan}><Printer size={16}/>Print / Save PDF</button></div></div>
  </section>}

  <div className="platformStats">
   <Stat icon={<PackageCheck size={18}/>} label="Ready to Dispatch" value={ready.length} onClick={()=>jumpTo('dispatch-queue')}/>
   {canSeeHistory&&<Stat icon={<Truck size={18}/>} label="Dispatched" value={dispatched.length} onClick={()=>jumpTo('dispatch-history')}/>}
   <Stat icon={<CheckSquare size={18}/>} label="Packed By" value={packedBy} onClick={()=>jumpTo('dispatch-staff')}/>
   <Stat icon={<Truck size={18}/>} label="Delivered By" value={deliveredBy} onClick={()=>jumpTo('dispatch-staff')}/>
  </div>

  <div className="dispatchStaff" id="dispatch-staff">
   <label>Packed by<input value={packedBy} onChange={e=>setPackedBy(e.target.value)}/></label>
   <label>Checked by<input value={checkedBy} onChange={e=>setCheckedBy(e.target.value)}/></label>
   <label>Delivered by<input value={deliveredBy} onChange={e=>setDeliveredBy(e.target.value)}/></label>
  </div>

  <section className="subPanel" id="challan-jobs">
   <div className="panelHead"><h2>Customer Challans</h2><small>{details.filter(d=>d.files.length>0).length} job(s) with files</small></div>
   <p>Print a customer challan for a job with uploaded files. You can print before dispatch; dispatched jobs use their dispatch number.</p>
   <table><thead><tr><th>Job</th><th>Customer</th><th>Files</th><th>Weight status</th><th>Action</th></tr></thead><tbody>{details.filter(d=>d.files.length>0).map(d=>{const missing=d.files.filter(file=>file.weight_g===null||Number(file.weight_g)<=0).length;const dispatch=d.dispatches[d.dispatches.length-1];return <tr key={d.job.id}><td><b>{d.job.number}</b></td><td>{d.job.customer}</td><td>{d.files.length}</td><td>{missing?`${missing} weight(s) pending`:'All file weights saved'}</td><td><button type="button" className="miniBtn" onClick={()=>printChallan({customer:d.job.customer,jobNumber:d.job.number,challanNumber:dispatch?.number||`DC-${d.job.number}`,courier:dispatch?.courier||'',date:localDateInput(),files:d.files.map(file=>({name:file.name,weight_g:file.weight_g,quantity:file.quantity}))})}><Printer size={14}/>Print Challan</button></td></tr>})}</tbody></table>
   {!details.some(d=>d.files.length>0)&&<div className="emptyState inboxEmpty"><PackageCheck size={30}/><p>No jobs with uploaded files yet.</p></div>}
  </section>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <section className="subPanel" id="dispatch-queue">
   <div className="panelHead"><h2>Dispatch Queue</h2><small>{ready.length} job(s)</small></div>
   <div className="dispatchCards">
    {ready.map(j=>{const d=details.find(x=>x.job.id===j.id);return <article className="dispatchCard" key={j.id}>
     <div><small>{j.number}</small><h3>{j.customer}</h3><span>{j.billable_weight_g}g billable / {d?.files.length||0} file(s)</span></div>
     <label>Courier<input value={courier[j.id]||''} onChange={e=>setCourier({...courier,[j.id]:e.target.value})} placeholder="Blue Dart / hand delivery"/></label>
     <label>Tracking No<input value={tracking[j.id]||''} onChange={e=>setTracking({...tracking,[j.id]:e.target.value})} placeholder="AWB / tracking"/></label>
     <label className="packingPhotoField"><span><ImagePlus size={14}/>Packing Image</span><input type="file" accept="image/*" onChange={e=>setPackingPhoto({...packingPhoto,[j.id]:e.target.files?.[0]||null})}/><small>{packingPhoto[j.id]?.name||'Optional photo'}</small></label>
     <button className="miniBtn" onClick={()=>createDispatch(j)} disabled={loading}><Truck size={14}/>Dispatch</button>
    </article>})}
   </div>
   {!ready.length&&<div className="emptyState inboxEmpty"><PackageCheck size={30}/><p>No jobs ready for dispatch.</p></div>}
  </section>

  {canSeeHistory&&<section className="subPanel" id="dispatch-history">
   <div className="panelHead"><h2>Dispatch History</h2><small>Latest</small></div>
   <table><thead><tr><th>Job</th><th>Customer</th><th>Dispatch</th><th>Courier</th><th>Tracking</th><th>Packing</th><th>Delivered By</th><th>Photo</th><th>Status</th><th>Challan</th></tr></thead><tbody>{details.flatMap(d=>d.dispatches.map(x=><tr key={x.id}><td><b>{d.job.number}</b></td><td>{d.job.customer}</td><td>{x.number}</td><td>{x.courier||'-'}</td><td>{x.tracking_no||'-'}</td><td>{x.packed_by||'-'}<small className="mutedCell">Checked: {x.checked_by||'-'}</small></td><td>{x.delivered_by||'-'}</td><td><div className="historyPhotoCell">{x.packing_photo_url&&<button className="tableLinkBtn" type="button" onClick={()=>openFile(x.packing_photo_url as string)}>{x.packing_photo_name||'View image'}</button>}<label className="historyPhotoUpload"><ImagePlus size={13}/>{x.packing_photo_url?'Replace':'Upload'}<input type="file" accept="image/*" disabled={loading} onChange={e=>uploadHistoryPhoto(x.id,e.target.files?.[0]||null)}/></label></div></td><td><span className="badge success">{x.status}</span></td><td><button type="button" className="miniBtn" onClick={()=>printChallan({customer:d.job.customer,jobNumber:d.job.number,challanNumber:x.number,courier:x.courier||'',date:localDateInput(),files:d.files.map(file=>({name:file.name,weight_g:file.weight_g,quantity:file.quantity}))})}><Printer size={14}/>Print</button></td></tr>))}</tbody></table>
  </section>}
 </section>
}

function Stat({icon,label,value,onClick}:{icon:ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
