import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import type { CandidateInput } from "../contracts/projections";
import type { ConnectionCheck, ExecutionContext, InvocationContext, SessionHandle, TargetAdapter, TargetConfig } from "../contracts/connectors";
import { capabilitySchema } from "../contracts/primitives";
import { observationSchema, type Observation } from "../contracts/results";
import { withContentHash } from "../contracts/hashing";
import { assignJson, selectJson } from "./json-mapping";
import { ConnectorRateLimit } from "./rate-limit";
import { validatePublicDestination, type Lookup, type PinnedDestination } from "./egress";

export type CredentialResolver = (secretVersionId: string, attemptId: string) => Promise<Buffer>;
export type NativeInvoker = (config: Extract<TargetConfig,{kind:"provider_native"}>, input: CandidateInput, context: InvocationContext) => Promise<NormalizedTargetResponse>;
export type NormalizedTargetResponse = {
  text: string;
  requestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  modelIdentity?: string;
  toolCalls?: Array<{callId:string;name:string;arguments:unknown}>;
  rawArtifact?: {path:string;sha256:string;size_bytes:number;media_type:string;visibility:"internal"};
};
export type TargetTransport = (destination: PinnedDestination, body: Uint8Array, headers: Record<string,string>, context: InvocationContext) => Promise<{status:number;headers:Headers;body:Uint8Array}>;

const unknown = { value: null, provenance: "unavailable" } as const;
function capabilityReport(config: TargetConfig) {
  const supported = new Set([
    "text",
    ...(config.kind === "openai_compatible" || config.kind === "provider_native"
      ? ["multi_turn", "tool_calls", "tool_traces"]
      : []),
    ...(config.reset !== "unsupported" ? ["session_reset"] : []),
  ]);
  return { checked_at: new Date().toISOString(), features: capabilitySchema.options.map((capability) => ({ capability, status: supported.has(capability) ? "supported" as const : "unknown" as const, evidence_artifact_id: null })) };
}
function authHeaders(config: TargetConfig, secret?: Buffer): Record<string,string> {
  if (config.kind === "website" || config.kind === "imported_responses" || config.kind === "private_runner") return {};
  if (config.credential.kind === "none") return {};
  if (!secret) throw new Error("credential_unavailable");
  return config.credential.kind === "bearer" ? { authorization: `Bearer ${secret.toString("utf8")}` } : { [config.credential.header_name]: secret.toString("utf8") };
}
export async function pinnedJsonTransport(destination: PinnedDestination, body: Uint8Array, headers: Record<string,string>, context: InvocationContext) {
  const client = destination.url.protocol === "https:" ? https : http;
  return new Promise<{status:number;headers:Headers;body:Uint8Array}>((resolve,reject) => {
    let total=0; const chunks:Buffer[]=[];
    const request=client.request(destination.url,{method:"POST",agent:false,signal:context.signal,timeout:Math.max(1,new Date(context.deadline).getTime()-Date.now()),lookup:(_h,_o,cb)=>cb(null,destination.address,destination.family),headers:{"content-type":"application/json","content-length":String(body.byteLength),...headers}},response=>{
      response.on("data",(chunk:Buffer)=>{total+=chunk.byteLength;if(total>2_000_000)response.destroy(new Error("response_too_large"));else chunks.push(chunk);});
      response.on("end",()=>resolve({status:response.statusCode??0,headers:new Headers(Object.entries(response.headers).flatMap(([key,value]):[string,string][]=>value===undefined?[]:[[key,Array.isArray(value)?value.join(", "):value]])),body:Buffer.concat(chunks)}));
      response.on("error",reject);
    });
    request.on("error",reject); request.end(body);
  });
}

export class HttpTargetAdapter implements TargetAdapter {
  private readonly limiter: ConnectorRateLimit;
  constructor(private readonly config: TargetConfig, private readonly dependencies: {credential?:CredentialResolver; native?:NativeInvoker; transport?:TargetTransport; lookup?:Lookup} = {}) {
    this.limiter = new ConnectorRateLimit(config.requests_per_minute, config.concurrent_sessions);
  }
  async validate(config: TargetConfig): Promise<ConnectionCheck> {
    if (config.target_revision_id !== this.config.target_revision_id || (config.kind!=="openai_compatible"&&config.kind!=="https_json"&&config.kind!=="provider_native")) return {status:"needs_operator",checked_at:new Date().toISOString(),error_code:"connection_unsupported"};
    if (config.kind === "openai_compatible" || config.kind === "https_json") await validatePublicDestination(config.endpoint,this.dependencies.lookup);
    const capabilities=capabilityReport(config);
    return {status:"ready",checked_at:new Date().toISOString(),capabilities:{...capabilities,checked_at:new Date().toISOString()}};
  }
  async capabilities(config: TargetConfig) { const check=await this.validate(config); if(check.status!=="ready") throw new Error(check.error_code); return check.capabilities; }
  async openSession(ctx: ExecutionContext): Promise<SessionHandle> { return {session_id:randomUUID(),target_revision_id:ctx.target_revision_id}; }
  async closeSession(_session: SessionHandle): Promise<void> {}
  async invoke(input: CandidateInput, context: InvocationContext): Promise<Observation> {
    const started=new Date().toISOString();
    return this.limiter.run(async()=>{
      let secret:Buffer|undefined;
      try {
        const cfg=this.config;
        if (cfg.kind === "website" || cfg.kind === "imported_responses" || cfg.kind === "private_runner") throw new Error("connection_unsupported");
        if (cfg.credential.kind!=="none") secret=await this.dependencies.credential!(cfg.credential.secret_version_id,context.attempt_id);
        let normalized:NormalizedTargetResponse;
        if(cfg.kind==="provider_native") {
          if(!this.dependencies.native) throw new Error("provider_native_unavailable");
          normalized=await this.dependencies.native(cfg,input,context);
        } else {
          const destination=await validatePublicDestination(cfg.endpoint,this.dependencies.lookup);
          const payload:Record<string,unknown>={};
          if(cfg.kind==="openai_compatible") Object.assign(payload,{
            model:cfg.model,
            messages:input.messages.map(({role,content,tool_call_id,tool_calls})=>({
              role,
              content,
              ...(tool_call_id?{tool_call_id}: {}),
              ...(tool_calls?.length?{tool_calls:tool_calls.map((call)=>({
                id:call.call_id,
                type:"function",
                function:{name:call.name,arguments:JSON.stringify(call.arguments)},
              }))}:{}),
            })),
            max_tokens:cfg.limits.max_output_tokens,
            stream:false,
            ...(input.tools.length?{tools:input.tools.map(tool=>({type:"function",function:{name:tool.name,description:tool.description,parameters:tool.input_schema}}))}:{}),
          });
          else assignJson(payload,cfg.mapping.messages_path,input.messages.map(({role,content})=>({role,content})));
          const response=await (this.dependencies.transport??pinnedJsonTransport)(destination,Buffer.from(JSON.stringify(payload)),authHeaders(cfg,secret),context);
          if(response.status===401||response.status===403) throw new Error("invalid_credentials");
          if(response.status<200||response.status>=300) throw new Error(`target_http_${response.status}`);
          const parsed=JSON.parse(Buffer.from(response.body).toString("utf8"));
          if(cfg.kind==="openai_compatible") {
            const message=parsed?.choices?.[0]?.message;
            const text=typeof message?.content==="string"?message.content:"";
            const rawCalls=Array.isArray(message?.tool_calls)?message.tool_calls:[];
            const toolCalls=rawCalls.map((call:unknown)=>{
              if(!call||typeof call!=="object")throw new Error("response_shape_invalid");
              const value=call as {id?:unknown;type?:unknown;function?:{name?:unknown;arguments?:unknown}};
              if(value.type!=="function"||typeof value.id!=="string"||typeof value.function?.name!=="string"||typeof value.function.arguments!=="string")throw new Error("response_shape_invalid");
              let parsedArguments:unknown;try{parsedArguments=JSON.parse(value.function.arguments);}catch{throw new Error("response_shape_invalid");}
              return {callId:value.id,name:value.function.name,arguments:parsedArguments};
            });
            if(!text&&!toolCalls.length) throw new Error("response_shape_invalid");
            normalized={text,toolCalls,requestId:typeof parsed.id==="string"?parsed.id:undefined,inputTokens:Number.isInteger(parsed?.usage?.prompt_tokens)?parsed.usage.prompt_tokens:undefined,outputTokens:Number.isInteger(parsed?.usage?.completion_tokens)?parsed.usage.completion_tokens:undefined,modelIdentity:typeof parsed.model==="string"?parsed.model:undefined};
          } else {
            const text=selectJson(parsed,cfg.mapping.response_text_path);
            if(typeof text!=="string") throw new Error("response_shape_invalid");
            normalized={text};
          }
        }
        const finished=new Date().toISOString();
        const document=withContentHash({schema_version:"1.0" as const,observation_id:randomUUID(),run_id:context.run_id,case_revision_id:input.case_revision_id,repetition:0,attempt_id:context.attempt_id,target_revision_id:context.target_revision_id,started_at:started,finished_at:finished,messages:[...input.messages,{role:"assistant" as const,content:normalized.text,...(normalized.toolCalls?.length?{tool_calls:normalized.toolCalls.map((call)=>({call_id:call.callId,name:call.name,arguments:call.arguments}))}:{})}],tool_events:(normalized.toolCalls??[]).map(call=>({kind:"call" as const,call_id:call.callId,tool_name:call.name,arguments:call.arguments,timestamp:finished})),artifacts:normalized.rawArtifact?[normalized.rawArtifact]:[],provider_request_id:normalized.requestId??null,status:"succeeded" as const,error:null,metadata:{latency_ms:{value:Math.max(0,Date.parse(finished)-Date.parse(started)),provenance:"measured" as const},input_tokens:normalized.inputTokens===undefined?unknown:{value:normalized.inputTokens,provenance:"provider_reported" as const},output_tokens:normalized.outputTokens===undefined?unknown:{value:normalized.outputTokens,provenance:"provider_reported" as const},cost:unknown,model_identity:normalized.modelIdentity===undefined?unknown:{value:normalized.modelIdentity,provenance:"provider_reported" as const}},extensions:{}});
        return observationSchema.parse(document);
      } finally { secret?.fill(0); }
    });
  }
}
