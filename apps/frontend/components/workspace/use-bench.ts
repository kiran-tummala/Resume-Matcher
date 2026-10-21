'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listConsultants,
  listRequirements,
  listSubmissions,
  type Consultant,
  type Requirement,
  type Submission,
} from '@/lib/api/bench';

export interface BenchData {
  consultants: Consultant[];
  requirements: Requirement[];
  submissions: Submission[];
}

/** While a resume is being tailored, refresh this often to pick up the result. */
const TAILORING_POLL_MS = 5000;

/**
 * Loads the whole bench (consultants, requirements, submissions). Small teams
 * have hundreds of rows at most, so one load per page keeps every view in sync.
 */
export function useBench() {
  const [data, setData] = useState<BenchData>({
    consultants: [],
    requirements: [],
    submissions: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [consultants, requirements, submissions] = await Promise.all([
        listConsultants(),
        listRequirements(),
        listSubmissions(),
      ]);
      setData({ consultants, requirements, submissions });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the bench.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tailoring = data.submissions.some(
    (s) => s.status === 'tailoring' && s.tailoring_status !== 'failed'
  );
  useEffect(() => {
    if (!tailoring) return;
    const timer = window.setInterval(() => {
      listSubmissions()
        .then((submissions) => setData((prev) => ({ ...prev, submissions })))
        .catch(() => undefined);
    }, TAILORING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [tailoring]);

  return { ...data, loading, error, refresh, setData };
}
