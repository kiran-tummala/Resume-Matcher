'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SignOut } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { buttonClass } from '@/components/ui/button';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ConsultantsPanel } from '@/components/bench/consultants-panel';
import { RequirementsPanel } from '@/components/bench/requirements-panel';
import { SubmissionsPanel } from '@/components/bench/submissions-panel';
import { useTranslations } from '@/lib/i18n';
import {
  listConsultants,
  listRequirements,
  listSubmissions,
  type Consultant,
  type Requirement,
  type Submission,
} from '@/lib/api/bench';

type Tab = 'consultants' | 'requirements' | 'submissions';

/** While any resume is tailoring, refresh this often to pick up the result. */
const TAILORING_POLL_MS = 5000;

export default function BenchPage() {
  const { t } = useTranslations();
  const [tab, setTab] = useState<Tab>('requirements');
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [c, r, s] = await Promise.all([
        listConsultants(),
        listRequirements(),
        listSubmissions(),
      ]);
      setConsultants(c);
      setRequirements(r);
      setSubmissions(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('bench.loadFailed'));
    } finally {
      setLoaded(true);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tailoring = submissions.some(
    (s) => s.status === 'tailoring' && s.tailoring_status !== 'failed'
  );
  useEffect(() => {
    if (!tailoring) return;
    const timer = window.setInterval(() => {
      listSubmissions()
        .then(setSubmissions)
        .catch(() => undefined);
    }, TAILORING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [tailoring]);

  const readyCount = submissions.filter((s) => s.status === 'ready').length;

  return (
    <PageFrame width="wide">
      <PageHeader>
        <PageHeader.Back href="/dashboard">{t('nav.backToDashboard')}</PageHeader.Back>
        <PageHeader.Title>{t('bench.title')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('bench.subtitle')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <SegmentedControl<Tab>
            aria-label={t('bench.tabsLabel')}
            value={tab}
            onChange={setTab}
            items={[
              { value: 'requirements', label: t('bench.tabs.requirements') },
              { value: 'consultants', label: t('bench.tabs.consultants') },
              {
                value: 'submissions',
                label:
                  readyCount > 0
                    ? t('bench.tabs.submissionsReady', { count: readyCount })
                    : t('bench.tabs.submissions'),
              },
            ]}
          />
          <form action="/logout" method="post">
            <button type="submit" className={buttonClass({ variant: 'outline', size: 'sm' })}>
              <SignOut aria-hidden="true" />
              {t('auth.signOut')}
            </button>
          </form>
          <Link href="/settings" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
            {t('nav.settings')}
          </Link>
        </PageHeader.Actions>
      </PageHeader>

      {error && (
        <div className="p-6 md:px-8">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {loaded && tab === 'consultants' && (
        <ConsultantsPanel consultants={consultants} onChanged={() => void refresh()} />
      )}
      {loaded && tab === 'requirements' && (
        <RequirementsPanel
          requirements={requirements}
          consultants={consultants}
          onChanged={() => void refresh()}
          onSubmitted={() => void refresh()}
        />
      )}
      {loaded && tab === 'submissions' && (
        <SubmissionsPanel submissions={submissions} onChanged={() => void refresh()} />
      )}
    </PageFrame>
  );
}
