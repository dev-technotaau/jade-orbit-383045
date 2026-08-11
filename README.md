# WhatsApp Cloud Module

A self-contained WhatsApp Business Cloud API console — shared team inbox, template
management, and broadcast/drip campaigns — that you can deploy per client.

It was extracted from a larger platform and stripped to stand alone: no user
accounts, no roles, no job board, no billing, and no third-party monitoring or
analytics. One app password gates the whole thing, and the branding comes from
environment variables so each deployment can ship under its own name.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Meta setup](#meta-setup)
- [Authentication model](#authentication-model)
- [Background jobs](#background-jobs)
- [Deployment](#deployment)
- [Project layout](#project-layout)

---

## What it does

**Inbox** — live conversation list and thread view over Socket.IO, with the 24-hour
customer-service window tracked per conversation. Send text, media (image / video /
audio / document), interactive messages (buttons, lists, CTA URLs, Flows), location,
contact cards and reactions. Canned replies, internal notes, labels, snooze, archive,
assignment, transcripts and CSAT.

**Contacts** — opt-in/opt-out state with consent provenance (encrypted at rest),
tags, blocking, bulk actions, CSV import/export, saved segments, a suppression list,
and DPDP-style data export / erase per contact.

**Templates** — sync from Meta, create and submit new ones through a builder, attach
media headers, and view per-template analytics.

**Campaigns** — one-off broadcasts, A/B variants, multi-step drip sequences,
recurring sends, scheduling, throttling and batching, per-recipient delivery status,
retry of failures, tracked short links and conversion attribution.

**Analytics** — volume time-series, SLA and first-response metrics, agent
productivity, spend estimates, opt-out rates, keyword and heatmap breakdowns,
channel health history, and Meta quality signals.

**Automation** — keyword rules, an FAQ responder, business-hours awareness and an
away auto-responder.

---

## Architecture

Two workspaces in one npm monorepo.

|                   |                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Backend**       | Express 5 · TypeScript · Prisma 7 + PostgreSQL · Redis + BullMQ · Socket.IO                                |
| **Frontend**      | Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · TanStack Query · Zustand                             |
| **Storage**       | Cloudflare R2 (optional) for media                                                                         |
| **Observability** | Winston logs + Prometheus `/metrics`. No Sentry, OpenTelemetry or analytics — nothing calls a third party. |

The browser never talks to the backend directly. Next.js API routes act as a
backend-for-frontend: `/api/proxy/[...path]` forwards to Express with the httpOnly
unlock cookie attached, so no credential is readable from JavaScript.

```
browser ──▶ Next.js BFF (/api/proxy, /api/unlock) ──▶ Express API ──▶ Postgres
                                                          │
                                                          ├─▶ Redis / BullMQ (5 queues)
                                                          └─▶ Meta Graph API
        ◀── Socket.IO (wa:message, wa:status, wa:conversation, wa:campaign) ──┘
```

---

## Quick start

Requires Node 20+, PostgreSQL and Redis.

```bash
npm run install:all

# configure both sides — see Configuration below
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# create the schema (fresh database — this project ships no migrations)
npm --prefix backend exec prisma db push

npm run dev        # backend :5000 + frontend :3000
```

Open <http://localhost:3000>, enter your `APP_PASSWORD`, and you land on the inbox.

> **Schema:** there is no migration history — the module is meant to be pointed at a
> brand-new database. Use `prisma db push` for the initial schema, and generate
> migrations from that point on if you want them.
>
> On a deployed environment, use **`npm --prefix backend run start:migrate`** as the
> start command instead of `start`: it runs `db:deploy` (`prisma db push`) and then
> boots. `db push` is idempotent, so this is a no-op once the database matches. If
> you start without it, the server boots and the status banner reports PostgreSQL as
> `error — the schema has never been applied`.

---

## Configuration

Environment lives with each workspace: `backend/.env` and `frontend/.env`.

### Backend — required

| Variable                             | Purpose                                             |
| ------------------------------------ | --------------------------------------------------- |
| `DATABASE_URL`                       | PostgreSQL connection string                        |
| `CSRF_SECRET`                        | ≥32 chars                                           |
| `APP_PASSWORD`                       | ≥16 chars — the single credential gating the module |
| `META_WHATSAPP_TOKEN`                | Meta system-user access token                       |
| `META_WHATSAPP_PHONE_ID`             | WhatsApp phone number ID                            |
| `META_WHATSAPP_WABA_ID`              | WhatsApp Business Account ID                        |
| `META_WHATSAPP_APP_SECRET`           | Verifies webhook `X-Hub-Signature-256`              |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Webhook handshake token                             |

### Backend — notable optional

| Variable                    | Default                   | Purpose                                                        |
| --------------------------- | ------------------------- | -------------------------------------------------------------- |
| `BRAND_NAME`                | `TechnoTaau`              | Name on the API's HTML pages and OpenAPI docs                  |
| `OPERATOR_LABEL`            | `operator`                | Stamped on `createdBy` / `assignedTo` audit fields             |
| `BFF_SECRET`                | —                         | Shared secret proving a request came from the Next.js BFF      |
| `FIELD_ENCRYPTION_KEY`      | —                         | 64-char hex; encrypts consent evidence and note bodies at rest |
| `REDIS_URL` / `REDIS_HOST`  | `localhost`               | Queues, caching, Socket.IO fan-out                             |
| `DEFAULT_COUNTRY_CODE`      | `91`                      | Applied to numbers supplied without one                        |
| `WHATSAPP_OPT_OUT_KEYWORDS` | `STOP,UNSUBSCRIBE,CANCEL` | Inbound auto opt-out                                           |
| `R2_*`                      | —                         | Cloudflare R2 media storage                                    |

### Frontend

| Variable                 | Purpose                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`    | Public API base, e.g. `http://localhost:5000/api/v1`                        |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO origin                                                            |
| `BACKEND_INTERNAL_URL`   | Server-side URL the BFF proxies to (never exposed)                          |
| `BFF_SECRET`             | Must match the backend's                                                    |
| `NEXT_PUBLIC_BRAND_NAME` | Wordmark shown in the sidebar and on the unlock page                        |
| `NEXT_PUBLIC_BRAND_LOGO` | Path to a logo in `frontend/public` (default `/logo.svg`); empty ⇒ wordmark |

**Branding:** ships with a TechnoTaau mark (`public/logo.svg` plus the PWA icon
set). Re-skin a deployment by replacing those files, or point
`NEXT_PUBLIC_BRAND_LOGO` elsewhere — set it empty and the `NEXT_PUBLIC_BRAND_NAME`
wordmark is used instead.

---

## Meta setup

1. Create a Meta app with the **WhatsApp** product and attach a WhatsApp Business
   Account.
2. Generate a **system user token** with `whatsapp_business_messaging` and
   `whatsapp_business_management`.
3. Point the webhook at `https://<your-api-host>/api/v1/webhooks/whatsapp` and
   subscribe to the `messages` field. Meta's verification handshake hits the same
   path with `GET`; use the same value for `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` in
   Meta and in `.env`.
4. Templates must be created and approved in Meta before they can send. Build and
   submit them from **Templates**, or sync ones you already have.

The webhook route is deliberately exempt from the app-password gate and from CSRF,
and is mounted before the global JSON parser so the raw bytes survive
`X-Hub-Signature-256` HMAC verification — that signature is its authentication.

---

## Authentication model

There are no accounts. One shared password gates everything, with an optional
second factor on top.

**Signing in**

1. `POST /api/v1/unlock` — Cloudflare Turnstile runs first, then the password is
   compared in constant time.
2. With MFA off, that returns the session token. With MFA on, it returns a
   scoped **5-minute challenge ticket** instead — which opens nothing except
   step 3.
3. `POST /api/v1/unlock/mfa/verify` — a 6-digit TOTP code or a recovery code,
   and only then is the session token issued.

The password crosses the wire exactly once. All three credentials live in
httpOnly cookies set by the Next.js BFF, so page JavaScript never holds anything
that advances an authentication:

| Cookie           | What it is               | Lifetime                            |
| ---------------- | ------------------------ | ----------------------------------- |
| `wa_unlock`      | the session              | signed into the token (12h default) |
| `wa_mfa_pending` | the MFA challenge ticket | 5 minutes                           |
| `wa_device`      | "trust this browser"     | 30 days, rotated on every use       |

**Everything else**

- Every operator route runs behind `requireAppPassword`, which accepts either the
  session cookie or an `X-App-Password` header (for scripts and webhook testers).
  **Once MFA is on, the header alone is refused** — it is checked against
  `APP_PASSWORD` directly, so accepting it would mean MFA protected the browser
  and nothing else. Re-open it deliberately with
  `ALLOW_PASSWORD_HEADER_WITH_MFA=true` if a script truly needs one-factor access.
- Socket.IO takes a **separate 2-minute ticket**, not the session token, minted
  by `GET /api/v1/unlock/socket-ticket` and fetched server-side via
  `/api/auth/socket-token`. `requireAppPassword` rejects it, so a ticket leaked
  from the page is not a session.
- It **fails closed** throughout: no `APP_PASSWORD` and nothing authenticates; no
  `CF_TURNSTILE_SECRET_KEY` in production and the server refuses to boot.

Because there is one operator, fields like `assignedTo`, `createdBy` and
`actorUserId` are free-text labels (`OPERATOR_LABEL`), not foreign keys.

### Two-factor authentication

Managed at **/whatsapp/security**. TOTP (SHA-1, 6 digits, 30s, ±1 step) —
compatible with Google Authenticator, 1Password, Authy and the rest.

Because the password is shared and there is no user table, **the TOTP seed is
shared too**: everyone scans the same QR. That is a real second factor — a
leaked password is no longer sufficient — but it cannot attribute an action or
revoke one person. Three controls compensate:

- **The secret is shown once**, during enrolment, and is never retrievable again.
- **Trusted browsers are individually revocable** — the closest thing to cutting
  off one machine.
- **Revoke everything** (an MFA "epoch" bump) invalidates the seed, every
  recovery code and every trusted browser at once, and forces a re-enrol. This is
  the answer if the QR is ever screenshotted somewhere it shouldn't be.

Ten single-use recovery codes are issued at enrolment and shown once. Enrolment
**requires `FIELD_ENCRYPTION_KEY`** and refuses to proceed without it rather than
writing a plaintext TOTP seed to the database.

### Audit trail

Every state-changing action is recorded — 71 distinct actions across 65 routes —
and readable at **/whatsapp/audit**: filter by action, entity, actor, IP, free
text or date range; open any entry for its full detail payload; export the
filtered set as CSV.

Two properties make it an audit log rather than an activity feed:

- **Append-only.** There is no endpoint that edits or deletes an entry. Rows
  leave only via the 180-day retention sweep.
- **Tamper-evident.** Each row carries a SHA-256 checksum over its immutable
  fields. The viewer re-hashes on read and labels every row Verified / Altered /
  No checksum, and **Verify integrity** sweeps the whole filtered range and
  reports anything that no longer matches — i.e. rows edited directly in the
  database, behind the application's back.

Message bodies, notes, CSAT comments and auto-reply copy are redacted before an
entry is written: the trail records that an action happened and on what, never
what was said.

### Brute-force and bot protection

- **Cloudflare Turnstile** on `/unlock`, required in production, fails closed,
  5s timeout so a Cloudflare outage cannot hang the login path.
- **Rate limits**: 30 failed password attempts per 5 min per IP, 10 MFA attempts
  per 15 min, 100 req/s per-IP DDoS cap, 30 Socket.IO handshakes per minute.
- **Progressive delay** after 3 consecutive failures from one address, applied
  _before_ the comparison so it cannot be used as a timing oracle.
- **No lockout, deliberately.** With one shared credential a lockout is a button
  anyone on the internet could press to take the whole console offline. Delay
  costs an attacker linearly and a legitimate operator nothing.
- **Every attempt is audited and counted** — `wa_unlock_attempts_total` and
  `wa_unlock_failure_streak` on `/metrics`, plus an `UNLOCK_FAILED` audit row.
  Alert on the streak gauge; a sustained run escalates to an error-level log.

---

## Background jobs

Six BullMQ queues — send, inbound, media, campaign, scheduler and webhook — plus
nine repeatable cron jobs (template sync, channel health, drip and scheduled ticks,
recurring campaigns, campaign and event recovery, retention pruning).

Workers run inside the API process behind a Redis leader lock, so scaling to
multiple replicas does not duplicate cron work.

---

## Deployment

Designed for managed platforms rather than a bespoke cluster — the frontend on
Vercel, the backend and workers on Render/Railway/Fly, with managed Postgres and
Redis. No Kubernetes manifests or CI pipelines are included.

### Backend (Render / Railway / Fly)

| Setting           | Value                          |
| ----------------- | ------------------------------ |
| Root directory    | `backend`                      |
| Build command     | `npm install && npm run build` |
| Start command     | `npm run start:migrate`        |
| Health check path | `/health/live`                 |
| Node version      | 20+                            |

`start:migrate` applies the schema (`prisma db push`) and then boots. It is
idempotent — a no-op once the database matches — so it is safe on every deploy.
If you prefer a separate release step, run `npm run db:deploy` there and use
plain `npm run start` as the start command.

**One-time bootstrap** against a brand-new database, if you'd rather do it by
hand than let the start command handle it:

```bash
DATABASE_URL='postgres://…' npx prisma db push --skip-generate
```

(Use `npx prisma`, not the `db:push` npm script — that one is wrapped in
`dotenv --` and expects a `.env` file that will not exist on a deploy host.)

### Frontend (Vercel)

| Setting        | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| Root directory | `frontend`                                                                |
| Build command  | `npm run build` (default)                                                 |
| Env            | `BACKEND_INTERNAL_URL`, `BFF_SECRET`, `NEXT_PUBLIC_*` — see Configuration |

`BFF_SECRET` must match the backend's, and `BACKEND_INTERNAL_URL` must include
the `/api/v1` suffix.

### Backups

Nothing in this repo backs up your data — that is the managed database's job,
and it is not on by default everywhere:

- Turn on your provider's automated daily backups and confirm the retention
  period. Postgres holds every conversation, contact and consent record; a
  WhatsApp inbox is not reconstructible from anywhere else.
- Take a manual snapshot before any schema change, since `db push` can drop
  columns:

  ```bash
  pg_dump "$DATABASE_URL" --no-owner --format=custom -f pre-deploy-$(date +%F).dump
  ```

- Redis holds only queues and caches. Losing it costs in-flight jobs, not data;
  the recovery crons re-batch stalled campaigns and re-process unprocessed
  webhook events.

### Rotating the app password

`APP_PASSWORD` is the only credential. To revoke every live session without
changing it — someone leaves, a laptop goes missing — increment `SESSION_EPOCH`
and redeploy: it is signed into every unlock token, so all of them stop
verifying immediately.

Start command: `npm --prefix backend run start:migrate` (applies the schema, then
boots). Use plain `start` only when the schema is applied by a separate release step.

Health probes: `/health/live` (process liveness — point the platform's health check
here), `/health/ready` (database + Redis, for load-balancer routing), `/health` (the
human view). Metrics: `/metrics`.
API docs: `/api-docs` (gated by the app password when one is set).

Every page is `noindex, nofollow` — this is an internal console, not a public site.

---

## Project layout

```
backend/
  prisma/schema.prisma      26 models, all WhatsApp-scoped (Wa* prefix)
  src/
    routes/                 health · metrics · unlock · whatsapp
    controllers/ services/  inbox, contacts, campaigns, templates, analytics…
    jobs/                   5 queues + workers, leader election
    middleware/             app-password, csrf, rate-limit, audit, error…
    socket.ts               Socket.IO server + rooms
frontend/
  src/
    app/                    /unlock, /whatsapp/*, BFF api routes
    app/api/                proxy · unlock · auth/socket-token · csrf-token
    components/whatsapp/    inbox, composer, campaigns, templates, contacts
    proxy.ts                Next.js middleware (NOT middleware.ts) — CSP + gate
```

Two conventions worth knowing before editing:

- The Next.js middleware file is **`src/proxy.ts`**, not `middleware.ts`. That is
  intentional and it is the active middleware.
- Do **not** add `src/app/loading.tsx`. A root loading UI wraps the page in a
  Suspense boundary, which streams content into a hidden div revealed by an inline
  script — invisible to anything that does not execute JavaScript.

---

## Scripts

| Command               | Does                                   |
| --------------------- | -------------------------------------- |
| `npm run dev`         | Backend and frontend together          |
| `npm run build`       | Build both                             |
| `npm run lint`        | ESLint across both                     |
| `npm run test`        | Test suites                            |
| `npm run install:all` | Install root + both workspaces         |
| `npm run clean`       | Remove `node_modules`, `dist`, `.next` |

---

## License

Copyright (c) 2026 TechnoTaau. All rights reserved. Proprietary and
confidential — see [LICENSE](LICENSE). No license is granted for
redistribution or derivative works.

Contact: `send@technotaau.com`
