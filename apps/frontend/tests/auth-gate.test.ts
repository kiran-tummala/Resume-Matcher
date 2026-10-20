import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { emailAllowed, getAuthConfig, safeNextPath, secretMatches } from '@/lib/auth/config';

const claims = vi.fn();
const session = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: claims, getSession: session },
  }),
}));

const RENDER = 'r'.repeat(40);
const ENV = {
  AUTH_PROVIDER: 'supabase',
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'pk',
  INTERNAL_RENDER_SECRET: RENDER,
  AUTH_ALLOWED_DOMAINS: 'vkstech.com',
};

function signedInAs(email: string | null) {
  claims.mockResolvedValue({ data: email ? { claims: { sub: 'u1', email } } : null });
  session.mockResolvedValue({ data: { session: email ? { access_token: 'tok-123' } : null } });
}

async function run(path: string, headers: Record<string, string> = {}) {
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(new URL(path, 'http://app.test'), { headers }));
}

describe('auth config helpers', () => {
  beforeEach(() => vi.stubEnv('AUTH_ALLOWED_DOMAINS', 'vkstech.com'));
  afterEach(() => vi.unstubAllEnvs());

  it('allows only listed domains or emails', () => {
    const config = getAuthConfig();
    expect(emailAllowed(config, 'Kiran@VKSTech.com')).toBe(true);
    expect(emailAllowed(config, 'someone@gmail.com')).toBe(false);
    expect(emailAllowed(config, undefined)).toBe(false);
  });

  it('keeps ?next= on this site', () => {
    expect(safeNextPath('/bench?tab=1')).toBe('/bench?tab=1');
    expect(safeNextPath('//evil.example')).toBe('/bench');
    expect(safeNextPath('/\\evil.example')).toBe('/bench');
    expect(safeNextPath('https://evil.example')).toBe('/bench');
    expect(safeNextPath(null)).toBe('/bench');
  });

  it('compares the render secret exactly', () => {
    expect(secretMatches(RENDER, RENDER)).toBe(true);
    expect(secretMatches(`${RENDER}x`, RENDER)).toBe(false);
    expect(secretMatches(null, RENDER)).toBe(false);
    expect(secretMatches('', '')).toBe(false);
  });
});

describe('proxy gate', () => {
  beforeEach(() => {
    Object.entries(ENV).forEach(([k, v]) => vi.stubEnv(k, v));
    claims.mockReset();
    session.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('does nothing when auth is off', async () => {
    vi.stubEnv('AUTH_PROVIDER', '');
    signedInAs(null);
    const res = await run('/bench');
    expect(res.headers.get('location')).toBeNull();
    expect(claims).not.toHaveBeenCalled();
  });

  it('sends signed-out visitors to login with a return path', async () => {
    signedInAs(null);
    const res = await run('/bench?tab=x');
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/bench?tab=x');
    expect(location.searchParams.get('denied')).toBeNull();
  });

  it('answers signed-out API calls with 401 Bearer', async () => {
    signedInAs(null);
    const res = await run('/api/v1/bench/consultants');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('marks a signed-in but disallowed address as denied', async () => {
    signedInAs('someone@gmail.com');
    const res = await run('/bench');
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.searchParams.get('denied')).toBe('1');
  });

  it('forwards the access token to the API and drops a client render header', async () => {
    signedInAs('kiran@vkstech.com');
    const res = await run('/api/v1/bench/consultants', { 'x-internal-render': RENDER });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-request-authorization')).toBe('Bearer tok-123');
    expect(res.headers.get('x-middleware-request-x-internal-render')).toBeNull();
  });

  it('hides print pages from everyone but the renderer', async () => {
    signedInAs('kiran@vkstech.com');
    expect((await run('/print/resumes/abc')).status).toBe(404);
    const ok = await run('/print/resumes/abc', { 'x-internal-render': RENDER });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('location')).toBeNull();
  });

  it('bounces a signed-in user away from the login page', async () => {
    signedInAs('kiran@vkstech.com');
    const res = await run('/login?next=/bench');
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/bench');
  });
});
