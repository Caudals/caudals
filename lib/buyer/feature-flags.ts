export function isBuyerWorkspaceV1Enabled(env: NodeJS.ProcessEnv = process.env) {
  return env.BUYER_WORKSPACE_V1_ENABLED !== "false";
}
