# 🌉 Hire Adda

> **Bridging the gap between manual talent and top employers.**

![License](https://img.shields.io/badge/license-Proprietary-red.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.1-black)
![React](https://img.shields.io/badge/React-19.2-cyan)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Prisma](https://img.shields.io/badge/Prisma-7.3-white)
![Express](https://img.shields.io/badge/Express-5.2-green)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-9.3-yellow)
![Redis](https://img.shields.io/badge/Redis-7.x-red)
![Docker](https://img.shields.io/badge/Docker-24.x-blue)
![Status](https://img.shields.io/badge/Status-Active_Development-brightgreen)

---

## 📖 Table of Contents

1.  [About The Project](#-about-the-project)
    - [Mission](#mission)
    - [Why Hire Adda?](#why-hire-adda)
2.  [Key Features](#-key-features)
    - [For Candidates](#-candidate-features)
    - [For Employers](#-employer-features)
    - [For Admins](#-admin-features)
3.  [Technical Architecture](#-technical-architecture)
    - [High-Level Overview](#high-level-overview)
    - [Tech Stack](#tech-stack)
    - [Monorepo Structure](#monorepo-structure)
    - [Authentication Flow](#authentication-flow)
    - [Search Engine Implementation](#search-engine-implementation)
4.  [Getting Started](#-getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Environment Variables](#environment-variables)
    - [Running Locally](#running-locally)
5.  [Development Guide](#-development-guide)
    - [Available Scripts](#available-scripts)
    - [Database Management](#database-management)
    - [Testing](#testing)
    - [Linting & Formatting](#linting--formatting)
6.  [API Reference](#-api-reference)
    - [Authentication](#auth-endpoints)
    - [Jobs](#job-endpoints)
    - [Users](#user-endpoints)
7.  [Deployment](#-deployment)
    - [Docker Compose](#docker-compose)
    - [Production Build](#production-build)
8.  [Troubleshooting](#-troubleshooting)
9.  [Roadmap](#-roadmap)
10. [Contributing](#-contributing)
11. [License](#-license)
12. [Contact](#-contact)

---

## 📘 About The Project

**Hire Adda** is a specialized, high-performance recruitment platform designed to address the unique challenges of the blue-collar and service industry job market.

### Mission

To democratize access to employment opportunities for manual laborers, technicians, delivery personnel, and service staff by providing a platform that is as professional and reliable as those used by white-collar professionals.

### Why Hire Adda?

Traditional job portals like LinkedIn are optimized for corporate networking, while local classifieds (Craigslist, OLX) lack verification and structure. Hire Adda fills this void by offering:

- **Trust:** Mandatory GST verification for employers and ID verification for candidates.
- **Accessibility:** Mobile-first design, as 95% of our target user base accesses the internet via smartphones.
- **Speed:** Instant WhatsApp/SMS notifications to bridge the digital divide.
- **Relevance:** Smart matching algorithms that value skills and location over fancy degrees.

---

## 🌟 Key Features

### 👷 Candidate Features

- **Mobile-Optimized Profile**:
  - Easy-to-fill resume builder.
  - Upload photos of work samples.
  - Video introduction support.
- **One-Click Application**:
  - Apply to jobs without re-entering data.
  - "Easy Apply" filter for urgent openings.
- **Real-Time Alerts**:
  - Get notified via WhatsApp when an employer views your profile.
  - SMS alerts for interview calls.
- **Verification Badges**:
  - Phone number verified.
  - Government ID verified (Aadhaar/PAN integration planned).
- **Application Tracking**:
  - See exactly when your application was viewed, shortlisted, or rejected.
  - Withdraw applications if you find another job.

### 🏢 Employer Features

- **Smart Job Posting**:
  - Structured forms for Salary, Shift timings, and Requirements.
  - Auto-suggestions for skills based on job title.
- **Powerful Search**:
  - Filter candidates by **Distance** (Location-based search).
  - Filter by **Experience**, **Salary Expectations**, and **Verification Status**.
  - Boolean search support (AND/OR).
- **Candidate Management System (CMS)**:
  - Kanban board to drag-and-drop candidates (Applied -> Interviewing -> Hired).
  - Save promising profiles for later.
  - Add internal notes to candidate profiles.
- **Company Branding**:
  - Customizable company page with logo, description, and photos.
  - "Verified Employer" badge after GST verification.

### 🛡️ Admin Features

- **Dashboard & Analytics**:
  - Live counter for Active Users, Jobs, and Applications.
  - Revenue tracking (Upcoming).
  - User growth charts.
- **Content Moderation**:
  - Auto-flagging of suspicious job postings (keyword blocking).
  - Manual review tools for reports against users.
- **User Management**:
  - Ban/Suspend users violating terms.
  - Reset 2FA for locked-out users.
  - Manually verify employers.
- **System Health**:
  - Monitor Redis queue status.
  - View error logs.

---

## 🏗️ Technical Architecture

### High-Level Overview

Hire Adda is built as a **Monorepo** using npm workspaces. It separates concerns between a high-performance REST API backend and a Server-Side Rendered (SSR) React frontend.

```mermaid
graph TD
    Client[Web/Mobile Client] -->|HTTPS| CDN[CDN/Edge]
    CDN -->|Next.js Asset| Frontend[Frontend (Next.js)]
    Frontend -->|API Call| Backend[Backend (Express)]
    Backend -->|Auth| Auth[JWT Service]
    Backend -->|Data| DB[(PostgreSQL)]
    Backend -->|Cache| Cache[(Redis)]
    Backend -->|Search| Search[(Elasticsearch)]
    Backend -->|Queue| Queue[BullMQ]
```

### Tech Stack

| Component              | Technology    | Version  | Reason for Choice                                        |
| :--------------------- | :------------ | :------- | :------------------------------------------------------- |
| **Frontend Framework** | Next.js       | `16.1.6` | Best-in-class SSR/ISR, SEO optimization, and App Router. |
| **Language**           | TypeScript    | `5.0+`   | Type safety prevents 90% of runtime errors.              |
| **Styling**            | Tailwind CSS  | `4.x`    | Rapid UI development with low bundle size.               |
| **Component Library**  | Shadcn UI     | --       | Accessible, headless components based on Radix UI.       |
| **Backend Framework**  | Express.js    | `5.2.1`  | Battle-tested, high-performance Node.js framework.       |
| **Database**           | PostgreSQL    | `16`     | ACID compliance, robust relational data modeling.        |
| **ORM**                | Prisma        | `7.3.0`  | Type-safe database queries, auto-migrations.             |
| **Search Engine**      | Elasticsearch | `9.3.0`  | Handles complex full-text search queries efficiently.    |
| **Caching**            | Redis         | `7.x`    | Session management, caching, and job queues.             |
| **Authentication**     | JWT + Cookies | --       | Secure, stateless authentication with refresh tokens.    |
| **Infrastructure**     | Docker        | --       | Consistent dev/prod environments.                        |

### Monorepo Structure

```plaintext
hire_adda/
├── package.json           # Root workspace config
├── .gitignore             # Global ignore rules
├── doc/                   # Documentation folder
├── backend/               # BACKEND WORKSPACE
│   ├── src/
│   │   ├── config/        # Env and tool setup (DB, Logger)
│   │   ├── controllers/   # Request handlers
│   │   ├── middlewares/   # Auth, Validation, Error Handling
│   │   ├── routes/        # API definition
│   │   ├── services/      # Business logic
│   │   └── utils/         # Helpers
│   ├── prisma/            # Schema schema.prisma
│   └── tests/             # Jest tests
└── frontend/              # FRONTEND WORKSPACE
    ├── src/
    │   ├── app/           # Next.js App Router (Pages)
    │   ├── components/    # Reusable UI
    │   ├── hooks/         # Custom React Hooks
    │   ├── lib/           # Utility libraries (Axios, utils)
    │   ├── services/      # API client services
    │   └── types/         # TypeScript interfaces
    └── public/            # Static assets
```

### Authentication Flow

We use a **Dual-Token System** (Access Token + Refresh Token) for maximum security.

1.  **Login**: User sends credentials.
2.  **Validation**: Backend verifies password (bcrypt).
3.  **Token Generation**:
    - `Access Token` (short-lived, 15m) -> Sent in HTTP-Only Cookie.
    - `Refresh Token` (long-lived, 7d) -> Stored in HttpOnly Cookie & Redis.
4.  **Request**: Frontend sends request. Middleware checks Access Token.
    - _If valid_: Request proceeds.
    - _If expired_: Frontend interceptor calls `/refresh`.
5.  **Refresh**: Backend verifies Refresh Token against Redis whitelist. Issues new Access Token.

### Search Engine Implementation

PostgreSQL is great for data integrity, but slow for flexible search. We sync data to **Elasticsearch**.

- **Sync Mechanism**: Database triggers / BullMQ jobs push updates to Elastic.
- **Search Features**:
  - Fuzzy matching (handles typos).
  - Geospatial queries (candidates within 50km).
  - Faceted search (filters).

---

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites

Ensure you have the following installed:

- **Node.js**: v18.17 or higher (LTS recommended)
- **npm**: v9 or higher
- **Docker Desktop**: Required for running services (Postgres, Redis, Elastic) easily.
- **Git**: Version control.

### Installation

1.  **Clone the Repository**

    ```bash
    git clone https://github.com/dev-technotaau/hire-adda.git
    cd hire-adda
    ```

2.  **Install Dependencies**
    We use `npm workspaces`. Installing at the root installs dependencies for both backend and frontend.

    ```bash
    npm install
    ```

3.  **Start Infrastructure Services**
    Use Docker Compose to spin up the required databases.
    ```bash
    cd backend
    docker-compose -f docker-compose.dev.yml up -d
    cd ..
    ```
    _This starts PostgreSQL (5432), Redis (6379), and Elasticsearch (9200)._

### Environment Variables

You need to configure environment variables for both workspaces.

**1. Backend Config**
Copy the example file:

```bash
cp backend/.env.example backend/.env
```

Key variables to check:

```ini
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/hire_adda"
# Security
JWT_SECRET="super_secret_key_change_in_prod"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_SECRET="another_secret_key"
# Services
REDIS_URL="redis://localhost:6379"
ELASTICSEARCH_NODE="http://localhost:9200"
```

**2. Frontend Config**
Copy the example file:

```bash
cp frontend/.env.example frontend/.env
```

Key variables:

```ini
NEXT_PUBLIC_API_URL="http://localhost:3001/api/v1"
```

### Running Locally

We have a unified script to run both servers concurrently.

```bash
# From the root directory
npm run dev
```

- **Frontend**: Open [http://localhost:3000](http://localhost:3000)
- **Backend API**: Running at [http://localhost:3001](http://localhost:3001)
- **API Docs**: [http://localhost:3001/api-docs](http://localhost:3001/api-docs) (Swagger)

---

## 👨‍💻 Development Guide

### Available Scripts

These scripts can be run from the root `package.json`.

| Script          | Description                                                           |
| :-------------- | :-------------------------------------------------------------------- |
| `npm run dev`   | Starts both Frontend (Next.js) and Backend (Nodemon) in parallel.     |
| `npm run build` | Builds both workspaces for production.                                |
| `npm run start` | Starts the production build.                                          |
| `npm run lint`  | Runs ESLint across the entire monorepo.                               |
| `npm run clean` | Deletes `node_modules`, `.next`, and `dist` folders (Cross-platform). |
| `npm run test`  | Runs Jest tests for both workspaces.                                  |

### Database Management

We use **Prisma** for schema management.

- **Migration**: Create a new migration after changing `schema.prisma`.
  ```bash
  npm run db:migrate --workspace=backend
  ```
- **Studio**: Open the database GUI.
  ```bash
  npm run db:studio --workspace=backend
  ```
- **Seeding**: Populate DB with dummy data.
  ```bash
  npm run db:seed --workspace=backend
  ```

### Testing

We use **Jest** for unit and integration testing.

```bash
# Run backend tests
npm run test --workspace=backend

# Run frontend tests
npm run test --workspace=frontend
```

### Linting & Formatting

We adhere to strict coding standards using **ESLint** and **Prettier**.

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint --workspace=backend -- --fix
```

---

## 📡 API Reference

This is a summary of the key API endpoints. For full details, refer to the Swagger docs at `/api-docs`.

### Auth Endpoints (`/api/v1/auth`)

| Method | Endpoint         | Description                               | Auth Required |
| :----- | :--------------- | :---------------------------------------- | :------------ |
| `POST` | `/register`      | Register a new User (Candidate/Employer). | No            |
| `POST` | `/login`         | Login with Email/Password.                | No            |
| `POST` | `/refresh-token` | Get new Access Token using Refresh Token. | No            |
| `POST` | `/logout`        | Invalidate tokens and clear cookies.      | Yes           |
| `GET`  | `/me`            | Get current logged-in user details.       | Yes           |
| `POST` | `/verify-email`  | Verify email with OTP.                    | Yes           |

### Job Endpoints (`/api/v1/jobs`)

| Method   | Endpoint     | Description                               | Auth Required |
| :------- | :----------- | :---------------------------------------- | :------------ |
| `GET`    | `/`          | Search jobs (Filters: loc, salary, type). | No            |
| `GET`    | `/:id`       | Get detailed job view.                    | No            |
| `POST`   | `/`          | Create a new job posting.                 | Employer      |
| `PUT`    | `/:id`       | Update an existing job.                   | Employer      |
| `DELETE` | `/:id`       | Close/Archive a job.                      | Employer      |
| `POST`   | `/:id/apply` | Apply for a job.                          | Candidate     |

### User Endpoints (`/api/v1/users`)

| Method | Endpoint         | Description                        | Auth Required |
| :----- | :--------------- | :--------------------------------- | :------------ |
| `GET`  | `/candidates`    | Search candidates (Elasticsearch). | Employer      |
| `PUT`  | `/profile`       | Update profile details.            | Yes           |
| `POST` | `/upload-resume` | Upload PDF resume.                 | Candidate     |
| `POST` | `/company-logo`  | Upload company logo.               | Employer      |
| `GET`  | `/saved-jobs`    | Get jobs saved by candidate.       | Candidate     |

### Admin Endpoints (`/api/v1/admin`)

| Method  | Endpoint          | Description                  | Role  |
| :------ | :---------------- | :--------------------------- | :---- |
| `GET`   | `/stats`          | Get system overview stats.   | Admin |
| `GET`   | `/users`          | List all users with filters. | Admin |
| `PATCH` | `/users/:id/ban`  | Ban a user.                  | Admin |
| `GET`   | `/reports/export` | Export data to CSV/Excel.    | Admin |

---

## 🚢 Deployment

### Docker Compose

For production deployment, we use a multi-stage Docker build.

1.  **Build Images**:

    ```bash
    docker-compose -f docker-compose.prod.yml build
    ```

2.  **Run Containers**:
    ```bash
    docker-compose -f docker-compose.prod.yml up -d
    ```
    This spins up Nginx (Reverse Proxy), Frontend, Backend, Postgres, and Redis.

### Production Build

To build for production locally without Docker:

```bash
# 1. Build
npm run build

# 2. Start
npm run start
```

- **Backend** starts on port defined in `PORT` (default 3001).
- **Frontend** starts on port 3000.
- Ensure a reverse proxy (Nginx/Apache) handles SSL and routing if exposed to the web.

---

## ❓ Troubleshooting

### Common Issues

**1. "Prisma Client not initialized"**

- **Cause**: You ran `npm install` but didn't generate the Prisma client.
- **Fix**: Run `npm run db:generate --workspace=backend`.

**2. "Connection Refused" (Database)**

- **Cause**: Docker container is not running or env vars are wrong.
- **Fix**: Check `docker ps` and ensure `DATABASE_URL` matches the container settings.

**3. "Elasticsearch connection error"**

- **Cause**: Elasticsearch takes time to maximize startup.
- **Fix**: Wait 30 seconds after `docker-compose up` or check memory allocation (ES needs ~2GB).

**4. "Middleware file convention deprecated" (Next.js)**

- **Cause**: Stale cache in Next.js.
- **Fix**: Run `npm run clean` and rebuild.

---

## 🗺️ Roadmap

### Phase 1: Foundation (Completed) ✅

- [x] Monorepo Setup
- [x] Basic Auth (Login/Register)
- [x] Profile Management
- [x] Job Posting & Application

### Phase 2: Security & Scale (Completed) ✅

- [x] Middleware Role Protection
- [x] Dockerization (`standalone` output)
- [x] Elasticsearch Integration
- [x] Admin Dashboard

### Phase 3: Monetization (Upcoming) 🚧

- [ ] **Payment Gateway**: Integration with **Razorpay**.
- [ ] **Subscription Plans**: Basic, Pro, Enterprise tiers for Employers.
- [ ] **Invoicing**: Auto-generate GST-compliant PDF invoices.

### Phase 4: Advanced AI (Future) 🔮

- [ ] **Resume Parsing**: Auto-fill profile from PDF.
- [ ] **AI Matching**: Scoring system for Candidate-Job fit.
- [ ] **Chatbot**: Automated support assistance.

---

## 🤝 Contributing

Hire Adda is closed-source. The codebase is restricted to authorized team
members (employees, contractors, approved collaborators) who already have
access to the private repository — public pull requests and forks are not
accepted.

If you are on the team, see [CONTRIBUTING.md](CONTRIBUTING.md) for the full
internal workflow: repo access, branch naming, PR review and approval
gates, commit conventions, code standards, and confidentiality rules.

All contributors are expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

---

## 📄 License

**Proprietary — All Rights Reserved.**

Copyright (c) 2026 Hire Adda. This software and its source code are the
proprietary and confidential property of Hire Adda. No license is granted
to copy, modify, distribute, sublicense, reverse-engineer, or otherwise
use the software except as expressly authorized in writing by Hire Adda.

See the [LICENSE](LICENSE) file for the full terms. For licensing
inquiries, contact `legal@hireadda.in`.

---

## 📞 Contact

**Project Lead**: Hire Adda Team
**Email**: support@hireadda.in
**Website**: [https://hireadda.in](https://hireadda.in)

---

<p align="center">
  Built with ❤️ for the global workforce.
</p>
