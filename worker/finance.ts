import { Hono, type Context } from 'hono';
import { Env, all, one, run, insert, update, code, fail, requireRoles, database, activeCompanyId } from './shared';

type C = Context<Env>;
type Data = Record<string, any>;
async function body(c:C):Promise<Data> {const d=await c.req.json();if(!d||Array.isArray(d)||typeof d!=='object')throw fail(422,'Expected a JSON object');return d;}
const today = () => new Date().toISOString().slice(0, 10);
const round = (n: number, digits = 2) => Number(n.toFixed(digits));
function text(d: Data, k: string, fallback?: string) { const v=d[k] ?? fallback; if(typeof v !== 'string' || !v.trim()) throw fail(422, `${k} is required`); return v.trim(); }
function num(d: Data,k:string,fallback?:number,positive=false) { const v=d[k] ?? fallback; if(typeof v!=='number'||!Number.isFinite(v)||v<0||(positive&&v===0)) throw fail(422,`${k} must be ${positive?'positive':'nonnegative'}`); return v; }
function date(d:Data,k:string) { const v=d[k]??today(); if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v) throw fail(422,`${k} must be a valid date`); return v; }
function id(d:Data,k:string) {const v=num(d,k,undefined,true); if(!Number.isInteger(v))throw fail(422,`${k} must be an integer`); return v;}
function bool(d:Data,k:string,fallback=false) {const v=d[k]??fallback;if(typeof v!=='boolean')throw fail(422,`${k} must be boolean`);return v;}
async function exists(c:C,table:string,value:number,label=table) { const row=await one(c,`SELECT * FROM ${table} WHERE id=?`,value); if(!row)throw fail(404,`${label} not found`);return row as Data; }
function add(c:C,table:string,data:Data) { const keys=Object.keys(data);return database(c).prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')}) RETURNING *`).bind(...Object.values(data).map(v=>typeof v==='boolean'?Number(v):v)); }
async function sum(c:C,sql:string,...args:any[]) {return Number((await one(c,sql,...args) as Data)?.n??0);}
async function refs(c:C,d:Data) {for(const [key,table] of [['job_id','jobs'],['platform_id','platforms'],['machine_id','machines']] )if(d[key]!=null)await exists(c,table,id(d,key));}
async function pnl(c:C,requested?:string) {
 const period=requested??today().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw fail(422,'period must be YYYY-MM');
 const start=period+'-01',end=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),1)).toISOString().slice(0,10);
 const ranged=(table:string,field:string,value:string,extra='')=>sum(c,`SELECT COALESCE(SUM(${value}),0) n FROM ${table} WHERE ${field}>=? AND ${field}<? ${extra}`,start,end);
 const [sales,material,direct,overhead,payroll,weight,reshoot]=await Promise.all([ranged('invoices','invoice_date','subtotal'),ranged('inventory_transactions','txn_date','value',"AND txn_type IN ('CONSUMPTION','WASTAGE')"),ranged('expenses','expense_date','amount','AND is_direct_cost=1 AND approved=1'),ranged('expenses','expense_date','amount','AND is_direct_cost=0 AND approved=1'),sum(c,'SELECT COALESCE(SUM(net_payable),0) n FROM payroll WHERE period=?',period),ranged('jobs','weight_recorded_at','billable_weight_g'),ranged('print_attempts','started_at','estimated_cost','AND is_reshoot=1')]);
 const cost=material+direct+reshoot;return {period,net_sales:round(sales),material_consumed:round(material),other_direct_cost:round(direct),reshoot_cost:round(reshoot),direct_production_cost:round(cost),successful_billable_weight_g:round(weight,3),cost_per_gram:weight?round(cost/weight):0,gross_profit:round(sales-cost),company_overhead:round(overhead+payroll),net_operating_profit:round(sales-cost-overhead-payroll)};
}
async function cash(c:C) {const [invoiced,paid,purchases,supplier]=await Promise.all([sum(c,'SELECT COALESCE(SUM(total_amount),0) n FROM invoices'),sum(c,'SELECT COALESCE(SUM(amount),0) n FROM payments'),sum(c,'SELECT COALESCE(SUM(quantity*rate+tax_amount),0) n FROM purchases'),sum(c,'SELECT COALESCE(SUM(paid_amount),0) n FROM purchases')]);return {customer_outstanding:round(Math.max(invoiced-paid,0)),supplier_payable:round(Math.max(purchases-supplier,0))};}
async function materials(c:C) {return all(c,`SELECT m.*,ROUND(COALESCE(SUM(CASE WHEN t.txn_type='PURCHASE' THEN t.quantity WHEN t.txn_type IN ('CONSUMPTION','WASTAGE') THEN -t.quantity ELSE 0 END),0),3) stock FROM materials m LEFT JOIN inventory_transactions t ON t.material_id=m.id GROUP BY m.id ORDER BY m.name`);}

export function registerFinance(app:Hono<Env>) {
 app.get('/api/customers',async c=>c.json(await all(c,'SELECT id,code,name,email,whatsapp,default_rate,credit_days FROM customers ORDER BY name')));
 app.post('/api/customers',async c=>{const d=await body(c);const row=await insert(c,'customers',{code:code('CUST'),name:text(d,'name'),email:d.email??null,whatsapp:d.whatsapp??null,gst_number:d.gst_number??null,default_rate:num(d,'default_rate',0),credit_days:num(d,'credit_days',0)});return c.json(row);});
 for(const [path,table,fields,defaults,numeric] of [
 ['materials','materials',['code','name','unit','minimum_stock'],{unit:'kg',minimum_stock:0},['minimum_stock']],
 ['suppliers','suppliers',['code','name','gst_number','contact'],{},[]],
 ['employees','employees',['code','name','department','role','monthly_salary'],{department:'Production',role:'Operator',monthly_salary:0},['monthly_salary']],
 ] as [string,string,string[],Data,string[]][]) {
   if(path!=='materials')app.get('/api/'+path,async c=>c.json(await all(c,`SELECT * FROM ${table} ORDER BY name`)));
   app.post('/api/'+path,async c=>{const d=await body(c);const values:Data={};for(const k of fields)values[k]=numeric.includes(k)?num(d,k,defaults[k]):['code','name'].includes(k)?text(d,k):d[k]??defaults[k]??null;return c.json(await insert(c,table,values));});
 }
 app.get('/api/materials',async c=>c.json(await materials(c)));
 app.post('/api/materials/:id/density',async c=>{requireRoles(c,'ADMIN');const material=await exists(c,'materials',id({id:Number(c.req.param('id'))},'id'));const d=await body(c);const density=num(d,'density_g_cm3',undefined,true);if(density>30)throw fail(422,'Density must be 30 g/cm³ or less');await update(c,'materials',material.id,{density_g_cm3:density});return c.json({id:material.id,density_g_cm3:density});});
 app.post('/api/purchases',async c=>{const d=await body(c);const supplier_id=id(d,'supplier_id'),material_id=id(d,'material_id');await exists(c,'suppliers',supplier_id);await exists(c,'materials',material_id);const quantity=num(d,'quantity',undefined,true),rate=num(d,'rate'),purchase_date=date(d,'purchase_date');const results=await database(c).batch([add(c,'purchases',{supplier_id,material_id,purchase_date,quantity,rate,tax_amount:num(d,'tax_amount',0),paid_amount:num(d,'paid_amount',0),invoice_no:d.invoice_no??null}),add(c,'inventory_transactions',{material_id,txn_date:purchase_date,txn_type:'PURCHASE',quantity,unit_cost:rate,value:quantity*rate,notes:`Purchase ${d.invoice_no??'received'}`})]);const row=results[0].results[0] as Data;return c.json({id:row.id,inventory_added:quantity,purchase_value:round(quantity*rate)});});
 app.post('/api/inventory/consume',async c=>{const d=await body(c);const material_id=id(d,'material_id');await exists(c,'materials',material_id);await refs(c,d);const quantity=num(d,'quantity',undefined,true),unit_cost=num(d,'unit_cost');const txn_type=d.txn_type??'CONSUMPTION';if(!['CONSUMPTION','WASTAGE'].includes(txn_type))throw fail(422,'txn_type must be CONSUMPTION or WASTAGE');const row=await insert(c,'inventory_transactions',{material_id,txn_date:date(d,'txn_date'),txn_type,quantity,unit_cost,value:quantity*unit_cost,job_id:d.job_id??null,platform_id:d.platform_id??null,machine_id:d.machine_id??null,notes:d.notes??null});return c.json({id:row.id,production_cost_added:round(quantity*unit_cost)});});
 app.get('/api/expenses',async c=>{requireRoles(c,'ADMIN');return c.json(await all(c,'SELECT id,expense_date date,category,subcategory,description,amount,is_direct_cost,related_type,related_id,approved FROM expenses ORDER BY expense_date DESC,id DESC'));});
 app.post('/api/expenses',async c=>{requireRoles(c,'ADMIN','ACCOUNTS','STAFF','OPERATOR');const d=await body(c);const row=await insert(c,'expenses',{expense_date:date(d,'expense_date'),category:text(d,'category'),subcategory:d.subcategory??null,description:text(d,'description'),amount:num(d,'amount',undefined,true),tax_amount:num(d,'tax_amount',0),is_direct_cost:bool(d,'is_direct_cost'),related_type:d.related_type??'GENERAL',related_id:d.related_id??null,payment_mode:d.payment_mode??'BANK',approved:c.get('user').role==='ADMIN'});return c.json({id:row.id,amount:row.amount,approved:!!row.approved});});
 app.post('/api/expenses/:id/approve',async c=>{requireRoles(c,'ADMIN');const eid=Number(c.req.param('id'));await exists(c,'expenses',eid);await update(c,'expenses',eid,{approved:true});return c.json({ok:true,id:eid});});
 app.get('/api/payroll',async c=>{requireRoles(c,'ADMIN');return c.json(await all(c,'SELECT p.*,e.name employee_name FROM payroll p JOIN employees e ON e.id=p.employee_id ORDER BY p.id DESC'));});
 app.post('/api/payroll',async c=>{requireRoles(c,'ADMIN');const d=await body(c);const employee_id=id(d,'employee_id');await exists(c,'employees',employee_id);const period=text(d,'period');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw fail(422,'period must be YYYY-MM');const data:Data={employee_id,period,paid:bool(d,'paid')};for(const k of ['basic','bonus','commission','reimbursement','advance_deduction','other_deduction'])data[k]=num(d,k,k==='basic'?undefined:0);data.net_payable=data.basic+data.bonus+data.commission+data.reimbursement-data.advance_deduction-data.other_deduction;const row=await insert(c,'payroll',data);return c.json({id:row.id,net_payable:round(data.net_payable)});});
 app.get('/api/advances',async c=>{requireRoles(c,'ADMIN');return c.json(await all(c,'SELECT a.*,e.name employee_name,j.number job_number FROM employee_advances a JOIN employees e ON e.id=a.employee_id LEFT JOIN jobs j ON j.id=a.job_id ORDER BY advance_date DESC,a.id DESC'));});
 app.post('/api/advances',async c=>{requireRoles(c,'ADMIN');const d=await body(c);const employee_id=id(d,'employee_id');const employee=await exists(c,'employees',employee_id);await refs(c,d);const row=await insert(c,'employee_advances',{employee_id,job_id:d.job_id??null,advance_date:date(d,'advance_date'),amount:num(d,'amount',undefined,true),purpose:text(d,'purpose','Salary advance'),period:d.period??null,notes:d.notes??null,status:'OPEN'});return c.json({id:row.id,employee:employee.name,amount:round(row.amount),status:row.status});});
 app.get('/api/travel',async c=>{requireRoles(c,'ADMIN');const rows=await all(c,'SELECT t.*,e.name employee_name,j.number job_number FROM travel_advances t JOIN employees e ON e.id=t.employee_id LEFT JOIN jobs j ON j.id=t.job_id ORDER BY trip_date DESC,t.id DESC');return c.json(rows.map((t:Data)=>{const total=['flight_amount','hotel_amount','taxi_amount','porter_amount','other_amount'].reduce((n,k)=>n+t[k],0);return {...t,total_expense:round(total),balance:round(t.advance_amount+t.settled_amount-total)};}));});
 app.post('/api/travel',async c=>{requireRoles(c,'ADMIN');const d=await body(c);const employee_id=id(d,'employee_id');await exists(c,'employees',employee_id);await refs(c,d);const data:Data={employee_id,job_id:d.job_id??null,trip_date:date(d,'trip_date'),destination:text(d,'destination'),purpose:text(d,'purpose'),notes:d.notes??null};for(const k of ['advance_amount','flight_amount','hotel_amount','taxi_amount','porter_amount','other_amount','settled_amount'])data[k]=num(d,k,0);const expense=['flight_amount','hotel_amount','taxi_amount','porter_amount','other_amount'].reduce((n,k)=>n+data[k],0),balance=data.advance_amount+data.settled_amount-expense;data.status=Math.abs(balance)<0.01?'SETTLED':'OPEN';const statements=[add(c,'travel_advances',data)];if(expense)statements.push(add(c,'expenses',{expense_date:data.trip_date,category:'Travel',subcategory:'Trip Settlement',description:`${data.destination} - ${data.purpose}`,amount:expense,is_direct_cost:!!data.job_id,related_type:data.job_id?'JOB':'EMPLOYEE',related_id:data.job_id??employee_id,payment_mode:'BANK',approved:true}));const results=await database(c).batch(statements);const row=results[0].results[0] as Data;return c.json({id:row.id,status:data.status,total_expense:round(expense),balance:round(balance)});});
 app.post('/api/invoices/from-job',async c=>{
   requireRoles(c,'ADMIN','ACCOUNTS');const d=await body(c);const job=await exists(c,'jobs',id(d,'job_id'));const customer=await exists(c,'customers',job.customer_id);
   if(!['WEIGHT_COMPLETED','DISPATCHED'].includes(job.status)||job.billable_weight_g<=0)fail(409,'Invoice blocked: complete production and save the final job weight first.');
   const fileCheck=await one(c,'SELECT COUNT(*) total,SUM(CASE WHEN weight_g IS NULL OR weight_g<=0 THEN 1 ELSE 0 END) missing,COALESCE(SUM(weight_g*quantity),0) total_weight FROM job_files WHERE job_id=?',job.id) as Data;
   if(Number(fileCheck?.total)>0&&Number(fileCheck?.missing)>0)fail(409,`Invoice blocked: ${fileCheck.missing} STL file(s) still need a measured weight.`);
   if(Number(fileCheck?.total)>0&&Math.abs(Number(job.billable_weight_g)-Number(fileCheck.total_weight))>0.001)fail(409,'Invoice blocked: job total does not match the saved per-file weights. Save the file weights again.');
   const amount=job.billable_weight_g*customer.default_rate,extra=num(d,'extra_charge',0),subtotal=amount+extra,tax=subtotal*num(d,'tax_rate',0)/100;const number=code('INV');const statements=[add(c,'invoices',{number,customer_id:job.customer_id,invoice_date:today(),subtotal,tax_amount:tax,total_amount:subtotal+tax,status:'SENT'}),database(c).prepare('INSERT INTO invoice_lines(invoice_id,job_id,description,weight_g,rate,amount) SELECT id,?,?,?,?,? FROM invoices WHERE number=?').bind(job.id,`Wax printing ${job.number}`,job.billable_weight_g,customer.default_rate,amount,number)];if(extra)statements.push(database(c).prepare('INSERT INTO invoice_lines(invoice_id,job_id,description,weight_g,rate,amount) SELECT id,?,?,0,0,? FROM invoices WHERE number=?').bind(job.id,text(d,'extra_description','Other Charges'),extra,number));statements.push(database(c).prepare("UPDATE jobs SET status='INVOICED' WHERE id=?").bind(job.id));const results=await database(c).batch(statements);const inv=results[0].results[0] as Data;return c.json({id:inv.id,number:inv.number,subtotal:round(subtotal),tax:round(tax),total:round(subtotal+tax)});
 });
 app.get('/api/invoices',async c=>{requireRoles(c,'ADMIN','ACCOUNTS');return c.json(await all(c,'SELECT i.id,i.number,i.customer_id,i.invoice_date date,i.subtotal,i.tax_amount tax,i.total_amount total,COALESCE(SUM(p.amount),0) paid,MAX(i.total_amount-COALESCE(SUM(p.amount),0),0) outstanding,i.status FROM invoices i LEFT JOIN payments p ON p.invoice_id=i.id GROUP BY i.id ORDER BY i.id DESC'));});
 app.post('/api/payments',async c=>{requireRoles(c,'ADMIN','ACCOUNTS');const d=await body(c);const inv=await exists(c,'invoices',id(d,'invoice_id'));const results=await database(c).batch([add(c,'payments',{invoice_id:inv.id,payment_date:date(d,'payment_date'),amount:num(d,'amount',undefined,true),payment_mode:d.payment_mode??'BANK',reference:d.reference??null}),database(c).prepare("UPDATE invoices SET status=CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=?)>=total_amount THEN 'PAID' ELSE 'PART_PAID' END WHERE id=?").bind(inv.id,inv.id)]);const row=results[0].results[0] as Data;const paid=await sum(c,'SELECT SUM(amount) n FROM payments WHERE invoice_id=?',inv.id);return c.json({id:row.id,invoice:inv.number,paid_total:round(paid),outstanding:round(Math.max(inv.total_amount-paid,0))});});
 app.get('/api/reports/pnl',async c=>{requireRoles(c,'ADMIN');return c.json(await pnl(c,c.req.query('period')));});
 app.get('/api/reports/job-profitability',async c=>{requireRoles(c,'ADMIN');const rows=await all(c,`SELECT j.number job,c.name customer,j.billable_weight_g weight_g,COALESCE((SELECT SUM(amount) FROM invoice_lines WHERE job_id=j.id),0) revenue,COALESCE((SELECT SUM(value) FROM inventory_transactions WHERE job_id=j.id AND txn_type IN ('CONSUMPTION','WASTAGE')),0)+COALESCE((SELECT SUM(amount) FROM expenses WHERE related_type='JOB' AND related_id=j.id AND is_direct_cost=1 AND approved=1),0)+COALESCE((SELECT SUM(a.estimated_cost) FROM print_attempts a JOIN job_files f ON f.id=a.job_file_id WHERE f.job_id=j.id AND a.is_reshoot=1),0) direct_cost FROM jobs j JOIN customers c ON c.id=j.customer_id ORDER BY j.id DESC`);return c.json(rows.map((r:Data)=>({...r,revenue:round(r.revenue),direct_cost:round(r.direct_cost),gross_profit:round(r.revenue-r.direct_cost),margin_pct:r.revenue?round((r.revenue-r.direct_cost)/r.revenue*100):0})));});
 app.get('/api/dashboard',async c=>{requireRoles(c,'ADMIN');const [jobs,reshoots,printing,qc,p,cashInfo,stock]=await Promise.all([sum(c,'SELECT COUNT(*) n FROM jobs'),sum(c,"SELECT COUNT(*) n FROM reshoot_tickets WHERE status='OPEN'"),sum(c,"SELECT COUNT(*) n FROM print_attempts WHERE status='PRINTING'"),sum(c,"SELECT COUNT(*) n FROM print_attempts WHERE status='QC_FAILED'"),pnl(c),cash(c),materials(c)]);return c.json({counts:{jobs,open_reshoots:reshoots,printing,qc_failed:qc},pnl:p,cash:cashInfo,low_stock:stock.filter((r:Data)=>r.stock<=r.minimum_stock).map((r:Data)=>({material:r.name,qty:r.stock,minimum:r.minimum_stock}))});});
 registerGmail(app);
}

const gmailEncoder=new TextEncoder();
function gmailB64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function gmailUnb64(value:string){return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));}
function gmailHex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes)).map(value=>value.toString(16).padStart(2,'0')).join('');}
async function gmailBridgeHash(token:string){return gmailHex(await crypto.subtle.digest('SHA-256',gmailEncoder.encode(token)));}
async function requireGmailBridge(c:C){
 const token=(c.req.header('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)throw fail(401,'Missing Gmail bridge key');
 const hash=await gmailBridgeHash(token);
 for(const [companyId,db] of [[1,c.env.DB],[2,c.env.DB_SUNMOON]] as Array<[number,D1Database|undefined]>){
  if(!db)continue;
  const setting=await db.prepare("SELECT value FROM integration_settings WHERE key='gmail_bridge'").first<Data>();
  if(setting&&JSON.parse(setting.value).token_hash===hash){c.set('companyId',companyId);return companyId;}
 }
 throw fail(401,'Invalid or replaced Gmail bridge key');
}
async function gmailHmacKey(c:C){return crypto.subtle.importKey('raw',gmailEncoder.encode(c.env.AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function sealGmailToken(c:C,token:string){const raw=await crypto.subtle.digest('SHA-256',gmailEncoder.encode(`gmail-refresh-v1:${c.env.AUTH_SECRET}`));const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,gmailEncoder.encode(token));return `${gmailB64(iv)}.${gmailB64(new Uint8Array(cipher))}`;}
async function openGmailToken(c:C,sealed:string){try{const [iv,cipher]=sealed.split('.');const raw=await crypto.subtle.digest('SHA-256',gmailEncoder.encode(`gmail-refresh-v1:${c.env.AUTH_SECRET}`));const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:gmailUnb64(iv)},key,gmailUnb64(cipher));return new TextDecoder().decode(plain);}catch{return null;}}
async function gmailSettings(c:C){const settings=await one(c,"SELECT value FROM integration_settings WHERE key='gmail'") as Data|null;return settings?JSON.parse(settings.value):{};}
async function saveGmailSettings(c:C,value:Data){await run(c,"INSERT INTO integration_settings(key,value) VALUES('gmail',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(value));}
async function gmailBridgeSettings(c:C){const setting=await one(c,"SELECT value FROM integration_settings WHERE key='gmail_bridge'") as Data|null;return setting?JSON.parse(setting.value):{};}
async function gmailStatus(c:C) {const d=await gmailSettings(c),bridge=await gmailBridgeSettings(c);const env=c.env as any;return {enabled:d.enabled??false,configured:!!(env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&(d.refresh_token_encrypted||env.GMAIL_REFRESH_TOKEN)),client_configured:!!(env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET),bridge_configured:!!bridge.token_hash,storage_enabled:!!env.FILES,mode:bridge.token_hash?'apps_script':'oauth',user:d.user??'',mailbox:d.mailbox??'INBOX',fetch_query:d.fetch_query??'is:unread',fetch_limit:d.fetch_limit??25,redirect_uri:`${new URL(c.req.url).origin}/api/integrations/gmail/callback`,pubsub_topic:env.GMAIL_PUBSUB_TOPIC??null,archive_label:null};}
async function gmailToken(c:C) {const current=await gmailStatus(c);if(!current.enabled)throw fail(400,'Enable Gmail in Settings before fetching mail');if(!current.configured)throw fail(400,'Connect Gmail from Settings > Gmail Intake. The Google app client must be configured once first.');const env=c.env as any,d=await gmailSettings(c);const refresh=d.refresh_token_encrypted?await openGmailToken(c,d.refresh_token_encrypted):env.GMAIL_REFRESH_TOKEN;if(!refresh)throw fail(400,'Gmail authorization expired or is missing. Use Connect Google in Settings to reconnect.');const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:refresh,grant_type:'refresh_token'})});const data=await response.json() as Data;if(!response.ok||!data.access_token)throw fail(502,'Google could not refresh Gmail authorization. Reconnect Gmail from Settings.');return data.access_token;}
async function gmailFetch(c:C,path:string,token:string) {const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw fail(502,`Gmail API returned ${response.status}`);return await response.json() as Data;}
function registerGmail(app:Hono<Env>) {
 app.get('/api/integrations/gmail/status',async c=>c.json(await gmailStatus(c)));
 app.get('/api/settings/integrations',async c=>{requireRoles(c,'ADMIN');return c.json({gmail:await gmailStatus(c),magics:{agent_token_configured:!!(c.env as any).AGENT_TOKEN,workstation_default:'MAGICS-PC-01',local_agent_folder:'magics_agent',queue_endpoint:'/api/magics/agent/jobs'}});});
 app.post('/api/settings/gmail/bridge-key',async c=>{requireRoles(c,'ADMIN');if(!c.env.FILES)throw fail(503,'Enable R2 attachment storage before setting up the Gmail bridge.');const token=gmailB64(crypto.getRandomValues(new Uint8Array(32))),hash=await gmailBridgeHash(token);await run(c,"INSERT INTO integration_settings(key,value) VALUES('gmail_bridge',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify({token_hash:hash,created_at:new Date().toISOString()}));return c.json({ok:true,token,endpoint:`${new URL(c.req.url).origin}/api/integrations/gmail/bridge/import`});});
 app.post('/api/integrations/gmail/bridge/import',async c=>{
  const token=(c.req.header('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)throw fail(401,'Missing Gmail bridge key');
  const hash=await gmailBridgeHash(token);let companyId=0;
  const databases:Array<[number,D1Database|undefined]>=[[1,c.env.DB],[2,c.env.DB_SUNMOON]];
  for(const [id,db] of databases){if(!db)continue;const setting=await db.prepare("SELECT value FROM integration_settings WHERE key='gmail_bridge'").first<Data>();if(setting&&JSON.parse(setting.value).token_hash===hash){companyId=id;break;}}
  if(!companyId)throw fail(401,'Invalid or replaced Gmail bridge key');c.set('companyId',companyId);
  const length=Number(c.req.header('content-length')||0);if(length>38*1024*1024)throw fail(413,'This email is too large for the Gmail bridge.');
  const d=await body(c),messageId=typeof d.message_id==='string'?d.message_id.trim():'';if(!messageId||messageId.length>500)throw fail(422,'A valid Gmail message ID is required.');
  if(!c.env.FILES)throw fail(503,'R2 attachment storage is not enabled.');
  const externalId=`gmail:${messageId}`;let inbox=await one(c,'SELECT id,attachments_archived FROM inbox_messages WHERE external_message_id=?',externalId) as Data|null;
  if(inbox?.attachments_archived){
   const saved=await one(c,'SELECT COUNT(*) AS count FROM inbox_attachments WHERE inbox_message_id=?',inbox.id) as Data;
   if(Number(saved.count)>0)return c.json({ok:true,already_imported:true,attachments_imported:0});
  }
  const received=typeof d.received_at==='string'&&!Number.isNaN(Date.parse(d.received_at))?new Date(d.received_at).toISOString():new Date().toISOString();
  const sender=typeof d.sender==='string'?d.sender.slice(0,1000):'',email=sender.match(/<([^>]+)>/)?.[1]??sender,customer=email?await one(c,'SELECT id FROM customers WHERE lower(email)=?',email.toLowerCase()) as Data|null:null;
  if(!inbox)inbox=await insert(c,'inbox_messages',{source:'gmail',external_message_id:externalId,sender,subject:(typeof d.subject==='string'?d.subject:'(no subject)').slice(0,1000),body:(typeof d.body==='string'?d.body:'').slice(0,10000),received_at:received,archived:false,status:customer?'MATCHED':'RECEIVED',customer_id:customer?.id??null});
  if(!Array.isArray(d.attachments)||d.attachments.length>30)throw fail(422,'The Gmail bridge accepts up to 30 attachments per message.');
  let imported=0,total=0;
  for(let index=0;index<d.attachments.length;index++){
   const attachment=d.attachments[index] as Data;if(typeof attachment?.data!=='string'||!attachment.data)continue;
   const partKey=`apps-script:${index}`,exists=await one(c,'SELECT id FROM inbox_attachments WHERE inbox_message_id=? AND gmail_part_key=?',inbox.id,partKey);if(exists)continue;
   let bytes:Uint8Array;try{bytes=gmailUnb64(attachment.data.replace(/\+/g,'-').replace(/\//g,'_'));}catch{throw fail(422,'An attachment was not valid base64 data.');}
   total+=bytes.byteLength;if(!bytes.byteLength||bytes.byteLength>25*1024*1024||total>25*1024*1024)throw fail(413,'Attachments in one email must total 25 MB or less.');
   const filename=(typeof attachment.filename==='string'?attachment.filename:'attachment').split(/[\\/]/).pop()?.replace(/[\r\n\0]/g,'_').slice(0,240)||'attachment';
   const mime=typeof attachment.mime_type==='string'&&/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(attachment.mime_type)?attachment.mime_type:'application/octet-stream';
   const key=`gmail/${companyId}/${inbox.id}/${crypto.randomUUID()}/${filename}`,sha=gmailHex(await crypto.subtle.digest('SHA-256',bytes));
   await c.env.FILES.put(key,bytes,{httpMetadata:{contentType:mime}});
   try{await insert(c,'inbox_attachments',{inbox_message_id:inbox.id,filename,mime_type:mime,size_bytes:bytes.byteLength,sha256:sha,storage_key:key,gmail_part_key:partKey});imported++;}catch(error){await c.env.FILES.delete(key);throw error;}
  }
  await run(c,'UPDATE inbox_messages SET attachments_archived=1 WHERE id=?',inbox.id);
  return c.json({ok:true,already_imported:false,attachments_imported:imported});
 });
 // Streaming bridge endpoints keep binary STL payloads out of JSON parsing and
 // request cloning, which otherwise exceeds a Cloudflare Worker's CPU/memory budget.
 app.post('/api/integrations/gmail/bridge/message',async c=>{
  const companyId=await requireGmailBridge(c),d=await body(c);
  const messageId=typeof d.message_id==='string'?d.message_id.trim():'';
  if(!messageId||messageId.length>500)throw fail(422,'A valid Gmail message ID is required.');
  const externalId=`gmail:${messageId}`;
  let inbox=await one(c,'SELECT id,attachments_archived FROM inbox_messages WHERE external_message_id=?',externalId) as Data|null;
  // A previous sync may have saved the email row but missed its files. Let the
  // Apps Script retry those messages; once any files are present, keep the
  // normal idempotent fast path.
  if(inbox?.attachments_archived){
   const saved=await one(c,'SELECT COUNT(*) AS count FROM inbox_attachments WHERE inbox_message_id=?',inbox.id) as Data;
   if(Number(saved.count)>0)return c.json({ok:true,already_imported:true});
  }
  if(!c.env.FILES)throw fail(503,'R2 attachment storage is not enabled.');
  if(!inbox){
   const sender=typeof d.sender==='string'?d.sender.slice(0,1000):'';
   const email=sender.match(/<([^>]+)>/)?.[1]??sender;
   const customer=email?await one(c,'SELECT id FROM customers WHERE lower(email)=?',email.toLowerCase()) as Data|null:null;
   const received=typeof d.received_at==='string'&&!Number.isNaN(Date.parse(d.received_at))?new Date(d.received_at).toISOString():new Date().toISOString();
   inbox=await insert(c,'inbox_messages',{source:'gmail',external_message_id:externalId,sender,subject:(typeof d.subject==='string'?d.subject:'(no subject)').slice(0,1000),body:(typeof d.body==='string'?d.body:'').slice(0,10000),received_at:received,archived:false,status:customer?'MATCHED':'RECEIVED',customer_id:customer?.id??null});
  }
  return c.json({ok:true,already_imported:false,inbox_message_id:inbox.id,company_id:companyId});
 });
 app.post('/api/integrations/gmail/bridge/attachment',async c=>{
  const companyId=await requireGmailBridge(c);
  if(!c.env.FILES)throw fail(503,'R2 attachment storage is not enabled.');
  const messageId=c.req.header('x-gmail-message-id')||'',partKey=c.req.header('x-gmail-part-key')||'';
  const encodedName=c.req.header('x-gmail-filename')||'',digest=(c.req.header('x-gmail-sha256')||'').toLowerCase();
  const mimeHeader=c.req.header('x-gmail-mime-type')||'application/octet-stream';
  const size=Number(c.req.header('content-length')||0);
  if(!messageId||messageId.length>500||!partKey||partKey.length>500)throw fail(422,'Gmail message and part IDs are required.');
  if(!/^[a-f0-9]{64}$/.test(digest))throw fail(422,'A valid attachment SHA-256 digest is required.');
  if(!Number.isSafeInteger(size)||size<1||size>45*1024*1024)throw fail(413,'Each Gmail attachment must be 1 byte to 45 MB.');
  let decodedName='attachment';try{decodedName=decodeURIComponent(encodedName);}catch{throw fail(422,'Attachment filename is invalid.');}
  const filename=decodedName.split(/[\\/]/).pop()?.replace(/[\r\n\0]/g,'_').slice(0,240)||'attachment';
  const mime=/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(mimeHeader)?mimeHeader:'application/octet-stream';
  const inbox=await one(c,'SELECT id,attachments_archived FROM inbox_messages WHERE external_message_id=? AND source=\'gmail\'',`gmail:${messageId}`) as Data|null;
  if(!inbox)throw fail(404,'Start this Gmail message import before uploading its files.');
  const exists=await one(c,'SELECT id FROM inbox_attachments WHERE inbox_message_id=? AND gmail_part_key=?',inbox.id,partKey);
  if(exists)return c.json({ok:true,already_imported:true});
  const stream=c.req.raw.body;if(!stream)throw fail(400,'Attachment body is empty.');
  const key=`gmail/${companyId}/${inbox.id}/${crypto.randomUUID()}/${filename}`;
  await c.env.FILES.put(key,stream,{httpMetadata:{contentType:mime}});
  try{await insert(c,'inbox_attachments',{inbox_message_id:inbox.id,filename,mime_type:mime,size_bytes:size,sha256:digest,storage_key:key,gmail_part_key:partKey});}
  catch(error){await c.env.FILES.delete(key);throw error;}
  return c.json({ok:true,already_imported:false});
 });
 app.post('/api/integrations/gmail/bridge/complete',async c=>{
  await requireGmailBridge(c);const d=await body(c),messageId=typeof d.message_id==='string'?d.message_id.trim():'';
  if(!messageId||messageId.length>500)throw fail(422,'A valid Gmail message ID is required.');
  const inbox=await one(c,'SELECT id,attachments_archived FROM inbox_messages WHERE external_message_id=? AND source=\'gmail\'',`gmail:${messageId}`) as Data|null;
  if(!inbox)throw fail(404,'Gmail message was not started.');
  await run(c,'UPDATE inbox_messages SET attachments_archived=1 WHERE id=?',inbox.id);
  return c.json({ok:true});
 });
 app.get('/api/settings/gmail/connect-url',async c=>{const user=requireRoles(c,'ADMIN')!;const env=c.env as any;if(!env.GMAIL_CLIENT_ID||!env.GMAIL_CLIENT_SECRET)throw fail(503,'Set the Google OAuth Client ID and Client Secret as Cloudflare Worker secrets first.');const companyId=activeCompanyId(c),returnTo=c.req.query('return_to')==='inbox'?'inbox':'settings',nonce=gmailB64(crypto.getRandomValues(new Uint8Array(24))),payload=gmailB64(gmailEncoder.encode(JSON.stringify({cid:companyId,uid:Number(user.id),nonce,return_to:returnTo,exp:Math.floor(Date.now()/1000)+600})));const signature=gmailB64(new Uint8Array(await crypto.subtle.sign('HMAC',await gmailHmacKey(c),gmailEncoder.encode(payload))));await run(c,"INSERT INTO integration_settings(key,value) VALUES('gmail_oauth_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify({nonce,user_id:Number(user.id),expires_at:Math.floor(Date.now()/1000)+600}));const redirectUri=`${new URL(c.req.url).origin}/api/integrations/gmail/callback`,settings=await gmailSettings(c);const authorize=new URL('https://accounts.google.com/o/oauth2/v2/auth');authorize.search=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,redirect_uri:redirectUri,response_type:'code',scope:'https://www.googleapis.com/auth/gmail.readonly',access_type:'offline',prompt:'consent',include_granted_scopes:'true',state:`${payload}.${signature}`,...(settings.user?{login_hint:settings.user}:{})}).toString();return c.json({url:authorize.toString(),redirect_uri:redirectUri});});
 app.get('/api/integrations/gmail/callback',async c=>{const state=c.req.query('state')||'',codeValue=c.req.query('code'),googleError=c.req.query('error');let returnTo:'inbox'|'settings'='settings';try{const [payload,signature,extra]=state.split('.');if(extra||!payload||!signature||!await crypto.subtle.verify('HMAC',await gmailHmacKey(c),gmailUnb64(signature),gmailEncoder.encode(payload)))throw new Error('Invalid Google authorization state');const value=JSON.parse(new TextDecoder().decode(gmailUnb64(payload))) as Data;returnTo=value.return_to==='inbox'?'inbox':'settings';if(!Number.isInteger(value.cid)||!Number.isInteger(value.uid)||value.exp<Math.floor(Date.now()/1000))throw new Error('Google authorization expired');c.set('companyId',value.cid);const savedState=await one(c,"SELECT value FROM integration_settings WHERE key='gmail_oauth_state'") as Data|null;const pending=savedState?JSON.parse(savedState.value):null;if(!pending||pending.nonce!==value.nonce||pending.user_id!==value.uid||pending.expires_at<Math.floor(Date.now()/1000))throw new Error('Google authorization request expired; try Connect Google again');await run(c,"DELETE FROM integration_settings WHERE key='gmail_oauth_state'");const user=await c.env.DB.prepare('SELECT id,company_id,role,active FROM app_users WHERE id=?').bind(value.uid).first<Data>();if(!user||!user.active||(user.role!=='SUPER_ADMIN'&&Number(user.company_id)!==value.cid)||!['ADMIN','SUPER_ADMIN'].includes(user.role))throw new Error('Only an active company administrator can connect Gmail');if(googleError)return c.redirect(returnTo==='inbox'?'/?page=inbox&gmail=cancelled':'/?page=settings&gmail=cancelled#gmail');if(!codeValue)throw new Error('Google did not return an authorization code');const env=c.env as any,redirectUri=`${new URL(c.req.url).origin}/api/integrations/gmail/callback`;const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,code:codeValue,grant_type:'authorization_code',redirect_uri:redirectUri})});const tokens=await response.json() as Data;if(!response.ok||!tokens.access_token)throw new Error('Google could not complete Gmail authorization');const old=await gmailSettings(c);let refresh=typeof tokens.refresh_token==='string'?tokens.refresh_token:old.refresh_token_encrypted?await openGmailToken(c,old.refresh_token_encrypted):env.GMAIL_REFRESH_TOKEN;if(!refresh)throw new Error('Google did not return offline access. Try Connect Google again and approve the requested Gmail access.');const profileResponse=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${tokens.access_token}`}});const profile=await profileResponse.json() as Data;if(!profileResponse.ok||!profile.emailAddress)throw new Error('Could not read the authorized Gmail account profile');await saveGmailSettings(c,{...old,enabled:true,user:profile.emailAddress,refresh_token_encrypted:await sealGmailToken(c,refresh)});return c.redirect(returnTo==='inbox'?'/?page=inbox&gmail=connected':'/?page=settings&gmail=connected#gmail');}catch(error){console.error('Gmail OAuth callback failed',error instanceof Error?error.message:'unknown error');return c.redirect(returnTo==='inbox'?'/?page=inbox&gmail=error':'/?page=settings&gmail=error#gmail');}});
 app.post('/api/settings/gmail',async c=>{requireRoles(c,'ADMIN');const d=await body(c);const old=await gmailSettings(c);const enabled=bool(d,'enabled',true),user=enabled?text(d,'user'):d.user??'',fetch_limit=num(d,'fetch_limit',25,true);if(!Number.isInteger(fetch_limit)||fetch_limit>100)throw fail(422,'fetch_limit must be 1 to 100');const value:Data={...old,enabled,user,mailbox:text(d,'mailbox','INBOX'),fetch_query:d.fetch_query==='UNSEEN'?'is:unread':text(d,'fetch_query','is:unread'),fetch_limit};if(!enabled){delete value.refresh_token_encrypted;await run(c,"DELETE FROM integration_settings WHERE key='gmail_bridge'");}await saveGmailSettings(c,value);return c.json({ok:true,message:'Gmail settings saved.',gmail:await gmailStatus(c)});});
 app.post('/api/settings/gmail/test',async c=>{requireRoles(c,'ADMIN');const token=await gmailToken(c);const profile=await gmailFetch(c,'profile',token);return c.json({ok:true,message:`Gmail connected to ${profile.emailAddress}`,gmail:await gmailStatus(c)});});
 app.post('/api/integrations/gmail/push',async c=>{const payload=await body(c);await insert(c,'audit_logs',{module:'gmail',action:'PUSH_RECEIVED',details:JSON.stringify(payload).slice(0,2000),user_name:'gmail'});return c.json({ok:true});});
 app.post('/api/integrations/gmail/reconcile',async c=>{
  requireRoles(c,'ADMIN');
  const settings=await gmailStatus(c),token=await gmailToken(c);
  const list=await gmailFetch(c,'messages?'+new URLSearchParams({q:settings.fetch_query,labelIds:settings.mailbox,maxResults:String(settings.fetch_limit)}),token);
  let imported=0,skipped_existing=0,attachments_imported=0;const errors:string[]=[];
  const fromUrl=(data:string)=>{const normalized=data.replace(/-/g,'+').replace(/_/g,'/');const raw=atob(normalized);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;};
  const mimeType=(value:unknown)=>typeof value==='string'&&/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(value)?value:'application/octet-stream';
  const digest=(bytes:Uint8Array)=>crypto.subtle.digest('SHA-256',bytes).then(hash=>Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join(''));
  for(const ref of list.messages??[]){
   try {
    const external_id='gmail:'+ref.id;
    let inbox=await one(c,'SELECT id,attachments_archived FROM inbox_messages WHERE external_message_id=?',external_id) as Data|null;
    if(inbox&&inbox.attachments_archived){skipped_existing++;continue;}
    const msg=await gmailFetch(c,`messages/${ref.id}?format=full`,token);
    if(!inbox){
     const headers=msg.payload?.headers??[],header=(key:string)=>headers.find((h:Data)=>h.name.toLowerCase()===key)?.value??'';
     const sender=header('from'),email=sender.match(/<([^>]+)>/)?.[1]??sender;
     const customer=await one(c,'SELECT id FROM customers WHERE lower(email)=?',email.toLowerCase()) as Data|null;
     const bodyParts:string[]=[];
     function readBody(part:Data){if(part.mimeType==='text/plain'&&part.body?.data)bodyParts.push(new TextDecoder().decode(fromUrl(part.body.data)));for(const child of part.parts??[])readBody(child);}
     readBody(msg.payload??{});
     inbox=await insert(c,'inbox_messages',{source:'gmail',external_message_id:external_id,sender,subject:header('subject')||'(no subject)',body:(bodyParts.join('\n\n')||msg.snippet||'').slice(0,10000),received_at:new Date(Number(msg.internalDate)).toISOString(),archived:false,status:customer?'MATCHED':'RECEIVED',customer_id:customer?.id??null});
     imported++;
    }else skipped_existing++;
    async function saveParts(part:Data,path:string){
     const filename=typeof part.filename==='string'?part.filename.trim():'';
     if(filename&&(part.body?.attachmentId||part.body?.data)){
      if(!c.env.FILES)throw new Error('Persistent file storage is not enabled. Activate R2 before importing Gmail attachments; no copy of this attachment was saved.');
      const partKey=String(part.partId??path);
      const exists=await one(c,'SELECT id FROM inbox_attachments WHERE inbox_message_id=? AND gmail_part_key=?',inbox!.id,partKey);
      if(!exists){
       let bytes:Uint8Array;
       if(part.body?.attachmentId){const data=await gmailFetch(c,`messages/${ref.id}/attachments/${part.body.attachmentId}`,token);bytes=fromUrl(data.data??'');}
       else bytes=fromUrl(part.body.data);
       if(!bytes.byteLength)throw new Error(`Attachment ${filename} is empty`);
       if(bytes.byteLength>25*1024*1024)throw new Error(`Attachment ${filename} exceeds Gmail's 25 MB attachment limit`);
       const safeName=filename.split(/[\\/]/).pop()?.replace(/[\\r\\n\\0]/g,'_').slice(0,240)||'attachment';
       const key=`gmail/${activeCompanyId(c)}/${inbox!.id}/${crypto.randomUUID()}/${safeName}`;
       const sha=await digest(bytes);
       const type=mimeType(part.mimeType);
       await c.env.FILES!.put(key,bytes,{httpMetadata:{contentType:type}});
       try{await insert(c,'inbox_attachments',{inbox_message_id:inbox!.id,filename:safeName,mime_type:type,size_bytes:bytes.byteLength,sha256:sha,storage_key:key,gmail_part_key:partKey});attachments_imported++;}
       catch(e){await c.env.FILES!.delete(key);throw e;}
      }
     }
     for(let i=0;i<(part.parts??[]).length;i++)await saveParts(part.parts[i],`${path}.${i}`);
    }
    await saveParts(msg.payload??{},'0');
    await run(c,'UPDATE inbox_messages SET attachments_archived=1 WHERE id=?',inbox!.id);
   }catch(e){errors.push(`Message ${ref.id}: ${e instanceof Error?e.message:'import failed'}`);}
  }
  const message=`Imported ${imported} Gmail message(s), saved ${attachments_imported} file(s), skipped ${skipped_existing} existing message(s).${errors.length?` ${errors[0]}`:''}`;
  return c.json({ok:errors.length===0,fetched:list.messages?.length??0,imported,skipped_existing,attachments_imported,errors,message});
 });
}
