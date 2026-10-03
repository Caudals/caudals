import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { registrable } = await import("../../lib/evals/repositories/web-discovery");

describe("company site for web research", () => {
  it("reduces a host to its registrable domain", () => {
    expect(registrable("indexacapital.com")).toBe("indexacapital.com");
    expect(registrable("www.mapfre.es")).toBe("mapfre.es");
    expect(registrable("help.example.co.uk")).toBe("example.co.uk");
    expect(registrable("chat.bank.com.es")).toBe("bank.com.es");
  });
});
