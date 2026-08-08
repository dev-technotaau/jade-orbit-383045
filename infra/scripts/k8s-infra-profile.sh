#!/usr/bin/env bash
# ============================================================
# K8s Infrastructure Profile Switcher
# ============================================================
# Mirrors Docker's COMPOSE_PROFILES system for Kubernetes.
# Edits ConfigMap + StatefulSet manifests in-place, then user
# commits + pushes → ArgoCD syncs the changes.
#
# Usage:
#   k8s-infra-profile.sh --status              Show current phase
#   k8s-infra-profile.sh --phase 2             Switch to Phase 2
#   k8s-infra-profile.sh --phase 3 --dry-run   Preview changes
#
# Phases:
#   1: All cloud        (Neon + Redis Cloud + Aiven Kafka)
#   2: Redis local      (Neon + LOCAL Redis + Aiven Kafka)
#   3: Redis+Kafka      (Neon + LOCAL Redis + LOCAL Kafka)
#   4: All local        (LOCAL Postgres + LOCAL Redis + LOCAL Kafka)
# ============================================================
set -euo pipefail

# ── Paths (relative to repo root) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONFIGMAP="$REPO_ROOT/infra/k8s/apps/backend/configmap.yaml"
POSTGRES_SS="$REPO_ROOT/infra/k8s/apps/postgres/statefulset.yaml"
KAFKA_SS="$REPO_ROOT/infra/k8s/apps/kafka/statefulset.yaml"
REDIS_SS="$REPO_ROOT/infra/k8s/apps/redis/statefulset.yaml"

# ── Colours ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

DRY_RUN=false
TARGET_PHASE=""

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
${BOLD}K8s Infrastructure Profile Switcher${NC}

Usage:
  $(basename "$0") --status              Show current phase
  $(basename "$0") --phase <1-4>         Switch to target phase
  $(basename "$0") --phase <1-4> --dry-run   Preview changes only

Phases (mirrors Docker COMPOSE_PROFILES):
  Phase 1: All cloud        — Neon + Redis Cloud + Aiven Kafka
  Phase 2: Redis local      — Neon + LOCAL Redis + Aiven Kafka
  Phase 3: Redis+Kafka      — Neon + LOCAL Redis + LOCAL Kafka
  Phase 4: All local        — LOCAL Postgres + LOCAL Redis + LOCAL Kafka

OpenSearch is always local (no cloud option).
EOF
  exit 0
}

die() { echo -e "${RED}ERROR:${NC} $1" >&2; exit 1; }
info() { echo -e "${CYAN}►${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
ok() { echo -e "${GREEN}✓${NC} $1"; }

# Check if a key exists in ConfigMap data section
configmap_has_key() {
  grep -q "^  $1:" "$CONFIGMAP" 2>/dev/null
}

# Get value of a key in ConfigMap
configmap_get() {
  grep "^  $1:" "$CONFIGMAP" 2>/dev/null | sed "s/^  $1: *'\(.*\)'/\1/"
}

# Get replicas from a StatefulSet
get_replicas() {
  grep 'replicas:' "$1" | head -1 | sed 's/.*replicas: *\([0-9]*\).*/\1/'
}

# ──────────────────────────────────────────────────────────────
# Detect current phase
# ──────────────────────────────────────────────────────────────
detect_phase() {
  local redis_local=false kafka_local=false postgres_local=false

  # Redis is local if ConfigMap has REDIS_HOST override
  if configmap_has_key "REDIS_HOST"; then
    redis_local=true
  fi

  # Kafka is local if ConfigMap has KAFKA_BROKERS override
  if configmap_has_key "KAFKA_BROKERS"; then
    kafka_local=true
  fi

  # Postgres is local if DATABASE_SSL_MODE is 'false' or 'disable'
  local ssl_mode
  ssl_mode=$(configmap_get "DATABASE_SSL_MODE")
  if [[ "$ssl_mode" == "false" || "$ssl_mode" == "disable" ]]; then
    postgres_local=true
  fi

  if $postgres_local && $redis_local && $kafka_local; then
    echo 4
  elif $redis_local && $kafka_local; then
    echo 3
  elif $redis_local; then
    echo 2
  else
    echo 1
  fi
}

show_status() {
  local phase
  phase=$(detect_phase)

  echo -e "\n${BOLD}K8s Infrastructure Profile Status${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "Current Phase: ${BOLD}${GREEN}Phase $phase${NC}"
  echo ""

  # Service status
  local pg_replicas redis_replicas kafka_replicas
  pg_replicas=$(get_replicas "$POSTGRES_SS")
  redis_replicas=$(get_replicas "$REDIS_SS")
  kafka_replicas=$(get_replicas "$KAFKA_SS")

  printf "  %-12s %-16s %-10s\n" "Service" "Provider" "Replicas"
  printf "  %-12s %-16s %-10s\n" "───────" "────────" "────────"

  # PostgreSQL
  if [[ "$phase" -ge 4 ]]; then
    printf "  %-12s ${GREEN}%-16s${NC} %-10s\n" "PostgreSQL" "LOCAL (K8s)" "$pg_replicas"
  else
    printf "  %-12s ${CYAN}%-16s${NC} %-10s\n" "PostgreSQL" "Cloud (Neon)" "$pg_replicas"
  fi

  # Redis
  if [[ "$phase" -ge 2 ]]; then
    printf "  %-12s ${GREEN}%-16s${NC} %-10s\n" "Redis" "LOCAL (K8s)" "$redis_replicas"
  else
    printf "  %-12s ${CYAN}%-16s${NC} %-10s\n" "Redis" "Cloud (Redis)" "$redis_replicas"
  fi

  # Kafka
  if [[ "$phase" -ge 3 ]]; then
    printf "  %-12s ${GREEN}%-16s${NC} %-10s\n" "Kafka" "LOCAL (K8s)" "$kafka_replicas"
  else
    printf "  %-12s ${CYAN}%-16s${NC} %-10s\n" "Kafka" "Cloud (Aiven)" "$kafka_replicas"
  fi

  printf "  %-12s ${GREEN}%-16s${NC} %-10s\n" "OpenSearch" "LOCAL (always)" "1"
  echo ""
}

# ──────────────────────────────────────────────────────────────
# ConfigMap manipulation
# ──────────────────────────────────────────────────────────────

# Remove a block of lines from ConfigMap (key + any comment above it on same indent)
configmap_remove_key() {
  local key="$1"
  if $DRY_RUN; then
    info "[dry-run] Would remove $key from ConfigMap"
    return
  fi
  # Remove the line with the key
  sed -i "/^  $key:/d" "$CONFIGMAP"
}

# Set or add a key in ConfigMap
configmap_set() {
  local key="$1" value="$2"
  if $DRY_RUN; then
    info "[dry-run] Would set $key: '$value' in ConfigMap"
    return
  fi
  if configmap_has_key "$key"; then
    # Update existing key
    sed -i "s|^  $key:.*|  $key: '$value'|" "$CONFIGMAP"
  else
    die "Key $key not found in ConfigMap — add it manually first"
  fi
}

# Add a key after an anchor line (used for inserting new override blocks)
configmap_add_after() {
  local anchor="$1" key="$2" value="$3"
  if $DRY_RUN; then
    info "[dry-run] Would add $key: '$value' after '$anchor'"
    return
  fi
  if configmap_has_key "$key"; then
    configmap_set "$key" "$value"
  else
    sed -i "/$anchor/a\\  $key: '$value'" "$CONFIGMAP"
  fi
}

# Update StatefulSet replicas
set_replicas() {
  local file="$1" count="$2" name="$3"
  local current
  current=$(get_replicas "$file")
  if [[ "$current" == "$count" ]]; then
    ok "$name already at replicas: $count"
    return
  fi
  if $DRY_RUN; then
    info "[dry-run] Would set $name replicas: $current → $count"
    return
  fi
  sed -i "s/replicas: *$current/replicas: $count/" "$file"
  ok "$name replicas: $current → $count"
}

# Update phase header comment in ConfigMap
update_phase_header() {
  local phase="$1"
  local phase_labels=("" "all cloud" "Redis local" "Redis+Kafka" "all local")
  local profile_names=("" "k8s-cloud" "k8s-redis" "k8s-redis-kafka" "k8s-all-local")
  if $DRY_RUN; then
    info "[dry-run] Would update phase header to Phase $phase"
    return
  fi
  sed -i "s|Infrastructure Profile: Phase [0-9] (k8s-[a-z-]*)|Infrastructure Profile: Phase $phase (${profile_names[$phase]})|" "$CONFIGMAP"
  sed -i "s|Phase [0-9]: .* (CURRENT)|Phase $phase: ${phase_labels[$phase]} (CURRENT)|" "$CONFIGMAP"
}

# ──────────────────────────────────────────────────────────────
# Redis: cloud ↔ local
# ──────────────────────────────────────────────────────────────
redis_to_local() {
  info "Redis → LOCAL (K8s StatefulSet)"
  # Add local override entries to ConfigMap (shadows SealedSecret cloud values)
  local anchor="# ── Redis"
  configmap_add_after "$anchor" "REDIS_HOST" "redis"
  configmap_add_after "REDIS_HOST" "REDIS_PORT" "6379"
  configmap_add_after "REDIS_PORT" "REDIS_ENABLED" "true"
  configmap_add_after "REDIS_ENABLED" "REDIS_TLS" "false"
  configmap_add_after "REDIS_TLS" "REDIS_PASSWORD" "10e4c845b45ebeb6f2a4b31a12f82d431735eeb970b63f45d726b4f7aa6e12c6"
  configmap_add_after "REDIS_PASSWORD" "REDIS_URL" "redis://default:10e4c845b45ebeb6f2a4b31a12f82d431735eeb970b63f45d726b4f7aa6e12c6@redis:6379"
  set_replicas "$REDIS_SS" 1 "Redis"
}

redis_to_cloud() {
  info "Redis → CLOUD (Redis Cloud)"
  # Remove local overrides — SealedSecret cloud values take effect
  configmap_remove_key "REDIS_HOST"
  configmap_remove_key "REDIS_PORT"
  configmap_remove_key "REDIS_TLS"
  configmap_remove_key "REDIS_PASSWORD"
  configmap_remove_key "REDIS_URL"
  # Keep REDIS_ENABLED in ConfigMap (app config, not infra)
  set_replicas "$REDIS_SS" 0 "Redis"
}

# ──────────────────────────────────────────────────────────────
# Kafka: cloud ↔ local
# ──────────────────────────────────────────────────────────────
kafka_to_local() {
  info "Kafka → LOCAL (K8s StatefulSet)"
  local anchor="# ── Kafka"
  configmap_add_after "$anchor" "KAFKA_BROKERS" "kafka:9092"
  configmap_add_after "KAFKA_BROKERS" "KAFKA_SASL_MECHANISM" ""
  configmap_add_after "KAFKA_SASL_MECHANISM" "KAFKA_USERNAME" ""
  configmap_add_after "KAFKA_USERNAME" "KAFKA_PASSWORD" ""
  configmap_add_after "KAFKA_PASSWORD" "KAFKA_CA_CERT" ""
  set_replicas "$KAFKA_SS" 1 "Kafka"
}

kafka_to_cloud() {
  info "Kafka → CLOUD (Aiven)"
  # Remove local overrides — SealedSecret cloud values take effect
  configmap_remove_key "KAFKA_BROKERS"
  configmap_remove_key "KAFKA_SASL_MECHANISM"
  configmap_remove_key "KAFKA_USERNAME"
  configmap_remove_key "KAFKA_PASSWORD"
  configmap_remove_key "KAFKA_CA_CERT"
  # Keep KAFKA_CLIENT_ID in ConfigMap (app config)
  set_replicas "$KAFKA_SS" 0 "Kafka"
}

# ──────────────────────────────────────────────────────────────
# PostgreSQL: cloud ↔ local
# ──────────────────────────────────────────────────────────────
postgres_to_local() {
  info "PostgreSQL → LOCAL (K8s StatefulSet)"
  warn "Local PostgreSQL needs DATABASE_URL in ConfigMap (contains password in plaintext)."
  warn "Consider using a separate SealedSecret for local DB credentials."
  configmap_set "DATABASE_SSL_MODE" "false"
  configmap_set "DATABASE_POOL_SIZE" "10"
  set_replicas "$POSTGRES_SS" 1 "PostgreSQL"
  warn "You MUST update DATABASE_URL and DIRECT_URL to point to local postgres."
  warn "Edit the SealedSecret or add ConfigMap overrides manually."
}

postgres_to_cloud() {
  info "PostgreSQL → CLOUD (Neon)"
  configmap_set "DATABASE_SSL_MODE" "verify-full"
  configmap_set "DATABASE_POOL_SIZE" "5"
  set_replicas "$POSTGRES_SS" 0 "PostgreSQL"
}

# ──────────────────────────────────────────────────────────────
# Phase transition logic
# ──────────────────────────────────────────────────────────────
switch_phase() {
  local current="$1" target="$2"

  if [[ "$current" == "$target" ]]; then
    ok "Already on Phase $target — no changes needed."
    return
  fi

  echo -e "\n${BOLD}Switching: Phase $current → Phase $target${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Redis: local in phases 2,3,4 — cloud in phase 1
  if [[ "$target" -ge 2 && "$current" -lt 2 ]]; then
    redis_to_local
  elif [[ "$target" -lt 2 && "$current" -ge 2 ]]; then
    redis_to_cloud
  else
    ok "Redis: no change"
  fi

  # Kafka: local in phases 3,4 — cloud in phases 1,2
  if [[ "$target" -ge 3 && "$current" -lt 3 ]]; then
    kafka_to_local
  elif [[ "$target" -lt 3 && "$current" -ge 3 ]]; then
    kafka_to_cloud
  else
    ok "Kafka: no change"
  fi

  # PostgreSQL: local in phase 4 — cloud in phases 1,2,3
  if [[ "$target" -ge 4 && "$current" -lt 4 ]]; then
    postgres_to_local
  elif [[ "$target" -lt 4 && "$current" -ge 4 ]]; then
    postgres_to_cloud
  else
    ok "PostgreSQL: no change"
  fi

  # Update phase header
  update_phase_header "$target"

  echo ""
  if ! $DRY_RUN; then
    ok "Phase transition complete."
    echo ""
    echo -e "${BOLD}Next steps:${NC}"
    echo "  1. Review changes:  git diff infra/k8s/"
    echo "  2. Commit & push:   git add infra/k8s/ && git commit -m 'infra: switch to phase $target' && git push"
    echo "  3. ArgoCD will auto-sync the manifests"
    echo "  4. Restart backend: kubectl rollout restart deployment/backend -n hire-adda"
  else
    echo -e "${YELLOW}Dry run complete — no files were modified.${NC}"
  fi
}

# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────
main() {
  # Parse arguments
  local show_status_flag=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --status)     show_status_flag=true; shift ;;
      --phase)      TARGET_PHASE="$2"; shift 2 ;;
      --dry-run)    DRY_RUN=true; shift ;;
      -h|--help)    usage ;;
      *)            die "Unknown argument: $1" ;;
    esac
  done

  # Validate files exist
  for f in "$CONFIGMAP" "$POSTGRES_SS" "$KAFKA_SS" "$REDIS_SS"; do
    [[ -f "$f" ]] || die "File not found: $f"
  done

  if $show_status_flag; then
    show_status
    exit 0
  fi

  if [[ -z "$TARGET_PHASE" ]]; then
    usage
  fi

  if [[ ! "$TARGET_PHASE" =~ ^[1-4]$ ]]; then
    die "Phase must be 1, 2, 3, or 4 (got: $TARGET_PHASE)"
  fi

  local current_phase
  current_phase=$(detect_phase)
  echo -e "${BOLD}Current phase: $current_phase | Target phase: $TARGET_PHASE${NC}"

  switch_phase "$current_phase" "$TARGET_PHASE"
}

main "$@"
