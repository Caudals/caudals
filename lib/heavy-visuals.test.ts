import { describe, expect, it } from "vitest";
import {
  isAutomatedUserAgent,
  isSoftwareWebglRenderer,
  shouldDisableHeavyVisuals,
} from "@/lib/heavy-visuals";

const CHROME_MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
const LIGHTHOUSE_MOBILE_UA = `${CHROME_MOBILE_UA} Chrome-Lighthouse`;

describe("isAutomatedUserAgent", () => {
  it("detects the Lighthouse/PageSpeed user agent", () => {
    expect(isAutomatedUserAgent(LIGHTHOUSE_MOBILE_UA)).toBe(true);
  });

  it("detects headless Chrome", () => {
    expect(
      isAutomatedUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/122.0.0.0 Safari/537.36"
      )
    ).toBe(true);
  });

  it("does not flag a real browser", () => {
    expect(isAutomatedUserAgent(CHROME_MOBILE_UA)).toBe(false);
  });

  it("does not flag a missing user agent", () => {
    expect(isAutomatedUserAgent(undefined)).toBe(false);
    expect(isAutomatedUserAgent(null)).toBe(false);
    expect(isAutomatedUserAgent("")).toBe(false);
  });
});

describe("isSoftwareWebglRenderer", () => {
  it("detects Chrome's SwiftShader software rasterizer", () => {
    expect(
      isSoftwareWebglRenderer(
        "Google SwiftShader (Subzero) (0x0000C0DE) Direct3D11"
      )
    ).toBe(true);
  });

  it("detects llvmpipe", () => {
    expect(isSoftwareWebglRenderer("Gallium 0.4 on llvmpipe (LLVM 15.0.6)")).toBe(
      true
    );
  });

  it("does not flag hardware GPUs", () => {
    expect(isSoftwareWebglRenderer("Apple M2 Pro")).toBe(false);
    expect(
      isSoftwareWebglRenderer("ANGLE (NVIDIA GeForce RTX 3070 Direct3D11)")
    ).toBe(false);
  });
});

describe("shouldDisableHeavyVisuals", () => {
  it("keeps visuals on a real GPU-backed browser", () => {
    expect(
      shouldDisableHeavyVisuals({
        userAgent: CHROME_MOBILE_UA,
        webdriver: false,
        webglRenderer: "Apple M2 Pro",
        prefersReducedMotion: false,
      })
    ).toBe(false);
  });

  it("disables visuals for Lighthouse/PageSpeed Insights", () => {
    expect(
      shouldDisableHeavyVisuals({
        userAgent: LIGHTHOUSE_MOBILE_UA,
        webdriver: false,
        webglRenderer: "Apple M2 Pro",
        prefersReducedMotion: false,
      })
    ).toBe(true);
  });

  it("disables visuals when navigator.webdriver is set", () => {
    expect(
      shouldDisableHeavyVisuals({
        userAgent: CHROME_MOBILE_UA,
        webdriver: true,
      })
    ).toBe(true);
  });

  it("disables visuals when WebGL falls back to software rendering", () => {
    expect(
      shouldDisableHeavyVisuals({
        userAgent: CHROME_MOBILE_UA,
        webdriver: false,
        webglRenderer: "Google SwiftShader",
        prefersReducedMotion: false,
      })
    ).toBe(true);
  });

  it("disables visuals when WebGL is unavailable", () => {
    expect(
      shouldDisableHeavyVisuals({
        userAgent: CHROME_MOBILE_UA,
        webdriver: false,
        webglRenderer: null,
      })
    ).toBe(true);
  });

  it("respects prefers-reduced-motion", () => {
    expect(
      shouldDisableHeavyVisuals({
        userAgent: CHROME_MOBILE_UA,
        webdriver: false,
        webglRenderer: "Apple M2 Pro",
        prefersReducedMotion: true,
      })
    ).toBe(true);
  });

  it("keeps visuals when the renderer was not probed", () => {
    expect(
      shouldDisableHeavyVisuals({
        userAgent: CHROME_MOBILE_UA,
        webdriver: false,
      })
    ).toBe(false);
  });

  it("keeps visuals when the renderer name is masked", () => {
    expect(
      shouldDisableHeavyVisuals({
        userAgent: CHROME_MOBILE_UA,
        webdriver: false,
        webglRenderer: "unknown",
        prefersReducedMotion: false,
      })
    ).toBe(false);
  });
});
