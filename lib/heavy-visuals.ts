/**
 * Guards for GPU-heavy decorative visuals (WebGL scenes, shader backgrounds).
 *
 * Runtimes such as Lighthouse/PageSpeed Insights, headless Chrome, and CI
 * browsers have no hardware WebGL. Chrome falls back to software rasterization
 * (SwiftShader), where a continuous `requestAnimationFrame` render loop
 * saturates the main thread indefinitely: the page never reaches CPU idle, so
 * Lighthouse keeps waiting for quiescence until its budget expires and the
 * audit fails with a timeout.
 *
 * These helpers let decorative scenes drop to a static fallback in exactly the
 * environments where they would otherwise never settle.
 */

/** User agents that identify automated auditing/crawling browsers. */
const AUTOMATION_USER_AGENT_PATTERN =
  /HeadlessChrome|Lighthouse|PageSpeed|Chrome-Lighthouse|GTmetrix|Pingdom|PhantomJS|Puppeteer|Playwright/i;

/**
 * WebGL renderer strings that mean "no GPU": Chrome's software rasterizer, and
 * the common Linux/Windows software fallbacks.
 */
const SOFTWARE_WEBGL_RENDERER_PATTERN =
  /SwiftShader|Software|llvmpipe|Microsoft Basic Render|Mesa OffScreen/i;

export interface HeavyVisualsEnvironment {
  userAgent?: string | null;
  /** `navigator.webdriver` — set by Lighthouse, Playwright, Selenium, etc. */
  webdriver?: boolean;
  /** `UNMASKED_RENDERER_WEBGL` string, or null when WebGL is unavailable. */
  webglRenderer?: string | null;
  /** Whether the user asked the OS to reduce motion. */
  prefersReducedMotion?: boolean;
}

export function isAutomatedUserAgent(userAgent?: string | null): boolean {
  if (!userAgent) return false;
  return AUTOMATION_USER_AGENT_PATTERN.test(userAgent);
}

export function isSoftwareWebglRenderer(renderer?: string | null): boolean {
  if (!renderer) return false;
  return SOFTWARE_WEBGL_RENDERER_PATTERN.test(renderer);
}

/**
 * Pure decision function: should GPU-heavy decorative visuals be replaced by a
 * static fallback in this environment?
 */
export function shouldDisableHeavyVisuals({
  userAgent,
  webdriver,
  webglRenderer,
  prefersReducedMotion,
}: HeavyVisualsEnvironment): boolean {
  if (webdriver === true) return true;
  if (isAutomatedUserAgent(userAgent)) return true;
  if (prefersReducedMotion === true) return true;

  // `undefined` means "not probed" — only treat an explicit probe result as a
  // signal, so callers that cannot inspect WebGL do not disable visuals.
  if (webglRenderer !== undefined) {
    if (webglRenderer === null) return true;
    if (isSoftwareWebglRenderer(webglRenderer)) return true;
  }

  return false;
}

/**
 * Reads the unmasked WebGL renderer name, or `null` when a WebGL context (or
 * the debug extension) is unavailable. Creates and discards a throwaway canvas.
 */
export function probeWebglRenderer(): string | null {
  if (typeof document === "undefined") return null;

  let gl: WebGLRenderingContext | null = null;
  try {
    const canvas = document.createElement("canvas");
    gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (!gl) return null;

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) {
      // WebGL exists but the renderer name is masked. Treat as usable.
      return "unknown";
    }

    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === "string" && renderer ? renderer : "unknown";
  } catch {
    return null;
  } finally {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

export interface DetectHeavyVisualsOptions {
  /**
   * Also drop to the static fallback when the OS requests reduced motion.
   * Off by default: it is an accessibility improvement rather than part of the
   * capability check, and it visibly changes the page for GPU-backed visitors
   * who have the setting enabled. Opt in per surface.
   */
  respectReducedMotion?: boolean;
}

/**
 * Browser-side convenience wrapper. Must only be called from an effect (it
 * touches `window`/`document`), never during render or SSR.
 */
export function detectHeavyVisualsDisabled({
  respectReducedMotion = false,
}: DetectHeavyVisualsOptions = {}): boolean {
  if (typeof window === "undefined") return true;

  return shouldDisableHeavyVisuals({
    userAgent: window.navigator.userAgent,
    webdriver: window.navigator.webdriver === true,
    webglRenderer: probeWebglRenderer(),
    prefersReducedMotion:
      respectReducedMotion &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
}
