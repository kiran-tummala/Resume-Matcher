'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowClockwise, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusIndicator, type StatusTone } from '@/components/ui/status-indicator';
import { formatDate } from '@/lib/format-date';
import { useTranslations } from '@/lib/i18n';
import {
  deleteSubmission,
  formatRate,
  retrySubmissionTailoring,
  SENT_STATUSES,
  SUBMISSION_STATUS_ORDER,
  updateSubmission,
  type Submission,
  type SubmissionStatus,
} from '@/lib/api/bench';

const STATUS_TONE: Record<SubmissionStatus, StatusTone> = {
  tailoring: 'active',
  ready: 'warning',
  submitted: 'active',
  client_review: 'active',
  interview: 'active',
  offer: 'ready',
  placed: 'ready',
  rejected: 'neutral',
  withdrawn: 'neutral',
};

interface Props {
  submissions: Submission[];
  onChanged: () => void;
}

export function SubmissionsPanel({ submissions, onChanged }: Props) {
  const { t, locale } = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Submission | null>(null);
  const [rtrPending, setRtrPending] = useState<{
    submission: Submission;
    status: SubmissionStatus;
  } | null>(null);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('bench.saveFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = (s: Submission, status: SubmissionStatus) => {
    // Sending a profile out needs the consultant's right to represent.
    if (SENT_STATUSES.has(status) && !s.rtr_confirmed) {
      setRtrPending({ submission: s, status });
      return;
    }
    void run(s.submission_id, () => updateSubmission(s.submission_id, { status }));
  };

  const confirmRtr = () => {
    if (!rtrPending) return;
    const { submission, status } = rtrPending;
    setRtrPending(null);
    void run(submission.submission_id, () =>
      updateSubmission(submission.submission_id, { status, rtr_confirmed: true })
    );
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    await run(target.submission_id, () => deleteSubmission(target.submission_id));
  };

  return (
    <section aria-labelledby="bench-submissions-heading" className="space-y-4 p-6 md:p-8">
      <h2 id="bench-submissions-heading" className="font-serif text-2xl font-bold text-ink">
        {t('bench.submissions.heading', { count: submissions.length })}
      </h2>
      {error && <Alert tone="error">{error}</Alert>}

      {submissions.length === 0 ? (
        <EmptyState
          variant="framed"
          title={t('bench.submissions.emptyTitle')}
          description={t('bench.submissions.emptyDescription')}
        />
      ) : (
        <div className="overflow-x-auto border border-ink bg-white shadow-sw-nested">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="border-b border-ink bg-paper font-mono text-xs uppercase tracking-wider text-steel">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t('bench.submissions.consultant')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('bench.submissions.requirement')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('bench.submissions.rates')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('bench.submissions.resume')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('bench.fields.status')}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">{t('bench.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => {
                const busy = busyId === s.submission_id;
                const failed = s.status === 'tailoring' && s.tailoring_status === 'failed';
                return (
                  <tr
                    key={s.submission_id}
                    className="border-b border-panel align-top last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-ink">{s.consultant_name ?? '—'}</div>
                      <div className="mt-1 font-mono text-xs text-steel">
                        {s.rtr_confirmed
                          ? t('bench.submissions.rtrYes')
                          : t('bench.submissions.rtrNo')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink">{s.requirement_title ?? '—'}</div>
                      <div className="mt-1 font-mono text-xs text-steel">
                        {[
                          s.client,
                          s.submitted_at &&
                            t('bench.submissions.submittedOn', {
                              date: formatDate(s.submitted_at, locale),
                            }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      <div>{t('bench.submissions.bill', { rate: formatRate(s.bill_rate) })}</div>
                      <div>{t('bench.submissions.pay', { rate: formatRate(s.pay_rate) })}</div>
                      {s.margin !== null && (
                        <div
                          className={
                            s.margin < 0 ? 'font-bold text-destructive' : 'font-bold text-ink'
                          }
                        >
                          {t('bench.submissions.marginShort', { rate: formatRate(s.margin) })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.tailored_resume_id ? (
                        <Link
                          href={`/resumes/${encodeURIComponent(s.tailored_resume_id)}`}
                          className="font-mono text-xs font-bold uppercase text-primary underline"
                        >
                          {t('bench.submissions.openTailored')}
                        </Link>
                      ) : failed ? (
                        <div className="flex flex-col items-start gap-2">
                          <StatusIndicator tone="error" live={false}>
                            {t('bench.submissions.tailoringFailed')}
                          </StatusIndicator>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void run(s.submission_id, () =>
                                retrySubmissionTailoring(s.submission_id)
                              )
                            }
                          >
                            <ArrowClockwise aria-hidden="true" />
                            {t('common.retry')}
                          </Button>
                        </div>
                      ) : (
                        <StatusIndicator tone="active">
                          {t('bench.submissions.tailoring')}
                        </StatusIndicator>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator tone={STATUS_TONE[s.status]} live={false} className="mb-2">
                        {t(`bench.submissionStatus.${s.status}`)}
                      </StatusIndicator>
                      <Dropdown
                        className="w-44"
                        options={SUBMISSION_STATUS_ORDER.filter((st) => st !== 'tailoring').map(
                          (st) => ({ id: st, label: t(`bench.submissionStatus.${st}`) })
                        )}
                        value={s.status}
                        placeholder={t('bench.submissions.moveTo')}
                        disabled={busy || !s.tailored_resume_id}
                        onChange={(value) => changeStatus(s, value as SubmissionStatus)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className={buttonClass({ variant: 'outline-destructive', size: 'icon-sm' })}
                        onClick={() => setDeleting(s)}
                        disabled={busy}
                        aria-label={t('bench.submissions.deleteNamed', {
                          name: s.consultant_name ?? '',
                          title: s.requirement_title ?? '',
                        })}
                      >
                        <Trash aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={rtrPending !== null}
        onOpenChange={(open) => !open && setRtrPending(null)}
        title={t('bench.submissions.rtrTitle')}
        description={t('bench.submissions.confirmRtr', {
          name: rtrPending?.submission.consultant_name ?? '',
        })}
        confirmLabel={t('bench.submissions.rtrConfirm')}
        variant="warning"
        onConfirm={confirmRtr}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('bench.submissions.deleteTitle')}
        description={t('bench.submissions.deleteDescription')}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
