import { processPendingDatasetExportJobs } from "@/lib/jobs/export-jobs";

function parseBatchSize(defaultSize = 10) {
  const raw = process.env.EXPORT_JOBS_BATCH_SIZE;
  if (!raw) {
    return defaultSize;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return defaultSize;
  }

  return Math.max(1, Math.floor(parsed));
}

async function main() {
  const exportId = process.argv[2];
  const summary = await processPendingDatasetExportJobs({
    limit: parseBatchSize(),
    exportId: exportId || undefined,
  });

  console.info(
    JSON.stringify(
      {
        job: "process-export-jobs",
        summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("process-export-jobs failed", error);
  process.exit(1);
});
