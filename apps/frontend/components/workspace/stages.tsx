'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type {
  ConsultantStatus,
  RequirementStatus,
  Submission,
  SubmissionStatus,
} from '@/lib/api/bench';

type Tone = 'muted' | 'amber' | 'slate' | 'pine' | 'red';

export const STAGE: Record<SubmissionStatus, { label: string; tone: Tone; hint: string }> = {
  tailoring: { label: 'Tailoring', tone: 'muted', hint: 'Writing a resume for this role' },
  ready: { label: 'Ready to send', tone: 'amber', hint: 'Review the resume, then send it' },
  submitted: { label: 'Submitted', tone: 'slate', hint: 'Sent to the client or vendor' },
  client_review: { label: 'Client review', tone: 'slate', hint: 'The client is looking at it' },
  interview: { label: 'Interview', tone: 'pine', hint: 'Interview scheduled or done' },
  offer: { label: 'Offer', tone: 'pine', hint: 'Offer made' },
  placed: { label: 'Placed', tone: 'pine', hint: 'Started on the project' },
  rejected: { label: 'Rejected', tone: 'red', hint: 'Not moving forward' },
  withdrawn: { label: 'Withdrawn', tone: 'muted', hint: 'Pulled from consideration' },
};

/** Board column order. Rejected and withdrawn sit at the end. */
export const BOARD_STAGES: SubmissionStatus[] = [
  'tailoring',
  'ready',
  'submitted',
  'client_review',
  'interview',
  'offer',
  'placed',
  'rejected',
  'withdrawn',
];

/** Stages where the profile is out with a client: margin is "in play". */
export const ACTIVE_STAGES: ReadonlySet<SubmissionStatus> = new Set([
  'submitted',
  'client_review',
  'interview',
  'offer',
]);

export const CONSULTANT_STATUS: Record<ConsultantStatus, string> = {
  bench: 'On bench',
  placed: 'Placed',
  inactive: 'Inactive',
};

export const REQUIREMENT_STATUS: Record<RequirementStatus, string> = {
  open: 'Open',
  on_hold: 'On hold',
  closed: 'Closed',
};

const TONE: Record<Tone, string> = {
  muted: 'bg-bp-canvas text-bp-muted ring-bp-line-strong',
  amber: 'bg-bp-amber-tint text-bp-amber ring-bp-amber/30',
  slate: 'bg-bp-slate-tint text-bp-slate ring-bp-slate/25',
  pine: 'bg-bp-pine-tint text-bp-pine ring-bp-pine/25',
  red: 'bg-bp-red-tint text-bp-red ring-bp-red/25',
};

export function Tag({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StageTag({ status }: { status: SubmissionStatus }) {
  const stage = STAGE[status];
  return <Tag tone={stage.tone}>{stage.label}</Tag>;
}

export function ConsultantTag({ status }: { status: ConsultantStatus }) {
  const tone: Tone = status === 'bench' ? 'pine' : status === 'placed' ? 'slate' : 'muted';
  return <Tag tone={tone}>{CONSULTANT_STATUS[status]}</Tag>;
}

export function RequirementTag({ status }: { status: RequirementStatus }) {
  const tone: Tone = status === 'open' ? 'pine' : status === 'on_hold' ? 'amber' : 'muted';
  return <Tag tone={tone}>{REQUIREMENT_STATUS[status]}</Tag>;
}

/** "$95" or "$95.50": rates without trailing zeros. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 0) return `-${money(-value)}`;
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/**
 * The rate bar: bill rate as the full width, pay as the muted part, margin as
 * the pine part. The one place the workspace spends its colour.
 */
export function RateBar({
  bill,
  pay,
  compact = false,
}: {
  bill: number | null;
  pay: number | null;
  compact?: boolean;
}) {
  if (bill === null || pay === null || bill <= 0) {
    return <p className="text-xs text-bp-muted">Rates not set</p>;
  }
  const margin = bill - pay;
  const negative = margin < 0;
  const payShare = Math.min(100, Math.max(0, (pay / bill) * 100));
  const summary = `Bill ${money(bill)} an hour, pay ${money(pay)}, margin ${money(margin)}`;
  return (
    <div className="flex flex-col gap-1" aria-label={summary} role="img">
      <div
        className={cn(
          'flex w-full overflow-hidden rounded-full bg-bp-line',
          compact ? 'h-1.5' : 'h-2'
        )}
        aria-hidden="true"
      >
        {negative ? (
          <div className="h-full w-full bg-bp-red" />
        ) : (
          <>
            <div className="h-full bg-bp-line-strong" style={{ width: `${payShare}%` }} />
            <div className="h-full flex-1 bg-bp-pine" />
          </>
        )}
      </div>
      <div
        className="flex items-baseline justify-between gap-2 text-xs tabular-nums"
        aria-hidden="true"
      >
        <span className="text-bp-muted">
          {money(pay)} pay of {money(bill)}
        </span>
        <span className={cn('font-semibold', negative ? 'text-bp-red' : 'text-bp-pine')}>
          {money(margin)}/hr
        </span>
      </div>
    </div>
  );
}

export function submissionMargin(s: Pick<Submission, 'margin'>): number {
  return s.margin ?? 0;
}
