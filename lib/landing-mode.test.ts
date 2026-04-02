import { describe, expect, it } from "vitest";
import {
  isLandingModeApiPathAllowed,
  isLandingModePagePathAllowed,
  isLandingModeRequestAllowed,
  isLandingModeStaticAssetPath,
} from "@/lib/landing-mode";

describe("landing mode route allowlist", () => {
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

  it("blocks non-public pages", () => {
    expect(isLandingModePagePathAllowed("/pricing")).toBe(false);
    expect(isLandingModePagePathAllowed("/collaborate")).toBe(false);
    expect(isLandingModePagePathAllowed("/auth/sign-in")).toBe(false);
    expect(isLandingModePagePathAllowed("/requester")).toBe(false);
  });

  it("allows only explicit public APIs", () => {
    expect(isLandingModeApiPathAllowed("/api/contact")).toBe(true);
    expect(isLandingModeApiPathAllowed("/api/waitlist")).toBe(true);
    expect(isLandingModeApiPathAllowed("/api/analytics/track")).toBe(true);
    expect(isLandingModeApiPathAllowed("/api/collaborations")).toBe(false);
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
    expect(isLandingModeRequestAllowed("/auth/sign-up")).toBe(false);
    expect(isLandingModeRequestAllowed("/api/internal/export-jobs")).toBe(false);
  });
});
