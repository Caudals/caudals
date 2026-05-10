import { NextResponse } from "next/server";

import { getCurrentOperatorSession } from "@/lib/auth/operator-session";

export async function GET(request: Request) {
  const session = await getCurrentOperatorSession(request.headers);

  if (!session) {
    return NextResponse.json({ role: null }, { status: 401 });
  }

  return NextResponse.json({
    role: session.operator.role,
    operatorId: session.operator.id,
  });
}
