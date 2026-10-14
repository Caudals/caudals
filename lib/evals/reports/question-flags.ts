/**
 * "Ask your report" rollout (launch L-36). Read on the server at request
 * time; off unless REPORT_QUESTIONS_ENABLED=true (every workspace) or the
 * workspace is listed in REPORT_QUESTIONS_WORKSPACE_IDS (internal workspaces
 * first). Erasing a stored question works whatever the flag says.
 */
type Env = Record<string, string | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function reportQuestionWorkspaceIds(env: Env = process.env): Set<string> {
  return new Set((env.REPORT_QUESTIONS_WORKSPACE_IDS ?? "").split(",").map((id) => id.trim().toLowerCase()).filter((id) => UUID.test(id)));
}

export function reportQuestionsEnabledFor(orgId: string, env: Env = process.env): boolean {
  return env.REPORT_QUESTIONS_ENABLED?.trim() === "true" || reportQuestionWorkspaceIds(env).has(orgId.toLowerCase());
}

/** Whether any workspace may see the panel (a hint for the report page; the API decides per workspace). */
export function reportQuestionsConfigured(env: Env = process.env): boolean {
  return env.REPORT_QUESTIONS_ENABLED?.trim() === "true" || reportQuestionWorkspaceIds(env).size > 0;
}
