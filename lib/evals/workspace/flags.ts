/** Workspace Home (launch L-22): read on the server at request time. Off unless `WORKSPACE_HOME_ENABLED=true`. */
export function workspaceHomeEnabled(env: Record<string, string | undefined> = process.env) {
  return env.WORKSPACE_HOME_ENABLED === "true";
}

export const WORKSPACE_HOME_PATH = "/workspace/home";

/**
 * Where a signed-in person lands (`/evaluation-entry`, the app root and the
 * brand link): operators on the Operations overview, workspace members on
 * Home when it is on (else the evaluations list), everyone else on their
 * invitations.
 */
export function landingPath(
  identity: { platformRole: string | null; workspaces: unknown[] },
  env: Record<string, string | undefined> = process.env,
) {
  if (identity.platformRole === "operator" || identity.platformRole === "platform_admin") return "/ops";
  if (!identity.workspaces.length) return "/workspace/invitations";
  return workspaceHomeEnabled(env) ? WORKSPACE_HOME_PATH : "/workspace/evaluations";
}
