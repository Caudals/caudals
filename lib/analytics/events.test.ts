import { describe, expect, it } from "vitest";
import { analyticsPath, sanitizeAttribution, sanitizePayload, CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES } from "./events";
describe("analytics privacy boundary", () => {
  it("allows only known scalar properties, rejecting emails, raw IPs, URLs and nonfinite numbers", () => {
    expect(sanitizePayload("demo_finished",{outcome:"done",email:"user@test.com",error_code:"user@test.com",model_used:"https://test.com/private",scored:Infinity,correct:-1,duration_s:3})).toEqual({outcome:"done",duration_s:3});
    for (const raw of ["192.168.0.1", "2001:db8::1", "2001:db8:abcd:1:2:3:4:5", "person%40example.com", "person@example.com", "https://a.test/?token=secret"]) expect(sanitizeAttribution({utm_source:raw})).toEqual({});
  });
  it("keeps campaign labels and validated journey IDs without unknown properties", () => {
    expect(sanitizeAttribution({utm_source:"linkedin",partner:"partner-1",email:"me@test.com",attribution_visitor_id:"not-an-id"})).toEqual({utm_source:"linkedin",partner:"partner-1"});
  });
  it("removes query strings and unknown route segments, including private IDs and slugs", () => {
    expect(analyticsPath("/en/blog/a-person-name?email=me@test.com")).toBe("/en/blog/:id");
    expect(analyticsPath("/workspace/reports/secret#token")).toBe("/workspace/reports/:id");
    expect(analyticsPath("//evil.test" )).toBeNull();
  });
  it("assigns each event to exactly one source", () => { expect(CLIENT_EVENT_NAMES.filter(name => (SERVER_EVENT_NAMES as readonly string[]).includes(name))).toEqual([]); });
});
