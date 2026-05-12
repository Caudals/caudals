export function isSupplierPortalEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.SUPPLIER_PORTAL_ENABLED !== "false";
}

export function isSupplierPortalV1Enabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.SUPPLIER_PORTAL_V1_ENABLED !== "false";
}
