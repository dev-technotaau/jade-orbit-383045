#!/usr/bin/env bash
set -euo pipefail

# ─── Database Restore Script ────────────────────────────────
# Restores a PostgreSQL database from a .sql.gz backup file.
# Requires --confirm flag to prevent accidental restores.
#
# Usage:
#   ./scripts/db-restore.sh <backup-file.sql.gz> --confirm
#   ./scripts/db-restore.sh --list               # List available backups
#   ./scripts/db-restore.sh --help               # Show help
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

BACKUP_DIR="${BACKUP_DIR:-$BACKEND_DIR/backups/db}"

show_help() {
  echo "Usage: db-restore.sh <backup-file> --confirm"
  echo ""
  echo "Arguments:"
  echo "  <backup-file>    Path to a .sql.gz backup file"
  echo "  --confirm        Required flag to confirm the restore operation"
  echo "  --list           List available backups"
  echo "  --help           Show this help message"
  echo ""
  echo "Examples:"
  echo "  ./scripts/db-restore.sh backups/db/hire_adda_20260226_020000.sql.gz --confirm"
  echo "  ./scripts/db-restore.sh --list"
}

list_backups() {
  echo "Available backups in $BACKUP_DIR:"
  echo ""
  if [ -d "$BACKUP_DIR" ] && ls "$BACKUP_DIR"/*.sql.gz 1>/dev/null 2>&1; then
    ls -lh "$BACKUP_DIR"/*.sql.gz | awk '{print "  " $NF " (" $5 ", " $6 " " $7 " " $8 ")"}'
  else
    echo "  No backups found."
  fi
}

# Parse arguments
if [ $# -eq 0 ] || [ "$1" = "--help" ]; then
  show_help
  exit 0
fi

if [ "$1" = "--list" ]; then
  list_backups
  exit 0
fi

BACKUP_FILE="$1"
CONFIRMED=false

for arg in "$@"; do
  if [ "$arg" = "--confirm" ]; then
    CONFIRMED=true
  fi
done

# Validate backup file
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [[ ! "$BACKUP_FILE" == *.sql.gz ]]; then
  echo "ERROR: Expected a .sql.gz file, got: $BACKUP_FILE"
  exit 1
fi

# Validate DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Set it in .env or pass it as an environment variable."
  exit 1
fi

# Show backup info
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
BACKUP_DATE=$(stat -c %y "$BACKUP_FILE" 2>/dev/null || stat -f %Sm "$BACKUP_FILE" 2>/dev/null || echo "unknown")

echo "═══════════════════════════════════════════"
echo " Database Restore"
echo "═══════════════════════════════════════════"
echo " Backup File: $BACKUP_FILE"
echo " File Size:   $BACKUP_SIZE"
echo " File Date:   $BACKUP_DATE"
echo "═══════════════════════════════════════════"

if [ "$CONFIRMED" = false ]; then
  echo ""
  echo "WARNING: This will overwrite the current database!"
  echo "Run with --confirm flag to proceed:"
  echo ""
  echo "  $0 $BACKUP_FILE --confirm"
  exit 1
fi

echo ""
echo "Restoring database from backup..."

# Restore from compressed backup
if gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL" \
  --no-password \
  --single-transaction \
  --set ON_ERROR_STOP=on 2>/dev/null; then

  echo ""
  echo "SUCCESS: Database restored from $BACKUP_FILE"
  echo "  Time: $(date +"%Y-%m-%d %H:%M:%S")"
  exit 0
else
  echo ""
  echo "ERROR: Restore failed. The database may be in an inconsistent state."
  echo "Check the backup file and DATABASE_URL."
  exit 1
fi
