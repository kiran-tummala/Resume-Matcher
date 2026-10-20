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
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/lib/i18n';
import {
  createConsultant,
  updateConsultant,
  type Consultant,
  type ConsultantInput,
  type ConsultantStatus,
} from '@/lib/api/bench';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this consultant; omit to add a new one. */
  consultant?: Consultant | null;
  onSaved: (consultant: Consultant) => void;
}

const EMPTY = {
  full_name: '',
  email: '',
  phone: '',
  headline: '',
  location: '',
  work_authorization: '',
  skills: '',
  pay_rate: '',
  available_from: '',
  status: 'bench' as ConsultantStatus,
  notes: '',
};

type FormState = typeof EMPTY;

function toForm(c?: Consultant | null): FormState {
  if (!c) return { ...EMPTY };
  return {
    full_name: c.full_name,
    email: c.email ?? '',
    phone: c.phone ?? '',
    headline: c.headline ?? '',
    location: c.location ?? '',
    work_authorization: c.work_authorization ?? '',
    skills: c.skills ?? '',
    pay_rate: c.pay_rate === null ? '' : String(c.pay_rate),
    available_from: c.available_from ?? '',
    status: c.status,
    notes: c.notes ?? '',
  };
}

const stopEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter') e.stopPropagation();
};

export function ConsultantDialog({ open, onOpenChange, consultant, onSaved }: Props) {
  const { t } = useTranslations();
  const [form, setForm] = useState<FormState>(() => toForm(consultant));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(consultant));
      setError(null);
    }
  }, [open, consultant]);

  const set =
    (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setError(t('bench.consultants.nameRequired'));
      return;
    }
    const rate = form.pay_rate.trim() === '' ? null : Number(form.pay_rate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
      setError(t('bench.rateInvalid'));
      return;
    }
    const blank = (value: string) => value.trim() || null;
    const payload: ConsultantInput = {
      full_name: form.full_name.trim(),
      email: blank(form.email),
      phone: blank(form.phone),
      headline: blank(form.headline),
      location: blank(form.location),
      work_authorization: blank(form.work_authorization),
      skills: blank(form.skills),
      pay_rate: rate,
      available_from: blank(form.available_from),
      status: form.status,
      notes: blank(form.notes),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = consultant
        ? await updateConsultant(consultant.consultant_id, payload)
        : await createConsultant(payload);
      onSaved(saved);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('bench.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof FormState,
    label: string,
    props: React.ComponentProps<'input'> = {}
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`consultant-${key}`}>{label}</Label>
      <Input id={`consultant-${key}`} value={form[key]} onChange={set(key)} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {consultant ? t('bench.consultants.editTitle') : t('bench.consultants.addTitle')}
          </DialogTitle>
          <DialogDescription>{t('bench.consultants.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {field('full_name', t('bench.fields.fullName'), { required: true })}
            {field('headline', t('bench.fields.headline'))}
            {field('email', t('bench.fields.email'), { type: 'email' })}
            {field('phone', t('bench.fields.phone'), { type: 'tel' })}
            {field('location', t('bench.fields.location'))}
            {field('work_authorization', t('bench.fields.workAuthorization'))}
            {field('pay_rate', t('bench.fields.payRate'), {
              type: 'number',
              min: 0,
              step: '0.01',
              inputMode: 'decimal',
            })}
            {field('available_from', t('bench.fields.availableFrom'), { type: 'date' })}
          </div>
          <div className="space-y-1">
            <Label htmlFor="consultant-skills">{t('bench.fields.skills')}</Label>
            <Textarea
              id="consultant-skills"
              value={form.skills}
              onChange={set('skills')}
              onKeyDown={stopEnter}
              rows={2}
              placeholder={t('bench.fields.skillsPlaceholder')}
            />
          </div>
          <Dropdown
            label={t('bench.fields.status')}
            options={(['bench', 'placed', 'inactive'] as const).map((s) => ({
              id: s,
              label: t(`bench.consultantStatus.${s}`),
            }))}
            value={form.status}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, status: value as ConsultantStatus }))
            }
          />
          <div className="space-y-1">
            <Label htmlFor="consultant-notes">{t('bench.fields.notes')}</Label>
            <Textarea
              id="consultant-notes"
              value={form.notes}
              onChange={set('notes')}
              onKeyDown={stopEnter}
              rows={3}
            />
          </div>
          {error && <Alert tone="error">{error}</Alert>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <SpinnerGap aria-hidden="true" className="animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('common.save')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
