import { config } from "dotenv";
import { createAdminClient } from "@/lib/supabase/admin";

config({ path: ".env.local" });

const EXPECTED_POLICY_NAMES = [
  "payment_compliance_admin_insert",
  "payment_compliance_admin_read",
  "payment_compliance_admin_update",
  "payment_compliance_service_insert",
  "payment_compliance_service_select",
  "payment_compliance_service_update",
] as const;

type PolicySurfaceResult = {
  table_exists?: boolean;
  policy_names?: string[];
};

async function main() {
  const admin = createAdminClient("admin_operations");
  const adminClient = admin as any;

  const { data, error } = await adminClient.rpc(
    "verify_payment_compliance_policy_surface"
  );

  if (error) {
    const code = String(error.code ?? "");
    if (code === "42883") {
      console.error(
        "verify_payment_compliance_policy_surface() function missing. Apply migration 025_payment_compliance_records.sql first."
      );
      process.exit(2);
    }

    console.error("Failed to verify payment compliance policies", error);
    process.exit(1);
  }

  const payload = (data ?? {}) as PolicySurfaceResult;
  const tableExists = Boolean(payload.table_exists);
  const policyNames = Array.isArray(payload.policy_names)
    ? payload.policy_names
    : [];

  const missingPolicies = EXPECTED_POLICY_NAMES.filter(
    (name) => !policyNames.includes(name)
  );

  console.info(
    JSON.stringify(
      {
        job: "check-payment-compliance-policies",
        tableExists,
        policyNames,
        missingPolicies,
      },
      null,
      2
    )
  );

  if (!tableExists || missingPolicies.length > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error("check-payment-compliance-policies failed", error);
  process.exit(1);
});
