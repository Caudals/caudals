import { NextRequest } from "next/server";

import { handleV1DeliveryDispute } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deliveryId: string }> },
) {
  const { deliveryId } = await params;
  return handleV1DeliveryDispute(request, deliveryId);
}
