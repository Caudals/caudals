import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Fault extends Error {
  constructor(status, code, message, details = {}) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
export const fail = (status, code, message, details) => { throw new Fault(status, code, message, details); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export function integer(value, fallback, min, max) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) fail(400, 'invalid_number', `Expected an integer between ${min} and ${max}.`);
  return number;
}
export const text = (value, max = 500) => ['string','number'].includes(typeof value) ? String(value).trim().slice(0, max) : '';
export function parseJSON(value) {
  // RocketReach request IDs are signed int64; preserve them before JavaScript rounds them.
  return JSON.parse(value, (_key, parsed, context) => typeof parsed === 'number' && Number.isInteger(parsed) && !Number.isSafeInteger(parsed) ? context.source : parsed);
}

export class Store {
  constructor(path, encryptionKey) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.key = Buffer.from(encryptionKey, 'hex');
    if (this.key.length !== 32) throw new Error('A 32-byte encryption key is required.');
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (org TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(org,kind,id));
      CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, org TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS records_by_kind ON records(org,kind,updated);`);
  }
  seal(data, context) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  unseal(data, context) {
    const raw = Buffer.from(data, 'base64'), cipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0,12));
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(raw.subarray(12,28));
    return JSON.parse(Buffer.concat([cipher.update(raw.subarray(28)), cipher.final()]).toString());
  }
  put(org, kind, id, data) {
    this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(org,kind,id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated')
      .run(org,kind,id,this.seal(data, `${org}:${kind}:${id}`),Date.now());
    return data;
  }
  get(org, kind, id) {
    const row = this.db.prepare('SELECT payload FROM records WHERE org=? AND kind=? AND id=?').get(org,kind,id);
    return row ? this.unseal(row.payload, `${org}:${kind}:${id}`) : null;
  }
  list(org, kind, limit = 1000) {
    return this.db.prepare('SELECT id,payload FROM records WHERE org=? AND kind=? ORDER BY updated DESC LIMIT ?').all(org,kind,limit)
      .map(row => this.unseal(row.payload, `${org}:${kind}:${row.id}`));
  }
  remove(org, kind, id) { this.db.prepare('DELETE FROM records WHERE org=? AND kind=? AND id=?').run(org,kind,id); }
  log(ctx, action, result) {
    this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(),ctx.org,ctx.user,action,JSON.stringify(result),Date.now());
  }
  history(org) { return this.db.prepare('SELECT id,actor,action,result,at FROM audit WHERE org=? ORDER BY at DESC LIMIT 100').all(org).map(r=>({...r,result:JSON.parse(r.result)})); }
  prune(days = 30, org = null) {
    const cutoff = Date.now()-days*86400000;
    this.db.prepare("DELETE FROM records WHERE updated<? AND kind IN ('result','company','cache','operation','import','job','batch')"+(org?' AND org=?':'')).run(...(org?[cutoff,org]:[cutoff]));
    this.db.prepare('DELETE FROM audit WHERE at<?').run(Date.now()-90*86400000);
  }
}

export const operations = {
  'people.search': {path:'/universal/person/search',legacy:'/person/search',method:'POST',cost:1},
  'companies.search': {path:'/universal/company/search',legacy:'/searchCompany',method:'POST',cost:2},
  'people.enrich': {path:'/universal/person/lookup',legacy:'/person/lookup',method:'GET',cost:2},
  'people.bulk-enrich': {virtual:true,cost:2},
  'companies.enrich': {path:'/universal/company/lookup',legacy:'/company/lookup/',method:'GET',cost:1},
  'companies.bulk-enrich': {virtual:true,cost:1},
  'email.verify': {path:'/email/verify/',method:'POST',cost:1,pool:'verification'},
  credits: {path:'/universal/account/',legacy:'/account/',method:'GET',cost:0},
  usage: {path:'/universal/account/',legacy:'/account/',method:'GET',cost:0},
};
const revealCosts={reveal_professional_email:2,reveal_personal_email:3,reveal_phone:6,reveal_detailed_person_enrichment:1,reveal_healthcare_enrichment:1};
const identifiers=['id','linkedin_url','email','phone','npi_number'];
function personParams(value) {
  const p={...object(value)};
  for(const k of ['api_key','Api-Key','webhook_url','webhook_id','lookup_type','profile_list']) delete p[k];
  if(!identifiers.some(k=>text(p[k])) && !(text(p.name)&&text(p.current_employer))) fail(400,'identifier_required','Provide an ID, LinkedIn URL, email, phone, NPI number or name with current_employer.');
  if(p.id!=null) p.id=integer(p.id,0,1,Number.MAX_SAFE_INTEGER);
  return p;
}
export function prepareOperation(name,input={}) {
  const op=operations[name];if(!op)fail(400,'unknown_operation','RocketReach operation not supported.');
  let params={...object(input.params)},options={...object(input.options)},cost=op.cost;
  for(const k of ['api_key','Api-Key','webhook_url','webhook_id']) {delete params[k];delete options[k];}
  if(name.endsWith('.search')) {
    params.start=integer(params.start,1,1,10000);params.page_size=integer(params.page_size,25,1,100);
    if(!Object.keys(object(params.query)).length)fail(400,'query_required','Provide a non-empty RocketReach query object.');
    if(params.start+params.page_size-1>10000)params.page_size=10001-params.start;
  }
  if(name.startsWith('people.')&&name.includes('enrich')) {
    const flags={};
    for(const k of Object.keys(revealCosts)) flags[k]=options[k] ?? params[k] ?? (k==='reveal_professional_email');
    for(const k of Object.keys(flags)) if(typeof flags[k]!=='boolean')fail(400,'invalid_options',k+' must be boolean.');
    cost=Object.entries(flags).reduce((n,[k,v])=>n+(v?revealCosts[k]:0),0);
    if(!cost)fail(400,'enrichment_required','Choose at least one enrichment type.');
    options={...flags,return_cached_emails:options.return_cached_emails===true};
    for(const k of [...Object.keys(flags),'return_cached_emails'])delete params[k];
    if(op.virtual) {
      const details=params.details || params.queries;
      if(!Array.isArray(details)||!details.length||details.length>100)fail(400,'bulk_limit','Select 1–100 people for a resumable batch.');
      params={details:details.map(personParams)};cost*=details.length;
    } else params=personParams(params);
  }
  if(name.startsWith('companies.')&&name.includes('enrich')) {
    const check=value=>{
      const p={...object(value)};for(const k of ['api_key','webhook_id','webhook_url'])delete p[k];
      if(!['domain','id','name','linkedin_url','ticker'].some(k=>text(p[k])))fail(400,'identifier_required','Provide company domain, ID, LinkedIn URL, ticker or name.');
      if(p.id!=null)p.id=integer(p.id,0,1,Number.MAX_SAFE_INTEGER);return p;
    };
    if(op.virtual) {if(!Array.isArray(params.details)||!params.details.length||params.details.length>100)fail(400,'bulk_limit','Select 1–100 companies.');params={details:params.details.map(check)};cost=params.details.length;}
    else params=check(params);
    options={};
  }
  if(name==='email.verify') {
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(params.email,254)))fail(400,'email_required','Provide a valid email address.');
    params={email:text(params.email,254).toLowerCase()};options={};
  }
  return {...op,name,params,options,cost};
}

export function publicAccount(account) {
  const { secret, ...safe } = account;
  return safe;
}
export function normalizePerson(person,provenance={}) {
  const p=object(person),emails=Array.isArray(p.emails)?p.emails:[];
  const verified=e=>['A','A-'].includes(e.grade)||e.smtp_valid==='valid';
  const ranked=[...emails].sort((a,b)=>(verified(b)?10:0)+(b.type==='professional'?2:0)-((verified(a)?10:0)+(a.type==='professional'?2:0)));
  const chosen=ranked[0] || {},email=text(chosen.email || p.recommended_email,320).toLowerCase();
  const phones=Array.isArray(p.phones)?p.phones:[],phone=phones.find(x=>x.recommended)||phones[0]||{};
  const names=text(p.name).split(/\s+/);
  return {id:text(p.id)||hash(JSON.stringify(p)).slice(0,24),name:text(p.name),first_name:text(p.first_name)||names[0]||'',last_name:text(p.last_name)||names.slice(1).join(' '),
    email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'',email_status:email?(verified(chosen)?'verified':'unverified'):'',emails,
    phone:text(phone.e164||phone.number),phone_numbers:phones,company:text(p.current_employer),domain:text(p.current_employer_domain),title:text(p.current_title),linkedin_url:text(p.linkedin_url,2000),
    industry:text(p.current_employer_industry),employees:p.current_employer_num_employees??null,location:text(p.location)||[p.city,p.region,p.country].filter(Boolean).join(', '),has_email:!!email,
    organization:{name:p.current_employer,primary_domain:p.current_employer_domain},raw:p,...provenance};
}
export function normalizeCompany(c,provenance={}) {
  return {...c,id:text(c.id)||hash(JSON.stringify(c)).slice(0,24),primary_domain:text(c.domain||c.website_domain),estimated_num_employees:c.num_employees??null,industry:text(c.industry),...provenance};
}
function sanitized(value) {
  if(Array.isArray(value))return value.map(sanitized);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['api_key','apikey','secret','Api-Key'].includes(k)).map(([k,v])=>[k,sanitized(v)]));
  return value;
}
export class RocketReach {
  constructor(store, { baseURL = 'https://api.rocketreach.co/api/v2', fetcher = fetch, timeout = 45000 } = {}) {
    this.store = store; this.base = baseURL; this.fetch = fetcher; this.timeout = timeout;
    this.locks = new Map();
  }
  async locked(org, fn) {
    const prior = this.locks.get(org) || Promise.resolve();
    let release;
    const current = new Promise(resolve=>{release=resolve;});
    this.locks.set(org,current); await prior;
    try { return await fn(); } finally { release(); if (this.locks.get(org)===current) this.locks.delete(org); }
  }
  account(ctx, id) {
    const account = this.store.get(ctx.org,'account',id);
    if (!account) fail(404,'account_not_found','RocketReach account not found in this workspace.');
    return account;
  }
  addAccount(ctx,input) {
    const key = text(input.api_key,300), alias = text(input.name,100);
    if (!alias || key.length < 12) fail(400,'invalid_account','An account name and RocketReach API key are required.');
    const fingerprint = hash(key);
    if (this.store.list(ctx.org,'account').some(a=>a.fingerprint===fingerprint)) fail(409,'duplicate_key','This RocketReach API key is already connected.');
    const account = { id:randomUUID(), name:alias, secret:key, fingerprint, enabled:true, status:'unverified', priority:integer(input.priority,100,0,10000), reserve:integer(input.reserve,0,0,1000000), daily_budget:integer(input.daily_budget,100,0,1000000), api_mode:input.api_mode==='universal'?'universal':'legacy', spent:0, spent_day:new Date().toISOString().slice(0,10), balances:null, credit_cycle:null, cooldown_until:0, last_used:0, created_at:Date.now() };
    this.store.put(ctx.org,'account',account.id,account); this.store.log(ctx,'account.create',{id:account.id});
    return publicAccount(account);
  }
  updateAccount(ctx,id,input) {
    const account = this.account(ctx,id);
    if (input.name != null) account.name = text(input.name,100) || account.name;
    for (const key of ['priority','reserve','daily_budget']) if (input[key] != null) account[key] = integer(input[key],0,0,1000000);
    if(input.api_mode!=null) {if(!['universal','legacy'].includes(input.api_mode))fail(400,'invalid_api_mode','Choose universal or legacy API.');account.api_mode=input.api_mode;account.balances=null;account.status='unverified';}
    if (typeof input.enabled === 'boolean') account.enabled = input.enabled;
    if(typeof input.verification_exhausted==='boolean')account.verification_exhausted=input.verification_exhausted;
    if (input.api_key) {
      account.secret = text(input.api_key,300);
      if (account.secret.length < 12) fail(400,'invalid_key','Invalid RocketReach key.');
      account.fingerprint = hash(account.secret);
      if (this.store.list(ctx.org,'account').some(a=>a.id!==id && a.fingerprint===account.fingerprint)) fail(409,'duplicate_key','This key is already connected.');
      account.status = 'unverified'; account.balances = null;
    }
    this.store.put(ctx.org,'account',id,account); this.store.log(ctx,'account.update',{id});
    return publicAccount(account);
  }
  eligible(account,cost,now=Date.now(),pool=null) {
    if (!account.enabled || ['invalid','forbidden','blocked'].includes(account.status) || account.cooldown_until > now) return false;
    const spent = account.spent_day === new Date(now).toISOString().slice(0,10) ? account.spent : 0;
    if (cost > 0 && spent+cost > account.daily_budget) return false;
    const cycleExpired = account.credit_cycle?.end_date && Date.parse(account.credit_cycle.end_date) <= now;
    const left = pool==='verification' || cycleExpired ? undefined : account.balances?.lead_credit?.left_over;
    if (cost>0 && typeof left==='number' && left-cost < account.reserve) return false;
    return cost===0 || pool==='verification' || account.status!=='exhausted' || !!cycleExpired;
  }
  choose(ctx,cost,id,spec={}) {
    const settings = this.store.get(ctx.org,'settings','main') || { strategy:'priority' };
    const accounts = id ? [this.account(ctx,id)] : this.store.list(ctx.org,'account');
    const candidates=accounts.filter(a=>this.eligible(a,cost,Date.now(),spec.pool) && !(spec.pool==='verification' && a.verification_exhausted));
    candidates.sort((a,b)=>settings.strategy==='round_robin' ? a.last_used-b.last_used : settings.strategy==='most_credits' ? (b.balances?.lead_credit?.left_over ?? -1)-(a.balances?.lead_credit?.left_over ?? -1) || a.priority-b.priority : a.priority-b.priority || a.last_used-b.last_used);
    if (!candidates.length) fail(409,'no_available_account','No account has the required budget and access. Refresh credits, enable an account or choose another account.');
    return candidates[0];
  }
  async request(ctx,account,spec) {
    const path=account.api_mode==='legacy' && spec.legacy?spec.legacy:spec.path;
    const url = new URL(this.base+path);
    const add = (key,value) => { if (value == null) return; if (Array.isArray(value)) value.forEach(v=>url.searchParams.append(key,String(v))); else url.searchParams.set(key,typeof value==='object'?JSON.stringify(value):String(value)); };
    if (spec.method==='GET') Object.entries(spec.params).forEach(([k,v])=>add(k,v));
    let options={...spec.options};
    if(account.api_mode==='legacy'&&spec.name?.startsWith('people.')&&spec.name.includes('enrich')) options={lookup_type:options.reveal_phone?'phone':options.reveal_detailed_person_enrichment?'enrich':'standard',return_cached_emails:options.return_cached_emails};
    Object.entries(options).forEach(([k,v])=>add(k,v));
    let response;
    try {
      response = await this.fetch(url,{method:spec.method,headers:{'Api-Key':account.secret,'Content-Type':'application/json',Accept:'application/json'},body:spec.method==='GET'?undefined:JSON.stringify(spec.params),signal:AbortSignal.timeout(this.timeout),redirect:'error'});
    } catch {
      fail(502,'rocketreach_outcome_unknown','RocketReach did not return a response. Credit-consuming calls are not automatically repeated.');
    }
    const raw = await response.text();
    let data; try { data = parseJSON(raw); } catch { fail(502,'rocketreach_invalid_response','RocketReach returned an unreadable response.'); }
    const code = text(data.error_code || data.code,120).toLowerCase();
    if (!response.ok) {
      if (response.status===429) {
        const header = response.headers.get('retry-after');
        const seconds = header && /^\d+$/.test(header) ? Number(header) : header ? Math.max(1,Math.ceil((Date.parse(header)-Date.now())/1000)) : 60;
        account.cooldown_until=Date.now()+Math.max(1,Number.isFinite(seconds)?seconds:60)*1000;
        // Rate limits stop this operation. Never hop keys to evade the provider's throttle.
        this.store.put(ctx.org,'account',account.id,account);
        this.store.put(ctx.org,'throttle',hash(spec.path),{until:account.cooldown_until});
        fail(429,'rocketreach_rate_limited','RocketReach rate limit reached. Retry after the provider cooldown.',{retry_after:Math.ceil((account.cooldown_until-Date.now())/1000)});
      }
      const knownCredit = response.status===402 || code==='202' || ['insufficient_credits','credits_exhausted','credit_limit_reached','insufficient_credit'].includes(code) || /(?:insufficient|not (?:have )?enough|exhausted|no remaining)\s+(?:\w+\s+){0,3}(?:credits|lookups|exports)|(?:credits|lookups|exports)\s+(?:are\s+)?exhausted/i.test(text(data.detail || data.error || data.message,400));
      if (knownCredit) { if(spec.pool==='verification')account.verification_exhausted=true;else account.status='exhausted'; this.store.put(ctx.org,'account',account.id,account); fail(402,'credits_exhausted','This account has no credits for the operation.'); }
      if ([401,403].includes(response.status)) {
        account.status = response.status===401?'invalid':'forbidden';
        this.store.put(ctx.org,'account',account.id,account);
        fail(response.status,'rocketreach_access_denied','RocketReach rejected this key or its access. Update its key or permissions.');
      }
      fail(response.status>=500?502:response.status,'rocketreach_request_failed','RocketReach rejected the request.',{provider_code:code || null,retry_after_seconds:Number(data.retry_after_seconds)||null});
    }
    if (data.error || (data.error_code && data.status==='error')) fail(502,'rocketreach_request_failed','RocketReach did not accept the request.',{provider_code:code || null,retry_after_seconds:Number(data.retry_after_seconds)||null});
    return sanitized(data);
  }
  async refresh(ctx,id) {
    return this.locked(ctx.org,async()=>{
      const account=this.account(ctx,id);
      const data=await this.request(ctx,account,{...operations.credits,name:'credits',params:{},options:{}});
      const usage=data.credit_usage;
      const list=Array.isArray(usage)?usage:usage?.credits_remaining!=null?[{credit_type:'universal',allocated:usage.credits_allocated,used:usage.credits_used,remaining:usage.credits_remaining}]:usage?.remaining!=null?[usage]:[];
      const pools=Object.fromEntries(list.map(x=>[x.credit_type||'lookup',{limit:x.allocated,consumed:x.used,left_over:x.remaining}]));
      const credit=account.api_mode==='universal'?pools.universal:pools.export || pools.lookup || pools.person_lookup;
      account.balances={...pools,lead_credit:credit || {left_over:null}};account.usage={credit_usage:data.credit_usage,credit_usage_by_action:data.credit_usage_by_action,rate_limits:data.rate_limits,plan:data.plan,daily_api_num_calls:data.daily_api_num_calls,daily_api_limit:data.daily_api_limit};
      account.status='ready'; account.checked_at=Date.now();
      this.store.put(ctx.org,'account',id,account);
      this.store.log(ctx,'account.refresh',{id}); return publicAccount(account);
    });
  }
  remember(ctx,data,account,name) {
    const provenance = { account_id:account.id, account_name:account.name, operation:name, fetched_at:Date.now() };
    const people=name.startsWith('companies.')||name==='email.verify'?[]:Array.isArray(data)?data:Array.isArray(data.profiles)?data.profiles:Array.isArray(data.people)?data.people:data.id!=null?[data]:[];
    const records = people.filter(Boolean).map(raw=>{
      const p=normalizePerson({...raw,id:raw.id || raw.person_id},provenance);
      const old=this.store.get(ctx.org,'result',p.id);
      const item = {...old,...p};
      if(old) {
        // Partial phone responses and search previews must retain enriched fields.
        for(const [key,value] of Object.entries(p)) if(value==='' || value==null || (Array.isArray(value)&&!value.length)) item[key]=old[key]??value;
        item.organization={...old.organization,...p.organization};
        item.raw={...old.raw,...p.raw,organization:item.organization};
        item.has_email=old.has_email || p.has_email;
        if(old.email&&!p.email) for(const key of ['first_name','last_name','name','email','email_status']) item[key]=old[key] || p[key];
        item.last_seen_at=Date.now();
      }
      this.store.put(ctx.org,'result',p.id,item);
      return item;
    });
    const companies=name.startsWith('companies.')?(Array.isArray(data)?data:Array.isArray(data.companies)?data.companies:data.id!=null?[data]:[]):[];
    const companyRecords=companies.filter(Boolean).map(c=>normalizeCompany(c,provenance));
    for(const c of companyRecords)this.store.put(ctx.org,'company',c.id,c);
    let job=null;
    if(name.includes('enrich') && !name.startsWith('companies.')) {
      const ids=people.filter(p=>['progress','searching','waiting','in progress','pending'].includes(p.status)).map(p=>text(p.id));
      if(ids.length) {job={id:randomUUID(),request_id:ids.join(','),profile_ids:ids,account_id:account.id,status:'pending',created_at:Date.now(),next_poll_at:Date.now()+30000,attempts:0,operation:name};this.store.put(ctx.org,'job',job.id,job);}
    }
    if(name==='email.verify') {
      for(const p of this.store.list(ctx.org,'result',100000))if(p.email===data.email){p.email_status=data.status==='valid'?'verified':data.status;this.store.put(ctx.org,'result',p.id,p);}
    }
    return {people:records,companies:companyRecords,job};
  }
  async execute(ctx,name,input={}) {
    const spec=prepareOperation(name,input);
    if(spec.virtual) {
      if(input.spend!==true)fail(400,'spend_confirmation_required','Set spend=true for a batch.',{maximum_reserved_credits:spec.cost});
      const key=text(input.idempotency_key,160);if(!key)fail(400,'idempotency_key_required','Provide a stable batch idempotency_key.');
      const batchID=hash('batch:'+key),fingerprint=hash(JSON.stringify({name,params:spec.params,options:spec.options}));
      const previous=this.store.get(ctx.org,'batch',batchID);
      if(previous&&previous.fingerprint!==fingerprint)fail(409,'idempotency_conflict','This key belongs to another batch.');
      const row=previous||{id:batchID,fingerprint,operation:name,status:'started',total:spec.params.details.length,completed:0,created_at:Date.now(),results:[]};
      this.store.put(ctx.org,'batch',batchID,row);
      const combined={people:[],companies:[],jobs:[],reserved_credits:0,account_name:'Batch',batch_id:batchID};
      try {
        for(const [index,params] of spec.params.details.entries()) {
          const result=await this.execute(ctx,name.replace('.bulk-enrich','.enrich'),{...input,params,options:spec.options,idempotency_key:key+':'+index});
          combined.people.push(...result.people);combined.companies.push(...result.companies);if(result.job)combined.jobs.push(result.job);combined.reserved_credits+=result.reserved_credits;
          row.completed=index+1;row.results[index]={receipt:result.receipt,account_id:result.account_id};this.store.put(ctx.org,'batch',batchID,row);
        }
        row.status='done';this.store.put(ctx.org,'batch',batchID,row);this.store.log(ctx,name,{batch_id:batchID,completed:row.completed,status:'done'});return combined;
      }catch(error){row.status='partial';row.error_code=error.code;this.store.put(ctx.org,'batch',batchID,row);this.store.log(ctx,name,{batch_id:batchID,completed:row.completed,status:'partial',error_code:error.code});throw error;}
    }
    const throttle=this.store.get(ctx.org,'throttle',hash(spec.path));
    if(throttle?.until>Date.now())fail(429,'rocketreach_rate_limited','Wait for the RocketReach endpoint cooldown before making another request.',{retry_after:Math.ceil((throttle.until-Date.now())/1000)});
    const cacheID=hash(JSON.stringify({name,params:spec.params,options:spec.options}));
    const cached=this.store.get(ctx.org,'cache',cacheID);
    if (name.includes('enrich') && input.force !== true && cached?.at>Date.now()-14*86400000) return {...cached.result,cached:true};
    if (spec.cost>0 && input.spend!==true) fail(400,'spend_confirmation_required','Set spend=true to authorize this credit-consuming operation.',{maximum_reserved_credits:spec.cost});
    const key=text(input.idempotency_key,200);
    if (spec.cost>0 && !key) fail(400,'idempotency_key_required','Provide a stable idempotency_key for a paid operation.');
    return this.locked(ctx.org,async()=>{
      const receiptID=key?hash(key):randomUUID();
      const prior=key && this.store.get(ctx.org,'operation',receiptID);
      if (prior) {
        if (prior.fingerprint!==cacheID) fail(409,'idempotency_conflict','This key was used for a different operation.');
        if (prior.status==='done') return {...prior.result,replayed:true};
        fail(409,'operation_already_attempted','This operation was already attempted. Inspect its receipt before submitting another paid request.',{receipt:receiptID,status:prior.status});
      }
      const account=this.choose(ctx,spec.cost,text(input.account_id),spec);
      const receipt={id:receiptID,name,fingerprint:cacheID,status:'started',account_id:account.id,started_at:Date.now()};
      this.store.put(ctx.org,'operation',receiptID,receipt);
      let chosen=account;
      for(let attempt=0;attempt<3;attempt++) {
        try {
          const today=new Date().toISOString().slice(0,10);
          chosen.spent=(chosen.spent_day===today?chosen.spent:0)+spec.cost;
          chosen.spent_day=today; chosen.last_used=Date.now();
          this.store.put(ctx.org,'account',chosen.id,chosen);
          const data=await this.request(ctx,chosen,spec);
          chosen.status='ready';
          if (spec.pool!=='verification' && typeof chosen.balances?.lead_credit?.left_over==='number') chosen.balances.lead_credit.left_over=Math.max(0,chosen.balances.lead_credit.left_over-spec.cost);
          this.store.put(ctx.org,'account',chosen.id,chosen);
          const saved=this.remember(ctx,data,chosen,name);
          const result={...saved,data,account_id:chosen.id,account_name:chosen.name,reserved_credits:spec.cost,cached:false,receipt:receiptID};
          this.store.put(ctx.org,'operation',receiptID,{...receipt,status:'done',result});
          if (name.includes('enrich')) this.store.put(ctx.org,'cache',cacheID,{id:cacheID,at:Date.now(),result});
          this.store.log(ctx,name,{account_id:chosen.id,receipt:receiptID,reserved_credits:spec.cost,people:saved.people.length,companies:saved.companies.length,pending:!!saved.job});
          return result;
        } catch(error) {
          if (error.code==='credits_exhausted') {const denied=this.account(ctx,chosen.id);denied.spent=Math.max(0,denied.spent-spec.cost);this.store.put(ctx.org,'account',chosen.id,denied);}
          if (error.code==='credits_exhausted' && !input.account_id && attempt<2) {
            try { chosen=this.choose(ctx,spec.cost,undefined,spec); continue; } catch { /* Record the original denial. */ }
          }
          this.store.put(ctx.org,'operation',receiptID,{...receipt,status:error.code==='rocketreach_outcome_unknown'?'unknown':'failed',error_code:error.code});
          this.store.log(ctx,name,{account_id:chosen.id,receipt:receiptID,error_code:error.code || 'failed'});
          throw error;
        }
      }
      fail(409,'no_available_account','No account could complete this operation.');
    });
  }
  async poll(ctx,id) {
    const job=this.store.get(ctx.org,'job',id);
    if (!job) fail(404,'job_not_found','Job not found in this workspace.');
    if (job.status!=='pending') return job;
    if (job.next_poll_at>Date.now()) return job;
    return this.locked(ctx.org,async()=>{
      const account=this.account(ctx,job.account_id);
      if (account.cooldown_until>Date.now()) return job;
      try {
        const data=await this.request(ctx,account,{path:'/universal/person/check_status',legacy:'/person/checkStatus',method:'GET',params:{ids:job.profile_ids},options:{}});
        const saved=this.remember(ctx,data,account,'people.poll');
        const rows=Array.isArray(data)?data:data.profiles || [];
        const terminal=rows.length===job.profile_ids.length && rows.every(p=>['complete','failed','not queued'].includes(p.status));
        if(terminal){job.status=rows.some(p=>p.status==='failed')?'failed':'done';job.finished_at=Date.now();job.result={people:saved.people};}
        else job.next_poll_at=Date.now()+30000;
      } catch(error) {
        if(error.details?.provider_code==='result_pending') { job.next_poll_at=Date.now()+Math.max(1,error.details?.retry_after_seconds || 30)*1000; }
        else if (['rocketreach_rate_limited','rocketreach_outcome_unknown'].includes(error.code)) { job.next_poll_at=Date.now()+Math.max(30,error.details?.retry_after || 60)*1000; }
        else {job.status='failed';job.error_code=error.details?.provider_code || error.code;}
      }
      job.attempts++; if (Date.now()-job.created_at>30*86400000) job.status='expired';
      this.store.put(ctx.org,'job',id,job);
      for(const kind of ['cache','operation'])for(const row of this.store.list(ctx.org,kind,100000)) if(row.result?.job?.id===id) {
        row.result={...row.result,job,people:row.result.people.map(p=>this.store.get(ctx.org,'result',p.id)||p)};
        this.store.put(ctx.org,kind,row.id,row);
      }
      return job;
    });
  }
}
