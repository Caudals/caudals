export function isSupplierPortalEnabled(env = process.env) {
  return env.SUPPLIER_PORTAL_ENABLED !== "false";
}
