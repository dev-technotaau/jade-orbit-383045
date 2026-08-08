# Disaster Recovery Plan

## Overview

Hire Adda runs on **Render** (backend) + **Managed PostgreSQL** (Neon/Supabase/etc.) + **Managed OpenSearch** + **Cloudflare R2** (file storage). This document covers backup procedures, restore steps, and disaster recovery runbooks.

### Infrastructure

| Component                 | Provider                | Backup Strategy                                                   |
| ------------------------- | ----------------------- | ----------------------------------------------------------------- |
| PostgreSQL                | Managed (Neon/Supabase) | **Automated**: BullMQ → `pg_dump` → Cloudflare R2 (daily 2AM UTC) |
| OpenSearch                | Managed service         | Provider handles snapshots (check provider dashboard)             |
| Redis                     | Upstash/Cloud           | Ephemeral cache — no backup needed                                |
| Resumes & Files           | Cloudflare R2           | Provider-managed durability (11 nines)                            |
| Avatars                   | Cloudinary              | Provider-managed redundancy                                       |
| Firebase (RTDB/Firestore) | Google                  | Google-managed backups                                            |

---

## Automated Backups

### How It Works

1. **BullMQ scheduler** triggers `db-backup` job daily at 2:00 AM UTC
2. The backup worker runs `pg_dump` against `DATABASE_URL`
3. Output is **gzipped** in memory (no local filesystem needed — works on Render)
4. Compressed backup is **uploaded to Cloudflare R2** at `backups/db/hire_adda_YYYYMMDD_HHMMSS.sql.gz`
5. Weekly cleanup job deletes R2 backups older than `BACKUP_RETENTION_DAYS` (default 30)

### Backup Status

Status is tracked in Redis:

- `backup:last-success:db` — last successful backup timestamp
- `backup:last-failure:db` — last failure timestamp
- `backup:last-success:cleanup` — last cleanup run

Check via: `make backup-status`

### Failure Alerts

When a backup fails, the worker:

1. Logs the error via Winston (visible in Render logs)
2. Records the failure in Redis
3. Sends email notification if `SUPER_ADMIN_EMAIL` + SMTP are configured
4. Sentry captures the error if `SENTRY_DSN` is configured

---

## Manual Backup (From Local Machine)

For local/development backups or ad-hoc production backups from your machine:

```bash
# Create a local backup (requires pg_dump installed + DATABASE_URL in .env)
make backup-db

# Backups saved to: backend/backups/db/hire_adda_YYYYMMDD_HHMMSS.sql.gz
```

---

## Restore Procedures

### PostgreSQL Restore

**Option A: From local backup file**

```bash
# List available local backups
cd backend && bash scripts/db-restore.sh --list

# Restore (requires --confirm flag to prevent accidents)
make backup-db-restore FILE=backups/db/hire_adda_20260226_020000.sql.gz
```

**Option B: From R2 cloud backup**

```bash
# Download the backup from R2 first (via Cloudflare dashboard or CLI)
# Then restore:
cd backend && bash scripts/db-restore.sh /path/to/downloaded-backup.sql.gz --confirm
```

**After restore:**

```bash
cd backend && npx prisma generate   # Sync Prisma client
```

### OpenSearch Recovery

Since OpenSearch runs on a managed service, check your provider's snapshot/restore capabilities.

**Alternative: Full reindex from database** (always works)

```bash
cd backend && npx ts-node scripts/reindex-all.ts
```

This rebuilds all OpenSearch indexes from PostgreSQL data. Takes longer but doesn't need provider snapshots.

### Redis Recovery

Redis is ephemeral — just restart the service:

- BullMQ queues automatically recover pending jobs
- Cache rebuilds on first access (cache-aside pattern)
- WebAuthn challenges have short TTL and regenerate

---

## Disaster Scenarios

### Scenario 1: PostgreSQL Database Loss

1. **Identify** the most recent R2 backup in `backups/db/` folder (via Cloudflare dashboard)
2. **Download** the backup file from R2
3. **Restore**: `bash scripts/db-restore.sh <backup.sql.gz> --confirm`
4. **Reindex**: `npx ts-node scripts/reindex-all.ts`
5. **Verify**: `curl https://your-api.onrender.com/health`

### Scenario 2: OpenSearch Index Corruption

1. Check managed provider for automatic snapshots
2. If unavailable: `npx ts-node scripts/reindex-all.ts`
3. Verify search: `GET /api/v1/search/autocomplete?q=react&type=all`

### Scenario 3: Render Service Down

1. Render auto-redeploys from Git. If persistent:
2. Check Render dashboard for service health
3. Redeploy manually from the Render dashboard
4. Data is safe (PostgreSQL on managed provider, files on R2 — not on Render)

### Scenario 4: Complete Rebuild

1. **Code**: `git clone` from GitHub
2. **Environment**: Restore env vars from secure storage (1Password, etc.)
3. **Deploy**: Push to Render (auto-deploys from main branch)
4. **Database**: Restore from R2 backup if database data is lost
5. **Search**: `npx ts-node scripts/reindex-all.ts`
6. **Verify**: `curl https://your-api.onrender.com/health/ready`

---

## Backup Cleanup

Old R2 backups are automatically cleaned weekly (Sunday 4AM UTC).

For local backups:

```bash
make backup-cleanup                              # Default retention (30 days)
cd backend && bash scripts/backup-cleanup.sh 7   # Custom: 7 days
cd backend && bash scripts/backup-cleanup.sh --dry-run  # Preview only
```

---

## Prisma Migrations

- **Baseline**: `prisma/migrations/0_init/migration.sql` captures the full schema
- **Mark as applied** (one-time, on existing database):
  ```bash
  cd backend && npx prisma migrate resolve --applied 0_init
  ```
- **Future changes**: Use `npx prisma migrate dev` instead of `db push`
- **Production**: Use `npx prisma migrate deploy`

---

## Environment Variables Backup

Store these securely (1Password, AWS Secrets Manager, Render env groups):

- `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `COOKIE_SECRET`, `CSRF_SECRET`, `WEBHOOK_SECRET`
- `FIREBASE_SERVICE_ACCOUNT`
- All API keys (Cloudinary, R2, Twilio, Meta, Google Cloud)

---

## RPO / RTO Targets

| Metric                             | Target   | Current                   |
| ---------------------------------- | -------- | ------------------------- |
| **RPO** (Recovery Point Objective) | 24 hours | Daily backups at 2AM UTC  |
| **RTO** (Recovery Time Objective)  | 1 hour   | Restore from R2 + reindex |
| **Backup Storage**                 | 30 days  | R2 with auto-cleanup      |
