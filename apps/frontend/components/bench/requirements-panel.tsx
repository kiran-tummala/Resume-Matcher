'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PaperPlaneTilt, Plus } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { RequirementDialog } from '@/components/bench/requirement-dialog';
import { SubmitDialog } from '@/components/bench/submit-dialog';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  formatRate,
  matchRequirement,
  updateRequirement,
  type Consultant,
  type ConsultantMatch,
  type Requirement,
  type RequirementStatus,
} from '@/lib/api/bench';

interface Props {
  requirements: Requirement[];
  consultants: Consultant[];
  onChanged: () => void;
  onSubmitted: () => void;
}

export function RequirementsPanel({ requirements, consultants, onChanged, onSubmitted }: Props) {
  const { t } = useTranslations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matches, setMatches] = useState<ConsultantMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<ConsultantMatch | null>(null);

  const selected =
    requirements.find((r) => r.requirement_id === selectedId) ?? requirements[0] ?? null;

  const loadMatches = useCallback(
    async (requirementId: string) => {
      setLoadingMatches(true);
      try {
        setMatches(await matchRequirement(requirementId));
      } catch (e) {
        setError(e instanceof Error ? e.message : t('bench.loadFailed'));
      } finally {
        setLoadingMatches(false);
      }
    },
    [t]
  );

  const selectedRequirementId = selected?.requirement_id ?? null;
  useEffect(() => {
    if (selectedRequirementId) void loadMatches(selectedRequirementId);
    else setMatches([]);
  }, [selectedRequirementId, loadMatches]);

  const handleSaved = (requirement: Requirement, created: boolean) => {
    setNotice(created ? null : t('bench.requirements.duplicateNotice'));
    setSelectedId(requirement.requirement_id);
    onChanged();
  };

  const changeStatus = async (status: RequirementStatus) => {
    if (!selected) return;
    try {
      await updateRequirement(selected.requirement_id, { status });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('bench.saveFailed'));
    }
  };

  const submittingConsultant = submitting
    ? consultants.find((c) => c.consultant_id === submitting.consultant_id)
    : undefined;

  return (
    <section aria-labelledby="bench-requirements-heading" className="space-y-4 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="bench-requirements-heading" className="font-serif text-2xl font-bold text-ink">
          {t('bench.requirements.heading', { count: requirements.length })}
        </h2>
        <Button type="button" onClick={() => setDialogOpen(true)}>
          <Plus aria-hidden="true" />
          {t('bench.requirements.add')}
        </Button>
      </div>

      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {requirements.length === 0 ? (
        <EmptyState
          variant="framed"
          title={t('bench.requirements.emptyTitle')}
          description={t('bench.requirements.emptyDescription')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
          <ul
            className="border border-ink bg-white shadow-sw-nested"
            aria-label={t('bench.requirements.listLabel')}
          >
            {requirements.map((r) => {
              const active = selected?.requirement_id === r.requirement_id;
              return (
                <li key={r.requirement_id} className="border-b border-panel last:border-b-0">
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => {
                      setSelectedId(r.requirement_id);
                      setNotice(null);
                    }}
                    className={cn(
                      'block w-full px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                      active ? 'bg-ink text-white' : 'hover:bg-panel-hover'
                    )}
                  >
                    <span className="block font-bold">{r.title}</span>
                    <span
                      className={cn(
                        'mt-1 block font-mono text-xs uppercase tracking-wider',
                        active ? 'text-white' : 'text-steel'
                      )}
                    >
                      {[r.client, r.vendor, t(`bench.requirementStatus.${r.status}`)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <div className="space-y-4">
              <div className="border border-ink bg-white p-4 shadow-sw-nested">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl font-bold text-ink">{selected.title}</h3>
                    <p className="mt-1 font-mono text-xs uppercase tracking-wider text-steel">
                      {[
                        selected.client,
                        selected.vendor && t('bench.requirements.via', { vendor: selected.vendor }),
                        selected.external_ref,
                        selected.location,
                        formatRate(selected.bill_rate),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Dropdown
                    className="w-44"
                    label={t('bench.fields.status')}
                    options={(['open', 'on_hold', 'closed'] as const).map((s) => ({
                      id: s,
                      label: t(`bench.requirementStatus.${s}`),
                    }))}
                    value={selected.status}
                    onChange={(value) => void changeStatus(value as RequirementStatus)}
                  />
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer font-mono text-xs font-bold uppercase text-primary">
                    {t('bench.requirements.showDescription')}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">
                    {selected.description}
                  </p>
                </details>
              </div>

              <div className="border border-ink bg-white shadow-sw-nested">
                <div className="border-b border-ink bg-paper px-4 py-3">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-ink">
                    {t('bench.matches.heading')}
                  </h3>
                  <p className="mt-1 text-sm text-ink-soft">{t('bench.matches.explainer')}</p>
                </div>
                {loadingMatches ? (
                  <div className="p-4">
                    <StatusIndicator tone="active">{t('common.loading')}</StatusIndicator>
                  </div>
                ) : matches.length === 0 ? (
                  <EmptyState
                    className="px-4"
                    title={t('bench.matches.emptyTitle')}
                    description={t('bench.matches.emptyDescription')}
                  />
                ) : (
                  <ul>
                    {matches.map((m) => (
                      <li
                        key={m.consultant_id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-panel px-4 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-lg font-bold text-ink">{m.score}</span>
                            <span className="font-bold text-ink">{m.full_name}</span>
                          </div>
                          {m.headline && <div className="text-sm text-ink-soft">{m.headline}</div>}
                          <div className="mt-1 font-mono text-xs text-steel">
                            {m.matched_skills.length > 0
                              ? t('bench.matches.matched', {
                                  skills: m.matched_skills.join(', '),
                                  count: m.matched_skills.length,
                                  total: m.skill_count,
                                })
                              : t('bench.matches.noneMatched')}
                          </div>
                        </div>
                        {m.already_submitted ? (
                          <StatusIndicator tone="ready" live={false}>
                            {t('bench.matches.alreadySubmitted')}
                          </StatusIndicator>
                        ) : !m.has_resume ? (
                          <StatusIndicator tone="warning" live={false}>
                            {t('bench.resumeStatus.missing')}
                          </StatusIndicator>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={selected.status !== 'open'}
                            onClick={() => setSubmitting(m)}
                          >
                            <PaperPlaneTilt aria-hidden="true" />
                            {t('bench.matches.submit')}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <RequirementDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={handleSaved} />
      {submitting && selected && (
        <SubmitDialog
          open
          onOpenChange={(open) => !open && setSubmitting(null)}
          consultant={{
            consultant_id: submitting.consultant_id,
            full_name: submitting.full_name,
            pay_rate: submittingConsultant?.pay_rate ?? null,
          }}
          requirement={selected}
          onCreated={() => {
            setSubmitting(null);
            void loadMatches(selected.requirement_id);
            onSubmitted();
          }}
        />
      )}
    </section>
  );
}
