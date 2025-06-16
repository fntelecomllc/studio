// src/middleware.ts
// Next.js middleware for session-based authentication - Cookie-only approach
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  console.log('[MIDDLEWARE] Session-based security check for:', pathname);
  
  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/signup'];
  
  // Static assets and API routes (handled by backend middleware)
  const staticRoutes = ['/favicon.ico', '/_next', '/api'];
  const isStaticRoute = staticRoutes.some(route => pathname.startsWith(route));
  
  // If accessing a public route or static asset, allow it
  if (publicRoutes.includes(pathname) || isStaticRoute) {
    console.log('[MIDDLEWARE] Public/static route allowed:', pathname);
    return NextResponse.next();
  }
  
  // SESSION-BASED AUTHENTICATION: Check only for session cookie
  const sessionCookie = request.cookies.get('domainflow_session');
  
  console.log('[MIDDLEWARE] Session auth check:', {
    pathname,
    hasSessionCookie: !!sessionCookie,
    sessionCookieValue: sessionCookie?.value ? 'present' : 'missing'
  });
  
  // CRITICAL: Default to DENY - redirect to login if no session cookie
  let hasValidSession = false;
  
  // Check for domainflow_session cookie (primary session identifier)
  if (sessionCookie && sessionCookie.value) {
    // Basic validation - session cookie exists and has value
    // Actual session validation is done by the backend
    hasValidSession = true;
    console.log('[MIDDLEWARE] Valid session cookie found');
  }
  
  // CRITICAL: If no valid session, ALWAYS redirect to login
  if (!hasValidSession) {
    console.log('[MIDDLEWARE] SECURITY BLOCK: No valid session cookie, redirecting to login');
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    
    const response = NextResponse.redirect(loginUrl);
    
    // Clear any invalid/expired session cookies
    response.cookies.delete('domainflow_session');
    response.cookies.delete('session_id'); // Legacy cleanup
    response.cookies.delete('auth_tokens'); // Legacy cleanup
    
    return response;
  }
  
  console.log('[MIDDLEWARE] Session authentication verified, allowing access to:', pathname);
  
  // Add security headers to the response
  const response = NextResponse.next();
  
  // Add security headers for protection
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};