import {useEffect, useMemo, useState} from 'react'
import {BadgeCheck, CircleAlert, Clock3, Play, Printer, RefreshCw, XCircle} from 'lucide-react'
import {getJson, postJson} from '../api'
import {jumpTo} from '../ui'

type Machine={id:number;code:string;name:string;model:string|null;serial_number:string|null;status:string}
type Platform={id:number;number:string;software_name:string;machine_id:number|null;status:string;is_reshoot_platform:boolean}
type PrintAttempt={id:number;file_id:number;platform_id:number;machine_id:number|null;attempt_no:number;is_reshoot:boolean;status:string;good_qty:number;bad_qty:number;reason:string|null;estimated_cost:number}

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)

export default function Printing(){
 const[machines,setMachines]=useState<Machine[]>([])
 const[platforms,setPlatforms]=useState<Platform[]>([])
 const[attempts,setAttempts]=useState<PrintAttempt[]>([])
 const[selectedMachine,setSelectedMachine]=useState('')
 const[weight,setWeight]=useState('25')
 const[cost,setCost]=useState('1500')
 const[notice,setNotice]=useState('')
 const[error,setError]=useState('')
 const[loading,setLoading]=useState(false)

 const load=()=>Promise.all([getJson<Machine[]>('/api/machines'),getJson<Platform[]>('/api/platforms'),getJson<PrintAttempt[]>('/api/print-attempts')]).then(([m,p,a])=>{setMachines(m);setPlatforms(p);setAttempts(a);if(!selectedMachine&&m[0])setSelectedMachine(String(m[0].id))})
 useEffect(()=>{load().catch(x=>setError(String(x)))},[])

 const ready=platforms.filter(p=>p.status==='READY')
 const active=attempts.filter(a=>a.status==='PRINTING')
 const failed=attempts.filter(a=>a.status==='QC_FAILED')
 const passed=attempts.filter(a=>a.status==='QC_PASSED')
 const platformById=useMemo(()=>Object.fromEntries(platforms.map(p=>[p.id,p])),[platforms])
 const machineById=useMemo(()=>Object.fromEntries(machines.map(m=>[m.id,m])),[machines])

 const run=async(action:()=>Promise<unknown>,message:string)=>{
  setLoading(true);setError('');setNotice('')
  try{await action();setNotice(message);await load()}catch(x){setError(String(x))}
  finally{setLoading(false)}
 }

 const startPrint=(platform:Platform)=>run(()=>postJson('/api/print-attempts/start',{platform_id:platform.id,machine_id:Number(selectedMachine),expected_qty:1,production_weight_g:Number(weight)||0,estimated_cost:Number(cost)||0,is_reshoot:platform.is_reshoot_platform}),`${platform.number} print started.`)
 const qcPass=(attempt:PrintAttempt)=>run(()=>postJson(`/api/print-attempts/${attempt.id}/qc`,{good_qty:1,bad_qty:0,reason:null,create_reshoot:false}),`Attempt #${attempt.id} passed QC.`)
 const qcFail=(attempt:PrintAttempt)=>run(()=>postJson(`/api/print-attempts/${attempt.id}/qc`,{good_qty:0,bad_qty:1,reason:'Failed physical QC',create_reshoot:true,responsibility:'OUR_PRODUCTION'}),`Attempt #${attempt.id} failed QC and reshoot was created.`)

 return <section className="panel">
  <div className="printingHeader">
   <div><h2>Printing</h2><p>Track platform-to-machine print attempts, machine load, estimated material cost and print QC handoff.</p></div>
   <button className="secondaryBtn" onClick={()=>load()} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>

  <div className="platformStats">
   <Stat icon={<Printer size={18}/>} label="Machines" value={machines.length} onClick={()=>jumpTo('machine-status')}/>
   <Stat icon={<Play size={18}/>} label="Ready Platforms" value={ready.length} onClick={()=>jumpTo('start-print')}/>
   <Stat icon={<Clock3 size={18}/>} label="Printing" value={active.length} onClick={()=>jumpTo('print-attempts')}/>
   <Stat icon={<BadgeCheck size={18}/>} label="QC Passed" value={passed.length} onClick={()=>jumpTo('print-attempts')}/>
   <Stat icon={<CircleAlert size={18}/>} label="QC Failed" value={failed.length} onClick={()=>jumpTo('print-attempts')}/>
  </div>

  {notice&&<div className="successBox">{notice}</div>}
  {error&&<div className="errorBox">{error}</div>}

  <div className="printGrid">
   <section className="subPanel printSidePanel" id="machine-status">
    <div className="panelHead"><h2>Machine Status</h2><small>Live</small></div>
    <div className="machineCards">{machines.map(m=><div className="machineCard" key={m.id}><Printer size={19}/><span><b>{m.name}</b><small>{m.model||m.code}</small></span><em className={m.status==='PRINTING'?'warnText':''}>{pretty(m.status)}</em></div>)}</div>
   </section>

   <section className="subPanel printMainPanel" id="start-print">
    <div className="panelHead"><h2>Start Print</h2><small>{ready.length} ready</small></div>
    <div className="printControls">
     <label>Machine<select value={selectedMachine} onChange={e=>setSelectedMachine(e.target.value)}>{machines.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
     <label>Production weight (g)<input value={weight} onChange={e=>setWeight(e.target.value)} inputMode="decimal"/></label>
     <label>Estimated cost<input value={cost} onChange={e=>setCost(e.target.value)} inputMode="decimal"/></label>
    </div>
    <table>
     <thead><tr><th>Platform</th><th>Software</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
     <tbody>{ready.map(p=><tr key={p.id}><td><b>{p.number}</b></td><td>{p.software_name}</td><td>{p.is_reshoot_platform?'Reshoot':'Regular'}</td><td><span className="badge success">{pretty(p.status)}</span></td><td><button className="miniBtn" onClick={()=>startPrint(p)} disabled={loading||!selectedMachine}><Play size={14}/>Start</button></td></tr>)}</tbody>
    </table>
    {!ready.length&&<div className="emptyState inboxEmpty"><Clock3 size={30}/><p>No ready platforms. Create one in Machine Software / Platforms first.</p></div>}
   </section>
  </div>

  <section className="subPanel" id="print-attempts">
   <div className="panelHead"><h2>Print Attempts</h2><small>Latest first</small></div>
   <table>
    <thead><tr><th>Attempt</th><th>Platform</th><th>Machine</th><th>Status</th><th>Cost</th><th>Result</th><th>Action</th></tr></thead>
    <tbody>{attempts.map(a=><tr key={a.id}><td><b>#{a.id}</b><small className="mutedCell">Attempt {a.attempt_no}</small></td><td>{platformById[a.platform_id]?.number||`#${a.platform_id}`}</td><td>{a.machine_id?machineById[a.machine_id]?.name||`#${a.machine_id}`:'-'}</td><td><span className={a.status==='QC_PASSED'?'badge success':a.status==='QC_FAILED'?'badge danger':'badge'}>{pretty(a.status)}</span></td><td>{money(a.estimated_cost)}</td><td>{a.good_qty} good / {a.bad_qty} bad</td><td>{a.status==='PRINTING'?<div className="rowActions"><button className="miniBtn good" onClick={()=>qcPass(a)} disabled={loading}><BadgeCheck size={14}/>Pass</button><button className="miniBtn warn" onClick={()=>qcFail(a)} disabled={loading}><XCircle size={14}/>Fail</button></div>:<span className="ok">Done</span>}</td></tr>)}</tbody>
   </table>
  </section>
 </section>
}

function Stat({icon,label,value,onClick}:{icon:React.ReactNode;label:string;value:string|number;onClick:()=>void}){return <button className="setupCard clickableStat" type="button" onClick={onClick}>{icon}<span><b>{value}</b><small>{label}</small></span></button>}
function pretty(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}
