import { describe, expect, it } from "vitest";
import { funnelLinkEvent } from "./funnel-links";

describe("funnel link clicks (launch L-04)", () => {
  it("counts the booking page and the contact form in both languages", () => {
    expect(funnelLinkEvent("/en/call")).toBe("readout_link_clicked");
    expect(funnelLinkEvent("/es/llamada")).toBe("readout_link_clicked");
    expect(funnelLinkEvent("/en/call/")).toBe("readout_link_clicked");
    expect(funnelLinkEvent("/en/contact")).toBe("pilot_requested");
    expect(funnelLinkEvent("/es/contacto")).toBe("pilot_requested");
  });
  it("ignores every other page and unprefixed paths", () => {
    for (const path of ["/en/demo", "/es/demo", "/call", "/en/contacto", "/es/call/extra", "/workspace/sign-in", "/"]) {
      expect(funnelLinkEvent(path), path).toBeNull();
    }
  });
});
