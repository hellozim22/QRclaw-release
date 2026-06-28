import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export const middleware = async (request: NextRequest) => {
  const response = await updateSession(request);

  // Prevent clickjacking on API responses
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
};

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
