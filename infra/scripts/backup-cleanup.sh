#!/usr/bin/env bash
set -euo pipefail

# ─── Backup Cleanup Script ──────────────────────────────────
# Removes old database backup files beyond the retention period.
#
# Usage:
#   ./scripts/backup-cleanup.sh           # Uses BACKUP_RETENTION_DAYS (default 30)
#   ./scripts/backup-cleanup.sh 7         # Override to 7 days
#   ./scripts/backup-cleanup.sh --dry-run # Show what would be deleted
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
DRY_RUN=false

# Parse arguments
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    [0-9]*)
      RETENTION_DAYS="$arg"
      ;;
  esac
done

echo "═══════════════════════════════════════════"
echo " Backup Cleanup"
echo "═══════════════════════════════════════════"
echo " Backup Dir:     $BACKUP_DIR"
echo " Retention Days: $RETENTION_DAYS"
echo " Dry Run:        $DRY_RUN"
echo "═══════════════════════════════════════════"
echo ""

if [ ! -d "$BACKUP_DIR" ]; then
  echo "No backup directory found. Nothing to clean."
  exit 0
fi

# Find old backup files
DELETED=0
TOTAL_SIZE=0

while IFS= read -r file; do
  if [ -n "$file" ]; then
    FILE_SIZE=$(du -k "$file" | cut -f1)
    TOTAL_SIZE=$((TOTAL_SIZE + FILE_SIZE))

    if [ "$DRY_RUN" = true ]; then
      echo "  [DRY RUN] Would delete: $(basename "$file") ($(du -h "$file" | cut -f1))"
    else
      rm -f "$file"
      echo "  Deleted: $(basename "$file") (${FILE_SIZE}K)"
    fi
    ((DELETED++)) || true
  fi
done < <(find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+$RETENTION_DAYS" -type f 2>/dev/null)

echo ""
if [ $DELETED -eq 0 ]; then
  echo "No backups older than $RETENTION_DAYS days found."
else
  TOTAL_MB=$((TOTAL_SIZE / 1024))
  if [ "$DRY_RUN" = true ]; then
    echo "Would delete $DELETED file(s), freeing ~${TOTAL_MB}MB"
  else
    echo "Deleted $DELETED file(s), freed ~${TOTAL_MB}MB"
  fi
fi

# Show remaining backups
REMAINING=$(find "$BACKUP_DIR" -name "*.sql.gz" -type f 2>/dev/null | wc -l)
echo "Remaining backups: $REMAINING"
