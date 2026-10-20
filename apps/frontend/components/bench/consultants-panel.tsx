'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { FileArrowUp, PencilSimple, Plus, SpinnerGap, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusIndicator, type StatusTone } from '@/components/ui/status-indicator';
import { ConsultantDialog } from '@/components/bench/consultant-dialog';
import { useTranslations } from '@/lib/i18n';
import {
  deleteConsultant,
  formatRate,
  uploadConsultantResume,
  type Consultant,
} from '@/lib/api/bench';

const RESUME_TONE: Record<string, StatusTone> = {
  ready: 'ready',
  processing: 'active',
  pending: 'active',
  failed: 'error',
};

interface Props {
  consultants: Consultant[];
  onChanged: () => void;
}

export function ConsultantsPanel({ consultants, onChanged }: Props) {
  const { t } = useTranslations();
  const [editing, setEditing] = useState<Consultant | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Consultant | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (consultant: Consultant) => {
    setEditing(consultant);
    setDialogOpen(true);
  };

  const pickFile = (consultantId: string) => {
    uploadTarget.current = consultantId;
    fileInput.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const consultantId = uploadTarget.current;
    e.target.value = '';
    if (!file || !consultantId) return;
    setUploadingId(consultantId);
    setError(null);
    try {
      const updated = await uploadConsultantResume(consultantId, file);
      if (updated.resume_status === 'failed') setError(t('bench.consultants.parseFailed'));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bench.consultants.uploadFailed'));
    } finally {
      setUploadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteConsultant(deleting.consultant_id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bench.saveFailed'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section aria-labelledby="bench-consultants-heading" className="space-y-4 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="bench-consultants-heading" className="font-serif text-2xl font-bold text-ink">
          {t('bench.consultants.heading', { count: consultants.length })}
        </h2>
        <Button type="button" onClick={openAdd}>
          <Plus aria-hidden="true" />
          {t('bench.consultants.add')}
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFile}
        aria-hidden="true"
        tabIndex={-1}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {consultants.length === 0 ? (
        <EmptyState
          variant="framed"
          title={t('bench.consultants.emptyTitle')}
          description={t('bench.consultants.emptyDescription')}
        />
      ) : (
        <div className="overflow-x-auto border border-ink bg-white shadow-sw-nested">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-ink bg-paper font-mono text-xs uppercase tracking-wider text-steel">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t('bench.fields.fullName')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('bench.fields.skills')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('bench.fields.payRate')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('bench.fields.status')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('bench.fields.resume')}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">{t('bench.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {consultants.map((c) => {
                const uploading = uploadingId === c.consultant_id;
                return (
                  <tr
                    key={c.consultant_id}
                    className="border-b border-panel align-top last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-ink">{c.full_name}</div>
                      {c.headline && <div className="text-ink-soft">{c.headline}</div>}
                      {(c.location || c.work_authorization) && (
                        <div className="mt-1 font-mono text-xs text-steel">
                          {[c.location, c.work_authorization].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="max-w-[22rem] px-4 py-3 text-ink-soft">{c.skills || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono">
                      {formatRate(c.pay_rate)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator
                        tone={c.status === 'bench' ? 'ready' : 'neutral'}
                        live={false}
                      >
                        {t(`bench.consultantStatus.${c.status}`)}
                      </StatusIndicator>
                    </td>
                    <td className="px-4 py-3">
                      {uploading ? (
                        <StatusIndicator tone="active">
                          {t('bench.consultants.parsing')}
                        </StatusIndicator>
                      ) : c.resume_id ? (
                        <div className="flex flex-col items-start gap-2">
                          <StatusIndicator
                            tone={RESUME_TONE[c.resume_status ?? ''] ?? 'neutral'}
                            live={false}
                          >
                            {t(`bench.resumeStatus.${c.resume_status ?? 'pending'}`)}
                          </StatusIndicator>
                          {c.resume_status === 'ready' && (
                            <Link
                              href={`/resumes/${encodeURIComponent(c.resume_id)}`}
                              className="font-mono text-xs font-bold uppercase text-primary underline"
                            >
                              {t('bench.consultants.viewResume')}
                            </Link>
                          )}
                        </div>
                      ) : (
                        <StatusIndicator tone="warning" live={false}>
                          {t('bench.resumeStatus.missing')}
                        </StatusIndicator>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploading}
                          onClick={() => pickFile(c.consultant_id)}
                        >
                          {uploading ? (
                            <SpinnerGap aria-hidden="true" className="animate-spin" />
                          ) : (
                            <FileArrowUp aria-hidden="true" />
                          )}
                          {c.resume_id
                            ? t('bench.consultants.replaceResume')
                            : t('bench.consultants.uploadResume')}
                        </Button>
                        <button
                          type="button"
                          className={buttonClass({ variant: 'outline', size: 'icon-sm' })}
                          onClick={() => openEdit(c)}
                          aria-label={t('bench.consultants.editNamed', { name: c.full_name })}
                        >
                          <PencilSimple aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={buttonClass({
                            variant: 'outline-destructive',
                            size: 'icon-sm',
                          })}
                          onClick={() => setDeleting(c)}
                          aria-label={t('bench.consultants.deleteNamed', { name: c.full_name })}
                        >
                          <Trash aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConsultantDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        consultant={editing}
        onSaved={() => onChanged()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('bench.consultants.deleteTitle')}
        description={t('bench.consultants.deleteDescription', { name: deleting?.full_name ?? '' })}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={confirmDelete}
      />
    </section>
  );
}
