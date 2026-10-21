# Bench: consultant submissions for staffing teams

This fork adds a **Bench** to Resume Matcher: keep your consultants and their
resumes in one place, log requirements from clients and vendors, rank the bench
against each one, and put a consultant forward with a resume tailored to that
requirement. Open it from the dashboard footer, or go to `/bench`.

It is built on Resume Matcher's own tailoring pipeline, so a tailored resume is
produced the same truth-checked way, from that consultant's real resume.

## The flow

The bench is its own workspace, **BenchPilot**, with a sidebar: Today,
Requirements, Candidates and Pipeline. Open it from the dashboard footer or
go to `/bench`.

1. **Candidates** → *Add candidate* (name, skills, pay rate, work
   authorization as they state it). On their profile, *Upload* a resume (PDF or
   DOCX). It's read with your configured AI provider.
2. **Requirements** → *Add requirement*, paste the job description. The same
   requirement sent by a second vendor (same client + req ID, or same client,
   title and location) is recognised and not added twice.
3. Open a requirement. **Best matches on your bench** ranks candidates by how
   many of their listed skills the description mentions. It's free and instant
   (no AI call), and a starting point for your judgement.
4. *Submit* a candidate: confirm bill and pay rate (the rate bar shows the
   margin) and whether you have their **right to represent**. A tailored resume
   is queued. You can also submit from a candidate's profile.
5. **Pipeline** is a board of every submission by stage. Drag a card or use its
   *Move* menu: Ready to send → Submitted → Client review → Interview → Offer →
   Placed. Moving a card out to a client asks for right to represent first.
6. **Today** lists what needs you: resumes ready to send, failed tailoring
   (with *Try again*), requirements nobody has been put forward for, and
   candidates missing a resume. It also shows margin in play and placed.

Guards built in:

- A consultant can't be submitted to the same requirement twice.
- A submission can't move to *Submitted* or beyond without right to represent
  and a tailored resume.
- Each tailored resume is fact-checked against **that consultant's** resume.
  (Upstream Resume Matcher checks any non-master resume against the default
  master, which on a bench would be someone else; this fork fixes that.)
- Consultant resumes don't count toward the 5-master-resume limit, and don't
  appear on your personal dashboard or application tracker.

## Run it locally

Step-by-step for Mac, Linux and Windows: [RUN-LOCAL.md](RUN-LOCAL.md).

Same as Resume Matcher (`SETUP.md`): backend on :8000, frontend on :3000, an AI
provider set in **Settings**. Locally there is no sign-in.

```bash
cd apps/backend && uv sync && uv run uvicorn app.main:app --reload --port 8000
cd apps/frontend && npm install && npm run dev
```

## Host it for your team (sign-in + Postgres)

1. **Supabase project** (free tier is fine).
   - In the Authentication settings, keep email sign-in on and **turn off
     public sign-ups**, so only people you invite can get in. Invite each
     recruiter from the Users list.
   - Copy the project URL and the **publishable key** from the API keys
     settings. If the project still signs tokens with the legacy JWT secret,
     copy that too (`SUPABASE_JWT_SECRET`).
   - Copy the Postgres connection string (session pooler) for `DATABASE_URL`.
2. **Environment** (`.env` next to `docker-compose.yml`):

   ```bash
   DATABASE_URL=postgresql://...            # from Supabase
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   AUTH_ALLOWED_DOMAINS=yourcompany.com     # and/or AUTH_ALLOWED_EMAILS=a@x.com,b@y.com
   INTERNAL_RENDER_SECRET=$(openssl rand -hex 32)
   FRONTEND_BASE_URL=https://bench.yourcompany.com
   ALLOWED_HOSTS=bench.yourcompany.com
   ```

3. **Start**:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.auth.yml up -d
   ```

   Put it behind HTTPS (Caddy, Cloud Run, Fly, Render...). The container only
   serves port 3000; the API stays inside it.

How the gate works: the frontend checks the Supabase session on every request
(pages redirect to `/login`, API calls get 401) and forwards the access token to
the API, which verifies it again against your project's signing keys and the
allow-list. PDF export renders internal print pages; those are only reachable
with `INTERNAL_RENDER_SECRET`, which the app sends itself.

If auth is half-configured (no `SUPABASE_URL`, or a short render secret) the
backend refuses to start rather than run open.

## Limits of this version

- **One workspace.** Everyone who signs in shares one bench. Separate companies
  need separate deployments until multi-tenant support is added.
- The BenchPilot workspace is English only (the rest of the app keeps its languages).
- Match ranking is keyword overlap on the skills you enter, not semantic.
- Tailoring runs one at a time through the queue (rate-limited for your AI
  provider), so a batch of submissions takes a few minutes.

## Code map

| Area | Files |
| --- | --- |
| Tables (`bench_consultants`, `bench_requirements`, `bench_submissions`) | `apps/backend/app/bench/models.py` |
| Data access, dedupe, duplicate guard | `apps/backend/app/bench/store.py` |
| Grounding + match ranking | `apps/backend/app/bench/service.py` |
| API (`/api/v1/bench/...`) | `apps/backend/app/bench/router.py`, `schemas.py` |
| Sign-in gate (API) | `apps/backend/app/auth.py`, PDF hook in `app/pdf.py` |
| Sign-in gate (pages) | `apps/frontend/proxy.ts`, `lib/auth/`, `app/login`, `app/logout` |
| Screens (own design system, `bp-*` colour tokens) | `apps/frontend/app/(workspace)/bench`, `components/workspace/` |
| Tests | `tests/integration/test_bench_api.py`, `tests/unit/test_auth.py`, `apps/frontend/tests/auth-gate.test.ts` |
