import { NextRequest } from "next/server";

import { handleV1Delivery } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deliveryId: string }> },
) {
  const { deliveryId } = await params;
  return handleV1Delivery(request, deliveryId);
}
