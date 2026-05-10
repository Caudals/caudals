const PHASE_ONE_HIDDEN_SURFACE_PREFIXES = [
  "/browse",
  "/contributor",
  "/dashboard",
  "/pwa",
  "/requester",
];

function normalizePathname(pathname: string) {
  if (!pathname) {
    return "/";
  }

  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function isLegacySelfServeEnabled() {
  return process.env.ENABLE_LEGACY_SELF_SERVE === "true";
}

export function isPhaseOneHiddenSurfacePath(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  return PHASE_ONE_HIDDEN_SURFACE_PREFIXES.some(
    (prefix) =>
      normalizedPathname === prefix ||
      normalizedPathname.startsWith(`${prefix}/`)
  );
}

export function shouldBlockPhaseOneHiddenSurface(pathname: string) {
  return !isLegacySelfServeEnabled() && isPhaseOneHiddenSurfacePath(pathname);
}
