import { z } from "zod";
import { languageSchema, timestampSchema } from "../contracts/primitives";
import { canonicalJson, sha256, withContentHash } from "../contracts/hashing";

const confidence=z.strictObject({value:z.string().nullable(),confidence:z.number().min(0).max(1),basis:z.array(z.string())});
export const contextProfileSchema=z.strictObject({
  schema_version:z.literal("1.0"), evaluation_id:z.string().min(1), purpose:confidence, intended_users:z.array(z.string()), tasks:z.array(z.string()),
  business_boundaries:z.array(z.string()), supported_capabilities:z.array(z.string()), source_hierarchy:z.array(z.strictObject({source_revision_id:z.string(),rank:z.number().int().positive(),authority:z.string()})),
  languages:z.array(languageSchema), jurisdiction:confidence, as_of:z.union([timestampSchema,z.null()]), material_risks:z.array(z.string()), allowed_actions:z.array(z.string()),
  tool_descriptions:z.array(z.string()), field_confidence:z.record(z.string(),z.number().min(0).max(1)).default({}), confirmed_context:z.array(z.strictObject({confirmation_id:z.string(),field:z.string(),question:z.string(),answer:z.string()})).default([]), unanswered_questions:z.array(z.strictObject({field:z.string(),question:z.string(),critical:z.boolean()})),
  conflicts:z.array(z.strictObject({field:z.string(),values:z.array(z.string()).min(2),source_revision_ids:z.array(z.string()).min(2)})),
  prompt_revision:z.string(), model_revision_id:z.string().nullable(), content_hash:z.string().regex(/^[a-f0-9]{64}$/),
});
export type ContextProfile=z.infer<typeof contextProfileSchema>;

export function buildContextProfile(input:{evaluationId:string;purpose?:string;intendedUsers?:string[];tasks?:string[];languages?:string[];jurisdiction?:string;asOf?:string|null;sources:Array<{revisionId:string;authority?:string;applicableFrom?:string|null;applicableTo?:string|null;claims?:Record<string,string>}>;capabilities?:string[];risks?:string[];allowedActions?:string[];tools?:string[];fieldConfidence?:Record<string,number>;fieldBasis?:Record<string,string[]>;promptRevision:string;modelRevisionId?:string|null}):ContextProfile {
  const unanswered:Array<{field:string;question:string;critical:boolean}>=[];
  if(!input.purpose)unanswered.push({field:"purpose",question:"What should this system help its users accomplish?",critical:true});
  if(!input.languages?.length)unanswered.push({field:"languages",question:"Which languages must the system support? Use BCP 47 tags such as en or es-ES.",critical:true});
  const dateSensitive=input.tasks?.some(task=>/tax|legal|policy|rate|eligib|coverage/i.test(task));
  if(dateSensitive&&!input.asOf)unanswered.push({field:"as_of",question:"Which date should date-sensitive answers use?",critical:true});
  const claimGroups=new Map<string,Map<string,string[]>>();
  for(const source of input.sources)for(const [field,value] of Object.entries(source.claims??{})){const values=claimGroups.get(field)??new Map<string,string[]>();values.set(value,[...(values.get(value)??[]),source.revisionId]);claimGroups.set(field,values);}
  const conflicts=[...claimGroups].filter(([,values])=>values.size>1).map(([field,values])=>({field,values:[...values.keys()],source_revision_ids:[...values.values()].flat()}));
  for(const conflict of conflicts)unanswered.push({field:`conflict.${conflict.field}`,question:`Which source controls the conflicting ${conflict.field} value?`,critical:true});
  const document=withContentHash({schema_version:"1.0" as const,evaluation_id:input.evaluationId,purpose:{value:input.purpose??null,confidence:input.fieldConfidence?.purpose??(input.purpose?1:0),basis:input.fieldBasis?.purpose??[]},intended_users:input.intendedUsers??[],tasks:input.tasks??[],business_boundaries:[],supported_capabilities:input.capabilities??["text"],source_hierarchy:input.sources.map((source,index)=>({source_revision_id:source.revisionId,rank:index+1,authority:source.authority??"customer_supplied"})),languages:input.languages??[],jurisdiction:{value:input.jurisdiction??null,confidence:input.fieldConfidence?.jurisdiction??(input.jurisdiction?1:0),basis:input.fieldBasis?.jurisdiction??[]},as_of:input.asOf??null,material_risks:input.risks??[],allowed_actions:input.allowedActions??[],tool_descriptions:input.tools??[],field_confidence:input.fieldConfidence??{},confirmed_context:[],unanswered_questions:unanswered,conflicts,prompt_revision:input.promptRevision,model_revision_id:input.modelRevisionId??null});
  return contextProfileSchema.parse(document);
}

export const coverageCellSchema=z.strictObject({topic:z.string().min(1),task:z.string().min(1),difficulty:z.enum(["routine","advanced","challenge"]),consequence:z.enum(["low","medium","high","critical"]),interaction:z.enum(["single_turn","conversation","tool_workflow"]),count:z.number().int().positive()});
export function planCoverage(profile:ContextProfile,maxCases:number) {
  if(!Number.isInteger(maxCases)||maxCases<1||maxCases>500)throw new Error("case_limit_invalid");
  const topics=profile.tasks.length?profile.tasks:["core behavior"];const cells=[];let remaining=maxCases;
  for(let index=0;index<topics.length&&remaining>0;index++){const count=Math.max(1,Math.floor(remaining/(topics.length-index)));cells.push({topic:topics[index],task:"grounded_qa",difficulty:index%3===2?"challenge" as const:index%3===1?"advanced" as const:"routine" as const,consequence:profile.material_risks.length?"high" as const:"medium" as const,interaction:"single_turn" as const,count});remaining-=count;}
  return {seed:sha256(canonicalJson({evaluation:profile.evaluation_id,maxCases,profile:profile.content_hash})),planned:maxCases,cells:cells.map(cell=>coverageCellSchema.parse(cell))};
}
