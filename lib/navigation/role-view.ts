export type ViewKey = "requester" | "contributor" | "admin";

export function resolveViewKey(pathname: string, userRole?: string | null): ViewKey {
  if (pathname.startsWith("/admin")) {
    return "admin";
  }
  if (pathname.startsWith("/contributor")) {
    return "contributor";
  }
  if (pathname.startsWith("/requester")) {
    return "requester";
  }

  if (userRole === "admin") {
    return "admin";
  }
  if (userRole === "contributor") {
    return "contributor";
  }
  return "requester";
}

export function resolveSettingsHref(pathname: string, userRole?: string | null): string {
  const viewKey = resolveViewKey(pathname, userRole);

  if (viewKey === "admin") {
    return "/admin/settings";
  }
  if (viewKey === "contributor") {
    return "/contributor/settings";
  }
  return "/requester/settings";
}
