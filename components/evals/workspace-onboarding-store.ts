"use client";

/**
 * One shared copy of each workspace's onboarding state (launch L-06,
 * `GET/PATCH /api/evals/v1/workspace/onboarding`): the activation checklist,
 * the welcome answers and the owner's "hide the example evaluation" choice
 * (launch L-33). The checklist, the example's entry points and Settings read
 * the same copy, so a change made in one place shows everywhere without a
 * second request.
 */
import { useEffect, useSyncExternalStore } from "react";
import { evalRequest } from "./api";
import type { WorkspaceOnboarding } from "@/lib/evals/onboarding/config";

export type OnboardingUpdate =
  | { action: "dismiss" | "restore" | "skip" | "hide_example" | "show_example" }
  | { action: "answer"; systemType: string | null; goal: string | null };

const values = new Map<string, WorkspaceOnboarding>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const isState = (value: unknown): value is WorkspaceOnboarding =>
  !!value && typeof value === "object" && !Array.isArray(value) && "steps" in value;

/** Loads (or reloads) a workspace's state. Failures keep the last copy: the state is never required. */
export function loadWorkspaceOnboarding(orgId: string): Promise<void> {
  const running = inflight.get(orgId);
  if (running) return running;
  const request = evalRequest<unknown>(`/workspace/onboarding?orgId=${encodeURIComponent(orgId)}`)
    .then((value) => {
      if (isState(value)) {
        values.set(orgId, value);
        emit();
      }
    })
    .catch(() => {})
    .finally(() => inflight.delete(orgId));
  inflight.set(orgId, request);
  return request;
}

/** Saves a change and shares the answer with every reader. Throws the API's message on failure. */
export async function updateWorkspaceOnboarding(orgId: string, body: OnboardingUpdate): Promise<WorkspaceOnboarding> {
  const next = await evalRequest<WorkspaceOnboarding>("/workspace/onboarding", "PATCH", { orgId, ...body });
  values.set(orgId, next);
  emit();
  return next;
}

/**
 * The workspace's state, loaded when `active` and refreshed whenever
 * `refreshKey` changes. Null until loaded, when inactive or without a workspace.
 */
export function useOnboardingState(orgId: string, active: boolean, refreshKey?: unknown): WorkspaceOnboarding | null {
  const value = useSyncExternalStore(subscribe, () => (orgId ? values.get(orgId) ?? null : null), () => null);
  useEffect(() => {
    if (active && orgId) void loadWorkspaceOnboarding(orgId);
  }, [active, orgId, refreshKey]);
  return active ? value : null;
}
