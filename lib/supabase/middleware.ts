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
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    userProfile = profile;
  }

  const protectedPrefixes = ["/requester", "/admin"];

  // Protected routes - require authentication
  if (!user && protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    return NextResponse.redirect(url);
  }

  // Role-based route protection
  if (user && userProfile) {
    const userRole = userProfile.role as "requester" | "contributor" | "admin";
    const roleHome =
      userRole === "admin"
        ? "/admin"
        : userRole === "requester"
          ? "/requester"
          : "/";

    // Role fences for canonical workspaces
    if (pathname.startsWith("/requester") && userRole === "contributor") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/admin") && userRole !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = roleHome;
      return NextResponse.redirect(url);
    }
  }

  // Auth routes - redirect if already logged in
  if (
    (pathname.startsWith("/auth/sign-in") ||
      pathname.startsWith("/auth/sign-up")) &&
    user
  ) {
    const role = userProfile?.role as "requester" | "contributor" | "admin" | undefined;
    const roleHome =
      role === "admin" ? "/admin" : role === "requester" ? "/requester" : "/";
    const url = request.nextUrl.clone();
    url.pathname = roleHome;
    return NextResponse.redirect(url);
  }

  // Add user data to response headers for role-based routing
  if (user && userProfile) {
    supabaseResponse.headers.set("x-user", JSON.stringify({
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
