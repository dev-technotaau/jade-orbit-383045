#!/usr/bin/env bash
set -euo pipefail

# ─── Database Backup Script ─────────────────────────────────
# Creates a timestamped pg_dump backup of the PostgreSQL database.
# Supports both local and managed (Supabase/Neon/Railway) databases.
#
# Usage:
#   ./scripts/db-backup.sh                    # Uses DATABASE_URL from .env
#   DATABASE_URL=... ./scripts/db-backup.sh   # Override connection string
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env if it exists
if [ -f "$BACKEND_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.env"
  set +a
fi

# Validate DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Set it in .env or pass it as an environment variable."
  exit 1
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-$BACKEND_DIR/backups/db}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="hire_adda_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "═══════════════════════════════════════════"
echo " Database Backup"
echo "═══════════════════════════════════════════"
echo " Timestamp: $TIMESTAMP"
echo " Output:    $BACKUP_DIR/$BACKUP_FILE"
echo "═══════════════════════════════════════════"

# Run pg_dump and compress
# --no-owner and --no-privileges are needed for managed databases (Supabase, Neon, etc.)
# where the restoring user may differ from the original owner
if pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --format=plain \
  --verbose 2>/dev/null | gzip > "$BACKUP_DIR/$BACKUP_FILE"; then

  BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
  echo ""
  echo "SUCCESS: Backup created"
  echo "  File: $BACKUP_DIR/$BACKUP_FILE"
  echo "  Size: $BACKUP_SIZE"
  echo "  Time: $(date +"%Y-%m-%d %H:%M:%S")"
  exit 0
else
  echo ""
  echo "ERROR: pg_dump failed. Check DATABASE_URL and ensure pg_dump is installed."
  # Clean up partial backup
  rm -f "$BACKUP_DIR/$BACKUP_FILE"
  exit 1
fi
