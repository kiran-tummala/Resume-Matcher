/**
 * Headers for server-side fetches made while rendering print pages for PDF
 * export. With sign-in on, the backend accepts these instead of a user token.
 * Import only from server components.
 */
import { RENDER_HEADER } from './config';

export function internalRenderHeaders(): Record<string, string> {
  const secret = (process.env.INTERNAL_RENDER_SECRET ?? '').trim();
  const enabled = (process.env.AUTH_PROVIDER ?? '').trim().toLowerCase() === 'supabase';
  return enabled && secret ? { [RENDER_HEADER]: secret } : {};
}
