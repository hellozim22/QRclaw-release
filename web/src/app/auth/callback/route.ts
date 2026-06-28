import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const GET = async (request: Request) => {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/messages';

  // Prevent open redirect: only allow relative paths starting with /
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/messages';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirect to login on error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
};
