import { NextRequest, NextResponse } from "next/server";
import { processPendingDatasetExportJobs } from "@/lib/jobs/export-jobs";

function readRequestToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return (request.headers.get("x-caudals-jobs-token") ?? "").trim();
}

function isAuthorized(request: NextRequest) {
  const expected = (process.env.EXPORT_JOBS_TOKEN ?? "").trim();
  if (!expected) {
    return {
      ok: false,
      status: 500,
      error: "EXPORT_JOBS_TOKEN is not configured",
    };
  }

  const provided = readRequestToken(request);
  if (!provided || provided !== expected) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized export job runner request",
    };
  }

  return { ok: true } as const;
}

export async function POST(request: NextRequest) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { limit?: number; exportId?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const summary = await processPendingDatasetExportJobs({
    limit: body.limit,
    exportId: body.exportId,
  });

  return NextResponse.json({
    ok: true,
    summary,
  });
}
