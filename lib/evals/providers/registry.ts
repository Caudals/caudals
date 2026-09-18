import type { PoolClient } from 'pg';
import type { Invocation, ProviderRevision } from './contracts';
import { units, type Price } from '../budget/money';
export interface PriceRevision extends Price {id:string;currency:string;provider_revision_id:string}
export async function loadProvider(client:PoolClient, input:Invocation):Promise<{provider:ProviderRevision;price:PriceRevision;inputBound:number}> {
 const provider=(await client.query('SELECT * FROM evals.provider_revision WHERE id=$1',[input.providerRevisionId])).rows[0] as ProviderRevision|undefined;
 const price=(await client.query('SELECT * FROM evals.price_revision WHERE id=$1 AND provider_revision_id=$2 AND effective_at<=now()',[input.priceRevisionId,input.providerRevisionId])).rows[0] as PriceRevision|undefined;
 if(!provider || !price || provider.retired_at && provider.retired_at.getTime()<=Date.now()) throw new Error('provider_revision_unavailable');
 if(!provider.roles.includes(input.role) || !provider.data_classes.includes(input.dataClass) || !provider.regions.includes(input.region)) throw new Error('provider_policy_denied');
 if(provider.adapter!=='dgx' && (input.routing==='local_only' || !input.approvedProviderIds.includes(provider.id))) throw new Error('provider_policy_denied');
 // A vetted bounded-token contract is mandatory. No assumptions about unprobed inventory.
 if(input.probe) {
   if(provider.adapter!=='dgx' || !provider.capabilities.probeApproved || input.maxOutputTokens>128 || Buffer.byteLength(JSON.stringify(input.messages))>256)throw new Error('probe_not_approved');
   if([price.input_price,price.output_price,price.cache_price,price.tool_price].some(p=>units(p)!==BigInt(0)))throw new Error('probe_requires_zero_external_price');
 } else if(input.probeKind!=='text')throw new Error('probe_mode_requires_admin_probe');
 else if(!provider.capabilities.text || !provider.capabilities.boundedTokens) throw new Error('provider_capability_unverified');
 if(input.maxOutputTokens>provider.output_limit) throw new Error('output_bound_exceeded');
 // UTF-8 bytes conservatively dominate byte-level tokenization; reserve full context
 // for input to cover provider chat-template overhead. Reject oversized payloads locally.
 const bytes=Buffer.byteLength(JSON.stringify(input.messages),'utf8');
 const inputBound=provider.context_limit-input.maxOutputTokens;
 if(inputBound<=0 || bytes+1024>inputBound) throw new Error('context_bound_exceeded');
 return {provider,price,inputBound};
}
export async function acquireCapacity(client:PoolClient, provider:ProviderRevision, attemptId:string, tokenBound:number):Promise<void> {
 // One residency slot across ALL DGX accounts/revisions, not one per model.
 if(provider.adapter==='dgx')await client.query("SELECT pg_advisory_xact_lock(hashtextextended('evals.dgx.residency',0))");
 // Global row lock serializes capacity and rolling rate accounting across all tenants.
 await client.query('SELECT id FROM evals.provider_account WHERE id=$1 FOR UPDATE',[provider.account_id]);
 const health=(await client.query('SELECT * FROM evals.provider_health WHERE provider_revision_id=$1',[provider.id])).rows[0];
 if(health?.state==='invalid_credentials')throw new Error('provider_credentials_invalid');
 if(health?.circuit_until && health.circuit_until.getTime()>Date.now()) throw new Error('provider_circuit_open');
 const counts=(await client.query(`SELECT count(*) FILTER(WHERE released_at IS NULL)::int AS active,
 count(*) FILTER(WHERE acquired_at>now()-interval '1 minute')::int AS requests,
 coalesce(sum(token_bound) FILTER(WHERE acquired_at>now()-interval '1 minute'),0)::text AS tokens
 FROM evals.provider_slot slot JOIN evals.provider_revision revision ON revision.id=slot.provider_revision_id
 WHERE ($2='dgx' AND revision.adapter='dgx') OR ($2<>'dgx' AND slot.provider_revision_id=$1)`,[provider.id,provider.adapter])).rows[0];
 if(counts.active>=(provider.adapter==='dgx'?1:provider.concurrency_limit) || counts.requests>=provider.rpm || Number(counts.tokens)+tokenBound>provider.tpm) throw new Error('provider_capacity_unavailable');
 await client.query('INSERT INTO evals.provider_slot(attempt_id,provider_revision_id,token_bound) VALUES($1,$2,$3)',[attemptId,provider.id,tokenBound]);
}
