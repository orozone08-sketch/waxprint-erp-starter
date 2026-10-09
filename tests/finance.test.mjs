import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, json } from './harness.mjs';

test('finance records stock, invoices, payment status and report totals', async () => {
 const h=await fixture();
 try {
  const post=(path,body)=>h.request('/api/'+path,{method:'POST',body});
  const material=await json(await post('materials',{code:'WAX',name:'Wax'}));
  const supplier=await json(await post('suppliers',{code:'SUP',name:'Supplier'}));
  await json(await post('purchases',{supplier_id:supplier.id,material_id:material.id,quantity:10,rate:2}));
  assert.equal((await json(await h.request('/api/materials')))[0].stock,10);
  await json(await post('inventory/consume',{material_id:material.id,quantity:3,unit_cost:2}));
  assert.equal((await json(await h.request('/api/materials')))[0].stock,7);
  const customer=await json(await post('customers',{name:'Customer',default_rate:5}));
  const job=await json(await post('jobs',{customer_id:customer.id}));
  h.db.prepare('UPDATE jobs SET billable_weight_g=20,weight_recorded_at=? WHERE id=?').run(new Date().toISOString(),job.id);
  const invoice=await json(await post('invoices/from-job',{job_id:job.id,tax_rate:10,extra_charge:5}));
  assert.equal(invoice.subtotal,105);assert.equal(invoice.total,115.5);
  await json(await post('payments',{invoice_id:invoice.id,amount:50}));
  let rows=await json(await h.request('/api/invoices'));
  assert.equal(rows[0].status,'PART_PAID');assert.equal(rows[0].outstanding,65.5);
  await json(await post('payments',{invoice_id:invoice.id,amount:65.5}));
  rows=await json(await h.request('/api/invoices'));assert.equal(rows[0].status,'PAID');assert.equal(rows[0].outstanding,0);
  const report=await json(await h.request('/api/reports/pnl'));
  assert.equal(report.net_sales,105);assert.equal(report.material_consumed,6);assert.equal(report.gross_profit,99);
 } finally {h.close();}
});

test('failed financial batches leave no partial purchases, invoices, travel or payments',async()=>{
 const h=await fixture();try {
  const post=(path,body)=>h.request('/api/'+path,{method:'POST',body});
  const material=await json(await post('materials',{code:'WAX',name:'Wax'}));const supplier=await json(await post('suppliers',{code:'SUP',name:'Supplier'}));
  h.db.exec("CREATE TRIGGER reject_inventory BEFORE INSERT ON inventory_transactions BEGIN SELECT RAISE(ABORT,'forced failure'); END;");
  assert.equal((await post('purchases',{supplier_id:supplier.id,material_id:material.id,quantity:10,rate:2})).status,500);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM purchases').get().n,0);h.db.exec('DROP TRIGGER reject_inventory');
  const customer=await json(await post('customers',{name:'Customer',default_rate:5}));const job=await json(await post('jobs',{customer_id:customer.id}));
  h.db.exec("CREATE TRIGGER reject_lines BEFORE INSERT ON invoice_lines BEGIN SELECT RAISE(ABORT,'forced failure'); END;");
  assert.equal((await post('invoices/from-job',{job_id:job.id})).status,500);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM invoices').get().n,0);assert.equal(h.db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id).status,'FILES_RECEIVED');h.db.exec('DROP TRIGGER reject_lines');
  const invoice=await json(await post('invoices/from-job',{job_id:job.id}));
  h.db.exec("CREATE TRIGGER reject_status BEFORE UPDATE ON invoices BEGIN SELECT RAISE(ABORT,'forced failure'); END;");
  assert.equal((await post('payments',{invoice_id:invoice.id,amount:1})).status,500);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM payments').get().n,0);h.db.exec('DROP TRIGGER reject_status');
  const employee=await json(await post('employees',{code:'EMP',name:'Employee'}));
  h.db.exec("CREATE TRIGGER reject_expense BEFORE INSERT ON expenses BEGIN SELECT RAISE(ABORT,'forced failure'); END;");
  assert.equal((await post('travel',{employee_id:employee.id,destination:'Mumbai',purpose:'Delivery',taxi_amount:20})).status,500);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM travel_advances').get().n,0);
 }finally{h.close();}
});

test('finance roles enforce approval and accounting boundaries; missing Gmail credentials fail explicitly',async()=>{
 const h=await fixture();try {
  assert.equal((await h.request('/api/dashboard',{role:'STAFF'})).status,403);
  assert.equal((await h.request('/api/invoices',{role:'STAFF'})).status,403);
  assert.equal((await h.request('/api/payroll',{role:'ACCOUNTS'})).status,403);
  const expense=await json(await h.request('/api/expenses',{method:'POST',role:'STAFF',body:{category:'Office',description:'Paper',amount:20}}));assert.equal(expense.approved,false);
  assert.equal((await h.request(`/api/expenses/${expense.id}/approve`,{method:'POST',role:'STAFF'})).status,403);
  assert.equal((await json(await h.request('/api/reports/pnl'))).company_overhead,0);
  await json(await h.request(`/api/expenses/${expense.id}/approve`,{method:'POST'}));
  assert.equal((await json(await h.request('/api/reports/pnl'))).company_overhead,20);
  await json(await h.request('/api/settings/gmail',{method:'POST',body:{enabled:true,user:'owner@example.com'}}));
  const response=await h.request('/api/settings/gmail/test',{method:'POST'});const error=await json(response,400);assert.match(error.detail,/GMAIL_CLIENT_ID/);
  assert.equal((await h.request('/api/expenses',{method:'POST',body:{category:'Office',description:'Invalid',amount:-1}})).status,422);
 }finally{h.close();}
});

test('configured Gmail OAuth tests profile and imports filtered messages once with recursive decoding',async()=>{
 const h=await fixture();const originalFetch=globalThis.fetch;const calls=[];
 try {
  Object.assign(h.env,{GMAIL_CLIENT_ID:'test-client',GMAIL_CLIENT_SECRET:'test-secret',GMAIL_REFRESH_TOKEN:'test-refresh'});
  const customer=await json(await h.request('/api/customers',{method:'POST',body:{name:'Known customer',email:'known@example.com'}}));
  const b64=value=>Buffer.from(value,'utf8').toString('base64url');
  const messages={
   first:{id:'first',internalDate:'1791540000000',payload:{mimeType:'multipart/mixed',headers:[{name:'From',value:'Known Person <KNOWN@example.com>'},{name:'Subject',value:'Print café'}],parts:[{mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:b64('Café wax print\nQuantity: 3')}},{mimeType:'text/html',body:{data:b64('<b>Ignored duplicate HTML</b>')}}]}]}},
   second:{id:'second',internalDate:'1791540001000',snippet:'Fallback content',payload:{mimeType:'multipart/mixed',headers:[{name:'From',value:'unknown@example.com'}],parts:[{mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:b64('Nested plain body')}}]}]}}
  };
  globalThis.fetch=async(input,init={})=>{
   const url=new URL(String(input));calls.push(url);
   if(url.href==='https://oauth2.googleapis.com/token') {
    assert.equal(init.method,'POST');const params=new URLSearchParams(init.body);assert.equal(params.get('client_id'),'test-client');assert.equal(params.get('client_secret'),'test-secret');assert.equal(params.get('refresh_token'),'test-refresh');assert.equal(params.get('grant_type'),'refresh_token');
    return Response.json({access_token:'mock-access'});
   }
   assert.equal(url.origin,'https://gmail.googleapis.com');assert.equal(init.headers.Authorization,'Bearer mock-access');
   if(url.pathname.endsWith('/profile'))return Response.json({emailAddress:'owner@example.com'});
   if(url.pathname.endsWith('/messages')) {assert.equal(url.searchParams.get('labelIds'),'INBOX');assert.equal(url.searchParams.get('q'),'is:unread has:attachment');assert.equal(url.searchParams.get('maxResults'),'12');return Response.json({messages:[{id:'first'},{id:'second'}]});}
   const id=url.pathname.split('/').pop();assert.equal(url.searchParams.get('format'),'full');assert.ok(messages[id]);return Response.json(messages[id]);
  };
  await json(await h.request('/api/settings/gmail',{method:'POST',body:{enabled:true,user:'owner@example.com',mailbox:'INBOX',fetch_query:'is:unread has:attachment',fetch_limit:12}}));
  const tested=await json(await h.request('/api/settings/gmail/test',{method:'POST'}));assert.equal(tested.ok,true);assert.match(tested.message,/owner@example.com/);assert.equal(tested.gmail.archive_label,null);
  const result=await json(await h.request('/api/integrations/gmail/reconcile',{method:'POST'}));assert.equal(result.ok,true);assert.equal(result.fetched,2);assert.equal(result.imported,2);assert.equal(result.skipped_existing,0);
  const rows=h.db.prepare('SELECT * FROM inbox_messages ORDER BY id').all();assert.equal(rows.length,2);assert.equal(rows[0].body,'Café wax print\nQuantity: 3');assert.equal(rows[0].customer_id,customer.id);assert.equal(rows[0].status,'MATCHED');assert.equal(rows[0].archived,0);assert.equal(rows[1].body,'Nested plain body');assert.equal(rows[1].customer_id,null);assert.equal(rows[1].status,'RECEIVED');assert.equal(rows[1].subject,'(no subject)');
  const repeated=await json(await h.request('/api/integrations/gmail/reconcile',{method:'POST'}));assert.equal(repeated.imported,0);assert.equal(repeated.skipped_existing,2);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM inbox_messages').get().n,2);
  assert.equal(calls.filter(url=>url.pathname.includes('/messages/')).length,2);
 } finally {globalThis.fetch=originalFetch;h.close();}
});
