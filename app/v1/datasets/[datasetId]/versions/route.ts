import { NextRequest } from "next/server";

import { handleV1DatasetVersions } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> },
) {
  const { datasetId } = await params;
  return handleV1DatasetVersions(request, datasetId);
}
