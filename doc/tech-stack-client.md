# Hire Adda — Technology & Services Overview

**Prepared for:** Client Review
**Date:** March 2026

---

## Platform Summary

Hire Adda is a modern, enterprise-grade job portal built with industry-leading technologies. The platform is designed for performance, security, scalability, and reliability — using the same tools trusted by companies like Netflix, Uber, Airbnb, and LinkedIn.

---

## 1. Core Technologies

### Frontend (What Users See & Interact With)

| Technology       | Version | What It Does                                                                                 |
| ---------------- | ------- | -------------------------------------------------------------------------------------------- |
| **Next.js**      | 16.1    | The framework that powers the website — fast page loads, SEO-friendly, server-side rendering |
| **React**        | 19.2    | The UI engine — builds interactive, responsive interfaces                                    |
| **TypeScript**   | 5.9     | Adds type safety to all code, reducing bugs before they happen                               |
| **Tailwind CSS** | 4.1     | Modern styling system for a clean, consistent, responsive design                             |

### Backend (Server & Business Logic)

| Technology     | Version     | What It Does                                                  |
| -------------- | ----------- | ------------------------------------------------------------- |
| **Node.js**    | 20 / 22 LTS | The server runtime — tested on two LTS versions for stability |
| **Express**    | 5.2         | The API framework handling all server requests                |
| **TypeScript** | 5.9         | Same type safety on the server side                           |

---

## 2. Performance & Optimization

| Technology                | What It Does                                                               |
| ------------------------- | -------------------------------------------------------------------------- |
| **Response Compression**  | Automatically compresses all responses (gzip/brotli) for faster page loads |
| **React Compiler**        | Automatically optimizes React components for faster rendering              |
| **LightningCSS**          | High-performance CSS minification and optimization                         |
| **PostCSS**               | CSS processing pipeline with automatic vendor prefixing                    |
| **Redis Caching**         | Frequently accessed data is cached in memory for instant responses         |
| **Background Processing** | Heavy tasks run in the background so users never wait                      |

---

## 3. Database & Data Layer

| Technology     | Version | What It Does                                                                    |
| -------------- | ------- | ------------------------------------------------------------------------------- |
| **PostgreSQL** | 16      | The primary database — stores all users, jobs, applications, and profiles       |
| **Prisma ORM** | 7.3     | Database toolkit — manages 31 data models with type-safe queries and migrations |
| **Neon**       | Managed | Cloud-hosted PostgreSQL with serverless auto-scaling                            |

---

## 4. Search Engine

| Technology        | Version | What It Does                                                      |
| ----------------- | ------- | ----------------------------------------------------------------- |
| **Elasticsearch** | 9       | Powers full-text job and candidate search with instant results    |
| **OpenSearch**    | 2.18    | AWS-compatible search engine (used in containerized environments) |

**Capabilities:** Full-text search, location-based search, auto-suggestions, advanced filters, faceted results

---

## 5. Caching & Background Processing

| Technology | Version | What It Does                                                         |
| ---------- | ------- | -------------------------------------------------------------------- |
| **Redis**  | 7       | High-speed cache — makes repeated requests instant                   |
| **BullMQ** | 5.67    | Background job processor — handles 20 different task queues reliably |

**20 Background Queues:** Email delivery, SMS, WhatsApp messages, push notifications, web push, in-app notifications, webhook delivery, AI job matching, resume parsing, geocoding, job expiration, job alerts, scheduled publishing, profile reminders, weekly digests, token cleanup, SLA monitoring, data exports, database backups, cron scheduling

---

## 6. Event Streaming

| Technology       | Version     | What It Does                                                                                                  |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| **Apache Kafka** | Aiven Cloud | Real-time event streaming — tracks user actions, job events, notifications, and system events across 4 topics |

---

## 7. Real-Time Features

| Technology                     | Version | What It Does                                            |
| ------------------------------ | ------- | ------------------------------------------------------- |
| **Socket.IO**                  | 4.8     | Real-time notifications and live updates in the browser |
| **Firebase Realtime Database** | —       | Shows who is online/offline in real time                |
| **Firebase Firestore**         | —       | Live counters (active users, total jobs posted, etc.)   |

---

## 8. Authentication & Login

| Method                    | Technology           | What It Does                                                   |
| ------------------------- | -------------------- | -------------------------------------------------------------- | ------------------- |
| **Email & Password**      | bcryptjs             | Secure password hashing                                        |
| **Google Login**          | Passport + OAuth 2.0 | One-click Google sign-in                                       | Not Operational yet |
| **LinkedIn Login**        | Passport + OAuth 2.0 | One-click LinkedIn sign-in                                     | Not Operational yet |
| **Passkeys (WebAuthn)**   | SimpleWebAuthn       | Passwordless login using fingerprint, Face ID, or security key |
| **Two-Factor Auth (MFA)** | Speakeasy (TOTP)     | Extra security with authenticator app codes                    |
| **QR Code Setup**         | qrcode               | Generates QR codes for easy MFA authenticator app setup        |
| **Firebase Auth**         | Firebase Admin SDK   | Firebase ID token verification                                 |
| **JWT Tokens**            | jsonwebtoken         | Secure session management with access + refresh tokens         |
| **httpOnly Cookies**      | BFF Pattern          | Tokens stored securely — never exposed to browser JavaScript   |

---

## 9. Security

| Protection                   | What It Does                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| **CSRF Protection**          | Prevents cross-site request forgery attacks                                             |
| **CORS**                     | Controls which domains can access the API — prevents unauthorized cross-origin requests |
| **Cloudflare Turnstile**     | Bot protection (modern CAPTCHA alternative)                                             |
| **Rate Limiting**            | Prevents API abuse (1000 requests per 15 minutes)                                       |
| **DDoS Protection**          | IP-level protection against distributed attacks                                         |
| **Web Application Firewall** | Blocks SQL injection, XSS, and path traversal attacks                                   |
| **Helmet**                   | Sets secure HTTP headers (CSP, HSTS, X-Frame-Options)                                   |
| **XSS Sanitization**         | Cleans all user input to prevent script injection                                       |
| **HTML Sanitization**        | Sanitizes rich text content using DOMPurify to prevent malicious HTML                   |
| **HPP Protection**           | Prevents HTTP parameter pollution                                                       |
| **Password Breach Check**    | Checks passwords against known breaches (Have I Been Pwned)                             |
| **Field Encryption**         | AES-256-GCM encryption for sensitive data at rest                                       |
| **Data Anonymization**       | GDPR-compliant personal data anonymization                                              |
| **Device Fingerprinting**    | Tracks known devices for suspicious login detection                                     |
| **Audit Logging**            | Tamper-evident logs with SHA-256 integrity checksums                                    |
| **Content Security Policy**  | Restricts which scripts and styles can run                                              |
| **Session Management**       | Max 5 active sessions per user                                                          |
| **Role-Based Access**        | 4 roles: Candidate, Employer, Admin, Super Admin                                        |

---

## 10. AI & Cloud Services (Google Cloud Platform)

| Service                      | What It Does                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Google Document AI**       | AI-powered resume parsing — extracts skills, experience, and education from uploaded resumes automatically |
| **Google Cloud Talent**      | AI job-candidate matching — recommends best-fit candidates for jobs                                        |
| **AI Matching Engine**       | Internal scoring algorithm that ranks candidates against jobs using vector and keyword analysis            |
| **Google BigQuery**          | Analytics data warehouse — powers the admin analytics dashboard                                            |
| **Firebase Cloud Messaging** | Sends push notifications to mobile and web browsers                                                        |
| **Firebase Remote Config**   | Feature flags — enable/disable features without deploying code                                             |

---

## 11. Platform Features

| Feature                   | What It Does                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Webhooks**              | Third-party integrations — sends HMAC-signed event notifications to external systems when key actions occur |
| **Content Moderation**    | Automated text analysis to detect and flag inappropriate or harmful content                                 |
| **Support Tickets**       | Built-in support ticket system with SLA monitoring for handling user inquiries                              |
| **Identity Verification** | KYC/KYB verification workflow for verifying user and company identities                                     |
| **Consent Management**    | GDPR/CCPA-compliant consent tracking — records and manages user privacy preferences                         |
| **GDPR Data Export**      | Users can request and download all their personal data in a portable format                                 |
| **Job Alerts**            | Automated email and push notifications when new jobs match saved search criteria                            |
| **Saved Searches**        | Users can save search filters and reuse them with one click                                                 |
| **Job Templates**         | Employers can create reusable job posting templates to save time                                            |
| **Profile View Tracking** | Users can see who viewed their profile and when                                                             |
| **Maintenance Mode**      | Feature-flag driven maintenance mode — can enable/disable without deploying code                            |
| **File Uploads**          | Secure drag-and-drop file upload handling for resumes, documents, and images                                |

---

## 12. File Storage & CDN

| Service           | What It Does                                                                           |
| ----------------- | -------------------------------------------------------------------------------------- |
| **Cloudflare R2** | Stores resumes, documents, generated PDFs, and database backups                        |
| **Cloudinary**    | Stores and optimizes profile images, company logos, and cover photos with CDN delivery |

---

## 13. Notifications (6 Channels)

| Channel         | Provider                  | What It Does                                       |
| --------------- | ------------------------- | -------------------------------------------------- |
| **Email**       | Brevo (SMTP) + Nodemailer | Transactional emails — OTP, alerts, weekly digests |
| **SMS**         | Twilio                    | OTP verification and security alerts               |
| **WhatsApp**    | Meta Business API         | Job match and application update messages          |
| **Mobile Push** | Firebase Cloud Messaging  | Native push notifications                          |
| **Web Push**    | VAPID (Web Push API)      | Browser push notifications                         |
| **In-App**      | Socket.IO                 | Real-time notifications inside the platform        |

---

## 14. Geocoding & Maps

| Service                       | What It Does                                                    |
| ----------------------------- | --------------------------------------------------------------- |
| **Nominatim (OpenStreetMap)** | Converts addresses to coordinates for location-based job search |
| **Leaflet**                   | Interactive maps on the frontend                                |
| **Google Geocoding**          | Optional alternative geocoding provider                         |

---

## 15. Monitoring & Analytics

| Service                       | What It Does                                                      |
| ----------------------------- | ----------------------------------------------------------------- |
| **Sentry**                    | Real-time error tracking and crash reporting (frontend + backend) |
| **OpenTelemetry + Honeycomb** | Distributed tracing — tracks request flow across all services     |
| **Winston**                   | Structured application logging                                    |
| **Morgan**                    | HTTP request logging for development and debugging                |
| **Grafana Loki**              | Centralized log aggregation and search                            |
| **Google Analytics 4**        | User behavior analytics and event tracking                        |
| **Google Tag Manager**        | Marketing tag management                                          |
| **Facebook Pixel**            | Marketing attribution tracking                                    |

---

## 16. Email System

| Component         | What It Does                                   |
| ----------------- | ---------------------------------------------- |
| **Brevo SMTP**    | Email delivery provider (100/hour, 300/day)    |
| **Nodemailer**    | Email sending library                          |
| **Handlebars**    | Email template engine (beautiful HTML emails)  |
| **Email Preview** | Admin tool to preview and test email templates |

---

## 17. PDF & Report Generation

| Technology     | What It Does                                          |
| -------------- | ----------------------------------------------------- |
| **Puppeteer**  | Generates polished PDF resumes from profile data      |
| **PDFKit**     | Alternative PDF generation                            |
| **Handlebars** | Resume templates                                      |
| **ExcelJS**    | Excel/CSV report exports for admin                    |
| **Archiver**   | Creates ZIP files for bulk data exports and downloads |

---

## 18. Rich Content & UI

| Technology           | What It Does                                               |
| -------------------- | ---------------------------------------------------------- |
| **Tiptap**           | Rich text editor for job descriptions                      |
| **recharts**         | Charts and data visualizations on dashboards               |
| **Framer Motion**    | Smooth animations and page transitions                     |
| **Lucide React**     | 700+ clean, consistent icons                               |
| **React Image Crop** | Profile photo cropping                                     |
| **React Dropzone**   | Drag-and-drop file uploads                                 |
| **Sonner**           | Beautiful toast notifications for user feedback and alerts |

---

## 19. Form Management & Validation

| Technology          | What It Does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| **React Hook Form** | High-performance form handling                                          |
| **Zod**             | Schema validation — shared between frontend and backend for consistency |
| **Form Auto-Save**  | Drafts are saved automatically so users never lose work                 |

---

## 20. State Management

| Technology               | What It Does                                              |
| ------------------------ | --------------------------------------------------------- |
| **Zustand**              | Lightweight client-side state (auth, UI preferences)      |
| **TanStack React Query** | Server data caching, background refetching, and mutations |

---

## 21. Utility Libraries

| Technology        | What It Does                                                            |
| ----------------- | ----------------------------------------------------------------------- |
| **Axios**         | HTTP client for making API requests (used in both frontend and backend) |
| **date-fns**      | Date formatting, comparison, and manipulation                           |
| **lodash**        | General-purpose utility functions for data transformation               |
| **DOMPurify**     | Sanitizes HTML content to prevent cross-site scripting attacks          |
| **cookie-parser** | Parses and manages secure cookies for authentication                    |
| **uuid**          | Generates unique identifiers for records and tracking                   |

---

## 22. API Documentation

| Technology            | What It Does                                 |
| --------------------- | -------------------------------------------- |
| **Swagger / OpenAPI** | Interactive API documentation at `/api-docs` |

---

## 23. DevOps & Infrastructure

### Containerization

| Technology         | What It Does                                                    |
| ------------------ | --------------------------------------------------------------- |
| **Docker**         | Containerized deployments (4 Dockerfiles — dev + prod for each) |
| **Docker Compose** | Multi-service orchestration (3 configs — base, dev, production) |
| **Nginx**          | Reverse proxy with SSL/TLS termination and load balancing       |

### CI/CD Pipeline (GitHub Actions)

| Step               | What It Does                                  |
| ------------------ | --------------------------------------------- |
| **Lint**           | Checks code style and formatting              |
| **Type Check**     | Verifies TypeScript correctness               |
| **Test**           | Runs automated test suites                    |
| **Build**          | Compiles production builds                    |
| **Security Audit** | Scans dependencies for vulnerabilities        |
| **Container Scan** | Trivy vulnerability scanning on Docker images |
| **Commit Lint**    | Enforces consistent commit message format     |

### Database Management

| Feature                   | What It Does                                                  |
| ------------------------- | ------------------------------------------------------------- |
| **Prisma Migrate**        | Version-controlled database schema changes                    |
| **Prisma Studio**         | Visual database browser                                       |
| **Automated Backups**     | Daily database backups to Cloudflare R2 with 30-day retention |
| **Manual Backup/Restore** | One-command backup and restore via Makefile                   |

---

## 24. Code Quality Tools

| Tool                      | What It Does                                                  |
| ------------------------- | ------------------------------------------------------------- |
| **ESLint**                | JavaScript/TypeScript linting                                 |
| **Prettier**              | Automatic code formatting                                     |
| **Husky**                 | Git hooks — runs checks before every commit                   |
| **Commitlint**            | Enforces Conventional Commits standard                        |
| **lint-staged**           | Runs linters only on changed files for fast feedback          |
| **Jest**                  | Automated testing framework                                   |
| **React Testing Library** | Frontend component testing                                    |
| **Supertest**             | Backend API endpoint testing                                  |
| **Nodemon**               | Auto-restarts the server during development when code changes |

---

## 25. Third-Party Service Providers

| Service         | Provider                      | Region                   |
| --------------- | ----------------------------- | ------------------------ |
| Database        | **Neon**                      | Asia Pacific (Singapore) |
| Cache & Queues  | **Redis Cloud**               | Asia Pacific (Mumbai)    |
| Search          | **AWS OpenSearch**            | US East                  |
| Event Streaming | **Aiven (Kafka)**             | Cloud                    |
| AI & Firebase   | **Google Cloud**              | Multi-region             |
| Email           | **Brevo**                     | EU                       |
| SMS             | **Twilio**                    | US                       |
| WhatsApp        | **Meta**                      | Global                   |
| File Storage    | **Cloudflare R2**             | Global CDN               |
| Image CDN       | **Cloudinary**                | Global CDN               |
| Error Tracking  | **Sentry**                    | US                       |
| Tracing         | **Honeycomb**                 | US                       |
| Logs            | **Grafana Cloud**             | Asia Pacific (Mumbai)    |
| Analytics       | **Google Analytics 4**        | Global                   |
| Bot Protection  | **Cloudflare Turnstile**      | Global                   |
| Geocoding       | **OpenStreetMap (Nominatim)** | Global                   |

---

## Platform Scale

| Metric                 | Count |
| ---------------------- | ----- |
| Data Models            | 31    |
| Backend Services       | 49    |
| Frontend Services      | 21    |
| API Route Groups       | 25    |
| Frontend Pages         | 85    |
| UI Components          | 63    |
| Background Queues      | 20    |
| Notification Channels  | 6     |
| Security Layers        | 18    |
| Authentication Methods | 7     |
| Platform Features      | 12    |
| Supported Roles        | 4     |

---

_Hire Adda — Built with enterprise-grade technology for reliability, security, and scale._
