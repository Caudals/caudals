import { describe, expect, it } from "vitest";
import { createWebhookSignature, verifyWebhookSignature } from "../../lib/evals/monitoring/webhook-protocol";
import { postWebhook } from "../../lib/evals/monitoring/webhooks";

describe("WP-13 webhook protocol",()=>{
  it("binds delivery ID, timestamp, and exact body to a signature",async()=>{
    const secret=Buffer.alloc(32,7),id="00000000-0000-4000-8000-000000000001",time="2026-09-20T12:00:00.000Z";
    const body=JSON.stringify({event:"regression",id:"event-1"});
    const signature=createWebhookSignature(secret,id,time,body);
    const seen=new Set<string>();
    const accept=(key:string)=>{if(seen.has(key))return false;seen.add(key);return true;};
    expect(await verifyWebhookSignature(secret,{id,timestamp:time,body,signature,now:Date.parse(time),accept})).toBe(true);
    expect(await verifyWebhookSignature(secret,{id,timestamp:time,body,signature,now:Date.parse(time),accept})).toBe(false);
    expect(await verifyWebhookSignature(secret,{id,timestamp:time,body:body+" ",signature,now:Date.parse(time),accept:()=>true})).toBe(false);
    expect(await verifyWebhookSignature(secret,{id,timestamp:time,body,signature,now:Date.parse(time)+6*60_000,accept:()=>true})).toBe(false);
  });
  it("rejects loopback webhook destinations before opening a request",async()=>{
    await expect(postWebhook("https://127.0.0.1/hook","{}",{})).rejects.toThrow("denied");
  });
});
