# Hire Adda — Technology Stack & Architecture Overview

**Version:** 1.0.0
**Last Updated:** March 2026
**Classification:** Client-Facing Technical Document

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Backend Stack](#3-backend-stack)
4. [Frontend Stack](#4-frontend-stack)
5. [Database & ORM](#5-database--orm)
6. [Search Engine](#6-search-engine)
7. [Caching & Message Queues](#7-caching--message-queues)
8. [Event Streaming](#8-event-streaming)
9. [Authentication & Security](#9-authentication--security)
10. [Cloud Services & AI](#10-cloud-services--ai)
11. [File Storage & CDN](#11-file-storage--cdn)
12. [Notifications (Multi-Channel)](#12-notifications-multi-channel)
13. [Email Infrastructure](#13-email-infrastructure)
14. [Real-Time Communication](#14-real-time-communication)
15. [Monitoring & Observability](#15-monitoring--observability)
16. [DevOps & CI/CD](#16-devops--cicd)
17. [Infrastructure & Containerization](#17-infrastructure--containerization)
18. [Code Quality & Developer Experience](#18-code-quality--developer-experience)
19. [Backend Services Inventory](#19-backend-services-inventory)
20. [Frontend Services Inventory](#20-frontend-services-inventory)
21. [Data Models](#21-data-models)
22. [API Architecture](#22-api-architecture)
23. [Background Job Queues](#23-background-job-queues)
24. [Frontend Page Routes](#24-frontend-page-routes)
25. [UI Component Library](#25-ui-component-library)
26. [Dependency Manifest](#26-dependency-manifest)

---

## 1. Executive Summary

Hire Adda is an enterprise-grade, full-stack job portal platform purpose-built for the Indian job market. The platform connects candidates with employers through intelligent matching, multi-channel notifications, and AI-powered resume processing.

### At a Glance

| Metric                | Value                             |
| --------------------- | --------------------------------- |
| Architecture          | Monorepo (npm workspaces)         |
| Backend               | Express 5 + TypeScript 5.9        |
| Frontend              | Next.js 16 + React 19             |
| Database              | PostgreSQL 16 (Neon)              |
| ORM                   | Prisma 7.3 (Driver Adapter)       |
| Search                | Elasticsearch 9 / OpenSearch 2.18 |
| Cache                 | Redis 7 (Redis Cloud)             |
| Queue                 | BullMQ 5.67 (20 queues)           |
| Event Stream          | Apache Kafka (Aiven)              |
| Real-Time             | Socket.IO 4.8                     |
| AI Services           | Google Document AI, Cloud Talent  |
| Data Models           | 31 Prisma models, 42 enums        |
| Backend Services      | 49 service files                  |
| Frontend Services     | 21 service files                  |
| API Routes            | 25 route files                    |
| Frontend Pages        | 85 page routes                    |
| UI Components         | 40+ custom components             |
| Background Queues     | 20 queue/worker pairs             |
| Environment Variables | 170+ (backend), 25+ (frontend)    |
| TypeScript Errors     | Zero                              |

---

## 2. System Architecture

```
                         ┌─────────────────────────┐
                         │      Cloudflare CDN      │
                         │   (Turnstile + WAF + R2) │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │    Nginx Reverse Proxy   │
                         │   (SSL/TLS Termination)  │
                         └──────┬───────────┬──────┘
                                │           │
                 ┌──────────────▼──┐   ┌────▼──────────────┐
                 │    Frontend     │   │     Backend API    │
                 │  Next.js 16    │   │   Express 5 + TS   │
                 │  React 19      │   │   49 Services      │
                 │  BFF Proxy     │   │   25 Route Files   │
                 │  85 Routes     │   │   17 Middleware     │
                 └────────┬───────┘   └────┬──────────────┘
                          │                │
                 ┌────────▼────────┐       │
                 │  BFF Auth Layer │◄──────┘
                 │  httpOnly Cookies│
                 └─────────────────┘
                                           │
              ┌──────────┬─────────────────┼─────────────┬──────────┐
              │          │                 │             │          │
     ┌────────▼──┐ ┌─────▼─────┐  ┌───────▼──────┐ ┌───▼───┐ ┌───▼────────┐
     │PostgreSQL │ │  Redis 7  │  │Elasticsearch │ │ Kafka │ │  Firebase  │
     │  16       │ │  + BullMQ │  │  9 / OS 2.18 │ │(Aiven)│ │ FCM/RTDB/  │
     │  (Neon)   │ │ 20 Queues │  │  Full-Text   │ │4 Topics│ │ Firestore │
     └───────────┘ └───────────┘  └──────────────┘ └───────┘ └────────────┘
              │
     ┌────────▼────────────────────────────────────────────────────┐
     │                    Google Cloud Platform                    │
     │  Document AI  ·  Cloud Talent  ·  BigQuery  ·  Geocoding   │
     └────────────────────────────────────────────────────────────┘
```

### Design Principles

- **BFF (Backend-For-Frontend) Pattern** — Next.js API Route Handlers proxy all auth to the Express backend via httpOnly cookies, eliminating token exposure in the browser
- **Graceful Degradation** — Every external service (Firebase, Kafka, Document AI, Cloud Talent, BigQuery) checks availability before calling and returns safe defaults if unavailable
- **Event-Driven Architecture** — Kafka consolidates cross-service events into 4 topics; BullMQ handles async job processing across 20 dedicated queues
- **Defense in Depth** — 17 middleware layers covering WAF, DDoS, CSRF, XSS, HPP, rate limiting, RBAC, MFA, and session management

---

## 3. Backend Stack

### Core Framework

| Technology     | Version     | Purpose                               |
| -------------- | ----------- | ------------------------------------- |
| **Node.js**    | 20.x / 22.x | Runtime (tested on both LTS versions) |
| **Express**    | 5.2.1       | HTTP framework (latest major release) |
| **TypeScript** | 5.9.3       | Type-safe development                 |

### Backend Architecture Breakdown

| Layer         | Count    | Description                                     |
| ------------- | -------- | ----------------------------------------------- |
| Config Files  | 22       | Service configuration & initialization          |
| Controllers   | 29       | Request handling & response formatting          |
| Services      | 49       | Business logic layer                            |
| Routes        | 25       | API endpoint definitions                        |
| Middleware    | 17       | Request/response pipeline                       |
| Jobs (Queues) | 20 pairs | Background queue + worker files                 |
| Validators    | 2        | Zod-based input validation                      |
| Utils         | 7        | Crypto, JWT, cookies, encryption, anonymization |
| Templates     | 4 dirs   | Email (HBS), Resume (HBS), SMS, WhatsApp        |
| Scripts       | 6        | Seeding, backfill, reindex utilities            |
| Kafka         | 2        | Producer + Consumer                             |

### Middleware Pipeline (17 layers)

| #   | Middleware        | Purpose                                              |
| --- | ----------------- | ---------------------------------------------------- |
| 1   | `request-id`      | UUID per request (X-Request-ID header)               |
| 2   | `helmet`          | HTTP security headers (CSP, HSTS, etc.)              |
| 3   | `compression`     | gzip/brotli response compression                     |
| 4   | `cors`            | Cross-origin resource sharing                        |
| 5   | `cookie-parser`   | Signed cookie parsing                                |
| 6   | `rate-limit`      | Global + route-specific rate limiting                |
| 7   | `ddos-protection` | Redis-backed IP-level DDoS mitigation                |
| 8   | `waf`             | Web Application Firewall (SQLi, XSS, path traversal) |
| 9   | `xss-sanitize`    | Input sanitization                                   |
| 10  | `content-type`    | Content-Type enforcement                             |
| 11  | `timeout`         | 30s request timeout                                  |
| 12  | `auth`            | JWT verification (header or httpOnly cookie)         |
| 13  | `firebase-auth`   | Firebase ID token verification                       |
| 14  | `rbac`            | Role-based access control                            |
| 15  | `require-mfa`     | MFA enforcement for sensitive operations             |
| 16  | `audit`           | Action audit logging with SHA-256 checksums          |
| 17  | `maintenance`     | Feature-flag-driven maintenance mode                 |
| —   | `turnstile`       | Cloudflare Turnstile CAPTCHA (per-route)             |
| —   | `cloudflare`      | Cloudflare header forwarding                         |
| —   | `cache`           | Redis GET response caching (per-route)               |
| —   | `last-active`     | User activity timestamp tracking                     |

---

## 4. Frontend Stack

### Core Framework

| Technology       | Version | Purpose                                           |
| ---------------- | ------- | ------------------------------------------------- |
| **Next.js**      | 16.1.6  | React framework (App Router, RSC, Route Handlers) |
| **React**        | 19.2.3  | UI library (concurrent features, React Compiler)  |
| **TypeScript**   | 5.x     | Type safety                                       |
| **Tailwind CSS** | 4.1.18  | Utility-first styling (v4 with native @theme)     |

### State Management

| Library                  | Version | Scope                                |
| ------------------------ | ------- | ------------------------------------ |
| **Zustand**              | 5.0.11  | Client state (auth, UI, maintenance) |
| **TanStack React Query** | 5.90.21 | Server state, caching, mutations     |

### UI & Forms

| Library                      | Version | Purpose                                 |
| ---------------------------- | ------- | --------------------------------------- |
| **React Hook Form**          | 7.71.1  | Performant form management              |
| **Zod**                      | 4.3.6   | Schema validation (shared with backend) |
| **@hookform/resolvers**      | 5.2.2   | Zod-RHF integration                     |
| **Framer Motion**            | 12.34.0 | Animation & transitions                 |
| **Lucide React**             | 0.563.0 | Icon library (700+ icons)               |
| **class-variance-authority** | 0.7.1   | Component variant management            |
| **clsx**                     | 2.1.1   | Conditional class names                 |
| **tailwind-merge**           | 3.4.0   | Tailwind class deduplication            |
| **tailwindcss-animate**      | 1.0.7   | Animation utilities                     |

### Rich Content

| Library                     | Version       | Purpose                                               |
| --------------------------- | ------------- | ----------------------------------------------------- |
| **Tiptap**                  | 3.20.0        | Rich text editor (with link & placeholder extensions) |
| **recharts**                | 3.7.0         | Charting & data visualization                         |
| **react-image-crop**        | 11.0.10       | Profile image cropping                                |
| **react-dropzone**          | 15.0.0        | Drag-and-drop file uploads                            |
| **Leaflet + react-leaflet** | 1.9.4 / 5.0.0 | Interactive maps                                      |

### Utilities

| Library                  | Version    | Purpose                         |
| ------------------------ | ---------- | ------------------------------- |
| **Axios**                | 1.13.5     | HTTP client (with interceptors) |
| **date-fns**             | 4.1.0      | Date manipulation               |
| **lodash**               | 4.17.23    | Utility functions               |
| **js-cookie**            | 3.0.5      | Cookie management               |
| **isomorphic-dompurify** | 3.0.0-rc.2 | XSS-safe HTML rendering         |
| **sonner**               | 2.0.7      | Toast notifications             |

### Frontend Architecture Breakdown

| Layer             | Count | Description                                   |
| ----------------- | ----- | --------------------------------------------- |
| Pages (Routes)    | 85    | App Router page components                    |
| Services          | 21    | API communication layer                       |
| Types             | 14    | TypeScript type definitions                   |
| Hooks             | 15    | Custom React hooks                            |
| Stores            | 3     | Zustand state stores                          |
| Validators        | 4     | Zod form schemas                              |
| Constants         | 7     | API routes, config, enums, suggestions        |
| Lib               | 6     | API client, Firebase, analytics, auth-channel |
| Utils             | 4     | Formatting, phone, storage, validation        |
| UI Components     | 40    | Reusable UI primitives                        |
| Layout Components | 8     | Page layouts & navigation                     |
| Common Components | 15    | Shared feature components                     |

---

## 5. Database & ORM

### PostgreSQL

| Aspect                | Detail                                             |
| --------------------- | -------------------------------------------------- |
| **Engine**            | PostgreSQL 16                                      |
| **Hosting**           | Neon (serverless, auto-scaling)                    |
| **Connection**        | `@prisma/adapter-pg` driver adapter with `pg` Pool |
| **Pool Size**         | 5 connections (configurable)                       |
| **SSL**               | Auto-enabled for remote connections                |
| **Statement Timeout** | 30 seconds                                         |
| **Keepalive**         | Enabled (10s initial delay)                        |

### Prisma ORM

| Aspect             | Detail                                     |
| ------------------ | ------------------------------------------ |
| **Version**        | 7.3.0                                      |
| **Driver Adapter** | `@prisma/adapter-pg` (direct `pg` Pool)    |
| **Models**         | 31 data models                             |
| **Enums**          | 42 enum types                              |
| **Migrations**     | Prisma Migrate (dev + deploy)              |
| **Studio**         | Prisma Studio for data browsing            |
| **Error Handling** | P2002→409, P2025→404, P2003→400, P2024→503 |

### Data Models (31)

| Category                 | Models                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| **Core Users**           | `User`, `RefreshToken`, `Session`, `AuditLog`                                           |
| **Profiles**             | `CandidateProfile`, `CompanyProfile`                                                    |
| **Jobs**                 | `JobPost`, `JobApplication`, `JobTemplate`, `SavedJob`                                  |
| **Screening**            | `ScreeningQuestion`, `ScreeningAnswer`                                                  |
| **Verification**         | `VerificationRequest`                                                                   |
| **Notifications**        | `Notification`, `PushSubscription`, `DeviceToken`, `JobCandidateMatch`                  |
| **Candidate Management** | `SavedCandidate`, `CandidateList`, `CandidateListMember`                                |
| **Search & Discovery**   | `SavedSearch`, `ProfileView`, `JobAlert`, `DismissedRecommendation`                     |
| **Support**              | `SupportTicket`, `TicketMessage`, `ContactMessage`                                      |
| **Security**             | `KnownDevice`, `LoginLocation`, `UserConsent`, `MfaTrustedDevice`, `WebAuthnCredential` |
| **Webhooks**             | `WebhookEndpoint`, `WebhookDelivery`                                                    |
| **System**               | `SystemConfig`, `FormDraft`                                                             |

### Enums (42)

Role, JobType, JobStatus, ApplicationStatus, VerificationType, VerificationStatus, Gender, WorkStatus, NoticePeriod, WorkMode, ShiftType, ExperienceLevel, SalaryType, CompanyType, MaritalStatus, EducationLevel, EducationType, UrgencyLevel, DisabilityType, CareerBreakType, ReservationCategory, NoticePeriodPreference, FunctionalArea, SpecificDegree, GenderPreference, DrivingLicenseType, PostingVisibility, ApplyMethod, ScreeningQuestionType, OpenToWorkStatus, PatentStatus, FundingStage, LanguageProficiency, NotificationType, FormDraftType, TicketStatus, TicketPriority, TicketCategory, TicketSatisfaction, AlertFrequency, and more.

---

## 6. Search Engine

| Aspect            | Detail                                                                              |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Engine**        | Elasticsearch 9 (AWS managed) / OpenSearch 2.18 (Docker)                            |
| **Client**        | `@opensearch-project/opensearch` ^2.12.0                                            |
| **Indexes**       | Jobs, Candidates, Companies                                                         |
| **Features**      | Full-text search, faceted filtering, geo-distance queries, autocomplete suggestions |
| **Reindexing**    | Full reindex on startup (delete → recreate → seed suggestions → backfill from DB)   |
| **Health Checks** | Cluster health monitoring at startup                                                |

### Search Capabilities

- Multi-field full-text search with boosted relevance
- Geo-proximity filtering (lat/lng with configurable radius)
- Faceted search (industry, location, experience, education, work mode, etc.)
- Auto-suggest with server-backed suggestion indexes
- Candidate search for employers with advanced filters

---

## 7. Caching & Message Queues

### Redis

| Aspect       | Detail                                                                          |
| ------------ | ------------------------------------------------------------------------------- |
| **Version**  | 7 (Alpine)                                                                      |
| **Hosting**  | Redis Cloud (ap-south-1)                                                        |
| **Client**   | `ioredis` ^5.9.2                                                                |
| **TLS**      | Configurable                                                                    |
| **Features** | Response caching, session storage, rate limiting, DDoS tracking, BullMQ backend |
| **Eviction** | allkeys-lru (256MB max in Docker)                                               |

### BullMQ Job Queues

| Aspect              | Detail                                       |
| ------------------- | -------------------------------------------- |
| **Version**         | 5.67.3                                       |
| **Default Retries** | 3 attempts with 1000ms exponential backoff   |
| **Cleanup**         | Remove completed after 100, failed after 500 |

#### 20 Queue/Worker Pairs

| #   | Queue               | Purpose                                            |
| --- | ------------------- | -------------------------------------------------- |
| 1   | `email`             | Transactional email sending (Handlebars templates) |
| 2   | `sms`               | Twilio SMS delivery                                |
| 3   | `whatsapp`          | Meta WhatsApp Business API messaging               |
| 4   | `fcm`               | Firebase Cloud Messaging push notifications        |
| 5   | `in-app`            | Real-time in-app notifications (Socket.IO)         |
| 6   | `web-push`          | VAPID web push notifications                       |
| 7   | `webhook`           | Webhook delivery with HMAC signatures              |
| 8   | `matching`          | AI-powered job-candidate matching                  |
| 9   | `resume-parse`      | Document AI async resume parsing                   |
| 10  | `geocoding`         | Address to coordinates conversion                  |
| 11  | `job-expiration`    | Auto-expire stale job postings                     |
| 12  | `job-alert`         | Job alert email + push notifications               |
| 13  | `scheduled-publish` | Timed job post publishing                          |
| 14  | `profile-reminder`  | Profile completion nudge emails                    |
| 15  | `weekly-digest`     | Weekly digest email compilation                    |
| 16  | `token-cleanup`     | Expired token & session sweep                      |
| 17  | `sla-check`         | Support ticket SLA monitoring                      |
| 18  | `data-export`       | GDPR data export generation                        |
| 19  | `backup`            | Automated database backups (→ R2)                  |
| 20  | `scheduler`         | Core cron scheduler (orchestrates other queues)    |

---

## 8. Event Streaming

### Apache Kafka

| Aspect       | Detail                                                  |
| ------------ | ------------------------------------------------------- |
| **Provider** | Aiven Cloud                                             |
| **Client**   | `kafkajs` ^2.2.4                                        |
| **Auth**     | SCRAM-SHA-256 with TLS (CA certificate)                 |
| **Topics**   | 4 consolidated event topics                             |
| **Consumer** | Auto-started at boot                                    |
| **Viewer**   | Admin-facing Kafka event viewer (in-memory ring buffer) |

### Event Topics

- User events (registration, login, profile updates)
- Job events (created, updated, closed, applications)
- Notification events (sent, failed, retried)
- System events (errors, config changes, maintenance)

---

## 9. Authentication & Security

### Authentication Methods

| Method                | Technology                       | Details                                  |
| --------------------- | -------------------------------- | ---------------------------------------- |
| **Email/Password**    | bcryptjs ^3.0.3                  | Hashed passwords with configurable rules |
| **JWT**               | jsonwebtoken ^9.0.3              | Access (15min) + Refresh (30d) tokens    |
| **Google OAuth**      | passport-google-oauth20 ^2.0.0   | Social login                             |
| **LinkedIn OAuth**    | passport-linkedin-oauth2 ^2.0.0  | Professional network login               |
| **Firebase Auth**     | firebase-admin ^13.6.1           | Firebase ID token verification           |
| **WebAuthn/Passkeys** | @simplewebauthn/server ^13.2.2   | FIDO2 passwordless authentication        |
| **MFA (TOTP)**        | speakeasy ^2.0.0 + qrcode ^1.5.4 | Time-based one-time passwords            |

### BFF Auth Pattern (httpOnly Cookie Architecture)

| Cookie             | Type                           | Purpose                             |
| ------------------ | ------------------------------ | ----------------------------------- |
| `ha_access_token`  | httpOnly, Secure, SameSite=Lax | Access token (never visible to JS)  |
| `ha_refresh_token` | httpOnly, Secure, SameSite=Lax | Refresh token                       |
| `ha_auth_session`  | Non-httpOnly                   | Auth indicator for client hydration |

- **BFF Proxy** — Next.js API Route Handlers at `/api/auth/*` and `/api/proxy/[...path]` forward requests to Express with cookies
- **Server-to-Server** — `X-BFF-Secret` header bypasses CSRF for BFF→Backend calls
- **Cross-Tab Sync** — BroadcastChannel API synchronizes auth state across browser tabs
- **Socket.IO Auth** — Dedicated `/api/auth/socket-token` endpoint; token held in memory only

### Security Layers

| Layer                       | Technology                                          | Details                                        |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| **CSRF Protection**         | csrf-csrf ^4.0.3                                    | Double-submit cookie pattern                   |
| **Cloudflare Turnstile**    | Server-side verification                            | Bot protection (CAPTCHA alternative)           |
| **Rate Limiting**           | express-rate-limit ^8.2.1 + rate-limit-redis ^4.3.1 | Global (1000 req/15min) + auth-specific limits |
| **DDoS Protection**         | Custom Redis-backed middleware                      | IP-level rate limiting                         |
| **WAF**                     | Custom middleware                                   | SQL injection, XSS, path traversal detection   |
| **Helmet**                  | helmet ^8.1.0                                       | Security headers (CSP, HSTS, X-Frame-Options)  |
| **XSS Sanitization**        | xss-clean + isomorphic-dompurify ^3.0.0             | Input sanitization + HTML purification         |
| **HPP Protection**          | hpp ^0.2.3                                          | HTTP parameter pollution prevention            |
| **Password Breach**         | HIBP API integration                                | Have I Been Pwned password check               |
| **Session Management**      | Custom                                              | Max 5 sessions/user, 168h timeout              |
| **Field Encryption**        | AES-256-GCM                                         | Sensitive data at rest                         |
| **Data Anonymization**      | Custom utility                                      | GDPR-compliant PII anonymization               |
| **Device Fingerprinting**   | Custom service                                      | Known device tracking & risk scoring           |
| **Audit Logging**           | Prisma + SHA-256 checksum                           | Tamper-evident action logs                     |
| **Content Security Policy** | Strict 'self' + allowlisted domains                 | Script/style source restrictions               |
| **Mongo Sanitize**          | express-mongo-sanitize ^2.2.0                       | NoSQL injection prevention                     |

### Role-Based Access Control (RBAC)

| Role          | Access Level                                   |
| ------------- | ---------------------------------------------- |
| `CANDIDATE`   | Job search, applications, profile management   |
| `EMPLOYER`    | Job posting, candidate management, analytics   |
| `ADMIN`       | User moderation, verification review, reports  |
| `SUPER_ADMIN` | System config, admin management, feature flags |

---

## 10. Cloud Services & AI

### Google Cloud Platform

| Service                   | Version/Library                 | Purpose                                      |
| ------------------------- | ------------------------------- | -------------------------------------------- |
| **Document AI**           | @google-cloud/documentai ^9.5.0 | AI-powered resume parsing (async via BullMQ) |
| **Cloud Talent Solution** | @google-cloud/talent ^7.1.1     | AI job-candidate recommendations             |
| **BigQuery**              | @google-cloud/bigquery ^8.1.1   | Analytics data warehouse & pipeline          |
| **Firebase Admin SDK**    | firebase-admin ^13.6.1          | FCM, RTDB, Firestore, Auth, Remote Config    |

### Firebase Services

| Service                      | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| **Cloud Messaging (FCM)**    | Mobile & web push notifications          |
| **Realtime Database (RTDB)** | User presence (online/offline status)    |
| **Firestore**                | Live counters (active users, jobs, etc.) |
| **Remote Config**            | Feature flags management                 |
| **Authentication**           | Firebase ID token verification           |
| **Analytics**                | Client-side analytics (GA4 integration)  |

### Geocoding

| Provider             | Detail                                         |
| -------------------- | ---------------------------------------------- |
| **Nominatim (OSM)**  | Default geocoding provider (free, open-source) |
| **Google Geocoding** | Optional alternative (API key configurable)    |
| **Purpose**          | Address → lat/lng for geo-proximity job search |

---

## 11. File Storage & CDN

### Cloudflare R2

| Aspect              | Detail                                               |
| ------------------- | ---------------------------------------------------- |
| **SDK**             | @aws-sdk/client-s3 ^3.985.0 (S3-compatible)          |
| **Upload**          | @aws-sdk/lib-storage ^3.985.0 (multipart uploads)    |
| **Pre-signed URLs** | @aws-sdk/s3-request-presigner ^3.985.0               |
| **Bucket**          | `hire-adda-resumes`                                  |
| **Use Cases**       | Resumes, documents, generated PDFs, database backups |
| **CDN**             | R2 public URL for asset delivery                     |

### Cloudinary

| Aspect        | Detail                                        |
| ------------- | --------------------------------------------- |
| **SDK**       | cloudinary ^2.9.0                             |
| **Use Cases** | Profile images, company logos, cover photos   |
| **Features**  | On-the-fly image transformation, CDN delivery |

---

## 12. Notifications (Multi-Channel)

The platform supports **6 notification channels**, each with dedicated BullMQ queues for reliable async delivery:

| Channel      | Technology                 | Version                | Use Case                                    |
| ------------ | -------------------------- | ---------------------- | ------------------------------------------- |
| **Email**    | Nodemailer + Brevo SMTP    | ^8.0.0                 | Transactional emails (OTP, alerts, digests) |
| **SMS**      | Twilio                     | ^5.12.1                | OTP verification, security alerts           |
| **WhatsApp** | Meta WhatsApp Business API | Axios-based            | Job matches, application updates            |
| **FCM Push** | Firebase Cloud Messaging   | firebase-admin ^13.6.1 | Mobile push notifications                   |
| **Web Push** | VAPID (web-push)           | ^3.6.7                 | Browser push notifications                  |
| **In-App**   | Socket.IO                  | ^4.8.3                 | Real-time in-app notifications              |

### Email Templates (Handlebars)

- Welcome, email verification, password reset
- OTP delivery, MFA setup/recovery
- Job match alerts, application status updates
- Weekly digest, profile completion reminders
- Admin notifications, support ticket updates

---

## 13. Email Infrastructure

| Aspect          | Detail                             |
| --------------- | ---------------------------------- |
| **Provider**    | Brevo (formerly Sendinblue)        |
| **Protocol**    | SMTP relay (port 2525)             |
| **Library**     | Nodemailer ^8.0.0                  |
| **Templates**   | Handlebars ^4.7.8 (.hbs files)     |
| **Rate Limits** | 100/hour, 300/day (configurable)   |
| **Queue**       | BullMQ email queue with 3 retries  |
| **Admin Tools** | Email template preview + test send |

---

## 14. Real-Time Communication

### Socket.IO

| Aspect       | Detail                                                    |
| ------------ | --------------------------------------------------------- |
| **Server**   | socket.io ^4.8.3                                          |
| **Client**   | socket.io-client ^4.8.3                                   |
| **Features** | Real-time notifications, typing indicators, online status |
| **Auth**     | JWT token via dedicated BFF endpoint (memory-only)        |
| **Scaling**  | Redis adapter for multi-instance support                  |

### Firebase Realtime Database

| Aspect      | Detail                                |
| ----------- | ------------------------------------- |
| **Purpose** | User presence (online/offline status) |
| **Region**  | Asia Southeast 1                      |
| **Sync**    | Real-time bi-directional sync         |

### Firebase Firestore

| Aspect      | Detail                                         |
| ----------- | ---------------------------------------------- |
| **Purpose** | Live counters (active users, total jobs, etc.) |
| **Updates** | Atomic counter increments                      |

---

## 15. Monitoring & Observability

### Error Tracking

| Tool                  | Version                 | Scope                                    |
| --------------------- | ----------------------- | ---------------------------------------- |
| **Sentry** (Backend)  | @sentry/node ^10.38.0   | Backend error tracking + source maps     |
| **Sentry** (Frontend) | @sentry/nextjs ^10.38.0 | Frontend error tracking + session replay |
| **Sentry CLI**        | @sentry/cli ^2.58.4     | Source map upload at build time          |

### Distributed Tracing

| Tool                          | Version                                           | Detail                                           |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| **OpenTelemetry SDK**         | @opentelemetry/sdk-node ^0.211.0                  | Instrumentation framework                        |
| **OTel Auto-Instrumentation** | @opentelemetry/auto-instrumentations-node ^0.69.0 | HTTP, Express, PG auto-tracing                   |
| **OTel OTLP Exporter**        | @opentelemetry/exporter-trace-otlp-http ^0.211.0  | Trace export to Honeycomb                        |
| **OTel API**                  | @opentelemetry/api ^1.9.0                         | Custom span creation                             |
| **Backend**                   | Honeycomb.io                                      | Trace visualization & analysis                   |
| **Custom Spans**              | All external service calls                        | ES, R2, Document AI, Cloud Talent, notifications |

### Logging

| Tool             | Version  | Purpose                                   |
| ---------------- | -------- | ----------------------------------------- |
| **Winston**      | ^3.19.0  | Structured logging (error → silly levels) |
| **Morgan**       | ^1.10.1  | HTTP request logging (dev mode)           |
| **Grafana Loki** | Push API | Centralized log aggregation               |

### Analytics

| Tool                   | Integration                      | Purpose                               |
| ---------------------- | -------------------------------- | ------------------------------------- |
| **Google Analytics 4** | Server-side Measurement Protocol | Auth, job, application event tracking |
| **GA4** (Frontend)     | gtag.js via NEXT_PUBLIC_GA_ID    | Page views, user interactions         |
| **Google Tag Manager** | NEXT_PUBLIC_GTM_ID               | Tag management                        |
| **Facebook Pixel**     | NEXT_PUBLIC_FB_PIXEL_ID          | Marketing attribution                 |

### Health Checks

| Endpoint            | Purpose                                 |
| ------------------- | --------------------------------------- |
| `GET /health`       | Full health check with service statuses |
| `GET /health/live`  | Kubernetes liveness probe               |
| `GET /health/ready` | Kubernetes readiness probe              |

---

## 16. DevOps & CI/CD

### GitHub Actions CI Pipeline

| Job                    | Runs On                         | Steps                                                    |
| ---------------------- | ------------------------------- | -------------------------------------------------------- |
| **Backend**            | ubuntu-latest (Node 20.x, 22.x) | Install → Lint → Type Check → Test → Build               |
| **Frontend**           | ubuntu-latest (Node 20.x, 22.x) | Install → Lint → Type Check → Test → Build               |
| **Security Audit**     | ubuntu-latest (Node 20.x)       | npm audit --audit-level=high (both workspaces)           |
| **Container Security** | ubuntu-latest (main only)       | Docker build → Trivy vulnerability scan (CRITICAL, HIGH) |
| **Commit Lint**        | ubuntu-latest (PRs only)        | commitlint (Conventional Commits)                        |

### Triggers

- Push to `main` and `develop` branches
- Pull requests to `main` and `develop`
- Concurrency: cancel-in-progress per branch

### Backup & Recovery

| Aspect        | Detail                                              |
| ------------- | --------------------------------------------------- |
| **Automated** | BullMQ backup queue (daily at 2AM UTC) → R2         |
| **Manual**    | `make backup-db` (pg_dump → local)                  |
| **Restore**   | `make backup-db-restore FILE=path/to/backup.sql.gz` |
| **Retention** | 30 days (configurable)                              |
| **Status**    | Redis-tracked timestamps (`make backup-status`)     |

---

## 17. Infrastructure & Containerization

### Docker

| Image           | Base             | Purpose                            |
| --------------- | ---------------- | ---------------------------------- |
| Backend (prod)  | `Dockerfile`     | Multi-stage production build       |
| Backend (dev)   | `Dockerfile.dev` | Development with hot reload        |
| Frontend (prod) | `Dockerfile`     | Optimized Next.js standalone build |
| Frontend (dev)  | `Dockerfile.dev` | Development with fast refresh      |

### Docker Compose (3 configurations)

| File                      | Environment | Services                                                          |
| ------------------------- | ----------- | ----------------------------------------------------------------- |
| `docker-compose.yml`      | Base        | Nginx, Frontend, Backend, PostgreSQL 16, OpenSearch 2.18, Redis 7 |
| `docker-compose.dev.yml`  | Development | Override with dev-specific settings                               |
| `docker-compose.prod.yml` | Production  | Production optimizations                                          |

### Service Resources (Docker)

| Service    | Memory Limit | CPU Limit |
| ---------- | ------------ | --------- |
| Nginx      | 256 MB       | 0.5       |
| Frontend   | 512 MB       | 1.0       |
| Backend    | 1 GB         | 1.0       |
| PostgreSQL | 1 GB         | 1.0       |
| OpenSearch | 2 GB         | 1.0       |
| Redis      | 512 MB       | 0.5       |

### Nginx

| Feature           | Detail                                  |
| ----------------- | --------------------------------------- |
| **Image**         | nginx:1.27-alpine                       |
| **SSL/TLS**       | Let's Encrypt via Certbot               |
| **Reverse Proxy** | Routes to Backend + Frontend containers |
| **Static Files**  | Serves uploaded files                   |
| **Config**        | Custom `nginx.conf` + `conf.d/`         |

---

## 18. Code Quality & Developer Experience

### Monorepo Tooling

| Tool               | Version                 | Purpose                            |
| ------------------ | ----------------------- | ---------------------------------- |
| **npm workspaces** | Native                  | Monorepo package management        |
| **Husky**          | ^9.1.7                  | Git hooks (pre-commit, commit-msg) |
| **lint-staged**    | ^16.2.7                 | Run linters on staged files only   |
| **Commitlint**     | @commitlint/cli ^20.4.1 | Conventional Commits enforcement   |
| **Makefile**       | GNU Make                | 20+ developer commands             |

### Linting & Formatting

| Tool                            | Version                                           | Scope                         |
| ------------------------------- | ------------------------------------------------- | ----------------------------- |
| **ESLint**                      | 10.0.0 (root) / 9.39.2 (backend) / 9.x (frontend) | JavaScript/TypeScript linting |
| **@typescript-eslint**          | ^8.54.0                                           | TypeScript-specific rules     |
| **eslint-config-next**          | 16.1.6                                            | Next.js-specific rules        |
| **Prettier**                    | 3.8.1                                             | Code formatting               |
| **prettier-plugin-tailwindcss** | 0.7.2                                             | Tailwind class sorting        |

### Testing

| Tool                          | Version | Scope                            |
| ----------------------------- | ------- | -------------------------------- |
| **Jest**                      | ^30.2.0 | Test runner (both workspaces)    |
| **ts-jest**                   | ^29.4.6 | TypeScript transformer for Jest  |
| **supertest**                 | ^7.2.2  | HTTP assertion library (backend) |
| **jest-mock-extended**        | ^4.0.0  | Mock utilities (backend)         |
| **@testing-library/react**    | ^16.3.2 | Component testing (frontend)     |
| **@testing-library/jest-dom** | ^6.9.1  | DOM assertion matchers           |
| **jest-environment-jsdom**    | ^30.2.0 | Browser environment for tests    |

### Build Tools

| Tool                            | Version             | Purpose                               |
| ------------------------------- | ------------------- | ------------------------------------- |
| **tsc**                         | TypeScript compiler | Type checking & compilation           |
| **tsc-alias**                   | ^1.8.16             | Path alias resolution in build output |
| **tsconfig-paths**              | ^4.2.0              | Runtime path alias resolution         |
| **copyfiles**                   | ^2.4.1              | Copy non-TS assets to dist            |
| **concurrently**                | ^9.2.1              | Parallel npm script execution         |
| **cross-env**                   | ^10.1.0             | Cross-platform env variables          |
| **rimraf**                      | Built-in            | Cross-platform rm -rf                 |
| **nodemon**                     | ^3.1.11             | Development auto-restart              |
| **babel-plugin-react-compiler** | ^1.0.0              | React Compiler (auto-memoization)     |
| **@tailwindcss/postcss**        | ^4                  | Tailwind CSS v4 PostCSS plugin        |
| **lightningcss**                | ^1.30.2             | CSS minification & transformation     |
| **autoprefixer**                | ^10.4.24            | CSS vendor prefixing                  |

### VS Code Integration

| Config            | Features                                 |
| ----------------- | ---------------------------------------- |
| `launch.json`     | 4 debug configurations + compound launch |
| `settings.json`   | Workspace-specific editor settings       |
| `extensions.json` | Recommended extensions                   |

---

## 19. Backend Services Inventory (49 files)

| #   | Service                         | Key Functionality                            |
| --- | ------------------------------- | -------------------------------------------- |
| 1   | `admin.service`                 | Dashboard stats, user management, moderation |
| 2   | `analytics.service`             | Platform-wide analytics & metrics            |
| 3   | `audit.service`                 | Tamper-evident action audit logging          |
| 4   | `auth.service`                  | Registration, login, password reset, MFA     |
| 5   | `bigquery.service`              | BigQuery analytics data pipeline             |
| 6   | `candidate.service`             | Candidate profile CRUD & management          |
| 7   | `candidate-analytics.service`   | Candidate-specific funnel & trends           |
| 8   | `consent.service`               | GDPR/CCPA consent tracking                   |
| 9   | `contact.service`               | Contact form submissions                     |
| 10  | `data-export.service`           | GDPR data export (JSON generation)           |
| 11  | `device.service`                | Device token management (FCM)                |
| 12  | `device-security.service`       | IP/device risk detection                     |
| 13  | `draft.service`                 | Form auto-save (drafts)                      |
| 14  | `email.service`                 | Transactional email dispatch                 |
| 15  | `employer.service`              | Employer profile & company management        |
| 16  | `employer-analytics.service`    | Employer hiring pipeline analytics           |
| 17  | `fcm.service`                   | Firebase Cloud Messaging push                |
| 18  | `firestore-counters.service`    | Firestore live counter management            |
| 19  | `geocoding.service`             | Address → coordinates conversion             |
| 20  | `job.service`                   | Job posting CRUD, search, filtering          |
| 21  | `job-alert.service`             | Job alert matching & notification dispatch   |
| 22  | `job-template.service`          | Reusable job post templates                  |
| 23  | `kafka-events.service`          | Kafka event ring buffer (admin viewer)       |
| 24  | `matching.service`              | AI job-candidate matching (vector + keyword) |
| 25  | `mfa.service`                   | TOTP setup, verification, recovery           |
| 26  | `moderation.service`            | Content moderation (text analysis)           |
| 27  | `notification.service`          | Multi-channel notification orchestration     |
| 28  | `presence.service`              | Firebase RTDB user presence tracking         |
| 29  | `profile-view.service`          | Profile view tracking & analytics            |
| 30  | `report.service`                | Excel/CSV report generation                  |
| 31  | `resume-generator.service`      | PDF resume generation (Puppeteer + HBS)      |
| 32  | `resume-parser.service`         | PDF text extraction                          |
| 33  | `resume-postprocessing.service` | Resume data normalization                    |
| 34  | `resume-preprocessing.service`  | Resume file preparation                      |
| 35  | `saved-candidate.service`       | Employer candidate bookmarks                 |
| 36  | `saved-search.service`          | Saved search criteria                        |
| 37  | `search.service`                | Elasticsearch full-text search               |
| 38  | `session.service`               | Session management (max 5/user)              |
| 39  | `sms.service`                   | Twilio SMS dispatch                          |
| 40  | `storage.service`               | R2/Cloudinary file management                |
| 41  | `super-admin.service`           | System config, admin management              |
| 42  | `talent-matching.service`       | Cloud Talent AI recommendations              |
| 43  | `ticket.service`                | Support ticket system                        |
| 44  | `token.service`                 | JWT token generation & validation            |
| 45  | `verification.service`          | Identity/GST/employment verification         |
| 46  | `webauthn.service`              | FIDO2 passkey registration & login           |
| 47  | `webhook.service`               | Webhook CRUD, delivery, HMAC signing         |
| 48  | `web-push.service`              | VAPID web push dispatch                      |
| 49  | `whatsapp.service`              | Meta WhatsApp API messaging                  |

---

## 20. Frontend Services Inventory (21 files)

| #   | Service                  | Purpose                                      |
| --- | ------------------------ | -------------------------------------------- |
| 1   | `admin.service`          | Admin dashboard API calls                    |
| 2   | `analytics.service`      | Analytics data fetching                      |
| 3   | `auth.service`           | Authentication (login, register, MFA, OAuth) |
| 4   | `candidate.service`      | Candidate profile management                 |
| 5   | `candidate-list.service` | Candidate list/folder management             |
| 6   | `contact.service`        | Contact form submission                      |
| 7   | `draft.service`          | Form auto-save                               |
| 8   | `employer.service`       | Employer profile management                  |
| 9   | `feature-flag.service`   | Feature flag fetching                        |
| 10  | `job.service`            | Job operations (CRUD, search, apply)         |
| 11  | `job-template.service`   | Job template management                      |
| 12  | `notification.service`   | Notification fetching & management           |
| 13  | `push.service`           | Push notification subscription               |
| 14  | `recommendation.service` | AI recommendation fetching                   |
| 15  | `saved-search.service`   | Saved search management                      |
| 16  | `search.service`         | Search API calls                             |
| 17  | `session.service`        | Session management                           |
| 18  | `ticket.service`         | Support ticket operations                    |
| 19  | `verification.service`   | Verification request management              |
| 20  | `webauthn.service`       | Passkey registration & authentication        |
| 21  | `webhook.service`        | Webhook endpoint management                  |

---

## 21. Data Models

The Prisma schema defines 31 models covering:

### User System

- User accounts with email/password, social auth (Google, LinkedIn), mobile auth, MFA, WebAuthn
- Session management with device tracking and IP logging
- Refresh tokens with session linking

### Job Marketplace

- Comprehensive job posts with 80+ fields (type, work mode, shift, salary, education, screening questions, walk-in details, diversity tags, etc.)
- Job applications with interview tracking, offer management, and screening answers
- Job templates for employers to reuse posting configurations

### Candidate Profiles

- 100+ profile fields including skills, education, experience (all as flexible JSON), certifications, projects, publications, patents, awards, volunteer work, professional memberships, courses, test scores, references
- AI-parsed resume data (Document AI)
- Geo-coordinates (auto-populated via geocoding worker)
- 10 social profile links (GitHub, LinkedIn, StackOverflow, Twitter, Dribbble, Behance, Medium, YouTube, etc.)

### Employer Profiles

- Company details with funding info, tech stack, culture data, leadership team, employee testimonials, office photos
- Social links, awards/recognitions, workplace policies, structured perks
- Geo-coordinates for location-based matching

### Verification & Compliance

- KYC/KYB verification workflow (GST, Employment, Identity)
- Multi-level approval chains with SLA tracking
- Escalation management

### Security & Privacy

- Known devices, login locations, MFA trusted devices
- GDPR consent tracking with version management
- Audit logs with SHA-256 integrity checksums

---

## 22. API Architecture

### Route Structure (25 route files)

| Route Prefix        | File                   | Auth               | Description                                     |
| ------------------- | ---------------------- | ------------------ | ----------------------------------------------- |
| `/auth`             | auth.routes            | Mixed              | Registration, login, OAuth, MFA, password reset |
| `/candidate`        | candidate.routes       | CANDIDATE          | Profile management                              |
| `/employer`         | employer.routes        | EMPLOYER           | Company profile management                      |
| `/jobs`             | job.routes             | Mixed              | Job CRUD, search, apply                         |
| `/search`           | search.routes          | Public             | Full-text search with filters                   |
| `/applications`     | (in job.routes)        | Authenticated      | Application management                          |
| `/notifications`    | notification.routes    | Authenticated      | Notification CRUD                               |
| `/admin`            | admin.routes           | ADMIN, SUPER_ADMIN | Admin dashboard & moderation                    |
| `/super-admin`      | super-admin.routes     | SUPER_ADMIN        | System configuration                            |
| `/verifications`    | verification.routes    | Mixed              | Verification requests                           |
| `/sessions`         | session.routes         | Authenticated      | Session management                              |
| `/webauthn`         | webauthn.routes        | Authenticated      | Passkey management                              |
| `/webhooks`         | webhook.routes         | Mixed              | Webhook CRUD & delivery                         |
| `/tickets`          | ticket.routes          | Mixed              | Support ticket system                           |
| `/reports`          | report.routes          | ADMIN+             | Report generation                               |
| `/analytics`        | analytics.routes       | Authenticated      | Analytics endpoints                             |
| `/recommendations`  | recommendation.routes  | Authenticated      | AI recommendations                              |
| `/saved-search`     | saved-search.routes    | Authenticated      | Saved search management                         |
| `/saved-candidates` | saved-candidate.routes | EMPLOYER           | Candidate bookmarks                             |
| `/candidate-lists`  | candidate-list.routes  | EMPLOYER           | Candidate list/folders                          |
| `/feature-flags`    | feature-flag.routes    | Mixed              | Feature flag endpoints                          |
| `/drafts`           | draft.routes           | Authenticated      | Form draft management                           |
| `/devices`          | device.routes          | Authenticated      | Device token management                         |
| `/contact`          | contact.routes         | Public             | Contact form                                    |
| `/health`           | health.routes          | Public             | Health check endpoints                          |
| `/public`           | public.routes          | Public             | Public data endpoints                           |

### API Response Format

```json
{
  "status": "success",
  "data": { ... },
  "message": "Optional message"
}
```

### Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "requestId": "uuid-v4"
  }
}
```

### Paginated Response Format

```json
{
  "status": "success",
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 25,
    "totalPages": 4,
    "hasMore": true
  }
}
```

---

## 23. Background Job Queues

### Queue Architecture

```
                    ┌────────────────────┐
                    │  Scheduler Queue   │ ← Cron-based orchestrator
                    │  (Core Scheduler)  │
                    └────────┬───────────┘
                             │ Triggers at scheduled intervals
          ┌──────────────────┼─────────────────────┐
          │                  │                       │
   ┌──────▼──────┐   ┌──────▼──────┐   ┌───────────▼───────┐
   │ Token       │   │ Job         │   │ Weekly Digest     │
   │ Cleanup     │   │ Expiration  │   │ (Batch emails)    │
   └─────────────┘   └─────────────┘   └───────────────────┘

   ┌── Event-Driven Queues ──────────────────────────────────┐
   │                                                          │
   │  Email → SMS → WhatsApp → FCM → Web Push → In-App      │
   │  Webhook → Matching → Resume Parse → Geocoding          │
   │  Job Alert → Scheduled Publish → Profile Reminder       │
   │  SLA Check → Data Export → Backup                       │
   └──────────────────────────────────────────────────────────┘
```

All queues use Redis as the message broker with configurable retry policies (default: 3 attempts, exponential backoff starting at 1000ms).

---

## 24. Frontend Page Routes (85 pages)

### Public Pages (13)

Home, About, Contact, Help, Privacy Policy, Terms, Cookie Policy, Disclaimer, Refund Policy, Accessibility, Offline, Share, Verify Employment

### Authentication (6)

Login, Register, Forgot Password, Reset Password, Verify Email, OAuth Callback

### Candidate Dashboard (14)

Dashboard, Profile, Profile Preview, Onboarding, Jobs Search, Job Detail, Applications, Application Detail, Saved Jobs, Job Alerts, Recommendations, Analytics, Verification, Settings, Help/FAQ

### Employer Dashboard (18)

Dashboard, Profile, Profile Preview, Onboarding, Jobs List, Job Detail, Post New Job, Edit Job, Job Applications, Applications List, Application Detail, Candidates Search, Candidate Detail, Saved Candidates, Candidate Lists, Analytics, Verification, Settings, Help/FAQ

### Admin Panel (12)

Dashboard, Users List, User Detail, Jobs List, Job Detail, Applications, Verifications, Reports, Analytics, Audit Logs, Email Templates, Settings, Tickets, Ticket Detail, Moderation

### Super Admin Panel (10)

Dashboard, Users List, User Detail, Admins List, Admin Detail, Jobs List, Job Detail, Analytics, Feature Flags, System Config, Tickets, Settings

### Other (3)

Company Public Profile, Portal Login, Notifications

---

## 25. UI Component Library (40+ components)

### Core UI Primitives (40)

| Component                  | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `Button`                   | Primary/Secondary/Outline/Ghost variants |
| `Input`                    | Text input with validation states        |
| `Textarea`                 | Multi-line text input                    |
| `Select`                   | Dropdown select                          |
| `Checkbox`                 | Checkbox with label                      |
| `Radio`                    | Radio button group                       |
| `Switch`                   | Toggle switch                            |
| `Modal`                    | Dialog overlay                           |
| `Card`                     | Content card container                   |
| `Badge`                    | Status/category badges                   |
| `Tag`                      | Removable tags                           |
| `Tabs`                     | Tab navigation                           |
| `Tooltip`                  | Hover tooltips                           |
| `Dropdown`                 | Action dropdown menus                    |
| `Pagination`               | Page navigation                          |
| `Spinner`                  | Loading spinner                          |
| `Skeleton`                 | Loading placeholder                      |
| `Toast`                    | Notification toasts (sonner)             |
| `Avatar`                   | User avatar with fallback                |
| `Breadcrumb`               | Navigation breadcrumbs                   |
| `Divider`                  | Content divider                          |
| `ProgressBar`              | Progress indicator                       |
| `DatePicker`               | Date selection                           |
| `PhoneInput`               | International phone input                |
| `FileUpload`               | Drag-and-drop file upload                |
| `ImageCropper`             | Profile image cropping                   |
| `RichTextEditor`           | Tiptap-based rich text editor            |
| `SearchBar`                | Search with debounce                     |
| `AutoSuggest`              | Client-side autocomplete                 |
| `ServerAutoSuggest`        | Server-backed autocomplete               |
| `ServerSuggestionInput`    | Server suggestion with input             |
| `HighlightText`            | Search term highlighting                 |
| `AdvancedFilters`          | Complex filter panel                     |
| `ConfirmDialog`            | Confirmation dialog                      |
| `EmptyState`               | Empty data placeholder                   |
| `ErrorBoundary`            | React error boundary                     |
| `PresenceIndicator`        | Online/offline status dot                |
| `ScreeningQuestionBuilder` | Job screening question builder           |
| `ScreeningQuestionForm`    | Screening question answer form           |

### Layout Components (8)

| Component         | Purpose                                      |
| ----------------- | -------------------------------------------- |
| `DashboardLayout` | Authenticated dashboard wrapper with sidebar |
| `DashboardHeader` | Dashboard top navigation                     |
| `Sidebar`         | Dashboard side navigation                    |
| `MobileSidebar`   | Responsive mobile navigation                 |
| `AuthLayout`      | Authentication page layout                   |
| `PublicLayout`    | Public page layout                           |
| `Header`          | Public site header                           |
| `Footer`          | Public site footer                           |

### Common Components (15)

| Component             | Purpose                      |
| --------------------- | ---------------------------- |
| `BackToTop`           | Scroll-to-top button         |
| `CookieConsent`       | GDPR cookie consent banner   |
| `ManageCookiesButton` | Cookie preferences manager   |
| `ErrorBoundary`       | App-level error boundary     |
| `KeyboardShortcuts`   | Keyboard shortcut handler    |
| `LegalModal`          | Legal document modals        |
| `Logo`                | Brand logo component         |
| `MaintenancePage`     | Maintenance mode display     |
| `OfflineBanner`       | Network connectivity banner  |
| `ResumeParseReview`   | AI-parsed resume review UI   |
| `SEO`                 | Dynamic meta tags            |
| `StatsSection`        | Statistics display section   |
| `TopLoadingBar`       | Route transition loading bar |
| `WebVitals`           | Core Web Vitals reporter     |

---

## 26. Dependency Manifest

### Backend Production Dependencies (52)

| Package                                     | Version     | Category       |
| ------------------------------------------- | ----------- | -------------- |
| `@aws-sdk/client-s3`                        | ^3.985.0    | Storage        |
| `@aws-sdk/lib-storage`                      | ^3.985.0    | Storage        |
| `@aws-sdk/s3-request-presigner`             | ^3.985.0    | Storage        |
| `@google-cloud/bigquery`                    | ^8.1.1      | Cloud/AI       |
| `@google-cloud/documentai`                  | ^9.5.0      | Cloud/AI       |
| `@google-cloud/talent`                      | ^7.1.1      | Cloud/AI       |
| `@opensearch-project/opensearch`            | ^2.12.0     | Search         |
| `@opentelemetry/api`                        | ^1.9.0      | Monitoring     |
| `@opentelemetry/auto-instrumentations-node` | ^0.69.0     | Monitoring     |
| `@opentelemetry/exporter-trace-otlp-http`   | ^0.211.0    | Monitoring     |
| `@opentelemetry/sdk-node`                   | ^0.211.0    | Monitoring     |
| `@prisma/adapter-pg`                        | ^7.3.0      | Database       |
| `@prisma/client`                            | ^7.3.0      | Database       |
| `@sentry/cli`                               | ^2.58.4     | Monitoring     |
| `@sentry/node`                              | ^10.38.0    | Monitoring     |
| `@simplewebauthn/server`                    | ^13.2.2     | Security       |
| `archiver`                                  | ^5.3.2      | Utilities      |
| `axios`                                     | ^1.13.5     | HTTP Client    |
| `bcryptjs`                                  | ^3.0.3      | Security       |
| `bullmq`                                    | ^5.67.3     | Queue          |
| `cloudinary`                                | ^2.9.0      | Storage        |
| `compression`                               | ^1.8.1      | Performance    |
| `cookie-parser`                             | ^1.4.7      | Security       |
| `cors`                                      | ^2.8.6      | Security       |
| `csrf-csrf`                                 | ^4.0.3      | Security       |
| `date-fns`                                  | ^4.1.0      | Utilities      |
| `dotenv`                                    | ^17.2.4     | Config         |
| `exceljs`                                   | ^4.4.0      | Reports        |
| `express`                                   | ^5.2.1      | Framework      |
| `express-mongo-sanitize`                    | ^2.2.0      | Security       |
| `express-rate-limit`                        | ^8.2.1      | Security       |
| `express-request-id`                        | ^3.0.0      | Tracing        |
| `firebase-admin`                            | ^13.6.1     | Cloud          |
| `handlebars`                                | ^4.7.8      | Templating     |
| `helmet`                                    | ^8.1.0      | Security       |
| `hpp`                                       | ^0.2.3      | Security       |
| `ioredis`                                   | ^5.9.2      | Cache          |
| `isomorphic-dompurify`                      | ^3.0.0-rc.2 | Security       |
| `jsonwebtoken`                              | ^9.0.3      | Auth           |
| `kafkajs`                                   | ^2.2.4      | Messaging      |
| `morgan`                                    | ^1.10.1     | Logging        |
| `multer`                                    | ^2.0.2      | Upload         |
| `nodemailer`                                | ^8.0.0      | Email          |
| `passport`                                  | ^0.7.0      | Auth           |
| `passport-google-oauth20`                   | ^2.0.0      | Auth           |
| `passport-jwt`                              | ^4.0.1      | Auth           |
| `passport-linkedin-oauth2`                  | ^2.0.0      | Auth           |
| `pdfkit`                                    | ^0.17.2     | PDF Generation |
| `pg`                                        | ^8.18.0     | Database       |
| `puppeteer`                                 | ^24.37.2    | PDF Generation |
| `qrcode`                                    | ^1.5.4      | Utilities      |
| `rate-limit-redis`                          | ^4.3.1      | Security       |
| `socket.io`                                 | ^4.8.3      | Real-Time      |
| `speakeasy`                                 | ^2.0.0      | MFA            |
| `swagger-jsdoc`                             | ^6.2.8      | Documentation  |
| `swagger-ui-express`                        | ^5.0.1      | Documentation  |
| `twilio`                                    | ^5.12.1     | Notifications  |
| `uuid`                                      | ^13.0.0     | Utilities      |
| `web-push`                                  | ^3.6.7      | Notifications  |
| `winston`                                   | ^3.19.0     | Logging        |
| `xss-clean`                                 | ^0.1.4      | Security       |
| `zod`                                       | ^4.3.6      | Validation     |

### Backend Dev Dependencies (27)

| Package                  | Version  | Category                       |
| ------------------------ | -------- | ------------------------------ |
| `@types/*`               | Various  | Type Definitions (19 packages) |
| `@typescript-eslint/*`   | ^8.54.0  | Linting                        |
| `concurrently`           | ^9.2.1   | Build                          |
| `copyfiles`              | ^2.4.1   | Build                          |
| `cross-env`              | ^10.1.0  | Build                          |
| `dotenv-cli`             | ^11.0.0  | Config                         |
| `eslint`                 | ^9.39.2  | Linting                        |
| `eslint-config-prettier` | ^10.1.8  | Linting                        |
| `eslint-plugin-import`   | ^2.32.0  | Linting                        |
| `eslint-plugin-n`        | ^17.23.2 | Linting                        |
| `eslint-plugin-prettier` | ^5.5.5   | Linting                        |
| `eslint-plugin-promise`  | ^7.2.1   | Linting                        |
| `husky`                  | ^9.1.7   | Git Hooks                      |
| `jest`                   | ^30.2.0  | Testing                        |
| `jest-mock-extended`     | ^4.0.0   | Testing                        |
| `lint-staged`            | ^16.2.7  | Linting                        |
| `nodemon`                | ^3.1.11  | Development                    |
| `prettier`               | ^3.8.1   | Formatting                     |
| `prisma`                 | ^7.3.0   | Database CLI                   |
| `supertest`              | ^7.2.2   | Testing                        |
| `ts-jest`                | ^29.4.6  | Testing                        |
| `ts-node`                | ^10.9.2  | Runtime                        |
| `tsc-alias`              | ^1.8.16  | Build                          |
| `tsconfig-paths`         | ^4.2.0   | Build                          |
| `typescript`             | ^5.9.3   | Language                       |

### Frontend Production Dependencies (32)

| Package                         | Version     | Category   |
| ------------------------------- | ----------- | ---------- |
| `@hookform/resolvers`           | ^5.2.2      | Forms      |
| `@marsidev/react-turnstile`     | ^1.4.2      | Security   |
| `@sentry/nextjs`                | ^10.38.0    | Monitoring |
| `@simplewebauthn/browser`       | ^13.2.2     | Security   |
| `@tanstack/react-query`         | ^5.90.21    | State      |
| `@tiptap/react`                 | ^3.20.0     | Rich Text  |
| `@tiptap/starter-kit`           | ^3.20.0     | Rich Text  |
| `@tiptap/extension-link`        | ^3.20.0     | Rich Text  |
| `@tiptap/extension-placeholder` | ^3.20.0     | Rich Text  |
| `axios`                         | ^1.13.5     | HTTP       |
| `class-variance-authority`      | ^0.7.1      | UI         |
| `clsx`                          | ^2.1.1      | UI         |
| `date-fns`                      | ^4.1.0      | Utilities  |
| `firebase`                      | ^12.9.0     | Cloud      |
| `framer-motion`                 | ^12.34.0    | Animation  |
| `isomorphic-dompurify`          | ^3.0.0-rc.2 | Security   |
| `js-cookie`                     | ^3.0.5      | Auth       |
| `leaflet`                       | ^1.9.4      | Maps       |
| `lodash`                        | ^4.17.23    | Utilities  |
| `lucide-react`                  | ^0.563.0    | Icons      |
| `next`                          | 16.1.6      | Framework  |
| `react`                         | 19.2.3      | UI Library |
| `react-dom`                     | 19.2.3      | UI Library |
| `react-dropzone`                | ^15.0.0     | Upload     |
| `react-hook-form`               | ^7.71.1     | Forms      |
| `react-image-crop`              | ^11.0.10    | Image      |
| `react-leaflet`                 | ^5.0.0      | Maps       |
| `recharts`                      | ^3.7.0      | Charts     |
| `socket.io-client`              | ^4.8.3      | Real-Time  |
| `sonner`                        | ^2.0.7      | Toasts     |
| `tailwind-merge`                | ^3.4.0      | UI         |
| `tailwindcss-animate`           | ^1.0.7      | UI         |
| `zod`                           | ^4.3.6      | Validation |
| `zustand`                       | ^5.0.11     | State      |

### Frontend Dev Dependencies (18)

| Package                       | Version  | Category                      |
| ----------------------------- | -------- | ----------------------------- |
| `@tailwindcss/postcss`        | ^4       | Styling                       |
| `@testing-library/dom`        | ^10.4.1  | Testing                       |
| `@testing-library/jest-dom`   | ^6.9.1   | Testing                       |
| `@testing-library/react`      | ^16.3.2  | Testing                       |
| `@types/*`                    | Various  | Type Definitions (7 packages) |
| `autoprefixer`                | ^10.4.24 | CSS                           |
| `babel-plugin-react-compiler` | ^1.0.0   | Build                         |
| `eslint`                      | ^9       | Linting                       |
| `eslint-config-next`          | 16.1.6   | Linting                       |
| `eslint-config-prettier`      | ^10.1.8  | Linting                       |
| `eslint-plugin-prettier`      | ^5.5.5   | Linting                       |
| `jest`                        | ^30.2.0  | Testing                       |
| `jest-environment-jsdom`      | ^30.2.0  | Testing                       |
| `lightningcss`                | ^1.30.2  | CSS                           |
| `postcss`                     | ^8.5.6   | CSS                           |
| `prettier`                    | ^3.8.1   | Formatting                    |
| `prettier-plugin-tailwindcss` | ^0.7.2   | Formatting                    |
| `tailwindcss`                 | ^4.1.18  | Styling                       |
| `ts-node`                     | ^10.9.2  | Runtime                       |
| `typescript`                  | ^5       | Language                      |

### Root Dev Dependencies (6)

| Package                           | Version | Purpose                    |
| --------------------------------- | ------- | -------------------------- |
| `@commitlint/cli`                 | ^20.4.1 | Commit message linting     |
| `@commitlint/config-conventional` | ^20.4.1 | Conventional Commits rules |
| `eslint`                          | 10.0.0  | Root-level linting         |
| `husky`                           | ^9.1.7  | Git hooks                  |
| `lint-staged`                     | ^16.2.7 | Pre-commit linting         |
| `prettier`                        | 3.8.1   | Code formatting            |
| `prettier-plugin-tailwindcss`     | 0.7.2   | Tailwind class sorting     |

---

## Document Generation & Maintenance

### Third-Party Service Providers

| Service            | Provider                 | Region         | Purpose                        |
| ------------------ | ------------------------ | -------------- | ------------------------------ |
| PostgreSQL         | **Neon**                 | ap-southeast-1 | Primary database               |
| Redis              | **Redis Cloud**          | ap-south-1     | Cache & message broker         |
| Elasticsearch      | **AWS OpenSearch**       | us-east-1      | Full-text search               |
| Kafka              | **Aiven**                | Cloud          | Event streaming                |
| Firebase           | **Google Cloud**         | Multi-region   | FCM, RTDB, Firestore, Auth     |
| Document AI        | **Google Cloud**         | asia-south1    | Resume parsing                 |
| Cloud Talent       | **Google Cloud**         | Global         | Job recommendations            |
| BigQuery           | **Google Cloud**         | Global         | Analytics warehouse            |
| SMTP               | **Brevo**                | EU             | Email delivery                 |
| SMS                | **Twilio**               | US             | SMS delivery                   |
| WhatsApp           | **Meta**                 | Global         | WhatsApp messaging             |
| R2 Storage         | **Cloudflare**           | Global         | File storage & CDN             |
| Image CDN          | **Cloudinary**           | Global         | Image storage & transformation |
| Error Tracking     | **Sentry**               | US             | Error monitoring               |
| Tracing            | **Honeycomb**            | US             | Distributed tracing            |
| Logs               | **Grafana Cloud**        | ap-south-1     | Log aggregation                |
| Analytics          | **Google Analytics 4**   | Global         | User analytics                 |
| CAPTCHA            | **Cloudflare Turnstile** | Global         | Bot protection                 |
| Geocoding          | **Nominatim (OSM)**      | Global         | Address → coordinates          |
| Container Security | **Trivy**                | CI/CD          | Vulnerability scanning         |

---

_This document was auto-generated from the Hire Adda codebase on March 7, 2026._
_For questions, contact the engineering team._
