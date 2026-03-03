import { config } from "dotenv";
import { createAdminClient } from "@/lib/supabase/admin";

config({ path: ".env.local" });

async function main() {
  const admin = createAdminClient("analytics_ingest");
  const adminClient = admin as any;

  const { data, error } = await adminClient
    .from("product_analytics_events")
    .select("id")
    .limit(1);

  if (error) {
    const code = String(error.code ?? "");
    const tableMissing = code === "42P01" || code === "PGRST205";
    console.info(
      JSON.stringify(
        {
          job: "check-product-analytics-surface",
          tableExists: !tableMissing,
          error: {
            code,
            message: error.message,
          },
        },
        null,
        2
      )
    );
    process.exit(tableMissing ? 2 : 1);
  }

  console.info(
    JSON.stringify(
      {
        job: "check-product-analytics-surface",
        tableExists: true,
        sampleRowCount: Array.isArray(data) ? data.length : 0,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("check-product-analytics-surface failed", error);
  process.exit(1);
});
