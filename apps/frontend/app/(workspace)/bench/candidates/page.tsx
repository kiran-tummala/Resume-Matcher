'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MagnifyingGlass, Plus } from '@phosphor-icons/react';
import type { ConsultantStatus } from '@/lib/api/bench';
import { CandidateDialog } from '@/components/workspace/dialogs';
import { ConsultantTag, money, Tag } from '@/components/workspace/stages';
import {
  Button,
  Empty,
  Notice,
  PageHeader,
  Select,
  Spinner,
  TextInput,
} from '@/components/workspace/ui';
import { useBench } from '@/components/workspace/use-bench';

type Filter = 'all' | ConsultantStatus;

function CandidatesView() {
  const { consultants, submissions, loading, error, refresh } = useBench();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('bench');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (params.get('new') === '1') setAdding(true);
  }, [params]);

  const activeByCandidate = useMemo(() => {
    const map = new Map<string, number>();
    submissions
      .filter((s) => !['rejected', 'withdrawn', 'placed'].includes(s.status))
      .forEach((s) => map.set(s.consultant_id, (map.get(s.consultant_id) ?? 0) + 1));
    return map;
  }, [submissions]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return consultants.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!q) return true;
      return [c.full_name, c.headline, c.skills, c.location]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [consultants, query, filter]);

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle={`${consultants.filter((c) => c.status === 'bench').length} on bench, ${consultants.length} in total`}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" /> Add candidate
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-bp-muted"
          />
          <TextInput
            type="search"
            aria-label="Search candidates"
            placeholder="Search name, skill or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Show"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="w-44"
        >
          <option value="bench">On bench</option>
          <option value="placed">Placed</option>
          <option value="inactive">Inactive</option>
          <option value="all">Everyone</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-bp-line bg-bp-surface">
        {loading ? (
          <div className="p-5">
            <Spinner label="Loading candidates" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5">
            {consultants.length === 0 ? (
              <Empty
                title="Add your first candidate"
                action={<Button onClick={() => setAdding(true)}>Add candidate</Button>}
              >
                Then upload their resume so it can be tailored to requirements.
              </Empty>
            ) : (
              <Empty title="No candidates match">Try another search or show everyone.</Empty>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-bp-line text-bp-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Name
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Skills
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Pay rate
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Resume
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Active
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const skills = (c.skills ?? '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                return (
                  <tr
                    key={c.consultant_id}
                    onClick={() => router.push(`/bench/candidates/${c.consultant_id}`)}
                    className="cursor-pointer border-b border-bp-line align-top last:border-b-0 hover:bg-bp-canvas"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/bench/candidates/${c.consultant_id}`}
                        className="font-medium text-bp-ink hover:text-bp-pine focus-visible:outline-2 focus-visible:outline-bp-pine"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.full_name}
                      </Link>
                      <div className="text-bp-muted">{c.headline ?? 'No headline'}</div>
                    </td>
                    <td className="max-w-[24rem] px-5 py-3.5 text-bp-muted">
                      {skills.length ? skills.slice(0, 5).join(', ') : '—'}
                      {skills.length > 5 && ` +${skills.length - 5}`}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums">
                      {c.pay_rate === null ? '—' : `${money(c.pay_rate)}/hr`}
                    </td>
                    <td className="px-5 py-3.5">
                      {!c.resume_id ? (
                        <Tag tone="amber">Missing</Tag>
                      ) : c.resume_status === 'ready' ? (
                        <Tag tone="pine">Ready</Tag>
                      ) : c.resume_status === 'failed' ? (
                        <Tag tone="red">Couldn’t read</Tag>
                      ) : (
                        <Tag tone="muted">Reading</Tag>
                      )}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums">
                      {activeByCandidate.get(c.consultant_id) ?? 0}
                    </td>
                    <td className="px-5 py-3.5">
                      <ConsultantTag status={c.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CandidateDialog
        open={adding}
        onClose={() => {
          setAdding(false);
          if (params.get('new')) router.replace('/bench/candidates');
        }}
        onSaved={(c) => {
          void refresh();
          router.push(`/bench/candidates/${c.consultant_id}`);
        }}
      />
    </>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense>
      <CandidatesView />
    </Suspense>
  );
}
