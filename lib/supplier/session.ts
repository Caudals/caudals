import "server-only";

import { headers } from "next/headers";

import { getBetterAuth } from "@/lib/auth/better-auth";
import {
  queryRows,
  type OperatorDbSession,
  type QueryValue,
} from "@/lib/db/client";

export const supplierMemberRoles = [
  "supplier",
  "supplier_admin",
  "supplier_viewer",
] as const;

export type SupplierMemberRole = (typeof supplierMemberRoles)[number];

export type SupplierAuthUser = {
  id: string;
  email: string;
  name: string;
};

export type CurrentSupplierSession = {
  authUser: SupplierAuthUser;
  supplier: {
    id: string;
    displayName: string;
    legalName: string;
    jurisdiction: string | null;
  };
  authOrganization: {
    id: string;
    name: string;
  };
  tenantOrgId: string;
  role: SupplierMemberRole;
};

export type SupplierSessionLookup =
  | { status: "unauthenticated" }
  | { status: "unauthorized"; authUser: SupplierAuthUser }
  | { status: "authorized"; session: CurrentSupplierSession };

type QueryRows = <T extends Record<string, unknown>>(
  sql: string,
  values?: QueryValue[],
  session?: OperatorDbSession,
) => Promise<T[]>;

type SupplierMemberRow = {
  memberRole: string;
  authOrganizationId: string;
  authOrganizationName: string;
  metadata: string | Record<string, unknown> | null;
};

type SupplierOrganizationRow = {
  supplierOrgId: string;
  displayName: string;
  legalName: string;
  jurisdiction: string | null;
  tenantOrgId: string;
};

type SupplierOrganizationMetadata = {
  domainOrgId: string;
  tenantOrgId: string;
  surface: "supplier";
};

const supplierRoleSet = new Set<string>(supplierMemberRoles);

function isSupplierMemberRole(value: string): value is SupplierMemberRole {
  return supplierRoleSet.has(value);
}

function parseMetadataValue(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseSupplierOrganizationMetadata(
  value: unknown,
): SupplierOrganizationMetadata | null {
  const metadata = parseMetadataValue(value);

  if (!metadata) {
    return null;
  }

  if (
    metadata.surface !== "supplier" ||
    typeof metadata.domainOrgId !== "string" ||
    typeof metadata.tenantOrgId !== "string"
  ) {
    return null;
  }

  return {
    surface: "supplier",
    domainOrgId: metadata.domainOrgId,
    tenantOrgId: metadata.tenantOrgId,
  };
}

export async function resolveSupplierAccessForAuthUser(
  authUser: SupplierAuthUser,
  query: QueryRows = queryRows,
): Promise<CurrentSupplierSession | null> {
  const memberRows = await query<SupplierMemberRow>(
    `
      SELECT
        m.role AS "memberRole",
        m."organizationId" AS "authOrganizationId",
        o.name AS "authOrganizationName",
        o.metadata
      FROM "auth_member" m
      JOIN "auth_organization" o ON o.id = m."organizationId"
      WHERE m."userId" = $1
      ORDER BY
        CASE
          WHEN m.role = 'supplier_admin' THEN 0
          WHEN m.role = 'supplier' THEN 1
          WHEN m.role = 'supplier_viewer' THEN 2
          ELSE 3
        END,
        m."createdAt" DESC
    `,
    [authUser.id],
  );

  for (const member of memberRows) {
    if (!isSupplierMemberRole(member.memberRole)) {
      continue;
    }

    const metadata = parseSupplierOrganizationMetadata(member.metadata);

    if (!metadata) {
      continue;
    }

    const [supplierOrg] = await query<SupplierOrganizationRow>(
      `
        SELECT
          id AS "supplierOrgId",
          display_name AS "displayName",
          legal_name AS "legalName",
          jurisdiction,
          org_id AS "tenantOrgId"
        FROM organization
        WHERE id = $1
          AND org_id = $2
          AND kind = 'supplier'
          AND state = 'active'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [metadata.domainOrgId, metadata.tenantOrgId],
      { orgId: metadata.tenantOrgId },
    );

    if (!supplierOrg) {
      continue;
    }

    return {
      authUser,
      supplier: {
        id: supplierOrg.supplierOrgId,
        displayName: supplierOrg.displayName,
        legalName: supplierOrg.legalName,
        jurisdiction: supplierOrg.jurisdiction,
      },
      authOrganization: {
        id: member.authOrganizationId,
        name: member.authOrganizationName,
      },
      tenantOrgId: supplierOrg.tenantOrgId,
      role: member.memberRole,
    };
  }

  return null;
}

export async function getCurrentSupplierSession(
  headerStore?: Headers,
): Promise<SupplierSessionLookup> {
  const session = await getBetterAuth().api.getSession({
    headers: headerStore ?? (await headers()),
  });

  if (!session?.user?.id || !session.user.email) {
    return { status: "unauthenticated" };
  }

  const authUser = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? session.user.email,
  };
  const supplierSession = await resolveSupplierAccessForAuthUser(authUser);

  if (!supplierSession) {
    return { status: "unauthorized", authUser };
  }

  return { status: "authorized", session: supplierSession };
}
