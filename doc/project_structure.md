# Project Structure

This document provides an **exhaustive** breakdown of the **Hire Adda** monorepo structure. Every file and folder is accounted for.

## 📂 Root Directory (`d:\Projects\hire_adda`)

Configuration for the workspace and community standards.

| File / Folder        | Description                                                                                   |
| :------------------- | :-------------------------------------------------------------------------------------------- |
| `.claude/`           | Configuration for Claude AI assistant.                                                        |
| `.github/`           | GitHub Action workflows (`ci.yml`) and templates.                                             |
| `doc/`               | Project documentation (`project_structure.md`, `project_summary.md`, `quick_start_guide.md`). |
| `backend/`           | **Workspace**: Express.js API Server.                                                         |
| `frontend/`          | **Workspace**: Next.js Web Application.                                                       |
| `.gitignore`         | Global git ignore rules (node_modules, .env, dist, etc.).                                     |
| `CHANGELOG.md`       | Version history and notable changes.                                                          |
| `CODE_OF_CONDUCT.md` | Community behavior standards (Contributor Covenant).                                          |
| `CONTRIBUTING.md`    | Guidelines for developers contributing to the project.                                        |
| `LICENSE`            | MIT License terms.                                                                            |
| `README.md`          | Main project entry point, setup guide, and features overview.                                 |
| `package.json`       | **Root Config**: Manages workspaces (`backend`, `frontend`) and unified scripts.              |

---

## 🛠️ Backend Workspace (`/backend`)

A highly modular REST API built with Node.js, Express, and TypeScript.

### Root Configs

| File                      | Description                                             |
| :------------------------ | :------------------------------------------------------ |
| `.dockerignore`           | Files excluded from Docker builds.                      |
| `.editorconfig`           | Editor coding style consistency.                        |
| `.env`                    | **Secret**: Environment variables (DB_URL, JWT_SECRET). |
| `.env.example`            | Template for environment variables.                     |
| `.eslintrc.json`          | Backend-specific linting rules.                         |
| `.prettierrc`             | Formatting rules.                                       |
| `Dockerfile`              | Multi-stage Docker build instruction.                   |
| `docker-compose.yml`      | Base service orchestration (Postgres, Redis, Elastic).  |
| `docker-compose.dev.yml`  | Development overrides for Docker.                       |
| `docker-compose.prod.yml` | Production specific overrides.                          |
| `ecosystem.config.js`     | PM2 process manager config for production.              |
| `jest.config.ts`          | Test configuration.                                     |
| `nodemon.json`            | Auto-restart config for dev server.                     |
| `package.json`            | Dependencies and scripts for backend.                   |
| `tsconfig.json`           | TypeScript compiler options.                            |
| `tsconfig.build.json`     | TS options optimized for build output.                  |

### Source Code (`/backend/src`)

#### Core Application

| File        | Description                                                     |
| :---------- | :-------------------------------------------------------------- |
| `app.ts`    | Express application setup (Middleware, Routes, Error Handling). |
| `server.ts` | Entry point. Connects to DB/Redis and starts the HTTP server.   |

#### Modules

**`/config`** - External Service Setup

- `cloudinary.ts`: Image upload configuration.
- `database.ts`: Prisma client instance.
- `elasticsearch.ts`: Search engine connection.
- `env.ts`: Environment variable validation (Zod).
- `logger.ts`: Winston logger setup.
- `redis.ts`: Redis client connection.

**`/controllers`** - Request Handlers

- `admin.controller.ts`: Admin-only actions (ban user, stats).
- `auth.controller.ts`: Login, Register, Refresh Token, MFA.
- `candidate.controller.ts`: Candidate profile operations.
- `employer.controller.ts`: Employer profile and job management.
- `job.controller.ts`: CRUD for jobs and applications.
- `notification.controller.ts`: Fetch/Mark-read notifications.
- `search.controller.ts`: Elasticsearch query handlers.
- `upload.controller.ts`: File upload handlers.
- `user.controller.ts`: General user profile management.
- `verification.controller.ts`: Mobile/Email verification logic.

**`/middleware`** - Request Interceptors

- `auth.ts`: JWT verification and Role-Based Access Control (RBAC).
- `error.ts`: Global error handling middleware.
- `logger.ts`: HTTP request logging (Morgan).
- `upload.ts`: Multer configuration for file parsing.
- `validate.ts`: Zod schema validation middleware.

**`/models`**

- _(Managed via Prisma Schema mostly, contains custom interfaces if needed)_.

**`/routes`** - API Endpoint Definitions

- `admin.routes.ts`: `/api/v1/admin/*`
- `auth.routes.ts`: `/api/v1/auth/*`
- `candidate.routes.ts`: `/api/v1/candidates/*`
- `employer.routes.ts`: `/api/v1/employers/*`
- `job.routes.ts`: `/api/v1/jobs/*`
- `notification.routes.ts`: `/api/v1/notifications/*`
- `report.routes.ts`: `/api/v1/reports/*`
- `saved-candidate.routes.ts`: `/api/v1/saved-candidates/*`
- `search.routes.ts`: `/api/v1/search/*`
- `upload.routes.ts`: `/api/v1/upload/*`
- `user.routes.ts`: `/api/v1/users/*`
- `verification.routes.ts`: `/api/v1/verification/*`
- `index.ts`: Central router aggregator.

**`/scripts`** - Utilities

- `seed-super-admin.ts`: Database seeder for initial admin.

**`/services`** - Business Logic

- `admin.service.ts`: Logic for admin stats and moderation.
- `auth.service.ts`: Token generation, hashing, login logic.
- `candidate.service.ts`: Profile management logic.
- `email.service.ts`: Nodemailer/SendGrid logic.
- `employer.service.ts`: Company profile logic.
- `job.service.ts`: Job posting and application logic.
- `monitoring.service.ts`: System health checks.
- `notification.service.ts`: Real-time notification logic.
- `report.service.ts`: Export generation (Excel/PDF).
- `search.service.ts`: Elasticsearch indexing and querying.
- `sms.service.ts`: Twilio SMS logic.
- `socket.service.ts`: Socket.io event handling.
- `storage.service.ts`: S3/Cloudinary upload logic.
- `token.service.ts`: JWT signing and verification.
- `user.service.ts`: User CRUD logic.
- `verification.service.ts`: OTP generation and checking.

**`/templates`** - Email/PDF Layouts

- `email/`: Handlebars templates (`welcome.hbs`, `reset-password.hbs`).
- `pdf/`: Templates for generated reports.

**`/types`** - TypeScript Definitions

- `express.d.ts`: Extends Express Request interface (adds `req.user`).
- `index.ts`: Shared type definitions.

**`/utils`** - Helpers

- `api-error.ts`: Custom error class.
- `api-response.ts`: Standard response formatter.
- `async-handler.ts`: Wrapper for async controller methods.
- `catch-async.ts`: Alternative async wrapper.
- `generate-otp.ts`: Numeric OTP generator.
- `helpers.ts`: Miscellaneous utilities.

**`/validators`** - Zod Schemas

- `auth.validator.ts`: Schema for login/register.
- `job.validator.ts`: Schema for job posting.
- `profile.validator.ts`: Schema for profile updates.

### Prisma (`/backend/prisma`)

- `schema.prisma`: The single source of truth for the Database Schema.
- `migrations/`: SQL migration history folder.

---

## 💻 Frontend Workspace (`/frontend`)

Next.js 14 App Router application with Tailwind CSS.

### Root Configs

| File                   | Description                                               |
| :--------------------- | :-------------------------------------------------------- |
| `.env`, `.env.example` | Environment variables (`NEXT_PUBLIC_API_URL`).            |
| `.eslintrc.json`       | Linting rules.                                            |
| `Dockerfile`           | Production build container.                               |
| `components.json`      | Shadcn/UI configuration.                                  |
| `middleware.ts`        | **Next.js Middleware**: Route protection and redirection. |
| `next.config.ts`       | Next.js configuration (`standalone` output).              |
| `package.json`         | Frontend dependencies.                                    |
| `tailwind.config.ts`   | Tailwind CSS Theme configuration.                         |
| `tsconfig.json`        | TypeScript config.                                        |

### Source Code (`/frontend/src`)

#### App Router (`/app`)

- `layout.tsx`: Root layout (fonts, global providers).
- `page.tsx`: Landing page (Home).
- `globals.css`: Global styles (Tailwind directives).
- `not-found.tsx`: 404 Page.
- `error.tsx`: Global error boundary.
- `loading.tsx`: Global loading state.

**`(auth)`** - Authentication Group

- `layout.tsx`: Auth-specific layout (centered box).
- `login/page.tsx`: Login form.
- `register/page.tsx`: Registration for Candidate/Employer.
- `forgot-password/page.tsx`: Recovery flow.
- `reset-password/page.tsx`: Password reset.
- `verify-email/page.tsx`: OTP verification.

**`(dashboard)`** - Protected Routes

- `admin/`: Admin dashboard pages (`analytics`, `users`, `jobs`, `reports`).
- `candidate/`: Candidate dashboard (`profile`, `jobs`, `applications`).
- `employer/`: Employer dashboard (`post-job`, `candidates`, `company-profile`).
- `notifications/`: Notification center.
- `settings/`: Account settings.

**`jobs`** - Public Job Pages

- `[id]/page.tsx`: Job details view.
- `search/page.tsx`: Job search listing.

**`companies`**

- `[id]/page.tsx`: Company public profile.

#### Components (`/components`)

**`/ui`** - Design System (Shadcn)

- `Button.tsx`, `Input.tsx`, `Card.tsx`, `Modal.tsx`, `Badge.tsx`, `Textarea.tsx`, `Select.tsx`, `Toast.tsx`, `Spinner.tsx`.

**`/layout`**

- `Header.tsx`: Top navigation bar.
- `Sidebar.tsx`: Dashboard side navigation.
- `Footer.tsx`: Public footer.
- `DashboardLayout.tsx`: Wrapper for protected pages.

**`/forms`** - Complex Form Logic

- `LoginForm.tsx`, `RegisterForm.tsx`, `JobPostForm.tsx`, `ProfileForm.tsx`.

**`/shared`**

- `ConfirmDialog.tsx`, `EmptyState.tsx`, `Pagination.tsx`.

#### Core Logic

**`/hooks`**

- `use-auth.ts`: Authentication state hook.
- `use-toast.ts`: Notification hook.
- `use-debounce.ts`: Search optimization.
- `use-socket.ts`: Real-time connection.

**`/lib`**

- `api.ts`: Axios instance with interceptors.
- `utils.ts`: Global utilities (cn, formatting).
- `constants.ts`: Static configuration data.

**`/services`** - API Clients

- `admin.service.ts`: Admin API calls.
- `auth.service.ts`: Auth API calls.
- `candidate.service.ts`: Candidate operations.
- `employer.service.ts`: Employer operations.
- `job.service.ts`: Job operations.
- `upload.service.ts`: File upload handler.
- `user.service.ts`: User profile operations.

**`/store`** - State Management

- `auth.store.ts`: Zustand store for user session.
- `ui.store.ts`: Global UI state (modals, sidebar).

**`/types`** - TypeScript Interfaces

- `api.ts`: API response shapes.
- `auth.ts`: User and Token types.
- `job.ts`: Job and Application types.
- `user.ts`: Candidate/Employer profile types.

**`/validators`** - Form Schemas

- `auth.schema.ts`: Zod schema for login/register.
- `job.schema.ts`: Zod schema for jobs.
- `profile.schema.ts`: Zod schema for profiles.
