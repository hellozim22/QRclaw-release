import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { isLocalAppShell } from '@/lib/local-app-shell';

/** 本地 v1 已裁减的路由 — 统一回 Chat */
const LEGACY_REDIRECT_PREFIXES = [
  '/login',
  '/signup',
  '/verify',
  '/auth/update-password',
  '/pricing',
  '/terms',
  '/privacy',
  '/docs',
  '/claim/',
  '/q/',
  '/agent/',
  '/messages',
  '/qrcodes',
  '/m/',
];

const isLegacyRedirect = (pathname: string): boolean =>
  LEGACY_REDIRECT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );

export const updateSession = async (request: NextRequest) => {
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
          const isProduction = process.env.NODE_ENV === 'production';
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: isProduction,
              sameSite: 'lax',
            }),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const localDev = isLocalAppShell();

  // 本地版：根路径直达 Chat
  if (localDev && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/chat';
    return NextResponse.redirect(url);
  }

  // 裁减 legacy 路由
  if (localDev && isLegacyRedirect(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/chat';
    return NextResponse.redirect(url);
  }

  // Visitor 旧 chat（/chat/[agentId]）与 dashboard /chat 区分
  if (localDev && pathname.startsWith('/chat/') && pathname !== '/chat') {
    const url = request.nextUrl.clone();
    url.pathname = '/chat';
    return NextResponse.redirect(url);
  }

  const protectedPrefixes = ['/settings', '/chat', '/agents', '/progress'];
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!user && isProtected && !localDev) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = localDev ? '/chat' : '/messages';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
};
