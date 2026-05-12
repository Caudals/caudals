import { NextRequest } from "next/server";

import { handleV1Datasets } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleV1Datasets(request);
}
