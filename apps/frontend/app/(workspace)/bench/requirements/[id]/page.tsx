'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowClockwise, PaperPlaneTilt } from '@phosphor-icons/react';
import {
  matchRequirement,
  retrySubmissionTailoring,
  updateRequirement,
  type ConsultantMatch,
  type RequirementStatus,
  type SubmissionStatus,
} from '@/lib/api/bench';
import { SubmitDialog } from '@/components/workspace/dialogs';
import {
  BOARD_STAGES,
  money,
  RateBar,
  REQUIREMENT_STATUS,
  STAGE,
  StageTag,
} from '@/components/workspace/stages';
import { useMoveSubmission } from '@/components/workspace/use-move';
import {
  Button,
  ButtonLink,
  Chip,
  Empty,
  Notice,
  PageHeader,
  Panel,
  Select,
  Spinner,
} from '@/components/workspace/ui';
import { useBench } from '@/components/workspace/use-bench';
import { cn } from '@/lib/utils';

function ScoreMeter({ score }: { score: number }) {
  return (
    <div
      className="flex w-14 shrink-0 flex-col items-center gap-1"
      aria-label={`Match ${score} of 100`}
    >
      <span className="text-lg font-semibold tabular-nums text-bp-ink">{score}</span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-bp-line" aria-hidden="true">
        <span
          className={cn(
            'block h-full',
            score >= 60 ? 'bg-bp-pine' : score >= 30 ? 'bg-bp-amber' : 'bg-bp-line-strong'
          )}
          style={{ width: `${score}%` }}
        />
      </span>
    </div>
  );
}

function RequirementView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { consultants, requirements, submissions, loading, error, refresh } = useBench();
  const [matches, setMatches] = useState<ConsultantMatch[] | null>(null);
  const [submitting, setSubmitting] = useState<ConsultantMatch | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadMatches = useCallback(async () => {
    try {
      setMatches(await matchRequirement(id));
    } catch {
      setMatches([]);
    }
  }, [id]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  const afterChange = () => {
    setActionError(null);
    void refresh();
    void loadMatches();
  };
  const { move, busy, dialog } = useMoveSubmission(afterChange, setActionError);

  const requirement = requirements.find((r) => r.requirement_id === id);
  const theirs = submissions.filter((s) => s.requirement_id === id);

  if (loading) return <Spinner label="Loading requirement" />;
  if (!requirement) {
    return (
      <Empty
        title="Requirement not found"
        action={<ButtonLink href="/bench/requirements">All requirements</ButtonLink>}
      >
        It may have been removed.
      </Empty>
    );
  }

  const facts = [
    requirement.client,
    requirement.vendor && `via ${requirement.vendor}`,
    requirement.external_ref && `req ${requirement.external_ref}`,
    requirement.location,
  ].filter(Boolean);

  const setStatus = async (status: RequirementStatus) => {
    try {
      await updateRequirement(requirement.requirement_id, { status });
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update the requirement.');
    }
  };

  const retry = async (submissionId: string) => {
    setRetrying(submissionId);
    try {
      await retrySubmissionTailoring(submissionId);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not retry.');
    } finally {
      setRetrying(null);
    }
  };

  const submittingCandidate = submitting
    ? consultants.find((c) => c.consultant_id === submitting.consultant_id)
    : undefined;

  return (
    <>
      <PageHeader
        back={{ href: '/bench/requirements', label: 'Requirements' }}
        title={requirement.title}
        subtitle={facts.join(', ')}
        actions={
          <>
            <div className="text-right">
              <p className="text-xs text-bp-muted">Bill rate</p>
              <p className="text-lg font-semibold tabular-nums">
                {requirement.bill_rate === null ? '—' : `${money(requirement.bill_rate)}/hr`}
              </p>
            </div>
            <Select
              aria-label="Requirement status"
              value={requirement.status}
              onChange={(e) => void setStatus(e.target.value as RequirementStatus)}
              className="w-36"
            >
              {(Object.keys(REQUIREMENT_STATUS) as RequirementStatus[]).map((s) => (
                <option key={s} value={s}>
                  {REQUIREMENT_STATUS[s]}
                </option>
              ))}
            </Select>
          </>
        }
      />

      {params.get('existing') === '1' && (
        <div className="mb-4">
          <Notice tone="info">
            This requirement was already on file, so nothing new was added.
          </Notice>
        </div>
      )}
      {(error || actionError) && (
        <div className="mb-4">
          <Notice tone="error">{actionError ?? error}</Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Best matches on your bench" bodyClassName="p-0">
            <p className="border-b border-bp-line px-5 py-3 text-sm text-bp-muted">
              Ranked by how many of each candidate’s listed skills the description mentions. A
              starting point for your judgement, not a verdict.
            </p>
            {matches === null ? (
              <div className="p-5">
                <Spinner label="Ranking the bench" />
              </div>
            ) : matches.length === 0 ? (
              <div className="px-5">
                <Empty title="No one to rank yet">Add candidates with skills to see matches.</Empty>
              </div>
            ) : (
              <ul>
                {matches.map((m) => (
                  <li
                    key={m.consultant_id}
                    className="flex items-start gap-4 border-b border-bp-line px-5 py-4 last:border-b-0"
                  >
                    <ScoreMeter score={m.score} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/bench/candidates/${m.consultant_id}`}
                        className="font-medium hover:text-bp-pine"
                      >
                        {m.full_name}
                      </Link>
                      <p className="text-sm text-bp-muted">{m.headline ?? 'No headline'}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.matched_skills.length ? (
                          m.matched_skills.map((s) => (
                            <Chip key={s} active>
                              {s}
                            </Chip>
                          ))
                        ) : (
                          <span className="text-xs text-bp-muted">
                            None of their listed skills appear
                          </span>
                        )}
                        {m.skill_count > m.matched_skills.length && m.matched_skills.length > 0 && (
                          <span className="self-center text-xs text-bp-muted">
                            of {m.skill_count} listed
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {m.already_submitted ? (
                        <span className="text-sm text-bp-muted">Submitted</span>
                      ) : !m.has_resume ? (
                        <ButtonLink href={`/bench/candidates/${m.consultant_id}`} size="sm">
                          Needs resume
                        </ButtonLink>
                      ) : (
                        <Button
                          size="sm"
                          disabled={requirement.status !== 'open'}
                          onClick={() => setSubmitting(m)}
                        >
                          <PaperPlaneTilt aria-hidden="true" /> Submit
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Job description">
            <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-bp-ink">
              {requirement.description}
            </p>
          </Panel>
        </div>

        <Panel title={`Submitted (${theirs.length})`} bodyClassName="p-0" className="self-start">
          {theirs.length === 0 ? (
            <div className="px-5">
              <Empty title="No one submitted yet">Pick someone from the matches.</Empty>
            </div>
          ) : (
            <ul>
              {theirs.map((s) => {
                const failed = s.status === 'tailoring' && s.tailoring_status === 'failed';
                return (
                  <li
                    key={s.submission_id}
                    className="flex flex-col gap-3 border-b border-bp-line px-5 py-4 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/bench/candidates/${s.consultant_id}`}
                          className="font-medium hover:text-bp-pine"
                        >
                          {s.consultant_name}
                        </Link>
                        <p className="text-sm text-bp-muted">
                          {s.rtr_confirmed
                            ? 'Right to represent confirmed'
                            : 'Right to represent not confirmed'}
                        </p>
                      </div>
                      <StageTag status={s.status} />
                    </div>
                    <RateBar bill={s.bill_rate} pay={s.pay_rate} />
                    <div className="flex flex-wrap items-center gap-2">
                      {s.tailored_resume_id ? (
                        <ButtonLink
                          href={`/resumes/${s.tailored_resume_id}`}
                          size="sm"
                          variant={s.status === 'ready' ? 'primary' : 'secondary'}
                        >
                          Review resume
                        </ButtonLink>
                      ) : failed ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={retrying === s.submission_id}
                          onClick={() => void retry(s.submission_id)}
                        >
                          <ArrowClockwise aria-hidden="true" />
                          {retrying === s.submission_id
                            ? 'Retrying…'
                            : 'Tailoring failed, try again'}
                        </Button>
                      ) : (
                        <Spinner label="Writing the tailored resume" />
                      )}
                      <Select
                        aria-label={`Move ${s.consultant_name}`}
                        value=""
                        disabled={busy === s.submission_id}
                        onChange={(e) => {
                          if (e.target.value) move(s, e.target.value as SubmissionStatus);
                        }}
                        className="ml-auto h-8 w-44 text-sm"
                      >
                        <option value="">Move to…</option>
                        {BOARD_STAGES.filter((st) => st !== s.status && st !== 'tailoring').map(
                          (st) => (
                            <option key={st} value={st}>
                              {STAGE[st].label}
                            </option>
                          )
                        )}
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {submitting && (
        <SubmitDialog
          open
          onClose={() => setSubmitting(null)}
          candidate={{
            consultant_id: submitting.consultant_id,
            full_name: submitting.full_name,
            pay_rate: submittingCandidate?.pay_rate ?? null,
          }}
          requirement={requirement}
          onCreated={afterChange}
        />
      )}
      {dialog}
    </>
  );
}

export default function RequirementPage() {
  return (
    <Suspense>
      <RequirementView />
    </Suspense>
  );
}
