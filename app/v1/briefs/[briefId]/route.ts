import { NextRequest } from "next/server";

import { handleV1Brief } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ briefId: string }> },
) {
  const { briefId } = await params;
  return handleV1Brief(request, briefId);
}
