import { shouldBlockPhaseOneHiddenSurface } from "@/lib/phase-one-surface-gates";
import { NextResponse } from "next/server";

function buildRedirectUrl(request: Request, path: string) {
  const url = new URL(path, request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (process.env.NODE_ENV === "development" || !forwardedHost) {
    return url;
  }

  url.protocol = `${forwardedProto || "https"}:`;
  url.host = forwardedHost;

  return url;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next");
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") && !shouldBlockPhaseOneHiddenSurface(next)
      ? next
      : null;

  return NextResponse.redirect(
    buildRedirectUrl(
      request,
      safeNext ?? "/auth/sign-in?error=auth-callback-disabled"
    )
  );
}
