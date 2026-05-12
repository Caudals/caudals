import "server-only";

import { headers } from "next/headers";

import { getBetterAuth } from "@/lib/auth/better-auth";
import {
  queryRows,
  type OperatorDbSession,
  type QueryValue,
} from "@/lib/db/client";

export const buyerMemberRoles = [
  "buyer",
  "buyer_admin",
  "buyer_viewer",
] as const;

export type BuyerMemberRole = (typeof buyerMemberRoles)[number];

export type BuyerAuthUser = {
  id: string;
  email: string;
  name: string;
};

export type CurrentBuyerSession = {
  authUser: BuyerAuthUser;
  buyer: {
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
  role: BuyerMemberRole;
};

export type BuyerSessionLookup =
  | { status: "unauthenticated" }
  | { status: "unauthorized"; authUser: BuyerAuthUser }
  | { status: "authorized"; session: CurrentBuyerSession };

type QueryRows = <T extends Record<string, unknown>>(
  sql: string,
  values?: QueryValue[],
  session?: OperatorDbSession,
) => Promise<T[]>;

type BuyerMemberRow = {
  memberRole: string;
  authOrganizationId: string;
  authOrganizationName: string;
  metadata: string | Record<string, unknown> | null;
};

type BuyerOrganizationRow = {
  buyerOrgId: string;
  displayName: string;
  legalName: string;
  jurisdiction: string | null;
  tenantOrgId: string;
};

type BuyerOrganizationMetadata = {
  domainOrgId: string;
  tenantOrgId: string;
  surface: "buyer";
};

const buyerRoleSet = new Set<string>(buyerMemberRoles);

function isBuyerMemberRole(value: string): value is BuyerMemberRole {
  return buyerRoleSet.has(value);
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

export function parseBuyerOrganizationMetadata(
  value: unknown,
): BuyerOrganizationMetadata | null {
  const metadata = parseMetadataValue(value);

  if (!metadata) {
    return null;
  }

  if (
    metadata.surface !== "buyer" ||
    typeof metadata.domainOrgId !== "string" ||
    typeof metadata.tenantOrgId !== "string"
  ) {
    return null;
  }

  return {
    surface: "buyer",
    domainOrgId: metadata.domainOrgId,
    tenantOrgId: metadata.tenantOrgId,
  };
}

export async function resolveBuyerAccessForAuthUser(
  authUser: BuyerAuthUser,
  query: QueryRows = queryRows,
): Promise<CurrentBuyerSession | null> {
  const memberRows = await query<BuyerMemberRow>(
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
          WHEN m.role = 'buyer_admin' THEN 0
          WHEN m.role = 'buyer' THEN 1
          WHEN m.role = 'buyer_viewer' THEN 2
          ELSE 3
        END,
        m."createdAt" DESC
    `,
    [authUser.id],
  );

  for (const member of memberRows) {
    if (!isBuyerMemberRole(member.memberRole)) {
      continue;
    }

    const metadata = parseBuyerOrganizationMetadata(member.metadata);

    if (!metadata) {
      continue;
    }

    const [buyerOrg] = await query<BuyerOrganizationRow>(
      `
        SELECT
          id AS "buyerOrgId",
          display_name AS "displayName",
          legal_name AS "legalName",
          jurisdiction,
          org_id AS "tenantOrgId"
        FROM organization
        WHERE id = $1
          AND org_id = $2
          AND kind = 'buyer'
          AND state = 'active'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [metadata.domainOrgId, metadata.tenantOrgId],
      { orgId: metadata.tenantOrgId },
    );

    if (!buyerOrg) {
      continue;
    }

    return {
      authUser,
      buyer: {
        id: buyerOrg.buyerOrgId,
        displayName: buyerOrg.displayName,
        legalName: buyerOrg.legalName,
        jurisdiction: buyerOrg.jurisdiction,
      },
      authOrganization: {
        id: member.authOrganizationId,
        name: member.authOrganizationName,
      },
      tenantOrgId: buyerOrg.tenantOrgId,
      role: member.memberRole,
    };
  }

  return null;
}

export async function getCurrentBuyerSession(
  headerStore?: Headers,
): Promise<BuyerSessionLookup> {
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
  const buyerSession = await resolveBuyerAccessForAuthUser(authUser);

  if (!buyerSession) {
    return { status: "unauthorized", authUser };
  }

  return { status: "authorized", session: buyerSession };
}
