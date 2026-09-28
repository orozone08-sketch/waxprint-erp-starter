const descriptions:Record<string,string>={
 inbox:'Gmail and WhatsApp file intake. Every original file is archived before production.',
 magics:'Magics repair queue, operator session and senior checker approval.',
 platforms:'Create WaxJet / machine-software platform manifests from approved files.',
 printing:'Track platform-to-machine print attempts and machine status.',
 qc:'Physical wax QC: good, broken, incomplete, missing or deformed.',
 weight:'Enter final billable weight separately from reshoot production weight.',
 dispatch:'Packing checklist, dispatch manifest, courier and tracking.',
 returns:'Customer complaint / return, responsibility decision and replacement reshoot.',
 billing:'Weight x customer rate, invoice, payments and outstanding.',
 employees:'Employees, payroll, bonus, commission, advance and deductions.',
 travel:'Trip advances, flight/hotel/taxi/porter expenses and settlement.',
 settings:'Company masters, customers, suppliers, machines, rates, Gmail and Magics settings.'
}

export default function Placeholder({page}:{page:string}){
 const title=page.replace(/_/g,' ').replace(/\b\w/g,(s:string)=>s.toUpperCase())
 return <section className="panel"><h2>{title}</h2><p>{descriptions[page]||'This module is included in the backend data model and can be expanded in the next development sprint.'}</p><div className="empty">UI form/workflow shell ready for the next implementation pass.</div></section>
}
