import { NextRequest } from "next/server";

import { handleV1ApproveQuote } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ briefId: string }> },
) {
  const { briefId } = await params;
  return handleV1ApproveQuote(request, briefId);
}
