import { NextRequest } from "next/server";

import { handleV1SubscriptionPause } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await params;
  return handleV1SubscriptionPause(request, subscriptionId);
}
