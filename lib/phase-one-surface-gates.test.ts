import { describe, expect, it } from "vitest";
import {
  isPhaseOneHiddenAdminPath,
  isPhaseOneRemovedSurfacePath,
  isPhaseOneHiddenSurfacePath,
  shouldBlockPhaseOneHiddenSurface,
} from "@/lib/phase-one-surface-gates";

describe("Phase 1 surface gates", () => {
  it("has no legacy self-serve route groups left in the hidden set", () => {
    expect(isPhaseOneHiddenSurfacePath("/requester")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/requester/datasets/new")).toBe(false);
  });

  it("keeps the public funnel and admin surface outside the hidden set", () => {
    expect(isPhaseOneHiddenSurfacePath("/")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/contact")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/blog")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/admin")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/buyer")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/supplier")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/auth/sign-in")).toBe(false);
  });

  it("identifies legacy admin subroutes without blocking the console root", () => {
    expect(isPhaseOneHiddenAdminPath("/admin")).toBe(false);
    expect(isPhaseOneHiddenAdminPath("/admin/")).toBe(false);
    expect(isPhaseOneHiddenAdminPath("/admin/requests")).toBe(true);
    expect(isPhaseOneHiddenAdminPath("/admin/payments")).toBe(true);
  });

  it("keeps removed route groups blocked", () => {
    expect(isPhaseOneRemovedSurfacePath("/dashboard")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/dashboard/requests/123")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/browse")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/browse/dt_01")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/contributor")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/contributor/earnings")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/pwa")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/pwa/upload")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/requester")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/requester/datasets")).toBe(true);
    expect(isPhaseOneRemovedSurfacePath("/buyer")).toBe(false);
    expect(shouldBlockPhaseOneHiddenSurface("/buyer")).toBe(false);
    expect(isPhaseOneRemovedSurfacePath("/supplier")).toBe(false);
    expect(shouldBlockPhaseOneHiddenSurface("/supplier")).toBe(false);
    expect(shouldBlockPhaseOneHiddenSurface("/dashboard")).toBe(true);
    expect(shouldBlockPhaseOneHiddenSurface("/browse")).toBe(true);
    expect(shouldBlockPhaseOneHiddenSurface("/contributor")).toBe(true);
    expect(shouldBlockPhaseOneHiddenSurface("/pwa")).toBe(true);
    expect(shouldBlockPhaseOneHiddenSurface("/requester")).toBe(true);
  });

  it("blocks removed and legacy admin surfaces", () => {
    expect(shouldBlockPhaseOneHiddenSurface("/requester")).toBe(true);
    expect(shouldBlockPhaseOneHiddenSurface("/dashboard")).toBe(true);
    expect(shouldBlockPhaseOneHiddenSurface("/pwa")).toBe(true);
    expect(shouldBlockPhaseOneHiddenSurface("/admin/requests")).toBe(true);
  });
});
