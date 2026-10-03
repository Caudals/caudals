import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, Apollo, prepareOperation, parseJSON } from '../core.mjs';
import { createPlugin } from '../server.mjs';

const ctx = {org:'workspace-a',user:'user-a',authorization:'Bearer test',auth_type:'api_key',scopes:['integrations','read_contacts','write_contacts']};
const response = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
function fixture(fetcher) {
  const store=new Store(':memory:','a'.repeat(64)),apollo=new Apollo(store,{fetcher});
  const account=apollo.addAccount(ctx,{name:'Primary',api_key:'test-primary-key-123',daily_budget:100,priority:1});
  return {store,apollo,account};
}

test('account secrets and PII are encrypted and bound to their tenant',()=>{
  const {store,apollo,account}=fixture(()=>{});
  const raw=store.db.prepare('SELECT payload FROM records').get().payload;
  assert(!raw.includes('test-primary'));assert(!('secret' in account));
  assert.equal(store.get('workspace-b','account',account.id),null);
  assert.throws(()=>apollo.account({...ctx,org:'workspace-b'},account.id),{code:'account_not_found'});
  assert.throws(()=>store.unseal(raw,'workspace-b:account:'+account.id));
});
test('Apollo signed int64 request IDs and quoted strings keep their exact values',()=>{
  const data=parseJSON('{"request_id":1039995589705121900,"negative":-1039995589705121900,"note":"abc:1234567890123456,"}');
  assert.equal(data.request_id,'1039995589705121900');assert.equal(data.negative,'-1039995589705121900');assert.equal(data.note,'abc:1234567890123456,');
});
test('paid calls require approval and a stable key; bulk and phone budgets are bounded',async()=>{
  const {apollo}=fixture(()=>{throw new Error('must not call provider');});
  await assert.rejects(()=>apollo.execute(ctx,'people.enrich',{params:{id:'p1'}}),{code:'spend_confirmation_required'});
  await assert.rejects(()=>apollo.execute(ctx,'people.enrich',{params:{id:'p1'},spend:true}),{code:'idempotency_key_required'});
  assert.throws(()=>prepareOperation('people.bulk-enrich',{params:{details:Array(11).fill({id:'p'})}}),{code:'bulk_limit'});
  assert.equal(prepareOperation('people.bulk-enrich',{params:{details:[{id:'p1'},{id:'p2'}]},options:{reveal_phone_number:true}}).cost,18);
  assert.throws(()=>prepareOperation('people.enrich',{params:{id:'p',reveal_phone_number:true}}),{code:'invalid_options'});
});
test('idempotency and cache avoid repeating credit consumption across account choices',async()=>{
  let calls=0;const {apollo}=fixture(async()=>{calls++;return response({person:{id:'p1',email:'jane@example.com',email_status:'verified'}});});
  const input={params:{id:'p1'},spend:true,idempotency_key:'one'};
  const first=await apollo.execute(ctx,'people.enrich',input);
  const second=await apollo.execute(ctx,'people.enrich',{...input,idempotency_key:'two'});
  assert.equal(first.people[0].email,'jane@example.com');assert.equal(second.cached,true);assert.equal(calls,1);
});
test('a provider 429 stops the call and preserves Retry-After instead of hopping accounts',async()=>{
  let calls=0;const {apollo,store,account}=fixture(async()=>{calls++;return response({error:'rate limited'},429,{'retry-after':'120'});});
  apollo.addAccount(ctx,{name:'Other',api_key:'test-other-key-456'});
  await assert.rejects(()=>apollo.execute(ctx,'people.search',{params:{}}),error=>error.code==='apollo_rate_limited'&&error.details.retry_after>=119);
  assert.equal(calls,1);assert(store.get(ctx.org,'account',account.id).cooldown_until>Date.now());
});
test('an explicit credit denial can fall back to another funded authorized account',async()=>{
  const keys=[];const {apollo,account}=fixture(async(_url,init)=>{keys.push(init.headers['x-api-key']);return keys.length===1?response({error_code:'insufficient_credits'},402):response({person:{id:'p1',email:'a@example.com'}});});
  apollo.updateAccount(ctx,account.id,{priority:1});apollo.addAccount(ctx,{name:'Secondary',api_key:'test-secondary-key-456',priority:2}); // gitleaks:allow
  const result=await apollo.execute(ctx,'people.enrich',{params:{id:'p1'},spend:true,idempotency_key:'credit-fallback'});
  assert.equal(keys.length,2);assert.equal(result.account_name,'Secondary');
});
test('403 does not rotate keys; uncertain provider outcomes remain charged to the local reservation',async()=>{
  let calls=0;const {apollo,store,account}=fixture(async()=>{calls++;return response({error:'API not available'},403);});
  apollo.addAccount(ctx,{name:'Other',api_key:'test-other-key-456'});
  await assert.rejects(()=>apollo.execute(ctx,'people.search',{params:{}}),{code:'apollo_access_denied'});assert.equal(calls,1);
  assert.equal(store.get(ctx.org,'account',account.id).status,'forbidden');
  const uncertain=fixture(async()=>{throw new Error('timeout');});
  const input={params:{id:'p1'},spend:true,idempotency_key:'uncertain'};
  await assert.rejects(()=>uncertain.apollo.execute(ctx,'people.enrich',input),{code:'apollo_outcome_unknown'});
  assert.equal(uncertain.store.get(ctx.org,'account',uncertain.account.id).spent,1);
  await assert.rejects(()=>uncertain.apollo.execute(ctx,'people.enrich',input),{code:'operation_already_attempted'});
});
test('reserve and daily limits exclude accounts; zero-cost searches remain possible after credit exhaustion',()=>{
  const {apollo,store,account}=fixture(()=>{});let raw=store.get(ctx.org,'account',account.id);
  raw.balances={lead_credit:{left_over:20}};raw.reserve=20;store.put(ctx.org,'account',account.id,raw);
  assert.throws(()=>apollo.choose(ctx,1),{code:'no_available_account'});assert.equal(apollo.choose(ctx,0).id,account.id);
  raw.status='exhausted';store.put(ctx.org,'account',account.id,raw);assert.equal(apollo.choose(ctx,0).id,account.id);
});
test('phone selection respects separate balances and only uses unified pools explicitly',()=>{
  const {apollo,store,account}=fixture(()=>{});
  const raw=store.get(ctx.org,'account',account.id);
  raw.balances={lead_credit:{left_over:75},direct_dial_credit:{left_over:0}};
  store.put(ctx.org,'account',account.id,raw);
  const spec=prepareOperation('people.enrich',{params:{id:'p1'},options:{reveal_phone_number:true}});
  assert.throws(()=>apollo.choose(ctx,spec.cost,null,spec),{code:'no_available_account'});
  assert.equal(apollo.choose(ctx,1).id,account.id);
  apollo.updateAccount(ctx,account.id,{credit_model:'unified'});
  assert.equal(apollo.choose(ctx,spec.cost,null,spec).id,account.id);
});
test('partial phone results retain names and companies before an email is available',()=>{
  const {apollo,store,account}=fixture(()=>{});
  apollo.remember(ctx,{people:[{id:'p1',first_name:'Jane',last_name:'Doe',organization:{name:'Example',primary_domain:'example.com'}}]},account,'people.search');
  apollo.remember(ctx,{people:[{person_id:'p1',phone_numbers:[{sanitized_number:'+34900000000'}]}]},account,'people.enrich');
  const person=store.get(ctx.org,'result','p1');
  assert.equal(person.first_name,'Jane');assert.equal(person.company,'Example');assert.equal(person.phone,'+34900000000');
  apollo.remember(ctx,{people:[{id:'p1',first_name:'Jane'}]},account,'people.search');
  assert.equal(store.get(ctx.org,'result','p1').phone,'+34900000000');
});
test('disconnecting an account cancels its pending jobs without crossing workspace boundaries',async()=>{
  const {apollo,store,account}=fixture(()=>{});const plugin=createPlugin({store,apollo});
  store.put(ctx.org,'job','own-job',{id:'own-job',account_id:account.id,status:'pending'});
  store.put('workspace-b','job','other-job',{id:'other-job',account_id:account.id,status:'pending'});
  await plugin.dispatch(ctx,'DELETE','/accounts/'+account.id,{});
  assert.equal(store.get(ctx.org,'job','own-job').status,'cancelled');
  assert.equal(store.get('workspace-b','job','other-job').status,'pending');
});
test('phone polling remains on the originating account and honors pending interval',async()=>{
  let stage=0;const {apollo,store,account}=fixture(async()=>{
    stage++;return stage===1?new Response('{"person":{"id":"p1","email":"jane@example.com"},"request_id":1039995589705121900}'):
      stage===2?response({error_code:'result_pending',retry_after_seconds:90},404):response({people:[{id:'p1',phone_numbers:[{sanitized_number:'+34900000000'}]}]});
  });
  const result=await apollo.execute(ctx,'people.enrich',{params:{id:'p1'},options:{reveal_phone_number:true},spend:true,idempotency_key:'phone'});
  assert.equal(result.job.request_id,'1039995589705121900');
  let job={...result.job,next_poll_at:0};store.put(ctx.org,'job',job.id,job);
  job=await apollo.poll(ctx,job.id);assert(job.next_poll_at>=Date.now()+89000);assert.equal(job.account_id,account.id);
  store.put(ctx.org,'job',job.id,{...job,next_poll_at:0});await apollo.poll(ctx,job.id);
  assert.equal(store.get(ctx.org,'result','p1').phone,'+34900000000');
});
test('imports update an existing organization contact without resubscribing or duplicating it',async()=>{
  const writes=[];const {store,apollo}=fixture(()=>{});
  store.put(ctx.org,'result','p1',{id:'p1',first_name:'Jane',last_name:'Doe',email:'jane@example.com',email_status:'verified',company:'Example',phone:'',title:'CTO',custom_fields:{},account_name:'Primary'});
  const plugin=createPlugin({store,apollo,fetcher:async(url,init)=>{
    if(url.includes('/contacts/lookup'))return response({contact:{id:'existing-contact',subscribed:false,custom_fields:{relationship:'established'}}});
    writes.push({url,method:init.method,payload:JSON.parse(init.body)});return response({id:'existing-contact'});
  }});
  const input={ids:['p1','p1'],subscribe_new:true,idempotency_key:'import-one'};
  const result=await plugin.importPeople(ctx,input);assert.equal(result.summary.updated,1);assert.equal(writes.length,1);
  assert.equal(writes[0].method,'PATCH');assert(writes[0].url.endsWith('/contacts/existing-contact'));assert(!('subscribed' in writes[0].payload));
  assert.equal(writes[0].payload.custom_fields.relationship,'established');
  await plugin.importPeople(ctx,input);assert.equal(writes.length,1);
});
test('new imports default to unsubscribed and skip unverified addresses',async()=>{
  const writes=[];const {store,apollo}=fixture(()=>{});
  for(const [id,email,status] of [['p1','a@example.com','verified'],['p2','b@example.com','unverified']])store.put(ctx.org,'result',id,{id,email,email_status:status});
  const plugin=createPlugin({store,apollo,fetcher:async(url,init)=>url.includes('/lookup')?response({contact:null}):(writes.push(JSON.parse(init.body)),response({}))});
  const result=await plugin.importPeople(ctx,{ids:['p1','p2'],idempotency_key:'import-two'});
  assert.equal(writes[0].subscribed,false);assert.equal(result.summary.created,1);assert.equal(result.summary.skipped,1);
});
test('a read-only credential cannot spend credits, import contacts, or access another workspace',async()=>{
  const {store,apollo,account}=fixture(()=>{});
  const plugin=createPlugin({store,apollo});const readOnly={...ctx,scopes:['integrations','read_contacts']};
  await assert.rejects(()=>plugin.dispatch(readOnly,'POST','/execute',{operation:'people.search'}),{code:'scope_required'});
  await assert.rejects(()=>plugin.dispatch(readOnly,'POST','/import',{ids:[]}),{code:'scope_required'});
  await assert.rejects(()=>plugin.dispatch({...ctx,org:'workspace-b'},'PATCH','/accounts/'+account.id,{enabled:false}),{code:'account_not_found'});
});
test('retention removes cached PII while preserving account credentials',()=>{
  const {store,account}=fixture(()=>{});store.put(ctx.org,'result','p1',{id:'p1',email:'a@example.com'});
  store.put(ctx.org,'job','job-1',{id:'job-1',status:'done',result:{email:'a@example.com'}});
  store.db.prepare("UPDATE records SET updated=0 WHERE kind IN ('result','job')").run();store.prune(1,ctx.org);
  assert.equal(store.get(ctx.org,'result','p1'),null);assert.equal(store.get(ctx.org,'job','job-1'),null);assert(store.get(ctx.org,'account',account.id));
});
