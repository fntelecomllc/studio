// src/middleware.ts
// Next.js middleware for session-based authentication - Cookie-only approach
import { NextResponse, type NextRequest } from 'next/server';
import { logger } from './src/lib/utils/logger';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  logger.auth('Session-based security check', { pathname, component: 'Middleware' });
  
  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/signup'];
  
  // Static assets and API routes (handled by backend middleware)
  const staticRoutes = ['/favicon.ico', '/_next', '/api'];
  const isStaticRoute = staticRoutes.some(route => pathname.startsWith(route));
  
  // If accessing a public route or static asset, allow it
  if (publicRoutes.includes(pathname) || isStaticRoute) {
    logger.auth('Public/static route allowed', { pathname, component: 'Middleware' });
    return NextResponse.next();
  }
  
  // SESSION-BASED AUTHENTICATION: Check only for session cookie
  const sessionCookie = request.cookies.get('domainflow_session');
  
  logger.auth('Session authentication check', {
    pathname,
    hasSessionCookie: !!sessionCookie,
    sessionCookieValue: sessionCookie?.value ? 'present' : 'missing',
    component: 'Middleware'
  });
  
  // CRITICAL: Default to DENY - redirect to login if no session cookie
  let hasValidSession = false;
  
  // Check for domainflow_session cookie (primary session identifier)
  if (sessionCookie && sessionCookie.value) {
    // Basic validation - session cookie exists and has value
    // Actual session validation is done by the backend
    hasValidSession = true;
    logger.auth('Valid session cookie found', { pathname, component: 'Middleware' });
  }
  
  // CRITICAL: If no valid session, ALWAYS redirect to login
  if (!hasValidSession) {
    logger.warn('SECURITY BLOCK: No valid session cookie, redirecting to login', {
      pathname,
      component: 'Middleware',
      operation: 'security_block'
    });
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    
    const response = NextResponse.redirect(loginUrl);
    
    // Clear any invalid/expired session cookies
    response.cookies.delete('domainflow_session');
    response.cookies.delete('session_id'); // Legacy cleanup
    response.cookies.delete('auth_tokens'); // Legacy cleanup
    
    return response;
  }
  
  logger.auth('Session authentication verified, allowing access', {
    pathname,
    component: 'Middleware',
    operation: 'access_granted'
  });
  
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