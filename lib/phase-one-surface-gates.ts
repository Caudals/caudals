const PHASE_ONE_HIDDEN_SURFACE_PREFIXES: string[] = [];

const PHASE_ONE_REMOVED_SURFACE_PREFIXES = [
  "/browse",
  "/contributor",
  "/dashboard",
  "/pwa",
  "/requester",
];
const PHASE_ONE_HIDDEN_ADMIN_PREFIXES = ["/admin/"];

function normalizePathname(pathname: string) {
  if (!pathname) {
    return "/";
  }

  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function isPhaseOneHiddenSurfacePath(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  return PHASE_ONE_HIDDEN_SURFACE_PREFIXES.some(
    (prefix) =>
      normalizedPathname === prefix ||
      normalizedPathname.startsWith(`${prefix}/`)
  );
}

export function isPhaseOneRemovedSurfacePath(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  return PHASE_ONE_REMOVED_SURFACE_PREFIXES.some(
    (prefix) =>
      normalizedPathname === prefix ||
      normalizedPathname.startsWith(`${prefix}/`)
  );
}

export function isPhaseOneHiddenAdminPath(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  return PHASE_ONE_HIDDEN_ADMIN_PREFIXES.some((prefix) =>
    normalizedPathname.startsWith(prefix)
  );
}

export function shouldBlockPhaseOneHiddenSurface(pathname: string) {
  return (
    isPhaseOneRemovedSurfacePath(pathname) ||
    isPhaseOneHiddenAdminPath(pathname)
  );
}
