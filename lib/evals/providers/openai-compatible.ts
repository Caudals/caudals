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
const annotationSchema=z.object({type:z.string().max(40),url_citation:z.object({url:z.string().max(2000),title:z.string().max(500).optional()}).passthrough().optional()}).passthrough();
const responseSchema=z.object({id:z.string().max(200).optional(),choices:z.array(z.object({finish_reason:z.string().nullable(),message:z.object({content:z.string().max(1000000).nullable().optional(),annotations:z.array(annotationSchema).max(100).nullable().optional(),reasoning:z.string().max(2000000).nullable().optional(),reasoning_content:z.string().max(2000000).nullable().optional(),tool_calls:z.array(z.object({type:z.literal('function'),function:z.object({name:z.string().max(128),arguments:z.string().max(10000)})})).max(4).optional()})})).min(1),usage:z.object({prompt_tokens:z.number().int().nonnegative(),completion_tokens:z.number().int().nonnegative(),prompt_tokens_details:z.object({cached_tokens:z.number().int().nonnegative()}).optional(),completion_tokens_details:z.object({reasoning_tokens:z.number().int().nonnegative().nullable().optional()}).nullable().optional()}).optional()});
const INTERNAL_ROLES=new Set(['generator','context_analyzer','judge','report_writer']);
/** Share of an output allowance a reasoning model may spend thinking; the rest stays for the answer. */
export function reasoningBudget(maxOutputTokens:number):number {
 return Math.max(512,Math.min(8192,Math.floor(maxOutputTokens*0.4)));
}
/**
 * max_tokens covers hidden reasoning and the visible answer together, so a
 * reasoning model can spend the whole allowance thinking and return nothing.
 * Internal engine steps therefore choose how much reasoning they allow:
 *
 * - "bounded" (generation, first attempt): think, inside reasoningBudget where
 *   the provider accepts a number (OpenRouter), otherwise the model default.
 * - "off" (generation retry after exhaustion): no hidden reasoning.
 * - unset (grading, report takeaways, connection tests): short answers on
 *   small allowances, so reasoning stays minimal.
 *
 * Ollama (DGX) rejects any thinking flag on models without thinking, and
 * gpt-oss cannot switch thinking off (it only accepts an effort level), so a
 * DGX model default is sent as no flag. Target calls are left untouched: they
 * evaluate the model as configured.
 */
export function reasoningHint(provider:Pick<ProviderRevision,'adapter'|'model_id'>,hostname:string,input:Pick<Invocation,'role'|'probe'>&Partial<Pick<Invocation,'reasoning'|'maxOutputTokens'>>):Record<string,unknown> {
 if(input.probe||!INTERNAL_ROLES.has(input.role))return {};
 const gptOss=/gpt-oss/i.test(provider.model_id);
 const nvidia=hostname==='integrate.api.nvidia.com';
 const openai=hostname==='api.openai.com'&&/^(o\d|gpt-5)/.test(provider.model_id);
 if(input.reasoning==='bounded') {
  if(provider.adapter==='dgx'||nvidia)return gptOss?{reasoning_effort:'low'}:{};
  if(hostname==='openrouter.ai')return {reasoning:{max_tokens:reasoningBudget(input.maxOutputTokens??4096)}};
  return openai?{reasoning_effort:'low'}:{};
 }
 if(provider.adapter==='dgx'||nvidia)return {reasoning_effort:gptOss?'low':'none'};
 if(hostname==='openrouter.ai')return input.reasoning==='off'?{reasoning:{enabled:false}}:{reasoning:{effort:'low'}};
 return openai?{reasoning_effort:'low'}:{};
}
/** No redirect following; DNS is validated and pinned to the actual socket lookup. */
/** The provider's error message from a rejected call, shortened and with anything key-like masked. */
export function providerErrorDetail(body:string):string|undefined {
 let message=body;
 try {const parsed=JSON.parse(body) as {error?:unknown;message?:unknown;detail?:unknown};const error=parsed.error;
  message=typeof error==='string'?error:error&&typeof error==='object'&&typeof (error as {message?:unknown}).message==='string'?(error as {message:string}).message:typeof parsed.message==='string'?parsed.message:typeof parsed.detail==='string'?parsed.detail:body;
 }catch{/* plain text body */}
 const clean=message.replace(/\s+/g,' ').replace(/\b(sk|tvly|pk|rk|key)[-_][A-Za-z0-9_-]{6,}/gi,'[key]').replace(/[A-Za-z0-9_-]{32,}/g,'[redacted]').trim();
 return clean?clean.slice(0,300):undefined;
}
async function invokeRequest(provider:ProviderRevision,input:Invocation,secret:Buffer|undefined,signal:AbortSignal,dgxEndpoint?:string,options:{omitReasoning?:boolean}={}):Promise<ProviderOutput> {
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
 // OpenAI's current models take max_completion_tokens and only the default temperature.
 const openai=provider.adapter!=='dgx'&&hostname==='api.openai.com';
 const payload=JSON.stringify({model:provider.model_id,messages:input.messages,stream:false,...(openai?{max_completion_tokens:input.maxOutputTokens}:{max_tokens:input.maxOutputTokens,temperature:0}),
  ...(options.omitReasoning?{}:reasoningHint(provider,hostname,input)),
  // Web research: OpenRouter's web plugin searches the public web for any model and returns url_citation annotations.
  ...(input.webSearch&&!input.probe&&INTERNAL_ROLES.has(input.role)&&hostname==='openrouter.ai'?{plugins:[{id:'web',max_results:input.webSearch.maxResults}]}:{}),
  ...((input.probe&&input.probeKind==='json_object'||!input.probe&&input.outputFormat==='json_object')?{response_format:{type:'json_object'}}:{}),
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
      const retryHeader=response.headers['retry-after'];const retry=typeof retryHeader==='string'?Number(retryHeader):0;
      const code=status===401||status===403?'invalid_credentials':status===404?'model_missing':status===429?'overloaded':status>=500?'service_unavailable':'unsupported_feature';
      // Keep the provider's own explanation (bounded) so a rejection can be diagnosed and, for reasoning flags, retried.
      const body:Buffer[]=[];let read=0;
      const reject=()=>fail(new ProviderFailure(code,status>=500?'unknown':'rejected',Number.isFinite(retry)?Math.min(300000,Math.max(0,retry*1000)):0,providerErrorDetail(Buffer.concat(body).toString('utf8'))));
      response.on('data',(chunk:Buffer)=>{if(read<8192){body.push(chunk.subarray(0,8192-read));read+=chunk.length;}});
      response.on('end',reject);response.on('error',reject);
      // Even explicit rejection can be billed; caller retains an estimated charge.
      return;
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
        // Some servers return the thinking only as a token count, not as text.
        const reasoned=!!(choice.message.reasoning||choice.message.reasoning_content)||(parsed.usage?.completion_tokens_details?.reasoning_tokens??0)>0;
        const seen=new Set<string>();
        const citations=(choice.message.annotations??[]).flatMap(item=>{const url=item.url_citation?.url;if(item.type!=='url_citation'||!url||!/^https?:\/\//i.test(url)||seen.has(url))return [];seen.add(url);return [{url,...(item.url_citation?.title?{title:item.url_citation.title}:{})}];}).slice(0,20);
        finished=true;resolve({text,complete,finishReason:reasoned&&!text.trim()&&choice.finish_reason==='length'?'reasoning_exhausted':choice.finish_reason??'unknown',...(toolCalls?{toolCalls}:{}),...(capabilityEvidence?{capabilityEvidence}:{}),...(parsed.id?{requestId:parsed.id}:{}),...(usage?{usage}:{}),...(citations.length?{citations}:{}),latencyMs:Date.now()-started});
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
 const attempt=(omitReasoning:boolean)=>Promise.race([invokeRequest(provider,input,secret,controller.signal,dgxEndpoint,{omitReasoning}),deadline]);
 try {
  let result:ProviderOutput;
  try {result=await attempt(false);}catch(error){
   // Some models cannot switch reasoning off or take no budget ("Reasoning is
   // mandatory for this endpoint"): ask once more with the model's default.
   const hinted=Object.keys(reasoningHint(provider,new URL(provider.endpoint).hostname.replace(/^\[|\]$/g,''),input)).length>0;
   if(!(error instanceof ProviderFailure&&error.code==='unsupported_feature'&&hinted&&(!error.detail||/reason|think/i.test(error.detail)))||controller.signal.aborted)throw error;
   result=await attempt(true);
  }
  return {...result,latencyMs:Date.now()-started};
 }
 finally {clearTimeout(timer);signal.removeEventListener('abort',abort);if(abortReject)controller.signal.removeEventListener('abort',abortReject);}
}
