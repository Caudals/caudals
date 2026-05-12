import { NextRequest } from "next/server";

import { handleV1DatasetAccessRequest } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string; versionId: string }> },
) {
  const { datasetId, versionId } = await params;
  return handleV1DatasetAccessRequest(request, datasetId, versionId);
}
