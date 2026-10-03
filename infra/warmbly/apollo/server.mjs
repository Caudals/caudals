import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Apollo, Store, Fault, fail, text, object, integer, publicAccount, operations, hash } from './core.mjs';

export function createPlugin({ store, apollo, warmblyURL='http://backend:8080', fetcher=fetch, publicOrigin='https://out.caudals.com' }) {
  const inflightImports = new Set();
  const warmbly = async (authorization,path,method='GET',body,extra={}) => {
    let response;
    try { response=await fetcher(warmblyURL+'/v1'+path,{method,headers:{Authorization:authorization,'Content-Type':'application/json',...extra},body:body==null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'}); }
    catch { fail(502,'warmbly_unavailable','Warmbly is temporarily unavailable.'); }
    const result=await response.json().catch(()=>({}));
    if (!response.ok) fail(response.status,'warmbly_'+(text(result.code,80)||'request_failed'),text(result.message,300)||'Warmbly rejected the request.');
    return result;
  };
  async function authenticate(authorization) {
    if (!authorization?.startsWith('Bearer ')) fail(401,'unauthorized','Sign in to Warmbly or supply a scoped Warmbly API key.');
    const me=await warmbly(authorization,'/me');
    if (!me.organization_id) fail(403,'workspace_required','Select a Warmbly workspace first.');
    const ctx={org:me.organization_id,user:me.user_id,authorization,auth_type:me.auth_type,scopes:(me.scopes||[]).map(s=>s.toLowerCase()),permissions:0};
    if (me.auth_type==='jwt') {
      const members=await warmbly(authorization,'/organization/members');
      const member=(members.data||[]).find(m=>m.user_id===ctx.user && m.organization_id===ctx.org);
      if (!member) fail(403,'membership_required','Workspace membership is required.');
      ctx.permissions=member.role==='owner'?65535:Number(member.permissions)&65535;
    }
    return ctx;
  }
  function require(ctx,action) {
    if(ctx.auth_type==='jwt') {
      const settings=!!(ctx.permissions&512), integrate=settings || !!(ctx.permissions&16384);
      if(!integrate || !(ctx.permissions&2048) || action==='manage'&&!settings || ['spend','import'].includes(action)&&!(ctx.permissions&8) || action==='import'&&!(ctx.permissions&2048)) fail(403,'permission_denied','Your Warmbly role does not allow this Apollo operation.');
    } else {
      if(!ctx.scopes.includes('read_contacts')) fail(403,'scope_required','READ_CONTACTS is required for the Apollo plugin.');
      if(!ctx.scopes.includes('integrations')) fail(403,'scope_required','The INTEGRATIONS scope is required.');
      if(['spend','import'].includes(action)&&!ctx.scopes.includes('write_contacts')) fail(403,'scope_required','WRITE_CONTACTS is required for enrichment and import.');
      if(action==='import'&&!ctx.scopes.includes('read_contacts')) fail(403,'scope_required','READ_CONTACTS is required to preserve existing contacts during import.');
    }
  }
  async function importPeople(ctx,input) {
    require(ctx,'import');
    if(!Array.isArray(input.ids)||input.ids.length===0||input.ids.length>100) fail(400,'import_limit','Select between 1 and 100 stored Apollo people.');
    const ids=[...new Set(input.ids.map(id=>text(id,120)))];
    const fingerprint=hash(JSON.stringify({ids,subscribed:input.subscribe_new===true,verified:input.verified_only!==false,update:input.update_existing!==false,fields:object(input.field_map)}));
    const key=text(input.idempotency_key,200);
    if(!key) fail(400,'idempotency_key_required','Provide an idempotency_key for import.');
    const receiptID=hash(key), lock=ctx.org+':'+receiptID;
    const old=store.get(ctx.org,'import',receiptID);
    if(old?.fingerprint && old.fingerprint!==fingerprint) fail(409,'idempotency_conflict','This import key belongs to a different selection.');
    if(old?.status==='done') return {...old,replayed:true};
    if(inflightImports.has(lock)) fail(409,'import_in_progress','This import is already running.');
    const results=old?.results || [], completed=new Set(results.map(r=>r.id));
    const receipt={id:receiptID,fingerprint,status:'running',started_at:old?.started_at||Date.now(),results};
    store.put(ctx.org,'import',receiptID,receipt); inflightImports.add(lock);
    try {
      const seen=new Set(results.map(r=>r.email).filter(Boolean));
      for(const id of ids) {
        if(completed.has(id)) continue;
        const person=store.get(ctx.org,'result',id);
        if(!person) fail(404,'person_not_found','A selected person is no longer stored in this workspace.');
        let result={id,email:person.email,status:'skipped'};
        if(!person.email) result.reason='no_email';
        else if(seen.has(person.email)) result.reason='duplicate_email';
        else if(input.verified_only!==false && person.email_status!=='verified') result.reason='email_not_verified';
        else {
          seen.add(person.email);
          const lookup=await warmbly(ctx.authorization,'/contacts/lookup?email='+encodeURIComponent(person.email));
          const existing=lookup.contact;
          if(existing && input.update_existing===false) result.reason='already_exists';
          else {
            const fields={apollo_id:person.id,apollo_title:person.title,apollo_linkedin:person.linkedin_url,apollo_company_domain:person.domain,apollo_industry:person.industry,apollo_employees:person.employees==null?'':String(person.employees),apollo_location:person.location,apollo_email_status:person.email_status,apollo_account:person.account_name || '',apollo_imported_at:new Date().toISOString()};
            for(const [source,target] of Object.entries(object(input.field_map))) {
              if(!/^[a-zA-Z0-9_]{1,80}$/.test(target)) fail(400,'invalid_field_map','Custom field names must contain letters, numbers or underscores.');
              if(['title','domain','industry','location','linkedin_url','company','employees'].includes(source)) fields[target]=String(person[source]??'');
            }
            const payload={first_name:person.first_name,last_name:person.last_name,email:person.email,company:person.company,phone:person.phone,custom_fields:{...object(existing?.custom_fields),...fields}};
            // Existing subscription state is owned by Warmbly; imports only decide it for new contacts.
            if(!existing) payload.subscribed=input.subscribe_new===true;
            if(person.email_status==='verified') payload.verification_status='valid';
            if(existing) for(const field of ['first_name','last_name','company','phone']) if(!payload[field]) delete payload[field];
            const written=await warmbly(ctx.authorization,existing?'/contacts/'+encodeURIComponent(existing.id):'/contacts',existing?'PATCH':'POST',payload,{'Idempotency-Key':'apollo-'+receiptID+'-'+hash(id).slice(0,16)});
            result={...result,status:existing?'updated':'created',warmbly_response:written};
          }
        }
        results.push(result); store.put(ctx.org,'import',receiptID,receipt);
      }
      receipt.status='done';receipt.finished_at=Date.now();
      receipt.summary={created:results.filter(r=>r.status==='created').length,updated:results.filter(r=>r.status==='updated').length,skipped:results.filter(r=>r.status==='skipped').length};
      store.put(ctx.org,'import',receiptID,receipt);store.log(ctx,'contacts.import',receipt.summary);return receipt;
    } catch(error) { receipt.status='partial';receipt.error_code=error.code || 'failed';store.put(ctx.org,'import',receiptID,receipt);throw error; }
    finally { inflightImports.delete(lock); }
  }
  const tools=[
    ...Object.keys(operations).filter(x=>!['credits','usage'].includes(x)).map(name=>({name:'apollo_'+name.replace(/[.-]/g,'_'),description:'Apollo '+name+'. Paid operations require spend=true and a stable idempotency_key. Search returns previews; enrich to obtain emails. Import never activates a campaign.',inputSchema:{type:'object',properties:{params:{type:'object'},options:{type:'object'},account_id:{type:'string'},spend:{type:'boolean'},idempotency_key:{type:'string'},max_credits:{type:'integer'},force:{type:'boolean'}}}})),
    {name:'apollo_accounts',description:'List connected Apollo accounts and their credit snapshots. Never returns API keys.',inputSchema:{type:'object',properties:{}}},
    {name:'apollo_results',description:'List locally stored Apollo people or companies.',inputSchema:{type:'object',properties:{kind:{type:'string',enum:['people','companies']}}}},
    {name:'apollo_import',description:'Import selected stored Apollo people into Warmbly. Preserves existing opt-outs. Does not send emails.',inputSchema:{type:'object',required:['ids','idempotency_key'],properties:{ids:{type:'array',items:{type:'string'}},idempotency_key:{type:'string'},subscribe_new:{type:'boolean'},verified_only:{type:'boolean'},update_existing:{type:'boolean'}}}},
  ];
  async function dispatch(ctx,method,path,input) {
    require(ctx,'read');
    if(method==='GET' && path==='/status') return {version:'1.0.1',workspace:ctx.org,accounts:store.list(ctx.org,'account').map(publicAccount),settings:store.get(ctx.org,'settings','main')||{strategy:'priority',retention_days:30},operations:Object.keys(operations)};
    if(method==='GET' && path==='/accounts') return {data:store.list(ctx.org,'account').map(publicAccount)};
    if(method==='POST' && path==='/accounts') {require(ctx,'manage');return apollo.addAccount(ctx,input);}
    const accountMatch=path.match(/^\/accounts\/([a-f0-9-]+)(?:\/(refresh|usage))?$/);
    if(accountMatch) {
      const [,id,action]=accountMatch;
      if(method==='PATCH') {require(ctx,'manage');return apollo.updateAccount(ctx,id,input);}
      if(method==='DELETE') {
        require(ctx,'manage');apollo.account(ctx,id);
        for(const job of store.list(ctx.org,'job',100000)) if(job.account_id===id&&job.status==='pending') store.put(ctx.org,'job',job.id,{...job,status:'cancelled',finished_at:Date.now()});
        store.remove(ctx.org,'account',id);store.log(ctx,'account.delete',{id});return {deleted:true};
      }
      if(method==='POST' && action==='refresh') {require(ctx,'spend');return apollo.refresh(ctx,id);}
      if(method==='POST' && action==='usage') {require(ctx,'spend');return apollo.execute(ctx,'usage',{account_id:id});}
    }
    if(path==='/settings') {
      if(method==='GET') return store.get(ctx.org,'settings','main')||{strategy:'priority',retention_days:30};
      if(method==='PATCH') {
        require(ctx,'manage');const current=store.get(ctx.org,'settings','main')||{strategy:'priority',retention_days:30};
        if(input.strategy&&!['priority','round_robin','most_credits'].includes(input.strategy)) fail(400,'invalid_strategy','Choose priority, round_robin or most_credits.');
        return store.put(ctx.org,'settings','main',{...current,strategy:input.strategy||current.strategy,retention_days:integer(input.retention_days,current.retention_days,1,365)});
      }
    }
    if(method==='POST' && path==='/execute') {require(ctx,'spend');return apollo.execute(ctx,text(input.operation,80),input);}
    if(method==='POST' && path==='/import') return importPeople(ctx,input);
    if(method==='GET' && path==='/results') return {data:store.list(ctx.org,'result',1000)};
    if(method==='GET' && path==='/companies') return {data:store.list(ctx.org,'company',1000)};
    if(method==='GET' && path==='/history') return {data:store.history(ctx.org)};
    if(method==='GET' && path==='/receipts') return {data:[...store.list(ctx.org,'operation',50),...store.list(ctx.org,'import',50)]};
    if(method==='GET' && path==='/jobs') return {data:store.list(ctx.org,'job',100)};
    const jobMatch=path.match(/^\/jobs\/([a-f0-9-]+)\/poll$/);
    if(method==='POST' && jobMatch) {require(ctx,'spend');return apollo.poll(ctx,jobMatch[1]);}
    if(path==='/saved-searches') {
      if(method==='GET') return {data:store.list(ctx.org,'search',100)};
      if(method==='POST') {require(ctx,'spend');const row={id:randomUUID(),name:text(input.name,100),kind:input.kind==='companies'?'companies':'people',params:object(input.params),created_at:Date.now()};if(!row.name)fail(400,'name_required','Name this search.');return store.put(ctx.org,'search',row.id,row);}
    }
    const savedMatch=path.match(/^\/saved-searches\/([a-f0-9-]+)$/);
    if(method==='DELETE' && savedMatch) {require(ctx,'spend');store.remove(ctx.org,'search',savedMatch[1]);return {deleted:true};}
    if(path==='/data' && method==='DELETE') {
      require(ctx,'manage');if(input.confirm!=='DELETE_APOLLO_RESULTS')fail(400,'confirmation_required','Confirm DELETE_APOLLO_RESULTS to clear cached Apollo data.');
      for(const kind of ['result','company','cache']) for(const row of store.list(ctx.org,kind,100000)) store.remove(ctx.org,kind,row.id);
      store.log(ctx,'data.clear',{});return {deleted:true};
    }
    if(path==='/manifest' && method==='GET') return {name:'warmbly-apollo',version:'1.0.1',api:'/v1/apollo',mcp:'/v1/apollo/mcp',tools};
    fail(404,'not_found','Apollo plugin endpoint not found.');
  }
  async function mcp(ctx,input) {
    const result=(value)=>({jsonrpc:'2.0',id:input.id,result:value});
    if(input.method==='initialize') return result({protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'warmbly-apollo',version:'1.0.1'}});
    if(input.method==='notifications/initialized') return null;
    if(input.method==='ping')return result({});
    if(input.method==='tools/list') {require(ctx,'read');return result({tools});}
    if(input.method==='tools/call') {
      const name=input.params?.name,args=object(input.params?.arguments);
      let response;
      if(name==='apollo_accounts')response=await dispatch(ctx,'GET','/accounts',args);
      else if(name==='apollo_results')response=await dispatch(ctx,'GET',args.kind==='companies'?'/companies':'/results',args);
      else if(name==='apollo_import')response=await dispatch(ctx,'POST','/import',args);
      else {
        const match=Object.keys(operations).find(n=>'apollo_'+n.replace(/[.-]/g,'_')===name);
        if(!match)fail(400,'unknown_tool','Tool not found.');
        response=await dispatch(ctx,'POST','/execute',{...args,operation:match});
      }
      return result({content:[{type:'text',text:JSON.stringify(response)}]});
    }
    return {jsonrpc:'2.0',id:input.id,error:{code:-32601,message:'Method not found'}};
  }
  const server=createServer(async(req,res)=>{
    const requestID=randomUUID();
    const url=new URL(req.url,'http://plugin');
    res.setHeader('X-Request-Id',requestID);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(url.pathname==='/health' && req.method==='GET') {res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true,"version":"1.0.1"}');return;}
    let body={},ctx;
    try {
      if(req.headers.origin && req.headers.origin!==publicOrigin) fail(403,'origin_denied','Origin is not allowed.');
      if(!url.pathname.startsWith('/v1/apollo/'))fail(404,'not_found','Not found.');
      ctx=await authenticate(req.headers.authorization);
      let length=0,raw='';
      for await(const chunk of req) {length+=chunk.length;if(length>2*1024*1024)fail(413,'body_too_large','Request body exceeds 2 MB.');raw+=chunk;}
      if(raw) {try {body=JSON.parse(raw);}catch {fail(400,'invalid_json','Request body must be JSON.');}}
      if(req.headers['idempotency-key']) body.idempotency_key=req.headers['idempotency-key'];
      let result;
      if(url.pathname==='/v1/apollo/mcp') {
        if(req.method!=='POST')fail(405,'method_not_allowed','MCP uses POST requests.');
        result=await mcp(ctx,body);
        if(result===null) {res.writeHead(202);res.end();return;}
      } else result=await dispatch(ctx,req.method,url.pathname.slice('/v1/apollo'.length),object(body));
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
    } catch(error) {
      const known=error instanceof Fault;
      const status=known?error.status:500;
      const safe={code:known?error.code:'internal_error',message:known?error.message:'The Apollo plugin could not complete the request.',request_id:requestID,...(known?error.details:{})};
      if(status===401)res.setHeader('WWW-Authenticate','Bearer resource_metadata="'+publicOrigin+'/.well-known/oauth-protected-resource"');
      if(status===429)res.setHeader('Retry-After',String(error.details?.retry_after||60));
      if(ctx)store.log(ctx,'request.error',{code:safe.code,request_id:requestID});
      if(url.pathname==='/v1/apollo/mcp' && body.id!=null) {res.writeHead(status>=500?status:200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,error:{code:-32000,message:safe.message,data:{code:safe.code}}}));}
      else {res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(safe));}
      if(!known)console.error(JSON.stringify({event:'plugin.error',request_id:requestID}));
    }
  });
  server.headersTimeout=10000;server.requestTimeout=180000;
  return {server,authenticate,dispatch,importPeople,tools};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const encryptionKey=readFileSync(process.env.APOLLO_ENCRYPTION_KEY_FILE||'/run/secrets/apollo_encryption_key','utf8').trim();
  const store=new Store(process.env.APOLLO_DB||'/data/apollo.sqlite',encryptionKey);
  const apollo=new Apollo(store);
  const seed=process.env.APOLLO_SEED_KEY_FILE;
  if(seed && process.env.APOLLO_SEED_ORG) {
    const secret=readFileSync(seed,'utf8').trim(),ctx={org:process.env.APOLLO_SEED_ORG,user:'operator-bootstrap'};
    if(secret && !store.list(ctx.org,'account').some(a=>a.fingerprint===hash(secret)))apollo.addAccount(ctx,{name:'Caudals CRM',api_key:secret,daily_budget:100});
  }
  const plugin=createPlugin({store,apollo,warmblyURL:process.env.WARMBLY_INTERNAL_URL||'http://backend:8080',publicOrigin:process.env.PUBLIC_ORIGIN||'https://out.caudals.com'});
  plugin.server.listen(Number(process.env.PORT||8091),'0.0.0.0',()=>console.log(JSON.stringify({event:'plugin.ready',version:'1.0.1'})));
  const timer=setInterval(()=>{
    const orgs=store.db.prepare("SELECT DISTINCT org FROM records").all();
    for(const {org} of orgs) {
      const ctx={org,user:'apollo-poller'};
      for(const job of store.list(org,'job',100)) if(job.status==='pending' && job.next_poll_at<=Date.now())apollo.poll(ctx,job.id).catch(()=>{});
      store.prune(store.get(org,'settings','main')?.retention_days || 30,org);
    }
    // Cached results expire independently of the user's mailbox data.

  },30000);timer.unref();
  process.on('SIGTERM',()=>{clearInterval(timer);plugin.server.close(()=>process.exit(0));});
}
