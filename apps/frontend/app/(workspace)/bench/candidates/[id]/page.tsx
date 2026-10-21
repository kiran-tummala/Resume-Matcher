'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FileArrowUp, FilePdf, PaperPlaneTilt, PencilSimple, Trash } from '@phosphor-icons/react';
import { deleteConsultant, uploadConsultantResume, type Requirement } from '@/lib/api/bench';
import { CandidateDialog, SubmitDialog } from '@/components/workspace/dialogs';
import { ConsultantTag, money, RateBar, StageTag, Tag } from '@/components/workspace/stages';
import {
  Button,
  ButtonLink,
  Chip,
  Dialog,
  Empty,
  Notice,
  PageHeader,
  Panel,
  Select,
  Spinner,
} from '@/components/workspace/ui';
import { useBench } from '@/components/workspace/use-bench';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-bp-muted">{label}</dt>
      <dd className="min-w-0 break-words text-bp-ink">{value || '—'}</dd>
    </div>
  );
}

export default function CandidatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { consultants, requirements, submissions, loading, error, refresh } = useBench();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'warn' | 'info'; text: string } | null>(
    null
  );
  const [reqId, setReqId] = useState('');
  const [submitTo, setSubmitTo] = useState<Requirement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const candidate = consultants.find((c) => c.consultant_id === id);
  const theirs = submissions.filter((s) => s.consultant_id === id);
  const submittedReqs = new Set(theirs.map((s) => s.requirement_id));
  const openReqs = requirements.filter(
    (r) => r.status === 'open' && !submittedReqs.has(r.requirement_id)
  );

  if (loading) return <Spinner label="Loading candidate" />;
  if (!candidate) {
    return (
      <Empty
        title="Candidate not found"
        action={<ButtonLink href="/bench/candidates">All candidates</ButtonLink>}
      >
        They may have been deleted.
      </Empty>
    );
  }

  const skills = (candidate.skills ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const updated = await uploadConsultantResume(candidate.consultant_id, file);
      setNotice(
        updated.resume_status === 'ready'
          ? { tone: 'info', text: 'Resume uploaded and read.' }
          : {
              tone: 'warn',
              text: 'The file uploaded but the resume couldn’t be read. Check your AI settings, then upload again.',
            }
      );
      await refresh();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    await deleteConsultant(candidate.consultant_id);
    router.push('/bench/candidates');
  };

  const resumeReady = candidate.resume_status === 'ready';

  return (
    <>
      <PageHeader
        back={{ href: '/bench/candidates', label: 'Candidates' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {candidate.full_name} <ConsultantTag status={candidate.status} />
          </span>
        }
        subtitle={candidate.headline ?? undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <PencilSimple aria-hidden="true" /> Edit
            </Button>
            <Button
              variant="danger"
              onClick={() => setDeleting(true)}
              aria-label={`Delete ${candidate.full_name}`}
            >
              <Trash aria-hidden="true" />
            </Button>
          </>
        }
      />
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Details">
            <dl className="-my-2 divide-y divide-bp-line">
              <Detail
                label="Email"
                value={
                  candidate.email && (
                    <a className="text-bp-pine hover:underline" href={`mailto:${candidate.email}`}>
                      {candidate.email}
                    </a>
                  )
                }
              />
              <Detail label="Phone" value={candidate.phone} />
              <Detail label="Location" value={candidate.location} />
              <Detail label="Work authorization" value={candidate.work_authorization} />
              <Detail
                label="Pay rate"
                value={candidate.pay_rate !== null && `${money(candidate.pay_rate)}/hr`}
              />
              <Detail label="Available from" value={candidate.available_from} />
            </dl>
          </Panel>

          <Panel title="Skills">
            {skills.length ? (
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </div>
            ) : (
              <p className="text-sm text-bp-muted">No skills listed. Add them so matching works.</p>
            )}
          </Panel>

          {candidate.notes && (
            <Panel title="Notes">
              <p className="whitespace-pre-wrap text-sm">{candidate.notes}</p>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Panel
            title="Resume"
            action={
              <Button
                size="sm"
                variant="secondary"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <FileArrowUp aria-hidden="true" />
                {candidate.resume_id ? 'Replace' : 'Upload'}
              </Button>
            }
          >
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={upload}
              aria-hidden="true"
              tabIndex={-1}
            />
            {uploading ? (
              <Spinner label="Reading the resume. This takes up to a minute." />
            ) : !candidate.resume_id ? (
              <Empty title="No resume yet">
                Upload a PDF or Word file. It’s used to write a tailored resume for each
                requirement.
              </Empty>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FilePdf className="size-8 text-bp-muted" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Base resume</p>
                    <p className="text-sm text-bp-muted">
                      {resumeReady
                        ? 'Read and ready to tailor'
                        : candidate.resume_status === 'failed'
                          ? 'Couldn’t be read. Upload it again.'
                          : 'Reading…'}
                    </p>
                  </div>
                </div>
                {resumeReady && (
                  <ButtonLink href={`/resumes/${candidate.resume_id}`} size="sm">
                    View and edit
                  </ButtonLink>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Submit to a requirement">
            {!resumeReady ? (
              <p className="text-sm text-bp-muted">Upload a resume first.</p>
            ) : openReqs.length === 0 ? (
              <p className="text-sm text-bp-muted">
                No open requirements left for {candidate.full_name.split(' ')[0]}.{' '}
                <Link href="/bench/requirements?new=1" className="text-bp-pine hover:underline">
                  Add a requirement
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Select
                  aria-label="Requirement"
                  value={reqId}
                  onChange={(e) => setReqId(e.target.value)}
                  className="max-w-md flex-1"
                >
                  <option value="">Choose a requirement…</option>
                  {openReqs.map((r) => (
                    <option key={r.requirement_id} value={r.requirement_id}>
                      {r.title}
                      {r.client ? ` (${r.client})` : ''}
                    </option>
                  ))}
                </Select>
                <Button
                  disabled={!reqId}
                  onClick={() =>
                    setSubmitTo(openReqs.find((r) => r.requirement_id === reqId) ?? null)
                  }
                >
                  <PaperPlaneTilt aria-hidden="true" /> Submit
                </Button>
              </div>
            )}
          </Panel>

          <Panel title={`Submissions (${theirs.length})`} bodyClassName="p-0">
            {theirs.length === 0 ? (
              <div className="px-5">
                <Empty title="Not submitted anywhere yet" />
              </div>
            ) : (
              <ul>
                {theirs.map((s) => (
                  <li
                    key={s.submission_id}
                    className="grid grid-cols-1 gap-3 border-b border-bp-line px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_14rem_auto]"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/bench/requirements/${s.requirement_id}`}
                        className="font-medium hover:text-bp-pine"
                      >
                        {s.requirement_title}
                      </Link>
                      <p className="text-sm text-bp-muted">
                        {s.client ?? 'No client'}
                        {!s.rtr_confirmed && ', right to represent not confirmed'}
                      </p>
                    </div>
                    <RateBar bill={s.bill_rate} pay={s.pay_rate} compact />
                    <div className="flex items-center gap-3 md:justify-end">
                      <StageTag status={s.status} />
                      {s.tailored_resume_id && (
                        <Link
                          href={`/resumes/${s.tailored_resume_id}`}
                          className="text-sm text-bp-pine hover:underline"
                        >
                          Resume
                        </Link>
                      )}
                      {s.status === 'tailoring' && s.tailoring_status === 'failed' && (
                        <Tag tone="red">Failed</Tag>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <CandidateDialog
        open={editing}
        onClose={() => setEditing(false)}
        candidate={candidate}
        onSaved={() => void refresh()}
      />
      {submitTo && (
        <SubmitDialog
          open
          onClose={() => setSubmitTo(null)}
          candidate={candidate}
          requirement={submitTo}
          onCreated={() => {
            setReqId('');
            void refresh();
          }}
        />
      )}
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${candidate.full_name}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              Keep
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete candidate
            </Button>
          </>
        }
      >
        <p className="text-sm">
          This removes their profile, their resume, every tailored copy and all their submissions.
          It can’t be undone.
        </p>
      </Dialog>
    </>
  );
}
