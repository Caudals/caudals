import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const role = searchParams.get("role"); // Role from OAuth signup

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data.user) {
      // Get user profile
      let { data: profile } = await supabase
        .from('profiles')
        .select('role, mail')
        .eq('id', data.user.id)
        .single();
      
      // If this is an OAuth signup and we have a role parameter, update the profile
      if (role && !profile?.role && ["contributor", "requester"].includes(role)) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            role: role as "contributor" | "requester",
            mail: data.user.email
          })
          .eq('id', data.user.id);
        
        if (!updateError) {
          // Refresh profile data
          const { data: updatedProfile } = await supabase
            .from('profiles')
            .select('role, mail')
            .eq('id', data.user.id)
            .single();
          profile = updatedProfile;
        }
      }
      
      const userRole = profile?.role;
      let redirectPath = "/dashboard"; // Default for requesters
      
      if (userRole === 'contributor') {
        redirectPath = "/dashboard/contributor";
      } else if (userRole === 'admin') {
        redirectPath = "/admin";
      } else if (!userRole) {
        // If no role is set, redirect to a role selection page or dashboard with a prompt
        redirectPath = "/dashboard?select-role=true";
      }
      
      const finalPath = next || redirectPath;

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
