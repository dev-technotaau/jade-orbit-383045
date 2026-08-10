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

| | |
|---|---|
| **Backend** | Express 5 · TypeScript · Prisma 7 + PostgreSQL · Redis + BullMQ · Socket.IO |
| **Frontend** | Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · TanStack Query · Zustand |
| **Storage** | Cloudflare R2 (optional) for media |
| **Observability** | Winston logs + Prometheus `/metrics`. No Sentry, OpenTelemetry or analytics — nothing calls a third party. |

The browser never talks to the backend directly. Next.js API routes act as a
backend-for-frontend: `/api/proxy/[...path]` forwards to Express with the httpOnly
unlock cookie attached, so no credential is readable from JavaScript.

```
browser ──▶ Next.js BFF (/api/proxy, /api/unlock) ──▶ Express API ──▶ Postgres
                                                          │
                                                          ├─▶ Redis / BullMQ (6 queues)
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

---

## Configuration

Environment lives with each workspace: `backend/.env` and `frontend/.env`.

### Backend — required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `CSRF_SECRET` | ≥32 chars |
| `APP_PASSWORD` | ≥16 chars — the single credential gating the module |
| `META_WHATSAPP_TOKEN` | Meta system-user access token |
| `META_WHATSAPP_PHONE_ID` | WhatsApp phone number ID |
| `META_WHATSAPP_WABA_ID` | WhatsApp Business Account ID |
| `META_WHATSAPP_APP_SECRET` | Verifies webhook `X-Hub-Signature-256` |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Webhook handshake token |

### Backend — notable optional

| Variable | Default | Purpose |
|---|---|---|
| `BRAND_NAME` | `TechnoTaau` | Name on the API's HTML pages and OpenAPI docs |
| `OPERATOR_LABEL` | `operator` | Stamped on `createdBy` / `assignedTo` audit fields |
| `BFF_SECRET` | — | Shared secret proving a request came from the Next.js BFF |
| `FIELD_ENCRYPTION_KEY` | — | 64-char hex; encrypts consent evidence and note bodies at rest |
| `REDIS_URL` / `REDIS_HOST` | `localhost` | Queues, caching, Socket.IO fan-out |
| `DEFAULT_COUNTRY_CODE` | `91` | Applied to numbers supplied without one |
| `WHATSAPP_OPT_OUT_KEYWORDS` | `STOP,UNSUBSCRIBE,CANCEL` | Inbound auto opt-out |
| `R2_*` | — | Cloudflare R2 media storage |

### Frontend

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Public API base, e.g. `http://localhost:5000/api/v1` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO origin |
| `BACKEND_INTERNAL_URL` | Server-side URL the BFF proxies to (never exposed) |
| `BFF_SECRET` | Must match the backend's |
| `NEXT_PUBLIC_BRAND_NAME` | Wordmark shown in the sidebar and on the unlock page |
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

There are no accounts. One shared password gates everything:

- `POST /api/v1/unlock` compares the submitted password in constant time and returns
  an HMAC token.
- The Next.js BFF stores that token in an httpOnly, SameSite=Lax cookie
  (`wa_unlock`). JavaScript can never read it.
- Every operator route runs behind `requireAppPassword`, which accepts either the
  cookie or an `X-App-Password` header (for scripts and webhook testers).
- Socket.IO accepts the same unlock token, fetched server-side via
  `/api/auth/socket-token`.
- It **fails closed**: if `APP_PASSWORD` is unset, nothing authenticates.

Because there is one operator, fields like `assignedTo`, `createdBy` and
`actorUserId` are free-text labels (`OPERATOR_LABEL`), not foreign keys.

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

Health probes: `/health`, `/health/live`, `/health/ready`. Metrics: `/metrics`.
API docs: `/api-docs` (gated by the app password when one is set).

Every page is `noindex, nofollow` — this is an internal console, not a public site.

---

## Project layout

```
backend/
  prisma/schema.prisma      23 models, all WhatsApp-scoped (Wa* prefix)
  src/
    routes/                 health · metrics · unlock · whatsapp
    controllers/ services/  inbox, contacts, campaigns, templates, analytics…
    jobs/                   6 queues + workers, leader election
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

| Command | Does |
|---|---|
| `npm run dev` | Backend and frontend together |
| `npm run build` | Build both |
| `npm run lint` | ESLint across both |
| `npm run test` | Test suites |
| `npm run install:all` | Install root + both workspaces |
| `npm run clean` | Remove `node_modules`, `dist`, `.next` |

---

## License

Copyright (c) 2026 TechnoTaau. All rights reserved. Proprietary and
confidential — see [LICENSE](LICENSE). No license is granted for
redistribution or derivative works.

Contact: `send@technotaau.com`
