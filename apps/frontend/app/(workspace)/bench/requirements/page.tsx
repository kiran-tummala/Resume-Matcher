'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MagnifyingGlass, Plus } from '@phosphor-icons/react';
import type { RequirementStatus } from '@/lib/api/bench';
import { RequirementDialog } from '@/components/workspace/dialogs';
import { money, RequirementTag } from '@/components/workspace/stages';
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
import { formatDate } from '@/lib/format-date';

type Filter = 'all' | RequirementStatus;

function RequirementsView() {
  const { requirements, submissions, loading, error, refresh } = useBench();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (params.get('new') === '1') setAdding(true);
  }, [params]);

  const counts = useMemo(() => {
    const map = new Map<string, { total: number; sent: number }>();
    submissions.forEach((s) => {
      const entry = map.get(s.requirement_id) ?? { total: 0, sent: 0 };
      entry.total += 1;
      if (!['tailoring', 'ready'].includes(s.status)) entry.sent += 1;
      map.set(s.requirement_id, entry);
    });
    return map;
  }, [submissions]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requirements.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return [r.title, r.client, r.vendor, r.external_ref, r.location]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [requirements, query, filter]);

  return (
    <>
      <PageHeader
        title="Requirements"
        subtitle={`${requirements.filter((r) => r.status === 'open').length} open`}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" /> Add requirement
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Notice tone="info">{notice}</Notice>
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
            aria-label="Search requirements"
            placeholder="Search title, client, vendor or req ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Show"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="w-40"
        >
          <option value="open">Open</option>
          <option value="on_hold">On hold</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-bp-line bg-bp-surface">
        {loading ? (
          <div className="p-5">
            <Spinner label="Loading requirements" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5">
            {requirements.length === 0 ? (
              <Empty
                title="Add your first requirement"
                action={<Button onClick={() => setAdding(true)}>Add requirement</Button>}
              >
                Paste a job description and BenchPilot ranks your candidates against it.
              </Empty>
            ) : (
              <Empty title="No requirements match">Try another search or show all.</Empty>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-bp-line text-bp-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Role
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Client
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Location
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Bill rate
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Submitted
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Added
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = counts.get(r.requirement_id);
                return (
                  <tr
                    key={r.requirement_id}
                    onClick={() => router.push(`/bench/requirements/${r.requirement_id}`)}
                    className="cursor-pointer border-b border-bp-line align-top last:border-b-0 hover:bg-bp-canvas"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/bench/requirements/${r.requirement_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-bp-ink hover:text-bp-pine focus-visible:outline-2 focus-visible:outline-bp-pine"
                      >
                        {r.title}
                      </Link>
                      {r.external_ref && <div className="text-bp-muted">Req {r.external_ref}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      {r.client ?? '—'}
                      {r.vendor && <div className="text-bp-muted">via {r.vendor}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-bp-muted">{r.location ?? '—'}</td>
                    <td className="px-5 py-3.5 tabular-nums">
                      {r.bill_rate === null ? '—' : `${money(r.bill_rate)}/hr`}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums">
                      {c ? `${c.sent} sent of ${c.total}` : 'None yet'}
                    </td>
                    <td className="px-5 py-3.5 text-bp-muted">{formatDate(r.created_at, 'en')}</td>
                    <td className="px-5 py-3.5">
                      <RequirementTag status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <RequirementDialog
        open={adding}
        onClose={() => {
          setAdding(false);
          if (params.get('new')) router.replace('/bench/requirements');
        }}
        onSaved={(r, created) => {
          void refresh();
          if (!created)
            setNotice(`“${r.title}” was already on file, so you’re looking at that one.`);
          router.push(`/bench/requirements/${r.requirement_id}${created ? '' : '?existing=1'}`);
        }}
      />
    </>
  );
}

export default function RequirementsPage() {
  return (
    <Suspense>
      <RequirementsView />
    </Suspense>
  );
}
