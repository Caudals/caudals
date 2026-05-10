import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getBetterAuth } from "@/lib/auth/better-auth";
import { queryRows } from "@/lib/db/client";

export type OperatorRole =
  | "admin"
  | "operations"
  | "data_engineer"
  | "privacy"
  | "qa"
  | "commercial";

export type CurrentOperator = {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
  orgId: string | null;
  mfaRequired: boolean;
  webauthnRequired: boolean;
};

export type CurrentOperatorSession = {
  authUser: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
    twoFactorEnabled: boolean;
    passkeyCount: number;
  };
  operator: CurrentOperator;
};

type OperatorRow = {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
  orgId: string | null;
  mfaRequired: boolean;
  webauthnRequired: boolean;
  twoFactorEnabled: boolean | null;
  passkeyCount: number | string;
};

export async function getCurrentOperatorSession(
  headerStore?: Headers
): Promise<CurrentOperatorSession | null> {
  const session = await getBetterAuth().api.getSession({
    headers: headerStore ?? (await headers()),
  });

  if (!session?.user.email) {
    return null;
  }

  const [operator] = await queryRows<OperatorRow>(
    `
      SELECT
        id,
        email::text,
        name,
        role,
        org_id AS "orgId",
        mfa_required AS "mfaRequired",
        webauthn_required AS "webauthnRequired",
        (
          SELECT "twoFactorEnabled"
          FROM "auth_user"
          WHERE "id" = $2
          LIMIT 1
        ) AS "twoFactorEnabled",
        (
          SELECT count(*)::int
          FROM "auth_passkey"
          WHERE "userId" = $2
        ) AS "passkeyCount"
      FROM "operator"
      WHERE email = $1::citext
        AND state = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [session.user.email, session.user.id]
  );

  if (!operator) {
    return null;
  }

  return {
    authUser: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      twoFactorEnabled: operator.twoFactorEnabled === true,
      passkeyCount: Number(operator.passkeyCount),
    },
    operator,
  };
}

export async function requireCurrentOperator() {
  const session = await getCurrentOperatorSession();

  if (!session) {
    redirect("/auth/sign-in");
  }

  return session;
}
