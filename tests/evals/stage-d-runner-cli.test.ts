import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, writeFile,stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { runnerBundleSchema, signPayload, verifyPayload } from "../../lib/evals/private-runner/protocol";

const run=promisify(execFile),cli=resolve("packages/evals-runner/cli.mjs");
const id=(digit:string)=>`${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
describe("WP-12 outbound CLI fixture",()=>{
  it("pairs, checks health, fetches, runs a local adapter and resumes signed uploads",async()=>{
    const dir=await mkdtemp(join(tmpdir(),"caudals-runner-cli-")),configPath=join(dir,"runner.json"),bundlePath=join(dir,"bundle.json"),
      resultsPath=join(dir,"results.json"),adapterPath=join(dir,"adapter.mjs"),adapterConfigPath=join(dir,"adapter.json");
    await writeFile(adapterPath,"let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{JSON.parse(input);process.stdout.write('Synthetic answer');});\n");
    await writeFile(adapterConfigPath,JSON.stringify({command:process.execPath,args:[adapterPath],timeoutMs:5000}));
    const keys=generateKeyPairSync("ed25519"),publicKey=keys.publicKey.export({format:"pem",type:"spki"}).toString(),
      privateKey=keys.privateKey.export({format:"pem",type:"pkcs8"}).toString();
    const orgId=id("1"),projectId=id("2"),targetId=id("3"),jobId=id("4"),unitId=id("5");
    await writeFile(configPath,"{}",{mode:0o644});
    await writeFile(resultsPath,JSON.stringify({job_id:jobId,results:[]}),{mode:0o644});
    const now=Date.now(),payload=runnerBundleSchema.parse({schema_version:"1.0",job_id:jobId,org_id:orgId,
      project_id:projectId,run_id:id("6"),suite_version_id:id("7"),target_id:targetId,target_revision_id:id("8"),
      nonce:"a".repeat(64),issued_at:new Date(now).toISOString(),expires_at:new Date(now+60_000).toISOString(),
      cases:[{case_unit_id:unitId,repetition:0,input:{schema_version:"1.0",case_id:id("9"),case_revision_id:id("a"),
        messages:[{role:"user",content:"Synthetic question"}],attachments:[],tools:[]}}]});
    const bundle={payload,signature:signPayload(payload,privateKey),public_key:publicKey};
    let uploads=0;const server=createServer(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):null;
      let data:unknown;
      if(req.url?.startsWith("/api/evals/v1/runner/pair"))data={runnerId:id("b"),orgId,projectId,targetId,
        token:"runnerfixturetoken".repeat(3),tokenExpiresAt:new Date(now+60_000).toISOString(),signingPublicKey:publicKey};
      else if(req.url?.includes("/health"))data={runnerId:id("b"),projectId,targetId,status:"connected"};
      else if(req.url?.includes("/results")){
        const paired=JSON.parse(await readFile(configPath,"utf8"));
        const runnerPublic=createPublicKey(createPrivateKey(paired.privateKey)).export({format:"pem",type:"spki"}).toString();
        if(body?.job_id!==jobId || body?.case_unit_id!==unitId || !verifyPayload({job_id:body.job_id,case_unit_id:body.case_unit_id,result:body.result},body.signature,runnerPublic)){
          res.writeHead(403,{"content-type":"application/json"});res.end(JSON.stringify({error:{code:"SCOPE_DENIED"}}));return;
        }
        uploads+=1;data={accepted:true,duplicate:false};
      }else data={job:bundle};
      res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data}));
    });
    await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
    try{
      const address=server.address();if(!address || typeof address==="string")throw new Error("fixture server missing");
      const env={...process.env,CAUDALS_EVALS_RUNNER_CONFIG:configPath};
      const invoke=(...args:string[])=>run(process.execPath,[cli,...args],{env,timeout:10000});
      await invoke("pair","--base",`http://127.0.0.1:${address.port}`,"--org",orgId,"--code","fixture-code".repeat(4));
      await invoke("doctor");await invoke("fetch","--output",bundlePath);
      await invoke("run","--bundle",bundlePath,"--adapter",adapterConfigPath,"--results",resultsPath);
      expect((await stat(configPath)).mode&0o777).toBe(0o600);
      expect((await stat(resultsPath)).mode&0o777).toBe(0o600);
      const saved=JSON.parse(await readFile(resultsPath,"utf8"));
      expect(saved.results[0].result.messages.at(-1).content).toBe("Synthetic answer");
      const runnerConfig=JSON.parse(await readFile(configPath,"utf8"));
      expect(verifyPayload({job_id:jobId,case_unit_id:unitId,result:saved.results[0].result},
        saved.results[0].signature,createPublicKey(createPrivateKey(runnerConfig.privateKey)).export({format:"pem",type:"spki"}).toString())).toBe(true);
      await invoke("upload","--results",resultsPath);
      await invoke("upload","--results",resultsPath);
      expect(uploads).toBe(1);
      expect(JSON.parse(await readFile(resultsPath,"utf8")).results[0].uploaded).toBe(true);
      expect(runnerConfig.privateKey).toContain("PRIVATE KEY");
      await invoke("logout");
      await expect(readFile(configPath,"utf8")).rejects.toMatchObject({code:"ENOENT"});
    }finally{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
  });
});
