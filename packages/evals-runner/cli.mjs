#!/usr/bin/env node
import { randomBytes, generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';

const configPath = resolve(process.env.CAUDALS_EVALS_RUNNER_CONFIG ?? `${homedir()}/.config/caudals-evals/runner.json`);
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${canonical(key)}:${canonical(value[key])}`).join(',')}}`;
}
function signature(value, privateKey) { return sign(null,Buffer.from(canonical(value)),createPrivateKey(privateKey)).toString('base64'); }
function verifyBundle(signed, config) {
  if (!signed?.payload || signed.public_key !== config.signingPublicKey ||
      signed.payload.org_id !== config.orgId || signed.payload.project_id !== config.projectId ||
      signed.payload.target_id !== config.targetId || Date.parse(signed.payload.expires_at) <= Date.now() ||
      !verify(null,Buffer.from(canonical(signed.payload)),createPublicKey(config.signingPublicKey),Buffer.from(signed.signature ?? '', 'base64')))
    throw new Error('Bundle signature, scope or expiry is invalid');
  const forbidden = ['reference','rubric','source','expected','answer_key','grading'];
  for (const item of signed.payload.cases ?? []) {
    if (!item.case_unit_id || !item.input || forbidden.some(key => Object.hasOwn(item.input,key)))
      throw new Error('Bundle contains invalid candidate input');
  }
  return signed.payload;
}
async function readJson(path) { return JSON.parse(await readFile(path,'utf8')); }
async function saveJson(path,value) {
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temp=`${path}.${randomBytes(8).toString('hex')}.tmp`;
  const handle=await open(temp,'wx',0o600);
  try{await handle.writeFile(`${JSON.stringify(value,null,2)}\n`);await handle.sync();}
  finally{await handle.close();}
  try{await rename(temp,path);}finally{await unlink(temp).catch(()=>{});}
}
function options(args) {
  const out={}; for(let i=0;i<args.length;i+=2) { if(!args[i]?.startsWith('--') || !args[i+1])throw new Error(`Expected --option value: ${args[i]}`); out[args[i].slice(2)]=args[i+1]; }
  return out;
}
function required(value,name) { if(!value)throw new Error(`Missing ${name}`); return value; }
async function api(config,path,{method='GET',body,auth=true}={}) {
  const url=new URL(`/api/evals/v1/runner/${path}`,config.baseUrl);
  if(auth) url.searchParams.set('orgId',config.orgId);
  const response=await fetch(url,{method,headers:{...(auth?{Authorization:`Bearer ${config.token}`}:{}) ,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  if(!response.ok)throw new Error(`Runner API ${response.status}: ${data.error?.code ?? 'request_failed'}`);
  return data.data;
}
async function pair(opts) {
  const baseUrl=new URL(required(opts.base,'--base'));
  if(baseUrl.protocol!=='https:' && !(baseUrl.hostname==='127.0.0.1' && baseUrl.protocol==='http:'))throw new Error('Pairing requires HTTPS');
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const config={baseUrl:baseUrl.origin,orgId:required(opts.org,'--org'),privateKey:privateKey.export({type:'pkcs8',format:'pem'}).toString()};
  const data=await api(config,'pair',{method:'POST',auth:false,body:{orgId:config.orgId,code:required(opts.code,'--code'),
    publicKey:publicKey.export({type:'spki',format:'pem'}).toString(),connectorVersion:'caudals-evals-cli:0.1.0'}});
  await saveJson(configPath,{...config,runnerId:data.runnerId,projectId:data.projectId,targetId:data.targetId,
    token:data.token,tokenExpiresAt:data.tokenExpiresAt,signingPublicKey:data.signingPublicKey});
  process.stdout.write(`Paired runner ${data.runnerId} for project ${data.projectId}.\n`);
}
async function doctor(config) {
  const data=await api(config,'health');
  if(data.runnerId!==config.runnerId || data.projectId!==config.projectId)throw new Error('Runner scope mismatch');
  process.stdout.write(`Connected: ${data.status}; token expires ${config.tokenExpiresAt}.\n`);
}
async function fetchJob(config,opts) {
  const data=await api(config,'jobs');
  if(!data.job) { process.stdout.write('No pending runner job.\n'); return; }
  const payload=verifyBundle(data.job,config),path=resolve(opts.output ?? `./caudals-job-${payload.job_id}.json`);
  await saveJson(path,data.job);
  process.stdout.write(`Saved ${payload.cases.length} candidate tests to ${path}.\n`);
}
async function localInvoke(adapter,input) {
  if(typeof adapter.command!=='string' || !Array.isArray(adapter.args) || adapter.args.some(x=>typeof x!=='string') ||
    !adapter.command || adapter.args.length>30)throw new Error('Invalid local adapter configuration');
  const env={PATH:process.env.PATH ?? '',LANG:process.env.LANG ?? 'C.UTF-8',...(adapter.env ?? {})};
  return new Promise((done,reject)=>{
    const child=spawn(adapter.command,adapter.args,{shell:false,env,stdio:['pipe','pipe','pipe'],cwd:adapter.cwd ?? process.cwd()});
    const chunks=[];let size=0;let stderrSize=0;let settled=false;
    const timeout=setTimeout(()=>child.kill('SIGKILL'),Math.min(Number(adapter.timeoutMs ?? 120000),120000));
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>1024*1024)child.kill('SIGKILL');else chunks.push(chunk);});
    child.stderr.on('data',chunk=>{stderrSize+=chunk.length;if(stderrSize>1024*1024)child.kill('SIGKILL');});
    child.on('error',error=>{if(!settled){settled=true;clearTimeout(timeout);reject(error);}});
    child.on('close',code=>{clearTimeout(timeout);if(settled)return;settled=true;
      if(code!==0 || size>1024*1024)reject(new Error('Local adapter failed or exceeded output limit'));
      else done(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.end(JSON.stringify(input));
  });
}
const unavailable={value:null,provenance:'unavailable'};
async function runJob(config,opts) {
  const signed=await readJson(required(opts.bundle,'--bundle'));
  const payload=verifyBundle(signed,config),adapter=await readJson(required(opts.adapter,'--adapter'));
  const path=resolve(opts.results ?? `./caudals-results-${payload.job_id}.json`);
  let state;try{state=await readJson(path);}catch{state={job_id:payload.job_id,results:[]};}
  if(state.job_id!==payload.job_id)throw new Error('Results file belongs to another job');
  for(const item of payload.cases) {
    if(state.results.some(x=>x.case_unit_id===item.case_unit_id))continue;
    const started=new Date(),startMs=Date.now();let output='',status='succeeded',error=null;
    try{output=await localInvoke(adapter,item.input);}catch{status='target_error';error={category:'target_error',code:'local_adapter_error',retryable:false};}
    const parsed=(()=>{try{return JSON.parse(output);}catch{return null;}})();
    const messages=[...item.input.messages,...(Array.isArray(parsed?.messages)?parsed.messages:[{role:'assistant',content:output}])];
    const result={started_at:started.toISOString(),finished_at:new Date().toISOString(),messages,tool_events:Array.isArray(parsed?.tool_events)?parsed.tool_events:[],
      status,error,provider_request_id:null,metadata:{latency_ms:{value:Date.now()-startMs,provenance:'customer_reported'},
      input_tokens:unavailable,output_tokens:unavailable,cost:unavailable,model_identity:unavailable}};
    const signedResult={job_id:payload.job_id,case_unit_id:item.case_unit_id,result};
    state.results.push({...signedResult,signature:signature(signedResult,config.privateKey),uploaded:false});
    await saveJson(path,state);
  }
  process.stdout.write(`Saved ${state.results.length} signed results to ${path}.\n`);
}
async function upload(config,opts) {
  const path=resolve(required(opts.results,'--results')),state=await readJson(path);
  let accepted=0;
  for(const result of state.results) {
    if(result.uploaded)continue;
    await api(config,`jobs/${state.job_id}/results`,{method:'POST',body:{job_id:result.job_id,case_unit_id:result.case_unit_id,
      result:result.result,signature:result.signature}});
    result.uploaded=true;accepted+=1;await saveJson(path,state);
  }
  process.stdout.write(`Uploaded ${accepted}; ${state.results.filter(x=>!x.uploaded).length} remain.\n`);
}
async function main() {
  const [command,...args]=process.argv.slice(2),opts=options(args);
  if(command==='pair')return pair(opts);
  if(command==='logout'){await unlink(configPath).catch(error=>{if(error?.code!=='ENOENT')throw error;});process.stdout.write('Local runner credentials removed.\n');return;}
  const config=await readJson(configPath);
  if(command==='doctor')return doctor(config);
  if(command==='fetch')return fetchJob(config,opts);
  if(command==='run')return runJob(config,opts);
  if(command==='upload')return upload(config,opts);
  process.stdout.write('Usage: caudals-evals pair --base URL --org UUID --code CODE | doctor | fetch [--output FILE] | run --bundle FILE --adapter FILE [--results FILE] | upload --results FILE | logout\n');
  process.exitCode=command?2:0;
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.message:'Runner failed'}\n`);process.exitCode=1;});
