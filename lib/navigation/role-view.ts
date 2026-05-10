export type ViewKey = "admin";

export function resolveViewKey(_pathname: string, _userRole?: string | null): ViewKey {
  return "admin";
}

export function resolveSettingsHref(_pathname: string, _userRole?: string | null): string {
  return "/admin?module=settings";
}
