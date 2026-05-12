import { NextRequest } from "next/server";

import { handleV1Subscriptions } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleV1Subscriptions(request);
}
