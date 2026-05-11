export type LicensePermissions = {
  train: boolean;
  finetune: boolean;
  eval: boolean;
  commercialInference: boolean;
  redistribute: boolean;
};

export type LicenseGrant = {
  id: string;
  permissions: LicensePermissions;
  geo: readonly string[];
  termStartsAt?: string | null;
  termEndsAt?: string | null;
  exclusivity?: "none" | "exclusive" | "category";
  shareAlike?: boolean;
};

export type RequestedUse = Partial<LicensePermissions> & {
  geo?: readonly string[];
};

export type ComposedLicense = {
  permissions: LicensePermissions;
  geo: string[];
  termStartsAt: string | null;
  termEndsAt: string | null;
  exclusivity: "none" | "exclusive" | "category";
  shareAlike: boolean;
  sourceClauseIds: string[];
  blockedReasons: string[];
};

const permissionKeys = [
  "train",
  "finetune",
  "eval",
  "commercialInference",
  "redistribute",
] as const;

const worldWide = "WW";

function normalizeGeo(geo: readonly string[]): string[] {
  const normalized = geo.map((entry) => entry.trim().toUpperCase()).filter(Boolean);
  return Array.from(new Set(normalized.length > 0 ? normalized : [worldWide]));
}

function intersectGeo(left: string[], right: string[]): string[] {
  if (left.includes(worldWide) && right.includes(worldWide)) {
    return [worldWide];
  }

  if (left.includes(worldWide)) {
    return right.filter((entry) => entry !== worldWide);
  }

  if (right.includes(worldWide)) {
    return left.filter((entry) => entry !== worldWide);
  }

  return left.filter((entry) => right.includes(entry));
}

function maxIso(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function minIso(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function composeExclusivity(
  current: ComposedLicense["exclusivity"],
  next: LicenseGrant["exclusivity"]
): ComposedLicense["exclusivity"] {
  if (current === "exclusive" || next === "exclusive") {
    return "exclusive";
  }

  if (current === "category" || next === "category") {
    return "category";
  }

  return "none";
}

function hasAnyPermission(permissions: LicensePermissions): boolean {
  return permissionKeys.some((key) => permissions[key]);
}

export function composeLicenseGrants(grants: readonly LicenseGrant[]): ComposedLicense {
  if (grants.length === 0) {
    throw new Error("At least one license grant is required");
  }

  const [firstGrant, ...remainingGrants] = grants;
  const composed: ComposedLicense = {
    permissions: { ...firstGrant.permissions },
    geo: normalizeGeo(firstGrant.geo),
    termStartsAt: firstGrant.termStartsAt ?? null,
    termEndsAt: firstGrant.termEndsAt ?? null,
    exclusivity: firstGrant.exclusivity ?? "none",
    shareAlike: firstGrant.shareAlike ?? false,
    sourceClauseIds: [firstGrant.id],
    blockedReasons: [],
  };

  for (const grant of remainingGrants) {
    for (const key of permissionKeys) {
      composed.permissions[key] = composed.permissions[key] && grant.permissions[key];
    }

    composed.geo = intersectGeo(composed.geo, normalizeGeo(grant.geo));
    composed.termStartsAt = maxIso(composed.termStartsAt, grant.termStartsAt ?? null);
    composed.termEndsAt = minIso(composed.termEndsAt, grant.termEndsAt ?? null);
    composed.exclusivity = composeExclusivity(composed.exclusivity, grant.exclusivity);
    composed.shareAlike = composed.shareAlike || (grant.shareAlike ?? false);
    composed.sourceClauseIds.push(grant.id);
  }

  if (!hasAnyPermission(composed.permissions)) {
    composed.blockedReasons.push("No permitted uses remain after license intersection");
  }

  if (composed.geo.length === 0) {
    composed.blockedReasons.push("No geography remains after license intersection");
  }

  if (
    composed.termStartsAt &&
    composed.termEndsAt &&
    composed.termStartsAt > composed.termEndsAt
  ) {
    composed.blockedReasons.push("No valid term remains after license intersection");
  }

  return composed;
}

export function evaluateRequestedUse(
  composed: ComposedLicense,
  requestedUse: RequestedUse
): { allowed: true } | { allowed: false; reasons: string[] } {
  const reasons = [...composed.blockedReasons];

  for (const key of permissionKeys) {
    if (requestedUse[key] === true && !composed.permissions[key]) {
      reasons.push(`Requested use requires ${key}, but the composed license forbids it`);
    }
  }

  if (requestedUse.geo && requestedUse.geo.length > 0) {
    const requestedGeo = normalizeGeo(requestedUse.geo);
    const allowedGeo =
      composed.geo.includes(worldWide) ||
      requestedGeo.every((entry) => composed.geo.includes(entry));

    if (!allowedGeo) {
      reasons.push(
        `Requested geography ${requestedGeo.join(", ")} is outside composed geography ${composed.geo.join(", ")}`
      );
    }
  }

  return reasons.length === 0
    ? { allowed: true }
    : { allowed: false, reasons };
}

export function isBuildPlanBlockedForLicense(
  grants: readonly LicenseGrant[],
  requestedUse: RequestedUse
): { blocked: false; composed: ComposedLicense } | {
  blocked: true;
  composed: ComposedLicense;
  reasons: string[];
} {
  const composed = composeLicenseGrants(grants);
  const evaluation = evaluateRequestedUse(composed, requestedUse);

  if (evaluation.allowed) {
    return { blocked: false, composed };
  }

  return {
    blocked: true,
    composed,
    reasons: evaluation.reasons,
  };
}
