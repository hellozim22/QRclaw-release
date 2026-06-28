import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isDesktopBootstrap, isLocalHostRequest } from '@/lib/local-app-shell';

function jsonWithCookies(
  body: Record<string, unknown>,
  cookieSource: NextResponse,
): NextResponse {
  const res = NextResponse.json(body);
  cookieSource.cookies.getAll().forEach(({ name, value }) => {
    res.cookies.set(name, value);
  });
  return res;
}

function sessionPayload(session: {
  access_token: string;
  refresh_token: string;
} | null | undefined) {
  if (!session?.access_token || !session?.refresh_token) {
    return {};
  }
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };
}

function isDevRouteAllowed(request: NextRequest): boolean {
  const host = request.headers.get('host') ?? '';
  const origin = request.headers.get('origin') ?? '';
  const isLocalHost = isLocalHostRequest(host, origin);

  // Desktop app: auto bootstrap on 127.0.0.1 without invite code (production OK)
  if (isDesktopBootstrap() && isLocalHost) {
    return true;
  }

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL ||
    process.env.LOCAL_DEV_BOOTSTRAP !== '1'
  ) {
    return false;
  }
  return isLocalHost;
}

/**
 * POST /api/dev/bootstrap — 本地开发：服务端 signIn + cookie + 返回 token 供浏览器 setSession。
 */
export async function POST(request: NextRequest) {
  if (!isDevRouteAllowed(request)) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  const email = process.env.LOCAL_DEV_EMAIL;
  const password = process.env.LOCAL_DEV_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 500 });
  }

  const cookieJar = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieJar.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user: existing },
  } = await supabase.auth.getUser();

  if (existing?.email === email) {
    const { data: sessionData } = await supabase.auth.getSession();
    return jsonWithCookies(
      {
        ok: true,
        user_id: existing.id,
        email: existing.email,
        already: true,
        ...sessionPayload(sessionData.session),
      },
      cookieJar,
    );
  }

  if (existing) {
    await supabase.auth.signOut();
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    return NextResponse.json(
      { error: error?.message ?? 'sign_in_failed' },
      { status: 401 },
    );
  }

  return jsonWithCookies(
    {
      ok: true,
      user_id: data.user.id,
      email: data.user.email,
      already: false,
      ...sessionPayload(data.session),
    },
    cookieJar,
  );
}
