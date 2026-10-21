'use client';

import React, { useEffect, useState } from 'react';
import {
  createConsultant,
  createRequirement,
  createSubmission,
  DuplicateSubmissionError,
  updateConsultant,
  type Consultant,
  type ConsultantInput,
  type ConsultantStatus,
  type Requirement,
  type Submission,
} from '@/lib/api/bench';
import { Button, Dialog, Field, Notice, Select, TextArea, TextInput } from './ui';
import { RateBar } from './stages';

function parseRate(value: string): number | null | undefined {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const RATE_ERROR = 'Enter rates as dollars per hour, 0 or more.';

// -- candidate -------------------------------------------------------------

const EMPTY_CANDIDATE = {
  full_name: '',
  headline: '',
  email: '',
  phone: '',
  location: '',
  work_authorization: '',
  pay_rate: '',
  available_from: '',
  skills: '',
  status: 'bench' as ConsultantStatus,
  notes: '',
};

export function CandidateDialog({
  open,
  onClose,
  candidate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  candidate?: Consultant | null;
  onSaved: (c: Consultant) => void;
}) {
  const [form, setForm] = useState(EMPTY_CANDIDATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      candidate
        ? {
            full_name: candidate.full_name,
            headline: candidate.headline ?? '',
            email: candidate.email ?? '',
            phone: candidate.phone ?? '',
            location: candidate.location ?? '',
            work_authorization: candidate.work_authorization ?? '',
            pay_rate: candidate.pay_rate === null ? '' : String(candidate.pay_rate),
            available_from: candidate.available_from ?? '',
            skills: candidate.skills ?? '',
            status: candidate.status,
            notes: candidate.notes ?? '',
          }
        : EMPTY_CANDIDATE
    );
  }, [open, candidate]);

  const set =
    (key: keyof typeof EMPTY_CANDIDATE) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.full_name.trim()) return setError('Enter the candidate’s name.');
    const rate = parseRate(form.pay_rate);
    if (rate === undefined) return setError(RATE_ERROR);
    const blank = (v: string) => v.trim() || null;
    const payload: ConsultantInput = {
      full_name: form.full_name.trim(),
      headline: blank(form.headline),
      email: blank(form.email),
      phone: blank(form.phone),
      location: blank(form.location),
      work_authorization: blank(form.work_authorization),
      pay_rate: rate,
      available_from: blank(form.available_from),
      skills: blank(form.skills),
      status: form.status,
      notes: blank(form.notes),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = candidate
        ? await updateConsultant(candidate.consultant_id, payload)
        : await createConsultant(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={candidate ? `Edit ${candidate.full_name}` : 'Add a candidate'}
      description="Skills drive the match ranking, so list the ones you would put them forward for."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : candidate ? 'Save changes' : 'Add candidate'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="c-name">
          <TextInput
            id="c-name"
            value={form.full_name}
            onChange={set('full_name')}
            required
            autoFocus
          />
        </Field>
        <Field label="Headline" htmlFor="c-headline">
          <TextInput
            id="c-headline"
            value={form.headline}
            onChange={set('headline')}
            placeholder="Senior DevOps Engineer"
          />
        </Field>
        <Field label="Email" htmlFor="c-email">
          <TextInput id="c-email" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Phone" htmlFor="c-phone">
          <TextInput id="c-phone" type="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Location" htmlFor="c-location">
          <TextInput
            id="c-location"
            value={form.location}
            onChange={set('location')}
            placeholder="Dallas, TX"
          />
        </Field>
        <Field label="Work authorization" htmlFor="c-auth" hint="As the candidate states it.">
          <TextInput
            id="c-auth"
            value={form.work_authorization}
            onChange={set('work_authorization')}
          />
        </Field>
        <Field label="Pay rate ($/hr)" htmlFor="c-pay">
          <TextInput
            id="c-pay"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={form.pay_rate}
            onChange={set('pay_rate')}
          />
        </Field>
        <Field label="Available from" htmlFor="c-available">
          <TextInput
            id="c-available"
            type="date"
            value={form.available_from}
            onChange={set('available_from')}
          />
        </Field>
        <Field
          label="Skills"
          htmlFor="c-skills"
          hint="Separate with commas."
          className="sm:col-span-2"
        >
          <TextInput
            id="c-skills"
            value={form.skills}
            onChange={set('skills')}
            placeholder="Terraform, Kubernetes, AWS"
          />
        </Field>
        <Field label="Status" htmlFor="c-status">
          <Select id="c-status" value={form.status} onChange={set('status')}>
            <option value="bench">On bench</option>
            <option value="placed">Placed</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Notes" htmlFor="c-notes" className="sm:col-span-2">
          <TextArea id="c-notes" rows={3} value={form.notes} onChange={set('notes')} />
        </Field>
        {error && (
          <div className="sm:col-span-2">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}

// -- requirement -----------------------------------------------------------

const EMPTY_REQ = {
  title: '',
  client: '',
  vendor: '',
  external_ref: '',
  location: '',
  bill_rate: '',
  description: '',
};

export function RequirementDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (r: Requirement, created: boolean) => void;
}) {
  const [form, setForm] = useState(EMPTY_REQ);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_REQ);
      setError(null);
    }
  }, [open]);

  const set =
    (key: keyof typeof EMPTY_REQ) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      return setError('Enter a job title and paste the job description.');
    }
    const rate = parseRate(form.bill_rate);
    if (rate === undefined) return setError(RATE_ERROR);
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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Add a requirement"
      description="Paste the job description as you received it. If a second vendor sends the same req, you’ll be taken to the one already on file."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Add requirement'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Job title" htmlFor="r-title" className="sm:col-span-2">
          <TextInput id="r-title" value={form.title} onChange={set('title')} required autoFocus />
        </Field>
        <Field label="Client" htmlFor="r-client">
          <TextInput id="r-client" value={form.client} onChange={set('client')} />
        </Field>
        <Field label="Vendor or prime" htmlFor="r-vendor">
          <TextInput id="r-vendor" value={form.vendor} onChange={set('vendor')} />
        </Field>
        <Field label="Client req ID" htmlFor="r-ref">
          <TextInput id="r-ref" value={form.external_ref} onChange={set('external_ref')} />
        </Field>
        <Field label="Location" htmlFor="r-location">
          <TextInput
            id="r-location"
            value={form.location}
            onChange={set('location')}
            placeholder="Remote (US)"
          />
        </Field>
        <Field label="Bill rate ($/hr)" htmlFor="r-bill">
          <TextInput
            id="r-bill"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={form.bill_rate}
            onChange={set('bill_rate')}
          />
        </Field>
        <Field label="Job description" htmlFor="r-desc" className="sm:col-span-2">
          <TextArea id="r-desc" rows={9} value={form.description} onChange={set('description')} />
        </Field>
        {error && (
          <div className="sm:col-span-2">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}

// -- submit a candidate to a requirement -----------------------------------

export function SubmitDialog({
  open,
  onClose,
  candidate,
  requirement,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  candidate: Pick<Consultant, 'consultant_id' | 'full_name' | 'pay_rate'>;
  requirement: Requirement;
  onCreated: (s: Submission) => void;
}) {
  const [bill, setBill] = useState('');
  const [pay, setPay] = useState('');
  const [rtr, setRtr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBill(requirement.bill_rate === null ? '' : String(requirement.bill_rate));
    setPay(candidate.pay_rate === null ? '' : String(candidate.pay_rate));
    setRtr(false);
    setError(null);
  }, [open, requirement, candidate]);

  const billRate = parseRate(bill);
  const payRate = parseRate(pay);

  const create = async () => {
    if (billRate === undefined || payRate === undefined) return setError(RATE_ERROR);
    setSaving(true);
    setError(null);
    try {
      const created = await createSubmission({
        consultant_id: candidate.consultant_id,
        requirement_id: requirement.requirement_id,
        bill_rate: billRate,
        pay_rate: payRate,
        rtr_confirmed: rtr,
      });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(
        err instanceof DuplicateSubmissionError
          ? `${candidate.full_name} is already submitted to this requirement.`
          : err instanceof Error
            ? err.message
            : 'Could not create the submission.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Submit ${candidate.full_name}`}
      description={
        <>
          {requirement.title}
          {requirement.client ? ` at ${requirement.client}` : ''}
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={saving}>
            {saving ? 'Creating…' : 'Create submission'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bill rate ($/hr)" htmlFor="s-bill">
            <TextInput
              id="s-bill"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={bill}
              onChange={(e) => setBill(e.target.value)}
            />
          </Field>
          <Field label="Pay rate ($/hr)" htmlFor="s-pay">
            <TextInput
              id="s-pay"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
            />
          </Field>
        </div>
        {typeof billRate === 'number' && typeof payRate === 'number' && (
          <RateBar bill={billRate} pay={payRate} />
        )}
        <label className="flex items-start gap-3 rounded-lg border border-bp-line bg-bp-canvas p-3 text-sm">
          <input
            type="checkbox"
            checked={rtr}
            onChange={(e) => setRtr(e.target.checked)}
            className="mt-0.5 size-4 accent-bp-pine"
          />
          <span>
            <span className="font-medium">{candidate.full_name} gave right to represent</span>
            <span className="block text-bp-muted">
              You can confirm this later, but the profile can’t be sent until you do.
            </span>
          </span>
        </label>
        <p className="text-sm text-bp-muted">
          A resume tailored to this role is written from their own resume. Review it before you send
          it.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

// -- right to represent ----------------------------------------------------

export function RtrDialog({
  open,
  name,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Confirm right to represent"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Not yet
          </Button>
          <Button onClick={onConfirm}>Yes, {name} agreed</Button>
        </>
      }
    >
      <p className="text-sm">
        Has {name} agreed to be represented for this role? A profile can only go to a client with
        the candidate’s consent.
      </p>
    </Dialog>
  );
}
