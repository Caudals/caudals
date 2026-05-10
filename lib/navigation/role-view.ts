export type ViewKey = "requester" | "admin";

export function resolveViewKey(pathname: string, userRole?: string | null): ViewKey {
  if (pathname.startsWith("/admin")) {
    return "admin";
  }
  if (pathname.startsWith("/requester")) {
    return "requester";
  }

  if (userRole === "admin") {
    return "admin";
  }
  return "requester";
}

export function resolveSettingsHref(pathname: string, userRole?: string | null): string {
  const viewKey = resolveViewKey(pathname, userRole);

  if (viewKey === "admin") {
    return "/admin?module=settings";
  }
  return "/requester/settings";
}
