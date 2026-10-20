/**
 * Sign-in gate for hosted deployments (no-op unless AUTH_PROVIDER=supabase).
 *
 * - Pages need a Supabase session from an allowed email; otherwise → /login.
 * - /api/* (proxied to FastAPI) gets the session's access token as a Bearer
 *   header, so the backend verifies the same identity; no session → 401.
 * - /print/* is only for the PDF renderer, which sends the internal render
 *   secret; everyone else gets 404.
 * Sessions refresh here on every request (cookies rotated by @supabase/ssr).
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import {
  RENDER_HEADER,
  emailAllowed,
  getAuthConfig,
  safeNextPath,
  secretMatches,
} from '@/lib/auth/config';

const PUBLIC_PATHS = new Set(['/login']);

function isApiPath(path: string): boolean {
  return (
    path.startsWith('/api/') || path === '/docs' || path === '/redoc' || path === '/openapi.json'
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const config = getAuthConfig();
  if (!config.enabled) return NextResponse.next();

  const path = request.nextUrl.pathname;

  if (path.startsWith('/print/')) {
    return secretMatches(request.headers.get(RENDER_HEADER), config.renderSecret)
      ? NextResponse.next()
      : new NextResponse('Not found', { status: 404 });
  }

  // Never forward a browser-supplied render header.
  const forwarded = new Headers(request.headers);
  forwarded.delete(RENDER_HEADER);

  let response = NextResponse.next({ request: { headers: forwarded } });
  const supabase = createServerClient(config.supabaseUrl, config.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: forwarded } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getClaims verifies the token signature (JWKS) instead of trusting the cookie.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const signedIn = Boolean(claims) && emailAllowed(config, claims?.email);

  if (PUBLIC_PATHS.has(path)) {
    if (signedIn) {
      const target = safeNextPath(request.nextUrl.searchParams.get('next'));
      return NextResponse.redirect(new URL(target, request.url));
    }
    return response;
  }

  if (!signedIn) {
    if (isApiPath(path)) {
      return NextResponse.json(
        { detail: 'Sign in required.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
      );
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${path}${request.nextUrl.search}`);
    // Signed in, but not with an allowed address.
    if (claims) login.searchParams.set('denied', '1');
    return NextResponse.redirect(login);
  }

  if (isApiPath(path)) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json(
        { detail: 'Sign in required.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
      );
    }
    forwarded.set('authorization', `Bearer ${session.access_token}`);
    const withToken = NextResponse.next({ request: { headers: forwarded } });
    response.cookies.getAll().forEach((cookie) => withToken.cookies.set(cookie));
    return withToken;
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$).*)',
  ],
};
