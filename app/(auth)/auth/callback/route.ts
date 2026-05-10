import { createClient } from "@/lib/supabase/server";
import { shouldBlockPhaseOneHiddenSurface } from "@/lib/phase-one-surface-gates";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") && !shouldBlockPhaseOneHiddenSurface(next)
      ? next
      : null;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data.user) {
      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, mail')
        .eq('id', data.user.id)
        .single();
      
      const userRole = profile?.role;
      let redirectPath = "/";

      if (userRole === "admin") {
        redirectPath = "/admin";
      }
      
      const finalPath = safeNext || redirectPath;

      // Build the correct redirect URL for production
      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProto = request.headers.get("x-forwarded-proto");
      const isLocalEnv = process.env.NODE_ENV === "development";

      let redirectUrl: string;

      if (isLocalEnv) {
        // Development: use origin from request
        redirectUrl = `${origin}${finalPath}`;
      } else if (forwardedHost) {
        // Production: use forwarded headers from Traefik/proxy
        const protocol = forwardedProto || "https";
        redirectUrl = `${protocol}://${forwardedHost}${finalPath}`;
      } else {
        // Fallback: use app hostname from env or default
        const appHostname = process.env.NEXT_PUBLIC_APP_HOSTNAMES?.split(',')[0] || 'app.caudals.com';
        redirectUrl = `https://${appHostname}${finalPath}`;
      }

      return NextResponse.redirect(redirectUrl);
    }
  }

  // return the user to an error page with instructions
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isLocalEnv = process.env.NODE_ENV === "development";

  let errorRedirectUrl: string;

  if (isLocalEnv) {
    errorRedirectUrl = `${origin}/auth/sign-in?error=auth-callback-error`;
  } else if (forwardedHost) {
    const protocol = forwardedProto || "https";
    errorRedirectUrl = `${protocol}://${forwardedHost}/auth/sign-in?error=auth-callback-error`;
  } else {
    const appHostname = process.env.NEXT_PUBLIC_APP_HOSTNAMES?.split(',')[0] || 'app.caudals.com';
    errorRedirectUrl = `https://${appHostname}/auth/sign-in?error=auth-callback-error`;
  }

  return NextResponse.redirect(errorRedirectUrl);
}
