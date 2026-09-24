import { z } from 'zod';
export const invocationSchema=z.object({
  probe:z.boolean().default(false), probeKind:z.enum(['text','json_object','tools']).default('text'), outputFormat:z.enum(['text','json_object']).default('text'), generationJobId:z.string().uuid().optional(), generationStep:z.enum(['profile','draft']).optional(), providerRevisionId:z.string().uuid(), priceRevisionId:z.string().uuid(), secretVersionId:z.string().uuid().optional(),
  workspaceBudgetId:z.string().uuid(), runBudgetId:z.string().uuid(),
  role:z.enum(['target','generator','context_analyzer','judge','adjudicator','report_writer','embedding']),
  dataClass:z.string().min(1), region:z.string().min(1), routing:z.enum(['local_only','approved_providers']),
  approvedProviderIds:z.array(z.string().uuid()),
  messages:z.array(z.object({role:z.enum(['system','user','assistant']),content:z.string().max(100000)}).strict()).min(1).max(100),
  maxOutputTokens:z.number().int().min(1).max(32768), timeoutMs:z.number().int().min(100).max(120000).default(60000),
  internalCostPerSecond:z.string().regex(/^(0|[1-9]\d*)(\.\d{1,9})?$/).default('0'),
  caseUnitId:z.string().uuid().optional(), caseRevisionId:z.string().uuid().optional(), targetRevisionId:z.string().uuid().optional(), repetition:z.number().int().nonnegative().optional(),
}).strict();
export type Invocation=z.infer<typeof invocationSchema>;
export interface ProviderRevision {
 id:string; account_id:string; adapter:'dgx'|'openai_compatible'; endpoint:string; model_id:string;
 roles:string[]; capabilities:{text?:boolean; boundedTokens?:boolean; jsonObject?:boolean; probeApproved?:boolean}; context_limit:number;output_limit:number;
 data_classes:string[]; regions:string[]; concurrency_limit:number; rpm:number;tpm:number; retired_at:Date|null;
}
export class ProviderFailure extends Error {
 constructor(public readonly code:'network_unavailable'|'service_unavailable'|'model_missing'|'overloaded'|'malformed_output'|'unsupported_feature'|'invalid_credentials',public readonly outcome:'unknown'|'rejected',public readonly retryAfterMs=0) {super(code);}
}
export interface ProviderOutput {text:string; complete:boolean; finishReason:string; requestId?:string; usage?:{input:number;output:number;cached:number}; latencyMs:number; toolCalls?:Array<{name:string;arguments:string}>; capabilityEvidence?:{kind:'text'|'json_object'|'tools';status:'supported'|'unsupported'|'unknown';scope:'single_bounded_probe'}}
