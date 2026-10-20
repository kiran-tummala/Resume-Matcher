'use client';

import React, { useEffect, useState } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/lib/i18n';
import {
  createSubmission,
  DuplicateSubmissionError,
  type Consultant,
  type Requirement,
  type Submission,
} from '@/lib/api/bench';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultant: Pick<Consultant, 'consultant_id' | 'full_name'> & { pay_rate?: number | null };
  requirement: Requirement;
  onCreated: (submission: Submission) => void;
}

export function SubmitDialog({ open, onOpenChange, consultant, requirement, onCreated }: Props) {
  const { t } = useTranslations();
  const [billRate, setBillRate] = useState('');
  const [payRate, setPayRate] = useState('');
  const [rtr, setRtr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBillRate(requirement.bill_rate === null ? '' : String(requirement.bill_rate));
    setPayRate(
      consultant.pay_rate === null || consultant.pay_rate === undefined
        ? ''
        : String(consultant.pay_rate)
    );
    setRtr(false);
    setError(null);
  }, [open, requirement, consultant]);

  const parse = (value: string): number | null | undefined => {
    if (value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const bill = parse(billRate);
  const pay = parse(payRate);
  const margin = typeof bill === 'number' && typeof pay === 'number' ? bill - pay : null;

  const handleCreate = async () => {
    if (bill === undefined || pay === undefined) {
      setError(t('bench.rateInvalid'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const submission = await createSubmission({
        consultant_id: consultant.consultant_id,
        requirement_id: requirement.requirement_id,
        bill_rate: bill,
        pay_rate: pay,
        rtr_confirmed: rtr,
      });
      onCreated(submission);
      onOpenChange(false);
    } catch (e) {
      setError(
        e instanceof DuplicateSubmissionError
          ? t('bench.submit.duplicate')
          : e instanceof Error
            ? e.message
            : t('bench.saveFailed')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('bench.submit.title', { name: consultant.full_name })}</DialogTitle>
          <DialogDescription>
            {t('bench.submit.description', {
              title: requirement.title,
              client: requirement.client ?? '—',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="submit-bill">{t('bench.fields.billRate')}</Label>
              <Input
                id="submit-bill"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={billRate}
                onChange={(e) => setBillRate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="submit-pay">{t('bench.fields.payRate')}</Label>
              <Input
                id="submit-pay"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={payRate}
                onChange={(e) => setPayRate(e.target.value)}
              />
            </div>
          </div>
          {margin !== null && (
            <p
              className={
                margin < 0
                  ? 'font-mono text-sm font-bold text-destructive'
                  : 'font-mono text-sm text-ink'
              }
            >
              {t('bench.submit.margin', { margin: margin.toFixed(2) })}
            </p>
          )}
          <label className="flex items-start gap-3 border border-ink bg-white p-3 shadow-sw-nested">
            <input
              type="checkbox"
              checked={rtr}
              onChange={(e) => setRtr(e.target.checked)}
              className="mt-1 size-4 accent-ink"
            />
            <span className="text-sm text-ink-soft">{t('bench.submit.rtr')}</span>
          </label>
          <p className="text-sm text-ink-soft">{t('bench.submit.tailorNote')}</p>
          {error && <Alert tone="error">{error}</Alert>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={handleCreate} disabled={saving}>
            {saving ? (
              <>
                <SpinnerGap aria-hidden="true" className="animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('bench.submit.confirm')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
