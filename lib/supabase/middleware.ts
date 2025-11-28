import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type UpdateSessionOptions = {
  pathnameOverride?: string;
};

export async function updateSession(
  request: NextRequest,
  options?: UpdateSessionOptions
) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = options?.pathnameOverride ?? request.nextUrl.pathname;

  // Get user profile if user exists
  let userProfile = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    userProfile = profile;
  }

  // Protected routes - require authentication
  if (pathname.startsWith("/dashboard") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    return NextResponse.redirect(url);
  }

  // Role-based route protection
  if (user && userProfile) {
    const userRole = userProfile.role;

    // Contributors cannot access requester routes
    if (userRole === "contributor") {
      const requesterRoutes = [
        "/dashboard/requests",
        "/dashboard/contributors",
        "/dashboard/analytics"
      ];
      
      const isRequesterRoute = requesterRoutes.some(route => pathname.startsWith(route));
      
      // Redirect /dashboard to /dashboard/contributor for contributors
      if (pathname === "/dashboard" || isRequesterRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard/contributor";
        return NextResponse.redirect(url);
      }
    }

    // Requesters cannot access contributor-specific routes
    if (userRole === "requester") {
      if (pathname.startsWith("/dashboard/contributor") || pathname.startsWith("/dashboard/contributions")) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }

    // Only admins can access admin routes
    if (pathname.startsWith("/admin") && userRole !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = userRole === "contributor" ? "/dashboard/contributor" : "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // Auth routes - redirect if already logged in
  if (
    (pathname.startsWith("/auth/sign-in") ||
      pathname.startsWith("/auth/sign-up")) &&
    user
  ) {
    const url = request.nextUrl.clone();
    // Redirect based on role
    if (userProfile?.role === "contributor") {
      url.pathname = "/dashboard/contributor";
    } else {
      url.pathname = "/dashboard";
    }
    return NextResponse.redirect(url);
  }

  // Add user data to response headers for role-based routing
  if (user && userProfile) {
    supabaseResponse.headers.set('x-user', JSON.stringify({
      id: user.id,
      email: user.email,
      role: userProfile.role
    }));
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely.

  return supabaseResponse;
}
