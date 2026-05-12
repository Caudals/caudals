import { NextRequest } from "next/server";

import { handleV1Briefs } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleV1Briefs(request);
}
