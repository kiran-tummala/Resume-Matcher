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
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/lib/i18n';
import { createRequirement, type Requirement } from '@/lib/api/bench';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the saved requirement and whether it was new. */
  onSaved: (requirement: Requirement, created: boolean) => void;
}

const EMPTY = {
  title: '',
  client: '',
  vendor: '',
  external_ref: '',
  location: '',
  bill_rate: '',
  description: '',
};

export function RequirementDialog({ open, onOpenChange, onSaved }: Props) {
  const { t } = useTranslations();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY });
      setError(null);
    }
  }, [open]);

  const set =
    (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setError(t('bench.requirements.validation'));
      return;
    }
    const rate = form.bill_rate.trim() === '' ? null : Number(form.bill_rate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
      setError(t('bench.rateInvalid'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { requirement, created } = await createRequirement({
        title: form.title.trim(),
        description: form.description.trim(),
        client: form.client.trim() || undefined,
        vendor: form.vendor.trim() || undefined,
        external_ref: form.external_ref.trim() || undefined,
        location: form.location.trim() || undefined,
        bill_rate: rate,
      });
      onSaved(requirement, created);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('bench.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof typeof EMPTY,
    label: string,
    props: React.ComponentProps<'input'> = {}
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`requirement-${key}`}>{label}</Label>
      <Input id={`requirement-${key}`} value={form[key]} onChange={set(key)} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('bench.requirements.addTitle')}</DialogTitle>
          <DialogDescription>{t('bench.requirements.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {field('title', t('bench.fields.title'), { required: true })}
            {field('client', t('bench.fields.client'))}
            {field('vendor', t('bench.fields.vendor'))}
            {field('external_ref', t('bench.fields.externalRef'))}
            {field('location', t('bench.fields.location'))}
            {field('bill_rate', t('bench.fields.billRate'), {
              type: 'number',
              min: 0,
              step: '0.01',
              inputMode: 'decimal',
            })}
          </div>
          <div className="space-y-1">
            <Label htmlFor="requirement-description">{t('bench.fields.description')}</Label>
            <Textarea
              id="requirement-description"
              value={form.description}
              onChange={set('description')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.stopPropagation();
              }}
              rows={8}
              placeholder={t('bench.requirements.descriptionPlaceholder')}
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
