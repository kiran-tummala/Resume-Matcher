import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/login-form';
import { defaultLocale } from '@/i18n/config';
import { getAuthConfig, safeNextPath } from '@/lib/auth/config';
import { translate } from '@/lib/i18n/server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; denied?: string }>;
}) {
  // Read the Supabase settings at request time, not at build time.
  await connection();
  const config = getAuthConfig();
  const { next, denied } = await searchParams;
  const nextPath = safeNextPath(next);
  if (!config.enabled) redirect(nextPath);

  const t = (key: string) => translate(defaultLocale, key);
  return (
    <main className="grid min-h-dvh place-items-center bg-bp-canvas px-4 py-12 font-plex text-bp-ink">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-md bg-bp-pine-deep text-sm font-bold text-white"
          >
            BP
          </span>
          <span className="text-lg font-semibold tracking-tight">BenchPilot</span>
        </div>
        <div className="rounded-xl border border-bp-line bg-bp-surface p-6">
          <h1 className="text-xl font-semibold">{t('auth.title')}</h1>
          <p className="mt-1 mb-6 text-sm text-bp-muted">{t('auth.subtitle')}</p>
          <LoginForm
            supabaseUrl={config.supabaseUrl}
            supabaseKey={config.supabaseKey}
            nextPath={nextPath}
            denied={denied === '1'}
            labels={{
              email: t('auth.email'),
              password: t('auth.password'),
              submit: t('auth.submit'),
              submitting: t('auth.submitting'),
              failed: t('auth.failed'),
              notAllowed: t('auth.notAllowed'),
              invite: t('auth.invite'),
            }}
          />
        </div>
      </div>
    </main>
  );
}
