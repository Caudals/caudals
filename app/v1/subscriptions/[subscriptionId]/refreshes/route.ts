import { NextRequest } from "next/server";

import { handleV1SubscriptionRefreshes } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await params;
  return handleV1SubscriptionRefreshes(request, subscriptionId);
}
