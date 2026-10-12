/**
 * In-process circuit breakers for the demo's two model routes. After an
 * availability failure (rate limit, timeout, unreachable, 5xx, spending limit)
 * a route is skipped for a cool-down, so later calls fail over at once and the
 * queue holds runs instead of admitting them into a failure. The web app runs
 * as one replica; a restart simply closes both circuits.
 */

export type Route = "primary" | "fallback";

type State = { downUntil: number; code: string | null; at: number };

declare global {
  var __caudalsDemoHealth: Record<Route, State> | undefined;
}

function state() {
  globalThis.__caudalsDemoHealth ??= {
    primary: { downUntil: 0, code: null, at: 0 },
    fallback: { downUntil: 0, code: null, at: 0 },
  };
  return globalThis.__caudalsDemoHealth;
}

/** Codes that mean "this route cannot serve right now", as opposed to one bad reply. */
export function isAvailabilityCode(code: string) {
  return /^(model_rate_limited|model_unreachable|model_timeout|model_http_5\d\d|model_http_40[23]|model_http_429|model_overloaded|demo_quota_exhausted|fallback_cap|fallback_unconfigured)$/.test(code);
}

/** Cool-down per failure: a spending limit or an exhausted quota lasts longer than a rate limit. */
export function coolDownMs(route: Route, code: string) {
  if (/^model_http_40[23]$|fallback_unconfigured/.test(code)) return 15 * 60_000;
  if (code === "demo_quota_exhausted" || code === "fallback_cap") return 5 * 60_000;
  return route === "primary" ? 2 * 60_000 : 60_000;
}

export function markDown(route: Route, code: string, now = Date.now()) {
  state()[route] = { downUntil: now + coolDownMs(route, code), code, at: now };
}

export function markUp(route: Route) {
  const current = state()[route];
  if (current.downUntil) state()[route] = { downUntil: 0, code: null, at: Date.now() };
}

export function isDown(route: Route, now = Date.now()) {
  return state()[route].downUntil > now;
}

export function health(now = Date.now()) {
  const s = state();
  return {
    primary: { down: s.primary.downUntil > now, code: s.primary.downUntil > now ? s.primary.code : null },
    fallback: { down: s.fallback.downUntil > now, code: s.fallback.downUntil > now ? s.fallback.code : null },
  };
}

/** Tests only. */
export function resetHealth() {
  globalThis.__caudalsDemoHealth = undefined;
}
