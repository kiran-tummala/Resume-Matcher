'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowClockwise,
  Briefcase,
  FileArrowUp,
  PaperPlaneTilt,
  Plus,
} from '@phosphor-icons/react';
import { retrySubmissionTailoring, type Submission } from '@/lib/api/bench';
import { ACTIVE_STAGES, BOARD_STAGES, money, RateBar, STAGE } from '@/components/workspace/stages';
import {
  Button,
  ButtonLink,
  Empty,
  Notice,
  PageHeader,
  Panel,
  Spinner,
} from '@/components/workspace/ui';
import { useBench } from '@/components/workspace/use-bench';
import { cn } from '@/lib/utils';

interface Task {
  key: string;
  icon: React.ElementType;
  tone: 'amber' | 'red' | 'muted';
  title: React.ReactNode;
  detail: React.ReactNode;
  action: React.ReactNode;
}

const STAGE_BAR: Record<string, string> = {
  muted: 'bg-bp-line-strong',
  amber: 'bg-bp-amber',
  slate: 'bg-bp-slate',
  pine: 'bg-bp-pine',
  red: 'bg-bp-red',
};

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function TodayPage() {
  const { consultants, requirements, submissions, loading, error, refresh } = useBench();
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (s: Submission) => {
    setRetrying(s.submission_id);
    try {
      await retrySubmissionTailoring(s.submission_id);
      await refresh();
    } finally {
      setRetrying(null);
    }
  };

  const tasks: Task[] = (() => {
    const out: Task[] = [];
    for (const s of submissions) {
      if (s.status === 'ready') {
        out.push({
          key: `ready-${s.submission_id}`,
          icon: PaperPlaneTilt,
          tone: 'amber',
          title: (
            <>
              Send {s.consultant_name}’s resume to {s.client ?? 'the client'}
            </>
          ),
          detail: s.rtr_confirmed
            ? `${s.requirement_title}. Tailored resume is ready to review.`
            : `${s.requirement_title}. Confirm right to represent before sending.`,
          action: (
            <ButtonLink
              href={`/bench/requirements/${s.requirement_id}`}
              size="sm"
              variant="primary"
            >
              Review
            </ButtonLink>
          ),
        });
      }
      if (s.status === 'tailoring' && s.tailoring_status === 'failed') {
        out.push({
          key: `failed-${s.submission_id}`,
          icon: ArrowClockwise,
          tone: 'red',
          title: <>Tailoring failed for {s.consultant_name}</>,
          detail: `${s.requirement_title}. Usually the AI provider’s daily limit or a bad key.`,
          action: (
            <Button
              size="sm"
              variant="secondary"
              disabled={retrying === s.submission_id}
              onClick={() => void retry(s)}
            >
              {retrying === s.submission_id ? 'Retrying…' : 'Try again'}
            </Button>
          ),
        });
      }
    }
    const submittedTo = new Set(submissions.map((s) => s.requirement_id));
    for (const r of requirements) {
      if (r.status === 'open' && !submittedTo.has(r.requirement_id)) {
        out.push({
          key: `req-${r.requirement_id}`,
          icon: Briefcase,
          tone: 'muted',
          title: <>No one put forward for {r.title}</>,
          detail:
            [r.client, r.vendor && `via ${r.vendor}`].filter(Boolean).join(', ') ||
            'Open requirement',
          action: (
            <ButtonLink href={`/bench/requirements/${r.requirement_id}`} size="sm">
              See matches
            </ButtonLink>
          ),
        });
      }
    }
    for (const c of consultants) {
      if (c.status === 'bench' && !c.resume_id) {
        out.push({
          key: `resume-${c.consultant_id}`,
          icon: FileArrowUp,
          tone: 'muted',
          title: <>Upload {c.full_name}’s resume</>,
          detail: 'Needed before they can be matched and submitted.',
          action: (
            <ButtonLink href={`/bench/candidates/${c.consultant_id}`} size="sm">
              Open profile
            </ButtonLink>
          ),
        });
      }
    }
    return out;
  })();

  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(BOARD_STAGES.map((s) => [s, 0])) as Record<string, number>;
    submissions.forEach((s) => (counts[s.status] += 1));
    return counts;
  }, [submissions]);

  const inPlay = submissions.filter((s) => ACTIVE_STAGES.has(s.status));
  const marginInPlay = inPlay.reduce((sum, s) => sum + (s.margin ?? 0), 0);
  const placed = submissions.filter((s) => s.status === 'placed');
  const marginPlaced = placed.reduce((sum, s) => sum + (s.margin ?? 0), 0);
  const onBench = consultants.filter((c) => c.status === 'bench').length;
  const openReqs = requirements.filter((r) => r.status === 'open').length;
  const maxStage = Math.max(1, ...Object.values(stageCounts));

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={todayLabel()}
        actions={
          <>
            <ButtonLink href="/bench/requirements?new=1" variant="secondary">
              <Plus aria-hidden="true" /> Requirement
            </ButtonLink>
            <ButtonLink href="/bench/candidates?new=1" variant="primary">
              <Plus aria-hidden="true" /> Candidate
            </ButtonLink>
          </>
        }
      />

      {error && (
        <div className="mb-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title={loading ? 'Needs you' : `Needs you (${tasks.length})`}
          bodyClassName="p-0"
          className="self-start"
        >
          {loading ? (
            <div className="p-5">
              <Spinner label="Loading your bench" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="px-5">
              <Empty title="Nothing is waiting on you">
                New requirements and finished resumes will show up here.
              </Empty>
            </div>
          ) : (
            <ul>
              {tasks.map(({ key, icon: Icon, tone, title, detail, action }) => (
                <li
                  key={key}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-bp-line px-5 py-4 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-lg',
                      tone === 'amber' && 'bg-bp-amber-tint text-bp-amber',
                      tone === 'red' && 'bg-bp-red-tint text-bp-red',
                      tone === 'muted' && 'bg-bp-canvas text-bp-muted'
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-bp-ink">{title}</p>
                    <p className="text-sm text-bp-muted">{detail}</p>
                  </div>
                  <div className="col-start-2 sm:col-start-auto">{action}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Margin">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-bp-muted">In play</dt>
                <dd className="text-2xl font-semibold tabular-nums text-bp-pine">
                  {money(marginInPlay)}
                  <span className="text-sm font-normal text-bp-muted">/hr</span>
                </dd>
                <dd className="text-xs text-bp-muted">{inPlay.length} with clients</dd>
              </div>
              <div>
                <dt className="text-sm text-bp-muted">Placed</dt>
                <dd className="text-2xl font-semibold tabular-nums text-bp-ink">
                  {money(marginPlaced)}
                  <span className="text-sm font-normal text-bp-muted">/hr</span>
                </dd>
                <dd className="text-xs text-bp-muted">{placed.length} working</dd>
              </div>
            </dl>
          </Panel>

          <Panel
            title="Pipeline"
            action={
              <Link href="/bench/pipeline" className="text-sm text-bp-pine hover:underline">
                Open board
              </Link>
            }
          >
            <ul className="flex flex-col gap-2.5">
              {BOARD_STAGES.filter((s) => s !== 'withdrawn').map((stage) => (
                <li
                  key={stage}
                  className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm"
                >
                  <span className="text-bp-muted">{STAGE[stage].label}</span>
                  <span
                    className="h-2 overflow-hidden rounded-full bg-bp-canvas"
                    aria-hidden="true"
                  >
                    <span
                      className={cn('block h-full rounded-full', STAGE_BAR[STAGE[stage].tone])}
                      style={{ width: `${(stageCounts[stage] / maxStage) * 100}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums font-medium">{stageCounts[stage]}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Bench">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-bp-muted">Candidates on bench</dt>
                <dd className="text-xl font-semibold tabular-nums">{onBench}</dd>
              </div>
              <div>
                <dt className="text-bp-muted">Open requirements</dt>
                <dd className="text-xl font-semibold tabular-nums">{openReqs}</dd>
              </div>
            </dl>
            {inPlay[0] && (
              <div className="mt-5 border-t border-bp-line pt-4">
                <p className="mb-2 text-sm">
                  Latest with a client:{' '}
                  <span className="font-medium">{inPlay[0].consultant_name}</span>
                </p>
                <RateBar bill={inPlay[0].bill_rate} pay={inPlay[0].pay_rate} compact />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
