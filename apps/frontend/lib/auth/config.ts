/**
 * Server-side sign-in settings, read at runtime (not inlined at build), so one
 * image serves local mode and hosted mode. Auth is on only when
 * AUTH_PROVIDER=supabase, matching the backend gate in app/auth.py.
 */

export const RENDER_HEADER = 'x-internal-render';

export interface AuthConfig {
  enabled: boolean;
  supabaseUrl: string;
  supabaseKey: string;
  renderSecret: string;
  allowedEmails: Set<string>;
  allowedDomains: Set<string>;
}

function csv(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function getAuthConfig(): AuthConfig {
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const supabaseKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ''
  ).trim();
  return {
    enabled: (process.env.AUTH_PROVIDER ?? '').trim().toLowerCase() === 'supabase',
    supabaseUrl,
    supabaseKey,
    renderSecret: (process.env.INTERNAL_RENDER_SECRET ?? '').trim(),
    allowedEmails: csv(process.env.AUTH_ALLOWED_EMAILS),
    allowedDomains: csv(process.env.AUTH_ALLOWED_DOMAINS),
  };
}

export function emailAllowed(config: AuthConfig, email: unknown): boolean {
  if (config.allowedEmails.size === 0 && config.allowedDomains.size === 0) return true;
  if (typeof email !== 'string' || !email.includes('@')) return false;
  const normalized = email.trim().toLowerCase();
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1);
  return config.allowedEmails.has(normalized) || config.allowedDomains.has(domain);
}

/** Constant-time comparison for the render secret. */
export function secretMatches(candidate: string | null, secret: string): boolean {
  if (!candidate || !secret || candidate.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

/** Only same-site relative paths, so ?next= cannot redirect off-site. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/bench';
  }
  return value;
}
