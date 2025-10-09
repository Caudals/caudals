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
