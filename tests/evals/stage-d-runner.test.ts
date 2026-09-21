import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { candidateInputSchema } from "../../lib/evals/contracts/projections";
import { newRunnerToken, publicKeyFor, runnerBundleSchema, runnerCompletionStatus, runnerResultSchema, runnerUploadSchema,
  signPayload, tokenHash, tokenMatches, validateSignedBundle, verifyPayload } from "../../lib/evals/private-runner/protocol";

const id=(digit:string)=>`${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
function keys(){const {privateKey,publicKey}=generateKeyPairSync("ed25519");return {
  privatePem:privateKey.export({format:"pem",type:"pkcs8"}).toString(),
  publicPem:publicKey.export({format:"pem",type:"spki"}).toString(),
};}
function bundle(){const now=Date.now();return runnerBundleSchema.parse({schema_version:"1.0",job_id:id("1"),org_id:id("2"),
  project_id:id("3"),run_id:id("4"),suite_version_id:id("5"),target_id:id("6"),target_revision_id:id("7"),
  nonce:"a".repeat(64),issued_at:new Date(now).toISOString(),expires_at:new Date(now+60_000).toISOString(),
  cases:[{case_unit_id:id("8"),repetition:0,input:candidateInputSchema.parse({schema_version:"1.0",case_id:id("9"),
    case_revision_id:id("a"),messages:[{role:"user",content:"Synthetic question"}],attachments:[],tools:[]})}]});}

describe("WP-12 private runner protocol",()=>{
  it("signs a candidate-only bundle and rejects tampering, expiry and another signing key",()=>{
    const key=keys(),other=keys(),payload=bundle(),signature=signPayload(payload,key.privatePem);
    expect(publicKeyFor(key.privatePem)).toBe(key.publicPem);
    expect(validateSignedBundle({payload,signature,public_key:key.publicPem},key.publicPem)).toEqual(payload);
    expect(JSON.stringify(payload)).not.toMatch(/reference|rubric|expected|source_refs/);
    expect(()=>validateSignedBundle({payload:{...payload,project_id:id("b")},signature,public_key:key.publicPem},key.publicPem)).toThrow();
    expect(()=>validateSignedBundle({payload,signature,public_key:key.publicPem},other.publicPem)).toThrow();
    expect(()=>validateSignedBundle({payload,signature,public_key:key.publicPem},key.publicPem,Date.parse(payload.expires_at))).toThrow();
  });
  it("binds signed results to a job and case unit",()=>{
    const key=keys(),payload={job_id:id("1"),case_unit_id:id("8"),result:runnerResultSchema.parse({
      started_at:new Date().toISOString(),finished_at:new Date().toISOString(),status:"succeeded",error:null,
      messages:[{role:"user",content:"Synthetic question"},{role:"assistant",content:"Synthetic answer"}],tool_events:[],provider_request_id:null,
      metadata:{latency_ms:{value:12,provenance:"customer_reported"},input_tokens:{value:null,provenance:"unavailable"},
        output_tokens:{value:null,provenance:"unavailable"},cost:{value:null,provenance:"unavailable"},
        model_identity:{value:null,provenance:"unavailable"}}})};
    const signature=signPayload(payload,key.privatePem);
    expect(runnerUploadSchema.parse({...payload,signature})).toBeDefined();
    expect(verifyPayload(payload,signature,key.publicPem)).toBe(true);
    expect(verifyPayload({...payload,case_unit_id:id("b")},signature,key.publicPem)).toBe(false);
    expect(()=>runnerResultSchema.parse({...payload.result,metadata:{...payload.result.metadata,latency_ms:{value:12,provenance:"provider_reported"}}})).toThrow();
  });
  it("hashes bearer credentials without returning plaintext",()=>{
    const token=newRunnerToken();expect(token).not.toBe(tokenHash(token));
    expect(tokenMatches(token,tokenHash(token))).toBe(true);
    expect(tokenMatches(newRunnerToken(),tokenHash(token))).toBe(false);
  });
  it("accepts a currency-tagged reported cost using the observation contract",()=>{
    const now=new Date().toISOString();
    expect(runnerResultSchema.parse({started_at:now,finished_at:now,status:"succeeded",error:null,
      messages:[],tool_events:[],provider_request_id:null,metadata:{
        latency_ms:{value:null,provenance:"unavailable"},input_tokens:{value:null,provenance:"unavailable"},
        output_tokens:{value:null,provenance:"unavailable"},cost:{value:{amount:"1.25",currency:"EUR"},provenance:"customer_reported"},
        model_identity:{value:null,provenance:"unavailable"}}}).metadata.cost.value).toEqual({amount:"1.25",currency:"EUR"});
  });
  it("labels mixed terminal runner results partial",()=>{
    expect(runnerCompletionStatus(2,2)).toBe("completed");
    expect(runnerCompletionStatus(2,1)).toBe("partial");
    expect(runnerCompletionStatus(2,0)).toBe("failed");
  });
});
