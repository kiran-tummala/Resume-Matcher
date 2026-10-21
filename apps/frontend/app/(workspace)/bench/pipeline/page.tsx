'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { DotsSixVertical, Warning } from '@phosphor-icons/react';
import { SENT_STATUSES, type Submission, type SubmissionStatus } from '@/lib/api/bench';
import { BOARD_STAGES, money, RateBar, STAGE } from '@/components/workspace/stages';
import { useMoveSubmission } from '@/components/workspace/use-move';
import { Empty, Notice, PageHeader, Select, Spinner } from '@/components/workspace/ui';
import { useBench } from '@/components/workspace/use-bench';
import { cn } from '@/lib/utils';

const TONE_DOT: Record<string, string> = {
  muted: 'bg-bp-line-strong',
  amber: 'bg-bp-amber',
  slate: 'bg-bp-slate',
  pine: 'bg-bp-pine',
  red: 'bg-bp-red',
};

function Card({
  s,
  busy,
  onMove,
}: {
  s: Submission;
  busy: boolean;
  onMove: (to: SubmissionStatus) => void;
}) {
  const draggable = s.status !== 'tailoring';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: s.submission_id,
    disabled: !draggable || busy,
  });
  const failed = s.status === 'tailoring' && s.tailoring_status === 'failed';
  return (
    <article
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        'rounded-lg border border-bp-line bg-bp-surface p-3 text-sm',
        isDragging && 'relative z-10 shadow-lg ring-2 ring-bp-pine/40',
        busy && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label={`Drag ${s.consultant_name}`}
            className="-ml-1 mt-0.5 cursor-grab rounded p-0.5 text-bp-muted hover:bg-bp-canvas focus-visible:outline-2 focus-visible:outline-bp-pine active:cursor-grabbing"
          >
            <DotsSixVertical className="size-4" aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/bench/candidates/${s.consultant_id}`}
            className="font-medium text-bp-ink hover:text-bp-pine"
          >
            {s.consultant_name}
          </Link>
          <Link
            href={`/bench/requirements/${s.requirement_id}`}
            className="block truncate text-bp-muted hover:text-bp-pine"
          >
            {s.requirement_title}
            {s.client ? `, ${s.client}` : ''}
          </Link>
        </div>
      </div>
      <div className="mt-3">
        <RateBar bill={s.bill_rate} pay={s.pay_rate} compact />
      </div>
      {(failed || (!s.rtr_confirmed && s.status === 'ready')) && (
        <p
          className={cn(
            'mt-2 flex items-center gap-1.5 text-xs',
            failed ? 'text-bp-red' : 'text-bp-amber'
          )}
        >
          <Warning className="size-3.5" aria-hidden="true" />
          {failed ? 'Tailoring failed' : 'Right to represent not confirmed'}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        {s.tailored_resume_id && (
          <Link
            href={`/resumes/${s.tailored_resume_id}`}
            className="text-xs text-bp-pine hover:underline"
          >
            Resume
          </Link>
        )}
        {draggable && (
          <Select
            aria-label={`Move ${s.consultant_name}`}
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && onMove(e.target.value as SubmissionStatus)}
            className="ml-auto h-7 w-28 px-2 text-xs"
          >
            <option value="">Move…</option>
            {BOARD_STAGES.filter((st) => st !== s.status && st !== 'tailoring').map((st) => (
              <option key={st} value={st}>
                {STAGE[st].label}
              </option>
            ))}
          </Select>
        )}
      </div>
    </article>
  );
}

function Column({
  stage,
  items,
  children,
}: {
  stage: SubmissionStatus;
  items: Submission[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage, disabled: stage === 'tailoring' });
  const margin = items.reduce((sum, s) => sum + (s.margin ?? 0), 0);
  const meta = STAGE[stage];
  return (
    <section
      ref={setNodeRef}
      aria-label={`${meta.label}, ${items.length}`}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border bg-bp-canvas/60',
        isOver ? 'border-bp-pine bg-bp-pine-tint/50' : 'border-bp-line'
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-bp-ink">
          <span aria-hidden="true" className={cn('size-2 rounded-full', TONE_DOT[meta.tone])} />
          {meta.label}
          <span className="font-normal text-bp-muted tabular-nums">{items.length}</span>
        </h2>
        {margin > 0 && (
          <span className="text-xs tabular-nums text-bp-muted" title="Total margin per hour">
            {money(margin)}/hr
          </span>
        )}
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">{children}</div>
    </section>
  );
}

export default function PipelinePage() {
  const { submissions, loading, error, refresh, setData } = useBench();
  const [actionError, setActionError] = useState<string | null>(null);
  const { move, busy, dialog } = useMoveSubmission(() => {
    setActionError(null);
    void refresh();
  }, setActionError);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const byStage = useMemo(() => {
    const map = Object.fromEntries(BOARD_STAGES.map((s) => [s, [] as Submission[]])) as Record<
      SubmissionStatus,
      Submission[]
    >;
    submissions.forEach((s) => map[s.status]?.push(s));
    return map;
  }, [submissions]);

  const onDragEnd = (event: DragEndEvent) => {
    const to = event.over?.id as SubmissionStatus | undefined;
    const s = submissions.find((x) => x.submission_id === event.active.id);
    if (!s || !to || to === s.status) return;
    // Show the card in its new column straight away when the move needs no
    // confirmation; the refresh after the server call settles the real state.
    const needsResume = !s.tailored_resume_id && to !== 'withdrawn' && to !== 'rejected';
    const needsRtr = SENT_STATUSES.has(to) && !s.rtr_confirmed;
    if (!needsResume && !needsRtr && to !== 'tailoring') {
      setData((prev) => ({
        ...prev,
        submissions: prev.submissions.map((x) =>
          x.submission_id === s.submission_id ? { ...x, status: to } : x
        ),
      }));
    }
    move(s, to);
  };

  return (
    <>
      <PageHeader title="Pipeline" subtitle="Drag a card to move it, or use its Move menu." />
      {(error || actionError) && (
        <div className="mb-4">
          <Notice tone="error">{actionError ?? error}</Notice>
        </div>
      )}
      {loading ? (
        <Spinner label="Loading the pipeline" />
      ) : submissions.length === 0 ? (
        <Empty title="Nothing in the pipeline yet">
          Open a requirement and submit a candidate from its matches.
        </Empty>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
            <div className="flex gap-3">
              {BOARD_STAGES.map((stage) => (
                <Column key={stage} stage={stage} items={byStage[stage]}>
                  {byStage[stage].length === 0 ? (
                    <p className="px-1 py-3 text-xs text-bp-muted">{STAGE[stage].hint}</p>
                  ) : (
                    byStage[stage].map((s) => (
                      <Card
                        key={s.submission_id}
                        s={s}
                        busy={busy === s.submission_id}
                        onMove={(to) => move(s, to)}
                      />
                    ))
                  )}
                </Column>
              ))}
            </div>
          </div>
        </DndContext>
      )}
      {dialog}
    </>
  );
}
