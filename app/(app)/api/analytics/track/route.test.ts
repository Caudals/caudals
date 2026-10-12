import { beforeEach, afterEach, expect, it, vi } from "vitest";
const {record,limit}=vi.hoisted(()=>({record:vi.fn(async()=>({ok:true})),limit:vi.fn(async()=>({allowed:true}))}));
vi.mock("@/lib/analytics/funnel-events-server",()=>({analyticsV2Enabled:()=>process.env.ANALYTICS_EVENTS_V2==="true",recordProductEvent:record}));
vi.mock("@/lib/security/rate-limit",()=>({consumeRateLimit:limit}));
vi.mock("@/lib/demo/client",()=>({clientHash:()=>"opaque-visitor"}));
import { POST } from "./route";
const send=(body:unknown,origin="http://localhost")=>POST(new Request("http://localhost/api/analytics/track",{method:"POST",headers:{"content-type":"application/json",host:"localhost",origin},body:JSON.stringify(body)}));
beforeEach(()=>{vi.stubEnv("ANALYTICS_EVENTS_V2","true");record.mockClear();limit.mockClear();});
afterEach(()=>vi.unstubAllEnvs());
it("requires explicit consent and forbids server event names",async()=>{
  expect((await send({eventName:"page_view"})).status).toBe(400);
  expect((await send({eventName:"page_view",consent:false})).status).toBe(400);
  expect((await send({eventName:"account_created",consent:true})).status).toBe(400);
  expect(record).not.toHaveBeenCalled();
});
it("rejects oversized payloads and foreign origins",async()=>{
  expect((await send({eventName:"page_view",consent:true,payload:{x:"a".repeat(9000)}})).status).toBe(400);
  expect((await send({eventName:"page_view",consent:true},"https://elsewhere.test")).status).toBe(403);
  expect(record).not.toHaveBeenCalled();
});
it("uses a pseudonymous rate key and the fixed client source",async()=>{
  expect((await send({eventName:"page_view",consent:true,path:"/en",payload:{locale:"en"}})).status).toBe(200);
  expect(limit).toHaveBeenCalledWith(expect.objectContaining({key:"analytics:opaque-visitor"}));
  expect(record).toHaveBeenCalledWith(expect.objectContaining({source:"client",eventName:"page_view"}));
});
it("turns off ingestion at runtime",async()=>{
  vi.stubEnv("ANALYTICS_EVENTS_V2","false");
  expect((await send({eventName:"page_view",consent:true})).status).toBe(204);
  expect(record).not.toHaveBeenCalled();
});
