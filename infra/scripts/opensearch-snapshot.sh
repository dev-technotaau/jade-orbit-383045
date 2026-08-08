#!/usr/bin/env bash
set -euo pipefail

# ─── OpenSearch Snapshot Script ──────────────────────────────
# Manages OpenSearch index snapshots (create, restore, list, cleanup).
# Uses the filesystem snapshot repository.
#
# Usage:
#   ./scripts/opensearch-snapshot.sh create-repo   # Initialize snapshot repository
#   ./scripts/opensearch-snapshot.sh snapshot       # Create a new snapshot
#   ./scripts/opensearch-snapshot.sh list           # List existing snapshots
#   ./scripts/opensearch-snapshot.sh restore <name> # Restore a specific snapshot
#   ./scripts/opensearch-snapshot.sh cleanup [days] # Remove snapshots older than N days (default 30)
#   ./scripts/opensearch-snapshot.sh --help         # Show help
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

# Configuration
OPENSEARCH_URL="${ELASTICSEARCH_URL:-http://localhost:9200}"
OPENSEARCH_USER="${ELASTICSEARCH_USERNAME:-}"
OPENSEARCH_PASS="${ELASTICSEARCH_PASSWORD:-}"
REPO_NAME="${OPENSEARCH_SNAPSHOT_REPO:-hire_adda_repo}"
SNAPSHOT_LOCATION="${SNAPSHOT_LOCATION:-/usr/share/opensearch/snapshots}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Build curl auth flags
CURL_AUTH=""
if [ -n "$OPENSEARCH_USER" ] && [ -n "$OPENSEARCH_PASS" ]; then
  CURL_AUTH="-u $OPENSEARCH_USER:$OPENSEARCH_PASS"
fi

# Helper: make an OpenSearch API call
os_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [ -n "$data" ]; then
    # shellcheck disable=SC2086
    curl -s -X "$method" $CURL_AUTH \
      -H "Content-Type: application/json" \
      "$OPENSEARCH_URL/$path" \
      -d "$data"
  else
    # shellcheck disable=SC2086
    curl -s -X "$method" $CURL_AUTH "$OPENSEARCH_URL/$path"
  fi
}

show_help() {
  echo "Usage: opensearch-snapshot.sh <action> [options]"
  echo ""
  echo "Actions:"
  echo "  create-repo          Initialize the filesystem snapshot repository"
  echo "  snapshot             Create a new timestamped snapshot"
  echo "  list                 List all existing snapshots"
  echo "  restore <name>       Restore indexes from a named snapshot"
  echo "  cleanup [days]       Delete snapshots older than N days (default: $RETENTION_DAYS)"
  echo "  status               Show repository and cluster status"
  echo "  --help               Show this help message"
  echo ""
  echo "Environment:"
  echo "  ELASTICSEARCH_URL             OpenSearch URL (default: http://localhost:9200)"
  echo "  OPENSEARCH_SNAPSHOT_REPO      Repository name (default: hire_adda_repo)"
  echo "  BACKUP_RETENTION_DAYS         Snapshot retention days (default: 30)"
}

cmd_create_repo() {
  echo "Creating snapshot repository: $REPO_NAME"
  local response
  response=$(os_api PUT "_snapshot/$REPO_NAME" "{
    \"type\": \"fs\",
    \"settings\": {
      \"location\": \"$SNAPSHOT_LOCATION\",
      \"compress\": true
    }
  }")

  if echo "$response" | grep -q '"acknowledged":true'; then
    echo "SUCCESS: Repository '$REPO_NAME' created"
  else
    echo "ERROR: Failed to create repository"
    echo "$response"
    exit 1
  fi
}

cmd_snapshot() {
  local TIMESTAMP
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  local SNAPSHOT_NAME="snapshot_${TIMESTAMP}"

  echo "═══════════════════════════════════════════"
  echo " OpenSearch Snapshot"
  echo "═══════════════════════════════════════════"
  echo " Repository: $REPO_NAME"
  echo " Snapshot:   $SNAPSHOT_NAME"
  echo "═══════════════════════════════════════════"

  local response
  response=$(os_api PUT "_snapshot/$REPO_NAME/$SNAPSHOT_NAME?wait_for_completion=true" "{
    \"indices\": \"*\",
    \"ignore_unavailable\": true,
    \"include_global_state\": false
  }")

  if echo "$response" | grep -q '"state":"SUCCESS"'; then
    echo ""
    echo "SUCCESS: Snapshot '$SNAPSHOT_NAME' created"
    echo "  Time: $(date +"%Y-%m-%d %H:%M:%S")"
  else
    echo ""
    echo "ERROR: Snapshot creation failed"
    echo "$response"
    exit 1
  fi
}

cmd_list() {
  echo "Snapshots in repository: $REPO_NAME"
  echo ""
  local response
  response=$(os_api GET "_snapshot/$REPO_NAME/_all")

  if echo "$response" | grep -q '"snapshots"'; then
    echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    snapshots = data.get('snapshots', [])
    if not snapshots:
        print('  No snapshots found.')
    else:
        for s in snapshots:
            name = s['snapshot']
            state = s['state']
            indices = len(s.get('indices', []))
            start = s.get('start_time', 'unknown')
            duration = s.get('duration_in_millis', 0)
            print(f'  {name}  state={state}  indices={indices}  started={start}  duration={duration}ms')
except Exception as e:
    print(f'  Error parsing response: {e}')
" 2>/dev/null || echo "$response"
  else
    echo "ERROR: Could not list snapshots"
    echo "$response"
  fi
}

cmd_restore() {
  local SNAPSHOT_NAME="${1:-}"

  if [ -z "$SNAPSHOT_NAME" ]; then
    echo "ERROR: Snapshot name required"
    echo "Usage: opensearch-snapshot.sh restore <snapshot-name>"
    echo ""
    echo "Available snapshots:"
    cmd_list
    exit 1
  fi

  echo "═══════════════════════════════════════════"
  echo " OpenSearch Restore"
  echo "═══════════════════════════════════════════"
  echo " Repository: $REPO_NAME"
  echo " Snapshot:   $SNAPSHOT_NAME"
  echo "═══════════════════════════════════════════"
  echo ""
  echo "WARNING: This will close and restore all indexes from the snapshot!"

  local response
  # Close all indices first (required for restore)
  os_api POST "_all/_close" > /dev/null 2>&1 || true

  response=$(os_api POST "_snapshot/$REPO_NAME/$SNAPSHOT_NAME/_restore?wait_for_completion=true" "{
    \"indices\": \"*\",
    \"ignore_unavailable\": true,
    \"include_global_state\": false
  }")

  if echo "$response" | grep -q '"accepted":true\|"snapshot"'; then
    # Reopen indices
    os_api POST "_all/_open" > /dev/null 2>&1 || true
    echo ""
    echo "SUCCESS: Restored from snapshot '$SNAPSHOT_NAME'"
    echo "  Time: $(date +"%Y-%m-%d %H:%M:%S")"
  else
    # Reopen indices even on failure
    os_api POST "_all/_open" > /dev/null 2>&1 || true
    echo ""
    echo "ERROR: Restore failed"
    echo "$response"
    exit 1
  fi
}

cmd_cleanup() {
  local MAX_AGE_DAYS="${1:-$RETENTION_DAYS}"
  local CUTOFF_EPOCH
  CUTOFF_EPOCH=$(date -d "-${MAX_AGE_DAYS} days" +%s 2>/dev/null || date -v-${MAX_AGE_DAYS}d +%s 2>/dev/null)

  echo "Cleaning up snapshots older than $MAX_AGE_DAYS days..."
  echo ""

  local response
  response=$(os_api GET "_snapshot/$REPO_NAME/_all")

  local deleted=0
  for name in $(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for s in data.get('snapshots', []):
        print(s['snapshot'])
except:
    pass
" 2>/dev/null); do
    # Extract timestamp from snapshot name (snapshot_YYYYMMDD_HHMMSS)
    local ts_part="${name#snapshot_}"
    local date_part="${ts_part%%_*}"

    if [ ${#date_part} -eq 8 ]; then
      local snap_epoch
      snap_epoch=$(date -d "${date_part:0:4}-${date_part:4:2}-${date_part:6:2}" +%s 2>/dev/null || date -j -f "%Y%m%d" "$date_part" +%s 2>/dev/null || echo "0")

      if [ "$snap_epoch" -lt "$CUTOFF_EPOCH" ] 2>/dev/null; then
        echo "  Deleting: $name"
        os_api DELETE "_snapshot/$REPO_NAME/$name" > /dev/null 2>&1
        ((deleted++)) || true
      fi
    fi
  done

  echo ""
  echo "Cleanup complete. Deleted $deleted snapshot(s)."
}

cmd_status() {
  echo "═══════════════════════════════════════════"
  echo " OpenSearch Status"
  echo "═══════════════════════════════════════════"
  echo ""
  echo "Cluster Health:"
  os_api GET "_cluster/health?pretty"
  echo ""
  echo "Repository:"
  os_api GET "_snapshot/$REPO_NAME?pretty" 2>/dev/null || echo "  Repository '$REPO_NAME' not found. Run 'create-repo' first."
  echo ""
  echo "Indices:"
  os_api GET "_cat/indices?v" 2>/dev/null || echo "  No indices found."
}

# ─── Main ───────────────────────────────────────────────────
ACTION="${1:-}"

case "$ACTION" in
  create-repo)
    cmd_create_repo
    ;;
  snapshot)
    cmd_snapshot
    ;;
  list)
    cmd_list
    ;;
  restore)
    cmd_restore "${2:-}"
    ;;
  cleanup)
    cmd_cleanup "${2:-}"
    ;;
  status)
    cmd_status
    ;;
  --help|-h|"")
    show_help
    ;;
  *)
    echo "ERROR: Unknown action: $ACTION"
    echo ""
    show_help
    exit 1
    ;;
esac
