import { z } from "zod";
import { caseSchema, type CefCase } from "../contracts/cases";
import { canonicalJson, sha256, verifyContentHash } from "../contracts/hashing";

export const generationSteps=["extract","profile","plan","draft","build_references","validate","review","freeze"] as const;
export type GenerationStep=typeof generationSteps[number];
export type GenerationRecord={step:GenerationStep;inputHash:string;version:number;status:"queued"|"running"|"completed"|"paused"|"failed";attemptCount:number;output?:unknown;reasonCode?:string};
export interface GenerationStore { get(step:GenerationStep,inputHash:string,version:number):Promise<GenerationRecord|undefined>; put(record:GenerationRecord):Promise<void>; quarantine(step:GenerationStep,draft:unknown,reason:string,errors:string[]):Promise<void>; }
export class GenerationUnavailable extends Error {constructor(public readonly reason:"dgx_unavailable"|"model_missing"|"budget_paused"){super(reason);}}

export class GenerationWorkflow {
  constructor(private readonly store:GenerationStore,private readonly handlers:Record<GenerationStep,(input:unknown)=>Promise<unknown>>,private readonly version=1){}
  async run(initial:unknown) {
    let value=initial;
    for(const step of generationSteps){const inputHash=sha256(canonicalJson({step,value}));const existing=await this.store.get(step,inputHash,this.version);if(existing?.status==="completed"){value=existing.output;continue;}
      const record:GenerationRecord={step,inputHash,version:this.version,status:"running",attemptCount:existing?.attemptCount??0};await this.store.put(record);
      try {
        for(let attempt=record.attemptCount;attempt<3;attempt++){record.attemptCount=attempt+1;try{value=await this.handlers[step](value);record.status="completed";record.output=value;await this.store.put(record);break;}catch(error){if(error instanceof GenerationUnavailable){record.status="paused";record.reasonCode=error.reason;await this.store.put(record);return record;}if(attempt>=2){record.status="failed";record.reasonCode="schema_repair_exhausted";await this.store.quarantine(step,value,"schema_repair_exhausted",[error instanceof Error?error.message:"invalid_output"]);await this.store.put(record);return record;}}}
      } catch(error){record.status="failed";record.reasonCode="workflow_failed";await this.store.put(record);throw error;}
    }
    return {status:"completed" as const,output:value};
  }
}

export function validateGeneratedCases(value:unknown,availableSources:Map<string,Set<string>>):CefCase[]{
  const parsed=z.array(caseSchema).min(1).max(500).parse(value);const families=new Set<string>();
  for(const item of parsed){verifyContentHash(item);if(families.has(item.family_id))throw new Error("duplicate_family");families.add(item.family_id);for(const ref of item.reference.source_refs)if(!availableSources.get(ref.source_revision_id)?.has(ref.anchor))throw new Error("unsupported_source_reference");if(item.provenance.evidence_level==="source_supported"&&!item.reference.source_refs.length)throw new Error("unsupported_claim");}
  return parsed;
}

export function familyFingerprint(question:string):string{return sha256(question.toLocaleLowerCase("en").replace(/\b\d+(?:\.\d+)?\b/g,"#").replace(/[^\p{L}#]+/gu," ").trim());}
export function findDuplicateFamilies(cases:Array<Pick<CefCase,"family_id"|"scenario">>) {const seen=new Map<string,string>(),duplicates:Array<{familyId:string;duplicates:string}>=[];for(const item of cases){const question=item.scenario.messages.find(message=>message.role==="user")?.content??"";const key=familyFingerprint(question),old=seen.get(key);if(old&&old!==item.family_id)duplicates.push({familyId:item.family_id,duplicates:old});else seen.set(key,item.family_id);}return duplicates;}
