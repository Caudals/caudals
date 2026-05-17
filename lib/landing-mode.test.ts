import { describe, expect, it } from "vitest";
import {
  landingModePublicNavigationLinks,
  isLandingModeApiPathAllowed,
  isLandingModePagePathAllowed,
  isLandingModeRequestAllowed,
  isLandingModeStaticAssetPath,
} from "@/lib/landing-mode";

describe("landing mode route allowlist", () => {
  it("exposes only the production public navigation links", () => {
    expect(landingModePublicNavigationLinks).toEqual([
      { href: "/contact", label: "Contacto" },
      { href: "/blog", label: "Blog" },
    ]);
  });

  it("allows the public page surface", () => {
    expect(isLandingModePagePathAllowed("/")).toBe(true);
    expect(isLandingModePagePathAllowed("/contact")).toBe(true);
    expect(isLandingModePagePathAllowed("/contact/")).toBe(true);
    expect(isLandingModePagePathAllowed("/blog")).toBe(true);
    expect(
      isLandingModePagePathAllowed(
        "/blog/launching-caudals-clearer-dataset-operations"
      )
    ).toBe(true);
  });

  it("keeps the private admin auth surface reachable", () => {
    expect(isLandingModePagePathAllowed("/admin")).toBe(true);
    expect(isLandingModePagePathAllowed("/auth/sign-in")).toBe(true);
    expect(isLandingModePagePathAllowed("/auth/security")).toBe(true);
    expect(isLandingModeApiPathAllowed("/api/auth/sign-in/email")).toBe(true);
    expect(isLandingModeApiPathAllowed("/api/auth/session")).toBe(true);
    expect(isLandingModeApiPathAllowed("/api/user/role")).toBe(true);
  });

  it("blocks non-public pages", () => {
    expect(isLandingModePagePathAllowed("/catalogue")).toBe(false);
    expect(isLandingModePagePathAllowed("/catalogue/")).toBe(false);
    expect(isLandingModePagePathAllowed("/security")).toBe(false);
    expect(isLandingModePagePathAllowed("/security/")).toBe(false);
    expect(isLandingModePagePathAllowed("/v1")).toBe(false);
    expect(isLandingModePagePathAllowed("/v1/datasets")).toBe(false);
    expect(isLandingModePagePathAllowed("/buyer")).toBe(false);
    expect(isLandingModePagePathAllowed("/buyer/deliveries")).toBe(false);
    expect(isLandingModePagePathAllowed("/supplier")).toBe(false);
    expect(isLandingModePagePathAllowed("/supplier/assets")).toBe(false);
    expect(isLandingModePagePathAllowed("/pricing")).toBe(false);
    expect(isLandingModePagePathAllowed("/catalog")).toBe(false);
    expect(isLandingModePagePathAllowed("/collaborate")).toBe(false);
    expect(isLandingModePagePathAllowed("/v10")).toBe(false);
    expect(isLandingModePagePathAllowed("/requester")).toBe(false);
    expect(isLandingModePagePathAllowed("/admin/requests")).toBe(false);
  });

  it("allows only explicit public APIs", () => {
    expect(isLandingModeApiPathAllowed("/api/contact")).toBe(true);
    expect(isLandingModeApiPathAllowed("/api/waitlist")).toBe(true);
    expect(isLandingModeApiPathAllowed("/api/analytics/track")).toBe(true);
    expect(isLandingModeApiPathAllowed("/api/collaborations")).toBe(false);
    expect(isLandingModeApiPathAllowed("/api/trpc/health")).toBe(false);
    expect(isLandingModeApiPathAllowed("/api/upload")).toBe(false);
  });

  it("allows required metadata and asset paths", () => {
    expect(isLandingModeStaticAssetPath("/manifest.webmanifest")).toBe(true);
    expect(isLandingModeStaticAssetPath("/favicon.ico")).toBe(true);
    expect(isLandingModeStaticAssetPath("/robots.txt")).toBe(true);
    expect(isLandingModeStaticAssetPath("/sitemap.xml")).toBe(true);
    expect(
      isLandingModeStaticAssetPath("/googlef901b912f9aefdea.html")
    ).toBe(true);
    expect(isLandingModeStaticAssetPath("/_next/static/chunk.js")).toBe(true);
  });

  it("evaluates full request allowlisting", () => {
    expect(isLandingModeRequestAllowed("/blog")).toBe(true);
    expect(isLandingModeRequestAllowed("/api/contact")).toBe(true);
    expect(isLandingModeRequestAllowed("/api/waitlist")).toBe(true);
    expect(isLandingModeRequestAllowed("/admin")).toBe(true);
    expect(isLandingModeRequestAllowed("/auth/sign-in")).toBe(true);
    expect(isLandingModeRequestAllowed("/api/auth/session")).toBe(true);
    expect(isLandingModeRequestAllowed("/api/user/role")).toBe(true);
    expect(isLandingModeRequestAllowed("/catalogue")).toBe(false);
    expect(isLandingModeRequestAllowed("/security")).toBe(false);
    expect(isLandingModeRequestAllowed("/v1/datasets")).toBe(false);
    expect(isLandingModeRequestAllowed("/buyer")).toBe(false);
    expect(isLandingModeRequestAllowed("/supplier")).toBe(false);
    expect(isLandingModeRequestAllowed("/api/internal/jobs")).toBe(false);
    expect(isLandingModeRequestAllowed("/api/trpc/health")).toBe(false);
  });
});
