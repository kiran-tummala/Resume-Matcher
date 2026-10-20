import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getAuthConfig } from '@/lib/auth/config';

/** Sign out (POST only, so a link or prefetch can't log anyone out). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getAuthConfig();
  const target = new URL(config.enabled ? '/login' : '/dashboard', request.url);
  const response = NextResponse.redirect(target, { status: 303 });
  if (!config.enabled) return response;

  const supabase = createServerClient(config.supabaseUrl, config.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });
  await supabase.auth.signOut();
  return response;
}
