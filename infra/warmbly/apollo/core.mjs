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
export const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function parseJSON(value) {
  // Apollo request IDs are signed int64; preserve them before JavaScript rounds them.
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
    this.db.prepare("DELETE FROM records WHERE updated<? AND kind IN ('result','company','cache','operation','import','job')"+(org?' AND org=?':'')).run(...(org?[cutoff,org]:[cutoff]));
    this.db.prepare('DELETE FROM audit WHERE at<?').run(Date.now()-90*86400000);
  }
}

export const operations = {
  'people.search': { path: '/mixed_people/api_search', method: 'POST', cost: 0, kind: 'people' },
  'companies.search': { path: '/mixed_companies/search', method: 'POST', cost: 1, kind: 'organizations' },
  'people.enrich': { path: '/people/match', method: 'POST', cost: 1, kind: 'person' },
  'people.bulk-enrich': { path: '/people/bulk_match', method: 'POST', cost: 1, kind: 'matches' },
  'companies.enrich': { path: '/organizations/enrich', method: 'GET', cost: 1, kind: 'organization' },
  'companies.bulk-enrich': { path: '/organizations/bulk_enrich', method: 'POST', cost: 1, kind: 'organizations' },
  'companies.jobs': { path: '/organizations/:id/job_postings', method: 'GET', cost: 0 },
  'credits': { path: '/usage_stats/credit_usage_stats', method: 'POST', cost: 0 },
  'usage': { path: '/usage_stats/api_usage_stats', method: 'POST', cost: 0 },
};

export function prepareOperation(name, input) {
  const spec = operations[name];
  if (!spec) fail(400,'unknown_operation','This Apollo operation is not supported.');
  const params = { ...object(input.params) };
  const options = { ...object(input.options) };
  for (const key of ['api_key','x-api-key','webhook_url','poll_only']) delete params[key];
  for (const key of ['api_key','webhook_url']) delete options[key];
  let count = 1, cost = spec.cost;
  if (name.endsWith('.search') || name === 'companies.jobs') {
    params.page = integer(params.page,1,1,500);
    params.per_page = integer(params.per_page,25,1,100);
  }
  if (name.includes('bulk-enrich')) {
    if (!Array.isArray(params.details) || !params.details.length || params.details.length > 10) fail(400,'bulk_limit','Bulk enrichment accepts 1–10 records per request.');
    count = params.details.length;
    params.details = params.details.map(item => {
      const clean = { ...object(item) };
      for (const key of ['api_key','webhook_url','poll_only']) delete clean[key];
      return clean;
    });
  }
  if (name.startsWith('people.') && name.includes('enrich')) {
    const phone = options.reveal_phone_number === true;
    const waterfall = options.run_waterfall_email === true || options.run_waterfall_phone === true;
    for (const key of ['reveal_phone_number','reveal_personal_emails','run_waterfall_email','run_waterfall_phone']) {
      if (params[key] === true && options[key] !== true) fail(400,'invalid_options',`Use options.${key}, not params.${key}.`);
      delete params[key]; options[key] = options[key] === true;
    }
    if (phone || waterfall) options.poll_only = true;
    cost = (phone ? 9 : 1) * count;
    if (waterfall) {
      cost = integer(input.max_credits,0,1,1000);
      if (cost < count) fail(400,'invalid_budget','Waterfall budget must cover every requested record.');
    }
    if (name === 'people.enrich' && !['id','email','hashed_email','linkedin_url','name','first_name'].some(k=>text(params[k]))) fail(400,'identifier_required','Provide a person ID, email, LinkedIn URL or name.');
  } else cost *= count;
  if (name === 'companies.enrich' && !['domain','linkedin_url','website','name'].some(k=>text(params[k]))) fail(400,'identifier_required','Provide a company domain, website, LinkedIn URL or name.');
  let path = spec.path;
  if (path.includes(':id')) {
    const id = text(params.id,100);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail(400,'invalid_id','A valid Apollo organization ID is required.');
    path = path.replace(':id',encodeURIComponent(id)); delete params.id;
  }
  return { ...spec, name, params, options, path, cost };
}

export function publicAccount(account) {
  const { secret, ...safe } = account;
  return safe;
}
export function normalizePerson(person, provenance = {}) {
  const p = object(person), company = object(p.organization), phone = Array.isArray(p.phone_numbers) ? p.phone_numbers : [];
  const email = text(p.email,320).toLowerCase();
  return {
    id: text(p.id,120) || hash(JSON.stringify(p)).slice(0,24),
    first_name: text(p.first_name), last_name: text(p.last_name || p.last_name_obfuscated),
    name: text(p.name) || [p.first_name,p.last_name || p.last_name_obfuscated].filter(Boolean).join(' '),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '', email_status: text(p.email_status),
    title: text(p.title), linkedin_url: text(p.linkedin_url,2000),
    phone: text(phone.find(x=>x.sanitized_number)?.sanitized_number || phone[0]?.raw_number || p.sanitized_phone || p.phone),
    phone_numbers: phone, company: text(company.name || p.organization_name), domain: text(company.primary_domain || p.domain),
    industry: text(company.industry), employees: company.estimated_num_employees ?? null,
    location: [p.city,p.state,p.country].filter(Boolean).join(', '),
    has_email: p.has_email === true || !!email, organization: company, raw: p,
    ...provenance,
  };
}

export class Apollo {
  constructor(store, { baseURL = 'https://api.apollo.io/api/v1', fetcher = fetch, timeout = 45000 } = {}) {
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
    if (!account) fail(404,'account_not_found','Apollo account not found in this workspace.');
    return account;
  }
  addAccount(ctx,input) {
    const key = text(input.api_key,300), alias = text(input.name,100);
    if (!alias || key.length < 12) fail(400,'invalid_account','An account name and Apollo API key are required.');
    const fingerprint = hash(key);
    if (this.store.list(ctx.org,'account').some(a=>a.fingerprint===fingerprint)) fail(409,'duplicate_key','This Apollo API key is already connected.');
    const account = { id:randomUUID(), name:alias, secret:key, fingerprint, enabled:true, status:'unverified', priority:integer(input.priority,100,0,10000), reserve:integer(input.reserve,0,0,1000000), daily_budget:integer(input.daily_budget,100,0,1000000), credit_model:input.credit_model==='unified'?'unified':'separate', spent:0, spent_day:new Date().toISOString().slice(0,10), balances:null, credit_cycle:null, cooldown_until:0, last_used:0, created_at:Date.now() };
    this.store.put(ctx.org,'account',account.id,account); this.store.log(ctx,'account.create',{id:account.id});
    return publicAccount(account);
  }
  updateAccount(ctx,id,input) {
    const account = this.account(ctx,id);
    if (input.name != null) account.name = text(input.name,100) || account.name;
    for (const key of ['priority','reserve','daily_budget']) if (input[key] != null) account[key] = integer(input[key],0,0,1000000);
    if (input.credit_model != null) {if(!['unified','separate'].includes(input.credit_model))fail(400,'invalid_credit_model','Choose unified or separate credits.');account.credit_model=input.credit_model;}
    if (typeof input.enabled === 'boolean') account.enabled = input.enabled;
    if (input.api_key) {
      account.secret = text(input.api_key,300);
      if (account.secret.length < 12) fail(400,'invalid_key','Invalid Apollo key.');
      account.fingerprint = hash(account.secret);
      if (this.store.list(ctx.org,'account').some(a=>a.id!==id && a.fingerprint===account.fingerprint)) fail(409,'duplicate_key','This key is already connected.');
      account.status = 'unverified'; account.balances = null;
    }
    this.store.put(ctx.org,'account',id,account); this.store.log(ctx,'account.update',{id});
    return publicAccount(account);
  }
  eligible(account,cost,now=Date.now()) {
    if (!account.enabled || ['invalid','forbidden','blocked'].includes(account.status) || account.cooldown_until > now) return false;
    const spent = account.spent_day === new Date(now).toISOString().slice(0,10) ? account.spent : 0;
    if (cost > 0 && spent+cost > account.daily_budget) return false;
    const cycleExpired = account.credit_cycle?.end_date && Date.parse(account.credit_cycle.end_date) <= now;
    const left = cycleExpired ? undefined : account.balances?.lead_credit?.left_over;
    if (cost>0 && typeof left==='number' && left-cost < account.reserve) return false;
    return cost===0 || account.status!=='exhausted' || !!cycleExpired;
  }
  choose(ctx,cost,id,spec={}) {
    const settings = this.store.get(ctx.org,'settings','main') || { strategy:'priority' };
    const accounts = id ? [this.account(ctx,id)] : this.store.list(ctx.org,'account');
    const phones=spec.options?.reveal_phone_number || spec.options?.run_waterfall_phone;
    const candidates = accounts.filter(a=>this.eligible(a,cost) && !(phones && a.credit_model!=='unified' && a.balances?.direct_dial_credit?.left_over===0));
    candidates.sort((a,b)=>settings.strategy==='round_robin' ? a.last_used-b.last_used : settings.strategy==='most_credits' ? (b.balances?.lead_credit?.left_over ?? -1)-(a.balances?.lead_credit?.left_over ?? -1) || a.priority-b.priority : a.priority-b.priority || a.last_used-b.last_used);
    if (!candidates.length) fail(409,'no_available_account','No account has the required budget and access. Refresh credits, enable an account or choose another account.');
    return candidates[0];
  }
  async request(ctx,account,spec) {
    const url = new URL(this.base+spec.path);
    const add = (key,value) => { if (value == null) return; if (Array.isArray(value)) value.forEach(v=>url.searchParams.append(key+'[]',String(v))); else url.searchParams.set(key,String(value)); };
    if (spec.method==='GET') Object.entries(spec.params).forEach(([k,v])=>add(k,v));
    Object.entries(spec.options).forEach(([k,v])=>add(k,v));
    let response;
    try {
      response = await this.fetch(url,{method:spec.method,headers:{'x-api-key':account.secret,'Content-Type':'application/json',Accept:'application/json'},body:spec.method==='GET'?undefined:JSON.stringify(spec.params),signal:AbortSignal.timeout(this.timeout),redirect:'error'});
    } catch {
      fail(502,'apollo_outcome_unknown','Apollo did not return a response. Credit-consuming calls are not automatically repeated.');
    }
    const raw = await response.text();
    let data; try { data = parseJSON(raw); } catch { fail(502,'apollo_invalid_response','Apollo returned an unreadable response.'); }
    const code = text(data.error_code || data.code,120).toLowerCase();
    if (!response.ok) {
      if (response.status===429) {
        const header = response.headers.get('retry-after');
        const seconds = header && /^\d+$/.test(header) ? Number(header) : header ? Math.max(1,Math.ceil((Date.parse(header)-Date.now())/1000)) : 60;
        account.cooldown_until=Date.now()+Math.max(1,Number.isFinite(seconds)?seconds:60)*1000;
        // Rate limits stop this operation. Never hop keys to evade the provider's throttle.
        this.store.put(ctx.org,'account',account.id,account);
        this.store.put(ctx.org,'throttle',hash(spec.path),{until:account.cooldown_until});
        fail(429,'apollo_rate_limited','Apollo rate limit reached. Retry after the provider cooldown.',{retry_after:Math.ceil((account.cooldown_until-Date.now())/1000)});
      }
      const knownCredit = ['insufficient_credits','credits_exhausted','credit_limit_reached','insufficient_credit'].includes(code) || /(?:insufficient|not enough|exhausted|no remaining)\s+(?:\w+\s+){0,3}credits|credits\s+(?:are\s+)?exhausted/i.test(text(data.error || data.message,400));
      if (knownCredit) { account.status='exhausted'; this.store.put(ctx.org,'account',account.id,account); fail(402,'credits_exhausted','This account has no credits for the operation.'); }
      if ([401,403].includes(response.status)) {
        account.status = response.status===401?'invalid':'forbidden';
        this.store.put(ctx.org,'account',account.id,account);
        fail(response.status,'apollo_access_denied','Apollo rejected this key or its access. Update its key or permissions.');
      }
      fail(response.status>=500?502:response.status,'apollo_request_failed','Apollo rejected the request.',{provider_code:code || null,retry_after_seconds:Number(data.retry_after_seconds)||null});
    }
    if (data.error || (data.error_code && data.status==='error')) fail(502,'apollo_request_failed','Apollo did not accept the request.',{provider_code:code || null,retry_after_seconds:Number(data.retry_after_seconds)||null});
    return data;
  }
  async refresh(ctx,id) {
    return this.locked(ctx.org,async()=>{
      const account=this.account(ctx,id);
      const data=await this.request(ctx,account,{path:operations.credits.path,method:'POST',params:{},options:{}});
      account.balances=object(data.credit_usage_stats); account.credit_cycle=data.current_credit_cycle || null;
      account.status='ready'; account.checked_at=Date.now();
      this.store.put(ctx.org,'account',id,account);
      this.store.log(ctx,'account.refresh',{id}); return publicAccount(account);
    });
  }
  remember(ctx,data,account,name) {
    const provenance = { account_id:account.id, account_name:account.name, operation:name, fetched_at:Date.now() };
    const people = data.person ? [data.person] : Array.isArray(data.matches) ? data.matches : Array.isArray(data.people) ? data.people : [];
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
    const companies = data.organization ? [data.organization] : Array.isArray(data.organizations) ? data.organizations : [];
    for (const c of companies.filter(Boolean)) {
      const id=text(c.id) || hash(JSON.stringify(c)).slice(0,24);
      this.store.put(ctx.org,'company',id,{...c,id,...provenance});
    }
    const requestID=data.request_id ?? data.requestId;
    let job=null;
    if (requestID != null) {
      job={id:randomUUID(),request_id:String(requestID),account_id:account.id,status:'pending',created_at:Date.now(),next_poll_at:Date.now()+30000,attempts:0,operation:name};
      this.store.put(ctx.org,'job',job.id,job);
    }
    return {people:records,companies,job};
  }
  async execute(ctx,name,input={}) {
    const spec=prepareOperation(name,input);
    const throttle=this.store.get(ctx.org,'throttle',hash(spec.path));
    if(throttle?.until>Date.now())fail(429,'apollo_rate_limited','Wait for the Apollo endpoint cooldown before making another request.',{retry_after:Math.ceil((throttle.until-Date.now())/1000)});
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
          if (typeof chosen.balances?.lead_credit?.left_over==='number') chosen.balances.lead_credit.left_over=Math.max(0,chosen.balances.lead_credit.left_over-spec.cost);
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
          this.store.put(ctx.org,'operation',receiptID,{...receipt,status:error.code==='apollo_outcome_unknown'?'unknown':'failed',error_code:error.code});
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
        const data=await this.request(ctx,account,{path:'/webhook_result/'+encodeURIComponent(job.request_id),method:'GET',params:{},options:{}});
        const payload=object(data.payload || data.data || data);
        this.remember(ctx,payload,account,job.operation);
        job.status='done'; job.result=payload; job.finished_at=Date.now();
      } catch(error) {
        if(error.details?.provider_code==='result_pending') { job.next_poll_at=Date.now()+Math.max(1,error.details?.retry_after_seconds || 30)*1000; }
        else if (['apollo_rate_limited','apollo_outcome_unknown'].includes(error.code)) { job.next_poll_at=Date.now()+Math.max(30,error.details?.retry_after || 60)*1000; }
        else {job.status='failed';job.error_code=error.details?.provider_code || error.code;}
      }
      job.attempts++; if (Date.now()-job.created_at>30*86400000) job.status='expired';
      this.store.put(ctx.org,'job',id,job); return job;
    });
  }
}
