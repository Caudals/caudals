import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getUserRole, getRedirectPathForRole } from "@/lib/auth/role-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data.user) {
      // Get user role and determine redirect path
      const userRole = await getUserRole(data.user.id);
      const redirectPath = userRole ? await getRedirectPathForRole(userRole) : "/dashboard";
      
      const finalPath = next || redirectPath;
      
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${finalPath}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${finalPath}`);
      } else {
        return NextResponse.redirect(`${origin}${finalPath}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(
    `${origin}/auth/sign-in?error=auth-callback-error`
  );
}
