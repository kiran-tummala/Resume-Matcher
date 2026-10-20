import { apiDelete, apiFetch, apiPatch, apiPost } from './client';

export type ConsultantStatus = 'bench' | 'placed' | 'inactive';
export type RequirementStatus = 'open' | 'on_hold' | 'closed';
export type SubmissionStatus =
  | 'tailoring'
  | 'ready'
  | 'submitted'
  | 'client_review'
  | 'interview'
  | 'offer'
  | 'placed'
  | 'rejected'
  | 'withdrawn';

export const SUBMISSION_STATUS_ORDER: SubmissionStatus[] = [
  'tailoring',
  'ready',
  'submitted',
  'client_review',
  'interview',
  'offer',
  'placed',
  'rejected',
  'withdrawn',
];

/** Statuses that mean the profile went out; the backend requires RTR and a tailored resume. */
export const SENT_STATUSES: ReadonlySet<SubmissionStatus> = new Set([
  'submitted',
  'client_review',
  'interview',
  'offer',
  'placed',
]);

export interface Consultant {
  consultant_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  location: string | null;
  work_authorization: string | null;
  skills: string | null;
  pay_rate: number | null;
  available_from: string | null;
  status: ConsultantStatus;
  resume_id: string | null;
  resume_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ConsultantInput = Partial<
  Omit<Consultant, 'consultant_id' | 'resume_id' | 'resume_status' | 'created_at' | 'updated_at'>
> & { full_name: string };

export interface Requirement {
  requirement_id: string;
  title: string;
  client: string | null;
  vendor: string | null;
  external_ref: string | null;
  location: string | null;
  bill_rate: number | null;
  description: string;
  status: RequirementStatus;
  created_at: string;
  updated_at: string;
}

export interface RequirementInput {
  title: string;
  description: string;
  client?: string;
  vendor?: string;
  external_ref?: string;
  location?: string;
  bill_rate?: number | null;
}

export interface ConsultantMatch {
  consultant_id: string;
  full_name: string;
  headline: string | null;
  status: ConsultantStatus;
  has_resume: boolean;
  already_submitted: boolean;
  score: number;
  matched_skills: string[];
  skill_count: number;
}

export interface Submission {
  submission_id: string;
  consultant_id: string;
  requirement_id: string;
  status: SubmissionStatus;
  queue_item_id: string | null;
  tailored_resume_id: string | null;
  bill_rate: number | null;
  pay_rate: number | null;
  margin: number | null;
  rtr_confirmed: boolean;
  submitted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  consultant_name: string | null;
  requirement_title: string | null;
  client: string | null;
  tailoring_status: string | null;
  tailoring_error: string | null;
}

export interface SubmissionInput {
  consultant_id: string;
  requirement_id: string;
  bill_rate?: number | null;
  pay_rate?: number | null;
  rtr_confirmed?: boolean;
  notes?: string;
}

export type SubmissionUpdate = Partial<
  Pick<Submission, 'status' | 'bill_rate' | 'pay_rate' | 'rtr_confirmed' | 'notes'>
>;

/** A 409 from creating a duplicate submission carries the existing id. */
export class DuplicateSubmissionError extends Error {
  constructor(
    message: string,
    readonly submissionId: string
  ) {
    super(message);
    this.name = 'DuplicateSubmissionError';
  }
}

function detailMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : null))
      .filter((m): m is string => Boolean(m));
    return parts.length > 0 ? parts.join('; ') : null;
  }
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: unknown }).message);
  }
  return null;
}

async function asJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data) || `${fallback} (status ${res.status}).`);
  }
  return res.json() as Promise<T>;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

// -- consultants ---------------------------------------------------------

export async function listConsultants(status?: ConsultantStatus): Promise<Consultant[]> {
  const res = await apiFetch(`/bench/consultants${query({ status })}`);
  return asJson<Consultant[]>(res, 'Failed to load consultants');
}

export async function createConsultant(input: ConsultantInput): Promise<Consultant> {
  return asJson<Consultant>(await apiPost('/bench/consultants', input), 'Failed to add consultant');
}

export async function updateConsultant(
  id: string,
  input: Partial<ConsultantInput>
): Promise<Consultant> {
  return asJson<Consultant>(
    await apiPatch(`/bench/consultants/${encodeURIComponent(id)}`, input),
    'Failed to update consultant'
  );
}

export async function deleteConsultant(id: string): Promise<void> {
  await asJson(
    await apiDelete(`/bench/consultants/${encodeURIComponent(id)}`),
    'Failed to delete consultant'
  );
}

export async function uploadConsultantResume(id: string, file: File): Promise<Consultant> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`/bench/consultants/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    body: form,
  });
  return asJson<Consultant>(res, 'Failed to upload resume');
}

// -- requirements --------------------------------------------------------

export async function listRequirements(status?: RequirementStatus): Promise<Requirement[]> {
  const res = await apiFetch(`/bench/requirements${query({ status })}`);
  return asJson<Requirement[]>(res, 'Failed to load requirements');
}

export async function createRequirement(
  input: RequirementInput
): Promise<{ requirement: Requirement; created: boolean }> {
  return asJson(await apiPost('/bench/requirements', input), 'Failed to add requirement');
}

export async function updateRequirement(
  id: string,
  input: Partial<RequirementInput> & { status?: RequirementStatus }
): Promise<Requirement> {
  return asJson<Requirement>(
    await apiPatch(`/bench/requirements/${encodeURIComponent(id)}`, input),
    'Failed to update requirement'
  );
}

export async function matchRequirement(id: string): Promise<ConsultantMatch[]> {
  const res = await apiFetch(`/bench/requirements/${encodeURIComponent(id)}/matches`);
  return asJson<ConsultantMatch[]>(res, 'Failed to rank the bench');
}

// -- submissions ---------------------------------------------------------

export async function listSubmissions(
  filters: { consultant_id?: string; requirement_id?: string; status?: string } = {}
): Promise<Submission[]> {
  const res = await apiFetch(`/bench/submissions${query(filters)}`);
  return asJson<Submission[]>(res, 'Failed to load submissions');
}

export async function createSubmission(input: SubmissionInput): Promise<Submission> {
  const res = await apiPost('/bench/submissions', input);
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as {
      detail?: { submission_id?: string } | string;
    };
    if (data.detail && typeof data.detail === 'object' && data.detail.submission_id) {
      throw new DuplicateSubmissionError(
        detailMessage(data) ?? 'Already submitted.',
        data.detail.submission_id
      );
    }
    throw new Error(detailMessage(data) ?? 'Could not create the submission.');
  }
  return asJson<Submission>(res, 'Failed to create submission');
}

export async function updateSubmission(id: string, input: SubmissionUpdate): Promise<Submission> {
  return asJson<Submission>(
    await apiPatch(`/bench/submissions/${encodeURIComponent(id)}`, input),
    'Failed to update submission'
  );
}

export async function retrySubmissionTailoring(id: string): Promise<Submission> {
  return asJson<Submission>(
    await apiPost(`/bench/submissions/${encodeURIComponent(id)}/retry-tailoring`, {}),
    'Failed to retry tailoring'
  );
}

export async function deleteSubmission(id: string): Promise<void> {
  await asJson(
    await apiDelete(`/bench/submissions/${encodeURIComponent(id)}`),
    'Failed to delete submission'
  );
}

/** Hourly rate for display, e.g. "$95.00/hr"; em dash when unset. */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${value.toFixed(2)}/hr`;
}
