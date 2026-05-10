import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPhaseOneHiddenAdminPath,
  isPhaseOneHiddenSurfacePath,
  shouldBlockPhaseOneHiddenSurface,
} from "@/lib/phase-one-surface-gates";

describe("Phase 1 surface gates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("identifies pre-pivot self-serve surfaces", () => {
    expect(isPhaseOneHiddenSurfacePath("/browse")).toBe(true);
    expect(isPhaseOneHiddenSurfacePath("/browse/dt_01")).toBe(true);
    expect(isPhaseOneHiddenSurfacePath("/requester")).toBe(true);
    expect(isPhaseOneHiddenSurfacePath("/requester/datasets/new")).toBe(true);
    expect(isPhaseOneHiddenSurfacePath("/contributor/earnings")).toBe(true);
    expect(isPhaseOneHiddenSurfacePath("/dashboard")).toBe(true);
    expect(isPhaseOneHiddenSurfacePath("/pwa/settings")).toBe(true);
  });

  it("keeps the public funnel and admin surface outside the hidden set", () => {
    expect(isPhaseOneHiddenSurfacePath("/")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/contact")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/blog")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/admin")).toBe(false);
    expect(isPhaseOneHiddenSurfacePath("/auth/sign-in")).toBe(false);
  });

  it("identifies legacy admin subroutes without blocking the console root", () => {
    expect(isPhaseOneHiddenAdminPath("/admin")).toBe(false);
    expect(isPhaseOneHiddenAdminPath("/admin/")).toBe(false);
    expect(isPhaseOneHiddenAdminPath("/admin/requests")).toBe(true);
    expect(isPhaseOneHiddenAdminPath("/admin/payments")).toBe(true);
  });

  it("blocks hidden surfaces by default", () => {
    expect(shouldBlockPhaseOneHiddenSurface("/requester")).toBe(true);
    expect(shouldBlockPhaseOneHiddenSurface("/admin/requests")).toBe(true);
  });

  it("allows explicit legacy self-serve mode for fixture checks", () => {
    vi.stubEnv("ENABLE_LEGACY_SELF_SERVE", "true");

    expect(shouldBlockPhaseOneHiddenSurface("/requester")).toBe(false);
    expect(shouldBlockPhaseOneHiddenSurface("/admin/requests")).toBe(true);
  });
});
