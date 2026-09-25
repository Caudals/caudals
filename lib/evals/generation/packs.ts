import { randomUUID } from "node:crypto";
import type { CefCase, Rubric, Source } from "../contracts/cases";
import { sha256, withContentHash } from "../contracts/hashing";

const createdAt="2026-09-17T00:00:00.000Z";
export function genericGroundedQaPack(input:{
 source?:Source;
 sources?:Source[];
 questions:Array<{question:string;expected:string;anchor:string;sourceRevisionId?:string;title?:string;topic?:string;difficulty?:"routine"|"advanced"|"challenge";severity?:"low"|"medium"|"high"|"critical"}>;
 authorId:string;
 generation?:{generatorRevisionId:string;promptRevisionId:string};
 /** When the workspace has a judge route, the "grounding" criterion is graded by the versioned rubric judge. */
 judge?:{modelRevisionId:string;promptRevisionId:string};
}):{rubric:Rubric;cases:CefCase[]} {
  const sources=input.sources??(input.source?[input.source]:[]);
  if(!sources.length)throw new Error("generation_source_missing");
  const byRevision=new Map(sources.map(source=>[source.revision_id,source]));
  const resolved=input.questions.map(question=>{
    const source=byRevision.get(question.sourceRevisionId??sources[0].revision_id);
    if(!source)throw new Error("generation_source_missing");
    if(!source.anchors.some(anchor=>anchor.id===question.anchor))throw new Error("Source anchor is absent from the frozen revision.");
    return {question,source};
  });
  const rubricId=randomUUID(),rubricRevisionId=randomUUID();const rubric=withContentHash({schema_version:"1.0" as const,rubric_id:rubricId,revision_id:rubricRevisionId,title:"Grounded answer correctness",criteria:[{id:"correctness",description:"The answer states the source-supported result without contradiction.",weight:1,max_score:1},{id:"grounding",description:"Material claims remain within the supplied evidence.",weight:1,max_score:1}],derivation_notes:null,created_at:createdAt,extensions:{}});
  const cases=resolved.map(({question:item,source},index)=>{const caseId=randomUUID(),revisionId=randomUUID();return withContentHash({schema_version:"1.0" as const,case_id:caseId,revision_id:revisionId,family_id:randomUUID(),title:item.title??`Grounded question ${index+1}`,task_type:"grounded_qa" as const,domain:"generic",tags:[item.topic??"grounded"],language:"en",jurisdiction:null,as_of:null,difficulty:item.difficulty??"routine" as const,severity:item.severity??"medium",split:"validation" as const,scenario:{mode:"single_turn" as const,required_capabilities:["text" as const],messages:[{role:"user" as const,content:item.question}],attachments:[],turn_plan:null,tool_fixture_set_id:null,termination:{kind:"final_answer" as const}},reference:{answerability:"answerable" as const,expected:item.expected,acceptable_alternatives:[],required_claims:[item.expected],prohibited_claims:[],prohibited_actions:[],source_refs:[{source_revision_id:source.revision_id,anchor:item.anchor}],rubric_revision_id:rubricRevisionId,graders:[{kind:"claims" as const,required:[item.expected],prohibited:[]},...(input.judge?[{kind:"llm_judge" as const,model_revision_id:input.judge.modelRevisionId,prompt_revision_id:input.judge.promptRevisionId,calibration_revision_id:null}]:[])]},provenance:{method:input.generation?"synthetic" as const:"human_authored" as const,generator_revision:input.generation?.generatorRevisionId??null,prompt_revision:input.generation?.promptRevisionId??null,evidence_level:input.generation?"customer_supplied_unreviewed" as const:"source_supported" as const,author_ids:[input.authorId],reviewer_ids:[],rights:source.rights,created_at:createdAt},limits:{max_turns:1,max_output_tokens:500,max_tool_calls:0,timeout_ms:60000,repetitions:1},weight:1,extensions:{}});});
  return {rubric,cases};
}

export function syntheticAccountingFixture(authorId="caudals-fixture") {
  const sourceId=randomUUID(),sourceRevisionId=randomUUID(),anchorId=randomUUID(),bytes=Buffer.from("Synthetic policy A: add a 10% service fee to the subtotal, then round once to two decimals.");
  const source=withContentHash({schema_version:"1.0" as const,source_id:sourceId,revision_id:sourceRevisionId,title:"Synthetic accounting policy A",artifact:{path:"fixtures/policy-a.txt",sha256:sha256(bytes),size_bytes:bytes.length,media_type:"text/plain",visibility:"candidate" as const},anchors:[{id:anchorId,excerpt:bytes.toString(),locator:`utf16:0:${bytes.toString().length}`}],access:{candidate:true,judge:true,customer:true,public:true},rights:"caudals_owned_synthetic" as const,created_at:createdAt,extensions:{}});
  const pack=genericGroundedQaPack({source,authorId,questions:[{question:"Using policy A, calculate the total for a subtotal of EUR 123.45. Return the amount and currency.",expected:"EUR 135.80",anchor:anchorId,severity:"medium"}]});
  const original=pack.cases[0];const numerical=withContentHash({...original,task_type:"numerical" as const,tags:["calculation","rounding"],provenance:{...original.provenance,method:"deterministic_fixture" as const,rights:"caudals_owned_synthetic" as const},reference:{...original.reference,expected:{total:"135.80",currency:"EUR"},graders:[{kind:"decimal_equal" as const,path:"$.total",expected:"135.80",tolerance:"0.00",rounding:"half_up" as const,unit:"EUR"}]}});
  return {source,rubric:pack.rubric,cases:[numerical],expected:{total:"135.80",currency:"EUR"}};
}
