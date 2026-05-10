"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  createOperatorConsoleRepository,
  isOperatorTransitionConflictError,
  type PersistOperatorTransitionResult,
} from "@/lib/operator/console-repository";
import {
  checkTransition,
  type WorkflowName,
} from "@/lib/operator/workflows";
import {
  actionError,
  parseInput,
  type ActionError,
} from "@/lib/validators/action-envelope";

const workflowNameSchema = z.enum([
  "buyer_opportunity",
  "supplier_opportunity",
  "build",
  "run",
  "label_batch",
  "contract",
  "delivery",
  "dsar",
]);

const transitionSchema = z.object({
  workflow: workflowNameSchema,
  targetId: z.string().trim().min(4).max(80),
  fromState: z.string().trim().min(1).max(80),
  toState: z.string().trim().min(1).max(80),
  reason: z.string().trim().max(500).optional(),
});

export async function getOperatorConsoleOverview() {
  const repository = createOperatorConsoleRepository();
  return { data: await repository.getSnapshot() };
}

type OperatorTransitionActionResult =
  | ({ ok: true } & PersistOperatorTransitionResult)
  | ActionError;

export async function transitionOperatorWorkflow(
  input: unknown
): Promise<OperatorTransitionActionResult> {
  const parsed = parseInput(transitionSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const transition = checkTransition(
    parsed.data.workflow as WorkflowName,
    parsed.data.fromState,
    parsed.data.toState
  );

  if (!transition.ok) {
    return actionError("CONFLICT", transition.reason);
  }

  const repository = createOperatorConsoleRepository();

  try {
    const result = await repository.persistTransition({
      workflow: parsed.data.workflow as WorkflowName,
      targetId: parsed.data.targetId,
      fromState: parsed.data.fromState,
      toState: parsed.data.toState,
      reason: parsed.data.reason,
    });

    revalidatePath("/admin");

    return {
      ok: true,
      ...result,
    };
  } catch (error) {
    if (isOperatorTransitionConflictError(error)) {
      return actionError("CONFLICT", error.message);
    }

    throw error;
  }
}

export async function validateOperatorTransition(
  input: unknown
): Promise<OperatorTransitionActionResult> {
  return transitionOperatorWorkflow(input);
}
