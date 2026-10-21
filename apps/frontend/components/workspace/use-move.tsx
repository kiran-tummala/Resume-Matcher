'use client';

import React, { useState } from 'react';
import {
  SENT_STATUSES,
  updateSubmission,
  type Submission,
  type SubmissionStatus,
} from '@/lib/api/bench';
import { RtrDialog } from './dialogs';

/**
 * Moves a submission to a new stage. Moving a profile out to a client needs the
 * candidate's right to represent, so that asks first. Returns the mover and the
 * dialog element to render.
 */
export function useMoveSubmission(onMoved: () => void, onError: (message: string) => void) {
  const [pending, setPending] = useState<{ s: Submission; to: SubmissionStatus } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const apply = async (s: Submission, to: SubmissionStatus, rtr?: boolean) => {
    setBusy(s.submission_id);
    try {
      await updateSubmission(
        s.submission_id,
        rtr ? { status: to, rtr_confirmed: true } : { status: to }
      );
      onMoved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not move the submission.');
    } finally {
      setBusy(null);
    }
  };

  const move = (s: Submission, to: SubmissionStatus) => {
    if (to === s.status) return;
    if (to === 'tailoring') return onError('A submission can’t go back to tailoring.');
    if (!s.tailored_resume_id && to !== 'withdrawn' && to !== 'rejected') {
      return onError('Wait for the tailored resume before moving this submission.');
    }
    if (SENT_STATUSES.has(to) && !s.rtr_confirmed) {
      setPending({ s, to });
      return;
    }
    void apply(s, to);
  };

  const dialog = (
    <RtrDialog
      open={pending !== null}
      name={pending?.s.consultant_name ?? 'the candidate'}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (pending) void apply(pending.s, pending.to, true);
        setPending(null);
      }}
    />
  );

  return { move, busy, dialog };
}
