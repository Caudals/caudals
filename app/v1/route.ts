import { NextRequest } from "next/server";

import { handleV1Docs } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleV1Docs(request);
}
