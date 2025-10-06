import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  
  // Get the pathname
  const pathname = request.nextUrl.pathname;
  
  // Only apply role-based redirection for dashboard routes
  if (pathname.startsWith('/dashboard')) {
    // Get user from the response headers (set by updateSession)
    const user = response.headers.get('x-user');
    
    if (user) {
      try {
        const userData = JSON.parse(user);
        const userRole = userData.role;
        
        // Redirect based on role
        if (pathname === '/dashboard' && (userRole === 'contributor' || userRole === 'both')) {
          return NextResponse.redirect(new URL('/dashboard/contributor', request.url));
        }
        
        if (pathname === '/dashboard/contributor' && userRole === 'requester') {
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
        
      } catch (error) {
        console.error('Error parsing user data in middleware:', error);
      }
    }
  }
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
