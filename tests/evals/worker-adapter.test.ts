import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { invokeOpenAI, providerErrorDetail } from '../../lib/evals/providers/openai-compatible';
import { ProviderFailure, type Invocation,type ProviderRevision } from '../../lib/evals/providers/contracts';
async function server(handler:http.RequestListener) {
 const server=http.createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw new Error();
 const endpoint=`http://127.0.0.1:${address.port}/v1`;
 const provider:ProviderRevision={id:randomUUID(),account_id:randomUUID(),adapter:'dgx',endpoint,model_id:'fixture',roles:['target'],capabilities:{text:true,boundedTokens:true},context_limit:2048,output_limit:128,data_classes:['test'],regions:['EU'],concurrency_limit:1,rpm:100,tpm:100000,retired_at:null};
 const input:Invocation={probe:false,probeKind:'text',outputFormat:'text',providerRevisionId:provider.id,priceRevisionId:randomUUID(),workspaceBudgetId:randomUUID(),runBudgetId:randomUUID(),role:'target',dataClass:'test',region:'EU',routing:'local_only',approvedProviderIds:[],messages:[{role:'user',content:'Hello'}],maxOutputTokens:32,timeoutMs:150,internalCostPerSecond:'0'};
 return {provider,input,endpoint,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};
}
describe('OpenAI-compatible adapter wire contract',()=>{
 it('has an absolute deadline even if a peer keeps sending bytes',async()=>{
  const s=await server((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.write('{');const timer=setInterval(()=>res.write(' '),20);res.on('close',()=>clearInterval(timer));});
  try{const start=Date.now();await expect(invokeOpenAI(s.provider,s.input,undefined,new AbortController().signal,s.endpoint)).rejects.toThrow('network_unavailable');expect(Date.now()-start).toBeLessThan(1000);}finally{await s.close();}
 });
 it('records truncated output as incomplete rather than successful',async()=>{
  const s=await server((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'length',message:{content:'partial'}}],usage:{prompt_tokens:1,completion_tokens:32}}));});
  try{const result=await invokeOpenAI(s.provider,s.input,undefined,new AbortController().signal,s.endpoint);expect(result.complete).toBe(false);expect(result.finishReason).toBe('length');}finally{await s.close();}
 });
 for(const kind of ['json_object','tools'] as const)it(`records only observed ${kind} probe evidence`,async()=>{
  const s=await server((req,res)=>{
   const chunks:Buffer[]=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
    const body=JSON.parse(Buffer.concat(chunks).toString());
    if(kind==='json_object')expect(body.response_format).toEqual({type:'json_object'});else expect(body.tools[0].function.name).toBe('probe_echo');
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[kind==='json_object'?{finish_reason:'stop',message:{content:'{"ok":true}'}}:{finish_reason:'tool_calls',message:{content:null,tool_calls:[{type:'function',function:{name:'probe_echo',arguments:'{"value":"ok"}'}}]}}]}));
   });
  });
  try{const result=await invokeOpenAI(s.provider,{...s.input,probe:true,probeKind:kind},undefined,new AbortController().signal,s.endpoint);expect(result.capabilityEvidence).toEqual({kind,status:'supported',scope:'single_bounded_probe'});}finally{await s.close();}
 });
 it('asks again with the model default when a reasoning flag is refused',async()=>{
  const bodies:Array<Record<string,unknown>>=[];
  const s=await server((req,res)=>{
   const chunks:Buffer[]=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
    const body=JSON.parse(Buffer.concat(chunks).toString());bodies.push(body);
    if('reasoning_effort' in body){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Reasoning is mandatory for this endpoint and cannot be disabled.',code:400}}));return;}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]}));
   });
  });
  try{
   const input={...s.input,role:'generator' as const,reasoning:'off' as const,timeoutMs:2000};
   const result=await invokeOpenAI({...s.provider,roles:['generator']},input,undefined,new AbortController().signal,s.endpoint);
   expect(result.text).toBe('{"ok":true}');expect(bodies).toHaveLength(2);
   expect(bodies[0].reasoning_effort).toBe('none');expect('reasoning_effort' in bodies[1]).toBe(false);
  }finally{await s.close();}
 });
 it('keeps the provider explanation of any other rejection and does not repeat it',async()=>{
  let calls=0;
  const s=await server((_req,res)=>{calls++;res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'This model maximum context length is 2048 tokens.'}}));});
  try{
   const error=await invokeOpenAI({...s.provider,roles:['judge']},{...s.input,role:'judge',timeoutMs:2000},undefined,new AbortController().signal,s.endpoint).catch((value:unknown)=>value);
   expect(error).toBeInstanceOf(ProviderFailure);expect((error as ProviderFailure).code).toBe('unsupported_feature');
   expect((error as ProviderFailure).detail).toContain('maximum context length');expect(calls).toBe(1);
  }finally{await s.close();}
 });
 it('reports a key out of credit as a spending limit, not a wrong key',async()=>{
  const s=await server((_req,res)=>{res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Key limit exceeded (total limit). Manage it using https://openrouter.ai/settings/keys',code:403}}));});
  try{
   const error=await invokeOpenAI({...s.provider,roles:['judge']},{...s.input,role:'judge',timeoutMs:2000},undefined,new AbortController().signal,s.endpoint).catch((value:unknown)=>value);
   expect((error as ProviderFailure).code).toBe('quota_exceeded');expect((error as ProviderFailure).outcome).toBe('rejected');
  }finally{await s.close();}
 });
 it('masks anything key-like in a provider error',()=>{
  expect(providerErrorDetail(JSON.stringify({error:{message:'Incorrect API key provided: sk-proj-abcdefghijklmnop'}}))).toBe('Incorrect API key provided: [key]');
  expect(providerErrorDetail('upstream said no')).toBe('upstream said no');
 });
 it('refuses a customer/commercial private destination and DGX endpoint mismatch',async()=>{
  const s=await server((_req,res)=>res.end());
  try{await expect(invokeOpenAI(s.provider,s.input,undefined,new AbortController().signal,'http://different.invalid/v1')).rejects.toThrow('dgx_admin_endpoint_denied');await expect(invokeOpenAI({...s.provider,adapter:'openai_compatible'},s.input,undefined,new AbortController().signal)).rejects.toThrow('commercial_requires_tls');}finally{await s.close();}
 });
});
