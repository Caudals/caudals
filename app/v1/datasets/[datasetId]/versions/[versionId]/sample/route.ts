import { NextRequest } from "next/server";

import { handleV1DatasetSample } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string; versionId: string }> },
) {
  const { datasetId, versionId } = await params;
  return handleV1DatasetSample(request, datasetId, versionId);
}
