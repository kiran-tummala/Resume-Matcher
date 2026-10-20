import { connection } from 'next/server';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/login-form';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
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
    <PageFrame width="narrow">
      <PageHeader>
        <PageHeader.Title>{t('auth.title')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('auth.subtitle')}</PageHeader.Subtitle>
      </PageHeader>
      <div className="p-8 md:p-12">
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
    </PageFrame>
  );
}
