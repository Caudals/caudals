import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { z } from 'zod';
import { pinnedLookup } from '../connectors/egress';
import { ProviderFailure, type Invocation, type ProviderOutput, type ProviderRevision } from './contracts';
const forbidden=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) forbidden.addSubnet(ip,bits,'ipv4');
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
for(const [ip,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const) forbidden.addSubnet(ip,bits,'ipv6');
export function publicAddress(ip:string):boolean {return isIP(ip)===4?!forbidden.check(ip,'ipv4'):isIP(ip)===6&&global6.check(ip,'ipv6')&&!forbidden.check(ip,'ipv6');}
const responseSchema=z.object({id:z.string().max(200).optional(),choices:z.array(z.object({finish_reason:z.string().nullable(),message:z.object({content:z.string().max(1000000).nullable().optional(),tool_calls:z.array(z.object({type:z.literal('function'),function:z.object({name:z.string().max(128),arguments:z.string().max(10000)})})).max(4).optional()})})).min(1),usage:z.object({prompt_tokens:z.number().int().nonnegative(),completion_tokens:z.number().int().nonnegative(),prompt_tokens_details:z.object({cached_tokens:z.number().int().nonnegative()}).optional()}).optional()});
/** No redirect following; DNS is validated and pinned to the actual socket lookup. */
async function invokeRequest(provider:ProviderRevision,input:Invocation,secret:Buffer|undefined,signal:AbortSignal,dgxEndpoint?:string):Promise<ProviderOutput> {
 const base=new URL(provider.endpoint);
 if(base.username || base.password || base.search || base.hash) throw new Error('invalid_provider_endpoint');
 if(provider.adapter==='dgx') {
   if(!dgxEndpoint || new URL(dgxEndpoint).href!==base.href || !['http:','https:'].includes(base.protocol)) throw new Error('dgx_admin_endpoint_denied');
 } else if(base.protocol!=='https:') throw new Error('commercial_requires_tls');
 const hostname=base.hostname.replace(/^\[|\]$/g,'');
 const addresses=await lookup(hostname,{all:true});
 if(!addresses.length || provider.adapter!=='dgx'&&addresses.some(a=>!publicAddress(a.address))) throw new Error('provider_egress_denied');
 if(signal.aborted)throw new ProviderFailure('network_unavailable','unknown');
 const address=addresses[0];
 const url=new URL(`${base.pathname.replace(/\/$/,'')}/chat/completions`,base);
 const payload=JSON.stringify({model:provider.model_id,messages:input.messages,max_tokens:input.maxOutputTokens,stream:false,temperature:0,
  ...(input.probe&&input.probeKind==='json_object'?{response_format:{type:'json_object'}}:{}),
  ...(input.probe&&input.probeKind==='tools'?{tools:[{type:'function',function:{name:'probe_echo',description:'Return the requested string; inspection only, never executed.',parameters:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false}}}],tool_choice:{type:'function',function:{name:'probe_echo'}}}:{}),
 });
 const started=Date.now();
 return new Promise((resolve,reject)=>{
  let finished=false;
  const fail=(error:ProviderFailure)=>{if(!finished){finished=true;reject(error);}};
  const request=(url.protocol==='https:'?https:http).request(url,{
    method:'POST',signal,agent:false,timeout:input.timeoutMs,
    lookup:pinnedLookup(address),
    headers:{'content-type':'application/json','content-length':Buffer.byteLength(payload),...(secret?{authorization:`Bearer ${secret.toString('utf8')}`}:{})},
  },response=>{
    const status=response.statusCode??0;
    if(status!==200) {
      response.resume();
      const retryHeader=response.headers['retry-after'];const retry=typeof retryHeader==='string'?Number(retryHeader):0;
      // Even explicit rejection can be billed; caller retains an estimated charge.
      fail(new ProviderFailure(status===401||status===403?'invalid_credentials':status===404?'model_missing':status===429?'overloaded':status>=500?'service_unavailable':'unsupported_feature',status>=500?'unknown':'rejected',Number.isFinite(retry)?Math.min(300000,Math.max(0,retry*1000)):0));return;
    }
    const chunks:Buffer[]=[];let size=0;
    response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2_000_000){response.destroy();fail(new ProviderFailure('malformed_output','unknown'));}else chunks.push(chunk);});
    response.on('error',()=>fail(new ProviderFailure('network_unavailable','unknown')));
    response.on('end',()=>{
      if(finished)return;
      try {const parsed=responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        const usage=parsed.usage?{input:parsed.usage.prompt_tokens,output:parsed.usage.completion_tokens,cached:parsed.usage.prompt_tokens_details?.cached_tokens??0}:undefined;
        if(usage&&usage.cached>usage.input)throw new Error();
        const choice=parsed.choices[0],text=choice.message.content??'';
        const toolCalls=choice.message.tool_calls?.map(t=>({name:t.function.name,arguments:t.function.arguments}));
        const complete=choice.finish_reason==='stop'||input.probe&&input.probeKind==='tools'&&choice.finish_reason==='tool_calls';
        let capabilityEvidence:ProviderOutput['capabilityEvidence'];
        if(input.probe) {
          let supported=false;
          if(input.probeKind==='text')supported=complete&&text.length>0;
          if(input.probeKind==='json_object')try{const value=JSON.parse(text);supported=complete&&value!==null&&typeof value==='object'&&!Array.isArray(value);}catch{/* Explicit unsupported output. */}
          if(input.probeKind==='tools')supported=complete&&toolCalls?.length===1&&toolCalls[0].name==='probe_echo'&&(()=>{try{return typeof JSON.parse(toolCalls[0].arguments).value==='string';}catch{return false;}})();
          capabilityEvidence={kind:input.probeKind,status:supported?'supported':complete?'unsupported':'unknown',scope:'single_bounded_probe'};
        }
        finished=true;resolve({text,complete,finishReason:choice.finish_reason??'unknown',...(toolCalls?{toolCalls}:{}),...(capabilityEvidence?{capabilityEvidence}:{}),...(parsed.id?{requestId:parsed.id}:{}),...(usage?{usage}:{}),latencyMs:Date.now()-started});
      }catch{fail(new ProviderFailure('malformed_output','unknown'));}
    });
  });
  request.on('timeout',()=>request.destroy());request.on('error',()=>fail(new ProviderFailure('network_unavailable','unknown')));
  request.end(payload);
 });
}

/** Absolute wall-clock deadline covers DNS, headers, and a continuously streaming body. */
export async function invokeOpenAI(provider:ProviderRevision,input:Invocation,secret:Buffer|undefined,signal:AbortSignal,dgxEndpoint?:string):Promise<ProviderOutput> {
 const controller=new AbortController();const started=Date.now();
 const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,input.timeoutMs);timer.unref();
 let abortReject:(()=>void)|undefined;
 const deadline=new Promise<never>((_,reject)=>{abortReject=()=>reject(new ProviderFailure('network_unavailable','unknown'));controller.signal.addEventListener('abort',abortReject,{once:true});});
 if(signal.aborted)controller.abort();
 try {const result=await Promise.race([invokeRequest(provider,input,secret,controller.signal,dgxEndpoint),deadline]);return {...result,latencyMs:Date.now()-started};}
 finally {clearTimeout(timer);signal.removeEventListener('abort',abort);if(abortReject)controller.signal.removeEventListener('abort',abortReject);}
}
