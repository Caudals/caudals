"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentOperator } from "@/lib/auth/operator-session";
import {
  getActiveOperatorElevation,
  grantOperatorElevation,
  revokeOperatorElevation,
  type OperatorElevationGrant,
} from "@/lib/auth/operator-elevation";
import { PRODUCTION_DB_ELEVATION_SCOPE } from "@/lib/db/operator-elevation";
import {
  actionError,
  parseInput,
  type ActionError,
} from "@/lib/validators/action-envelope";

const grantElevationSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  durationMinutes: z.coerce.number().int().min(5).max(120).default(30),
});

const revokeElevationSchema = z.object({
  elevationId: z.string().trim().min(4).max(80),
  reason: z.string().trim().max(1000).optional(),
});

const elevationRoles = new Set(["admin", "data_engineer"]);

export type OperatorElevationStatus = {
  enforcementEnabled: boolean;
  serviceRoleEnabled: boolean;
  currentOperatorId: string;
  targetOperatorId: string;
  targetIsCurrentOperator: boolean;
  scope: typeof PRODUCTION_DB_ELEVATION_SCOPE;
  canManage: boolean;
  activeGrant: OperatorElevationGrant | null;
};

export type OperatorElevationStatusResult =
  | { ok: true; status: OperatorElevationStatus }
  | ActionError;

export type OperatorElevationMutationResult =
  | {
      ok: true;
      status: OperatorElevationStatus;
      grant: OperatorElevationGrant | null;
    }
  | ActionError;

function resolveTargetOperatorId(currentOperatorId: string) {
  return process.env.OPERATOR_CONSOLE_OPERATOR_ID ?? currentOperatorId;
}

function canManageElevation(role: string) {
  return elevationRoles.has(role);
}

async function buildCurrentOperatorElevationStatus(): Promise<
  OperatorElevationStatusResult
> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  const targetOperatorId = resolveTargetOperatorId(session.operator.id);
  const activeGrant = await getActiveOperatorElevation({
    orgId,
    operatorId: targetOperatorId,
    scope: PRODUCTION_DB_ELEVATION_SCOPE,
  });

  return {
    ok: true,
    status: {
      enforcementEnabled:
        process.env.OPERATOR_CONSOLE_REQUIRE_JIT_ELEVATION === "true",
      serviceRoleEnabled: process.env.OPERATOR_CONSOLE_SERVICE_ROLE === "true",
      currentOperatorId: session.operator.id,
      targetOperatorId,
      targetIsCurrentOperator: targetOperatorId === session.operator.id,
      scope: PRODUCTION_DB_ELEVATION_SCOPE,
      canManage: canManageElevation(session.operator.role),
      activeGrant,
    },
  };
}

export async function getCurrentOperatorElevationStatus(): Promise<
  OperatorElevationStatusResult
> {
  return buildCurrentOperatorElevationStatus();
}

export async function grantCurrentOperatorElevation(
  input: unknown
): Promise<OperatorElevationMutationResult> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  if (!canManageElevation(session.operator.role)) {
    return actionError(
      "FORBIDDEN",
      "Only admin and data engineer operators can grant production DB elevation"
    );
  }

  const parsed = parseInput(grantElevationSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const targetOperatorId = resolveTargetOperatorId(session.operator.id);
  const grant = await grantOperatorElevation({
    orgId,
    operatorId: targetOperatorId,
    actorOperatorId: session.operator.id,
    reason: parsed.data.reason,
    durationMinutes: parsed.data.durationMinutes,
    scope: PRODUCTION_DB_ELEVATION_SCOPE,
    metadata: {
      source: "operator_console",
      requested_by: session.operator.id,
    },
  });
  const statusResult = await buildCurrentOperatorElevationStatus();

  revalidatePath("/admin");

  if ("error" in statusResult) {
    return statusResult;
  }

  return {
    ok: true,
    grant,
    status: statusResult.status,
  };
}

export async function revokeCurrentOperatorElevation(
  input: unknown
): Promise<OperatorElevationMutationResult> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  if (!canManageElevation(session.operator.role)) {
    return actionError(
      "FORBIDDEN",
      "Only admin and data engineer operators can revoke production DB elevation"
    );
  }

  const parsed = parseInput(revokeElevationSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const targetOperatorId = resolveTargetOperatorId(session.operator.id);
  const grant = await revokeOperatorElevation({
    orgId,
    operatorId: targetOperatorId,
    actorOperatorId: session.operator.id,
    elevationId: parsed.data.elevationId,
    reason: parsed.data.reason,
  });

  if (!grant) {
    return actionError("NOT_FOUND", "No active elevation grant was found");
  }

  const statusResult = await buildCurrentOperatorElevationStatus();

  revalidatePath("/admin");

  if ("error" in statusResult) {
    return statusResult;
  }

  return {
    ok: true,
    grant,
    status: statusResult.status,
  };
}
