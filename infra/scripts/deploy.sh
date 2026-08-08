#!/usr/bin/env bash
# ============================================================
# Hire Adda — Blue-Green / Canary / Rolling Deploy Script
# Manages zero-downtime deployments on VPS via Docker Compose
# with nginx upstream weight switching.
#
# Usage:
#   ./deploy.sh [OPTIONS]
#
# Strategies:
#   --strategy progressive  Rolling phases + canary traffic shift (default)
#   --strategy blue-green   Deploy to inactive color, instant swap
#   --strategy canary       Deploy to inactive color, gradual traffic shift
#   --strategy rolling      Sequential: backend first → frontend second
#
# Actions:
#   --promote               Promote canary to 100% traffic
#   --rollback              Instant rollback to previous active color
#   --status                Show current deployment state
#
# Options:
#   --backend-tag <tag>     New backend image tag
#   --frontend-tag <tag>    New frontend image tag
#   --canary-weight <N>     Initial canary weight % (default: 20)
#   --skip-migrations       Skip Prisma migration step
#   --dry-run               Show what would happen without executing
# ============================================================

set -euo pipefail

# ── Configuration ──
# Derive paths from script location (infra/scripts/ → infra/docker/)
_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$(dirname "$_SCRIPT_DIR")/docker}"
SCRIPTS_DIR="${SCRIPTS_DIR:-$_SCRIPT_DIR}"
ENV_FILE="${COMPOSE_DIR}/.env"
STATE_FILE="${COMPOSE_DIR}/.deploy-state"
UPSTREAM_DIR="${COMPOSE_DIR}/nginx/upstreams"
LOG_FILE="/var/log/hire-adda-deploy.log"
LOCK_FILE="/tmp/tb-deploy.lock"
MAX_HEALTH_RETRIES=15
HEALTH_CHECK_INTERVAL=10
DRAIN_WAIT=5               # seconds to let in-flight requests finish after upstream switch
CANARY_STAGE_WAIT=15       # seconds to observe each canary weight stage before advancing

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Logging ──
log()  { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARN:${NC} $*" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "$LOG_FILE"; }
info() { echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $*" | tee -a "$LOG_FILE"; }

# ── Argument Parsing ──
STRATEGY="progressive"
ACTION="deploy"
BACKEND_TAG=""
FRONTEND_TAG=""
CANARY_WEIGHT=20
SKIP_MIGRATIONS=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --strategy)        STRATEGY="$2"; shift 2 ;;
    --backend-tag)     BACKEND_TAG="$2"; shift 2 ;;
    --frontend-tag)    FRONTEND_TAG="$2"; shift 2 ;;
    --canary-weight)   CANARY_WEIGHT="$2"; shift 2 ;;
    --skip-migrations) SKIP_MIGRATIONS=true; shift ;;
    --dry-run)         DRY_RUN=true; shift ;;
    --promote)         ACTION="promote"; shift ;;
    --rollback)        ACTION="rollback"; shift ;;
    --status)          ACTION="status"; shift ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Validate strategy ──
if [[ "$ACTION" == "deploy" ]]; then
  case "$STRATEGY" in
    progressive|blue-green|canary|rolling) ;;
    *) err "Invalid strategy: $STRATEGY (use: progressive, blue-green, canary, rolling)"; exit 1 ;;
  esac
fi

# ── Locking (prevent concurrent deploys) ──
cleanup() {
  rm -f "$LOCK_FILE"
}

acquire_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    LOCK_PID=$(cat "$LOCK_FILE")
    if kill -0 "$LOCK_PID" 2>/dev/null; then
      err "Another deploy is running (PID: $LOCK_PID). Aborting."
      exit 1
    else
      warn "Stale lock file found. Removing."
      rm -f "$LOCK_FILE"
    fi
  fi
  echo $$ > "$LOCK_FILE"
  trap cleanup EXIT
}

# ── State Management ──
init_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    log "Initializing deploy state (first deploy)..."
    cat > "$STATE_FILE" <<'STATEEOF'
ACTIVE_COLOR=blue
BLUE_BACKEND_TAG=latest
BLUE_FRONTEND_TAG=latest
GREEN_BACKEND_TAG=latest
GREEN_FRONTEND_TAG=latest
CANARY_WEIGHT=0
LAST_DEPLOY=never
DEPLOY_STRATEGY=none
STATEEOF
  fi
}

read_state() {
  init_state
  # shellcheck source=/dev/null
  source "$STATE_FILE"
}

write_state() {
  cat > "$STATE_FILE" <<EOF
ACTIVE_COLOR=${ACTIVE_COLOR}
BLUE_BACKEND_TAG=${BLUE_BACKEND_TAG}
BLUE_FRONTEND_TAG=${BLUE_FRONTEND_TAG}
GREEN_BACKEND_TAG=${GREEN_BACKEND_TAG}
GREEN_FRONTEND_TAG=${GREEN_FRONTEND_TAG}
CANARY_WEIGHT=${CANARY_WEIGHT}
LAST_DEPLOY=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DEPLOY_STRATEGY=${DEPLOY_STRATEGY:-${STRATEGY}}
EOF
}

get_inactive_color() {
  if [[ "$ACTIVE_COLOR" == "blue" ]]; then
    echo "green"
  else
    echo "blue"
  fi
}

# ── .env Helpers ──
update_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

# ── Nginx Upstream Generation ──
generate_backend_upstream() {
  local blue_weight=$1
  local green_weight=$2

  local servers=""
  # Only add servers for containers that are actually running
  if [[ $blue_weight -gt 0 ]] && docker compose ps -q backend-blue 2>/dev/null | grep -q .; then
    servers="${servers}    server backend-blue:5000 weight=${blue_weight} max_fails=3 fail_timeout=30s;\n"
  fi
  if [[ $green_weight -gt 0 ]] && docker compose ps -q backend-green 2>/dev/null | grep -q .; then
    servers="${servers}    server backend-green:5000 weight=${green_weight} max_fails=3 fail_timeout=30s;\n"
  fi

  # If no servers are available, use a down server as placeholder
  if [[ -z "$servers" ]]; then
    servers="    server 127.0.0.1:65535 down;  # No backend containers running\n"
  fi

  cat > "${UPSTREAM_DIR}/backend.conf" <<EOF
# Backend upstream — managed by deploy.sh (DO NOT EDIT MANUALLY on VPS)
# Active: blue=${blue_weight}% green=${green_weight}%
upstream backend_api {
    least_conn;
$(echo -e "$servers" | sed '/^$/d')
    keepalive 32;
}
EOF
}

generate_frontend_upstream() {
  local blue_weight=$1
  local green_weight=$2

  local servers=""
  # Only add servers for containers that are actually running
  if [[ $blue_weight -gt 0 ]] && docker compose ps -q frontend-blue 2>/dev/null | grep -q .; then
    servers="${servers}    server frontend-blue:3000 weight=${blue_weight};\n"
  fi
  if [[ $green_weight -gt 0 ]] && docker compose ps -q frontend-green 2>/dev/null | grep -q .; then
    servers="${servers}    server frontend-green:3000 weight=${green_weight};\n"
  fi

  # If no servers are available, use a down server as placeholder
  if [[ -z "$servers" ]]; then
    servers="    server 127.0.0.1:65535 down;  # No frontend containers running\n"
  fi

  cat > "${UPSTREAM_DIR}/frontend.conf" <<EOF
# Frontend upstream — managed by deploy.sh (DO NOT EDIT MANUALLY on VPS)
# Active: blue=${blue_weight}% green=${green_weight}%
upstream frontend_app {
$(echo -e "$servers" | sed '/^$/d')
    keepalive 16;
}
EOF
}

set_upstream_weights() {
  local blue_weight=$1
  local green_weight=$2

  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would set upstream weights: blue=${blue_weight}% green=${green_weight}%"
    return
  fi

  # Always generate both upstream configs (they handle missing containers gracefully)
  generate_backend_upstream "$blue_weight" "$green_weight"
  generate_frontend_upstream "$blue_weight" "$green_weight"

  log "Updated upstream weights: blue=${blue_weight}% green=${green_weight}%"
}

reload_nginx() {
  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would reload nginx"
    return
  fi

  if docker compose exec -T nginx nginx -t 2>&1 | tee -a "$LOG_FILE"; then
    docker compose exec -T nginx nginx -s reload 2>&1 | tee -a "$LOG_FILE"
    log "Nginx reloaded successfully."
  else
    err "Nginx config test failed! Upstream NOT switched."
    return 1
  fi
}

# ── Health Checks ──
health_check() {
  local service="$1"
  local url="$2"
  local retries=0

  log "  Checking health: ${service} → ${url}"
  while [[ $retries -lt $MAX_HEALTH_RETRIES ]]; do
    if docker compose exec -T "$service" wget -q --spider "$url" 2>/dev/null; then
      log "  ${service}: ${GREEN}healthy${NC}"
      return 0
    fi
    retries=$((retries + 1))
    warn "  ${service}: waiting... (attempt ${retries}/${MAX_HEALTH_RETRIES})"
    sleep "$HEALTH_CHECK_INTERVAL"
  done

  err "  ${service}: UNHEALTHY after ${MAX_HEALTH_RETRIES} attempts"
  return 1
}

health_check_color() {
  local color="$1"
  local failed=false

  log "Running health checks for ${CYAN}${color}${NC} environment..."

  if ! health_check "backend-${color}" "http://127.0.0.1:5000/health/live"; then
    failed=true
  fi

  if ! health_check "frontend-${color}" "http://127.0.0.1:3000/"; then
    failed=true
  fi

  if [[ "$failed" == "true" ]]; then
    return 1
  fi
  return 0
}

# ── Grafana Annotations ──
grafana_annotate() {
  local text="$1"
  local tags="${2:-deploy}"

  # Best-effort — don't fail the deploy if Grafana is down
  local grafana_user grafana_pass
  grafana_user=$(grep -oP '^GRAFANA_ADMIN_USER=\K.*' "$ENV_FILE" 2>/dev/null || echo "admin")
  grafana_pass=$(grep -oP '^GRAFANA_ADMIN_PASSWORD=\K.*' "$ENV_FILE" 2>/dev/null || echo "")

  if [[ -z "$grafana_pass" || "$grafana_pass" == "CHANGE_ME"* ]]; then
    return 0
  fi

  # Grafana has no host port — reach it via Docker network
  docker compose exec -T grafana \
    wget -q --post-data="{\"text\": \"${text}\", \"tags\": [\"${tags}\"]}" \
    --header="Content-Type: application/json" \
    --user="${grafana_user}" --password="${grafana_pass}" \
    -O /dev/null "http://localhost:3000/api/annotations" \
    2>/dev/null || true
}

# ── Deploy: Blue-Green ──
deploy_blue_green() {
  local inactive
  inactive=$(get_inactive_color)

  log "============================================"
  log "  Strategy: ${CYAN}Blue-Green${NC}"
  log "  Active: ${ACTIVE_COLOR} → Deploying to: ${inactive}"
  log "============================================"

  # Update tags for inactive color
  local inactive_upper active_upper
  inactive_upper=$(echo "$inactive" | tr '[:lower:]' '[:upper:]')
  active_upper=$(echo "$ACTIVE_COLOR" | tr '[:lower:]' '[:upper:]')

  # When only one service changes (e.g. CD only built backend), copy the
  # active color's unchanged-service tag to inactive so both environments
  # run the same image for the unchanged service.
  if [[ -n "$BACKEND_TAG" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would set ${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
    else
      update_env_var "${inactive_upper}_BACKEND_TAG" "$BACKEND_TAG"
      eval "${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
      log "Set ${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
    fi
  else
    local active_btag_var="${active_upper}_BACKEND_TAG"
    local active_btag="${!active_btag_var:-latest}"
    update_env_var "${inactive_upper}_BACKEND_TAG" "$active_btag"
    eval "${inactive_upper}_BACKEND_TAG=${active_btag}"
    log "Copied active backend tag: ${inactive_upper}_BACKEND_TAG=${active_btag}"
  fi

  if [[ -n "$FRONTEND_TAG" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would set ${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
    else
      update_env_var "${inactive_upper}_FRONTEND_TAG" "$FRONTEND_TAG"
      eval "${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
      log "Set ${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
    fi
  else
    local active_ftag_var="${active_upper}_FRONTEND_TAG"
    local active_ftag="${!active_ftag_var:-latest}"
    update_env_var "${inactive_upper}_FRONTEND_TAG" "$active_ftag"
    eval "${inactive_upper}_FRONTEND_TAG=${active_ftag}"
    log "Copied active frontend tag: ${inactive_upper}_FRONTEND_TAG=${active_ftag}"
  fi

  # Pull new images
  log "Pulling images for ${inactive}..."
  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would pull: backend-${inactive} frontend-${inactive}"
  else
    docker compose pull "backend-${inactive}" "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
  fi

  # Run Prisma migrations (via inactive backend)
  if [[ "$SKIP_MIGRATIONS" == "false" && -n "$BACKEND_TAG" ]]; then
    log "Running Prisma migrations (via backend-${inactive})..."
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would run migrations via backend-${inactive}"
    else
      if docker compose run --rm --no-deps "backend-${inactive}" npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE"; then
        log "Migrations completed successfully."
      else
        err "Migration failed! Aborting deploy."
        exit 1
      fi
    fi
  else
    info "Skipping migrations."
  fi

  local old_color="$ACTIVE_COLOR"

  # Start inactive containers (both colors run simultaneously during transition;
  # leader election ensures only one instance runs BullMQ workers + Kafka consumers)
  #
  log "Starting ${inactive} containers..."
  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would start: backend-${inactive} frontend-${inactive}"
  else
    docker compose up -d --no-build "backend-${inactive}" "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
  fi

  # Health check inactive
  if [[ "$DRY_RUN" != "true" ]]; then
    sleep 5
    if ! health_check_color "$inactive"; then
      err "Health checks failed for ${inactive}! Old ${old_color} still serving — zero downtime."
      docker compose stop "backend-${inactive}" "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE" || true
      exit 1
    fi
  fi

  # Instant swap: 100% to inactive
  if [[ "$inactive" == "green" ]]; then
    set_upstream_weights 0 100
  else
    set_upstream_weights 100 0
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    reload_nginx
  fi

  # Drain in-flight requests, then stop old containers
  if [[ "$DRY_RUN" != "true" ]]; then
    log "Draining connections from ${old_color} (${DRAIN_WAIT}s)..."
    sleep "$DRAIN_WAIT"
    log "Stopping old ${old_color} containers..."
    docker compose stop "backend-${old_color}" "frontend-${old_color}" 2>&1 | tee -a "$LOG_FILE" || true
  fi

  # Update state
  ACTIVE_COLOR="$inactive"
  DEPLOY_STRATEGY="blue-green"
  CANARY_WEIGHT=0

  if [[ "$DRY_RUN" != "true" ]]; then
    write_state
    grafana_annotate "Deploy (blue-green): switched to ${inactive}. Backend: ${BACKEND_TAG:-unchanged}, Frontend: ${FRONTEND_TAG:-unchanged}" "deploy,blue-green"
  fi

  log ""
  log "============================================"
  log "  ${GREEN}Blue-Green Deploy Successful${NC}"
  log "  Active: ${CYAN}${ACTIVE_COLOR}${NC}"
  log "============================================"
}

# ── Deploy: Canary ──
deploy_canary() {
  local inactive
  inactive=$(get_inactive_color)

  log "============================================"
  log "  Strategy: ${CYAN}Canary (${CANARY_WEIGHT}%)${NC}"
  log "  Active: ${ACTIVE_COLOR} → Canary: ${inactive}"
  log "============================================"

  # Update tags for inactive color
  local inactive_upper active_upper
  inactive_upper=$(echo "$inactive" | tr '[:lower:]' '[:upper:]')
  active_upper=$(echo "$ACTIVE_COLOR" | tr '[:lower:]' '[:upper:]')

  if [[ -n "$BACKEND_TAG" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would set ${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
    else
      update_env_var "${inactive_upper}_BACKEND_TAG" "$BACKEND_TAG"
      eval "${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
      log "Set ${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
    fi
  else
    local active_btag_var="${active_upper}_BACKEND_TAG"
    local active_btag="${!active_btag_var:-latest}"
    update_env_var "${inactive_upper}_BACKEND_TAG" "$active_btag"
    eval "${inactive_upper}_BACKEND_TAG=${active_btag}"
    log "Copied active backend tag: ${inactive_upper}_BACKEND_TAG=${active_btag}"
  fi

  if [[ -n "$FRONTEND_TAG" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would set ${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
    else
      update_env_var "${inactive_upper}_FRONTEND_TAG" "$FRONTEND_TAG"
      eval "${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
      log "Set ${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
    fi
  else
    local active_ftag_var="${active_upper}_FRONTEND_TAG"
    local active_ftag="${!active_ftag_var:-latest}"
    update_env_var "${inactive_upper}_FRONTEND_TAG" "$active_ftag"
    eval "${inactive_upper}_FRONTEND_TAG=${active_ftag}"
    log "Copied active frontend tag: ${inactive_upper}_FRONTEND_TAG=${active_ftag}"
  fi

  # Pull new images
  log "Pulling images for ${inactive}..."
  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would pull: backend-${inactive} frontend-${inactive}"
  else
    docker compose pull "backend-${inactive}" "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
  fi

  # Run Prisma migrations
  if [[ "$SKIP_MIGRATIONS" == "false" && -n "$BACKEND_TAG" ]]; then
    log "Running Prisma migrations (via backend-${inactive})..."
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would run migrations via backend-${inactive}"
    else
      if docker compose run --rm --no-deps "backend-${inactive}" npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE"; then
        log "Migrations completed successfully."
      else
        err "Migration failed! Aborting deploy."
        exit 1
      fi
    fi
  else
    info "Skipping migrations."
  fi

  # Start/recreate inactive containers
  log "Starting ${inactive} containers..."
  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would start: backend-${inactive} frontend-${inactive}"
  else
    docker compose up -d --no-build "backend-${inactive}" "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
  fi

  # Health check inactive
  if [[ "$DRY_RUN" != "true" ]]; then
    sleep 5
    if ! health_check_color "$inactive"; then
      err "Health checks failed for ${inactive}! Aborting — no traffic switched."
      docker compose stop "backend-${inactive}" "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE" || true
      exit 1
    fi
  fi

  # Set canary weights
  local active_weight=$((100 - CANARY_WEIGHT))
  if [[ "$ACTIVE_COLOR" == "blue" ]]; then
    set_upstream_weights "$active_weight" "$CANARY_WEIGHT"
  else
    set_upstream_weights "$CANARY_WEIGHT" "$active_weight"
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    reload_nginx
  fi

  # Update state (active color stays the same during canary)
  DEPLOY_STRATEGY="canary"
  # CANARY_WEIGHT already set from args

  if [[ "$DRY_RUN" != "true" ]]; then
    write_state
    grafana_annotate "Canary started: ${CANARY_WEIGHT}% → ${inactive}. Backend: ${BACKEND_TAG:-unchanged}, Frontend: ${FRONTEND_TAG:-unchanged}" "deploy,canary"
  fi

  log ""
  log "============================================"
  log "  ${GREEN}Canary Deploy Started${NC}"
  log "  Active: ${CYAN}${ACTIVE_COLOR} (${active_weight}%)${NC}"
  log "  Canary: ${CYAN}${inactive} (${CANARY_WEIGHT}%)${NC}"
  log "  Run: deploy.sh --promote    (shift to 100%)"
  log "  Run: deploy.sh --rollback   (revert canary)"
  log "============================================"
}

# ── Deploy: Rolling ──
deploy_rolling() {
  log "============================================"
  log "  Strategy: ${CYAN}Rolling${NC} (backend first → frontend)"
  log "============================================"

  local inactive
  inactive=$(get_inactive_color)
  local inactive_upper
  inactive_upper=$(echo "$inactive" | tr '[:lower:]' '[:upper:]')

  # ── Phase 1: Backend ──
  if [[ -n "$BACKEND_TAG" ]]; then
    log "── Phase 1: Backend (blue-green) ──"

    if [[ "$DRY_RUN" != "true" ]]; then
      update_env_var "${inactive_upper}_BACKEND_TAG" "$BACKEND_TAG"
      eval "${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
    fi

    # Pull backend
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would pull backend-${inactive}"
    else
      docker compose pull "backend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
    fi

    # Migrations
    if [[ "$SKIP_MIGRATIONS" == "false" ]]; then
      log "Running Prisma migrations..."
      if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] Would run migrations via backend-${inactive}"
      else
        if ! docker compose run --rm --no-deps "backend-${inactive}" npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE"; then
          err "Migration failed! Aborting."
          exit 1
        fi
      fi
    fi

    # Start new backend alongside old (leader election handles worker singleton)
    if [[ "$DRY_RUN" != "true" ]]; then
      docker compose up -d --no-build "backend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
      sleep 5
      if ! health_check "backend-${inactive}" "http://127.0.0.1:5000/health/live"; then
        err "Backend health check failed! Old backend-${ACTIVE_COLOR} still serving — zero downtime."
        docker compose stop "backend-${inactive}" 2>&1 | tee -a "$LOG_FILE" || true
        exit 1
      fi
    fi

    # Switch backend upstream only
    if [[ "$inactive" == "green" ]]; then
      generate_backend_upstream 0 100
    else
      generate_backend_upstream 100 0
    fi
    if [[ "$DRY_RUN" != "true" ]]; then
      reload_nginx
    fi
    log "Backend switched to ${inactive}."

    # Drain and stop old backend
    if [[ "$DRY_RUN" != "true" ]]; then
      log "Draining backend connections (${DRAIN_WAIT}s)..."
      sleep "$DRAIN_WAIT"
      log "Stopping old backend-${ACTIVE_COLOR}..."
      docker compose stop "backend-${ACTIVE_COLOR}" 2>&1 | tee -a "$LOG_FILE" || true

      # Regenerate upstream to exclude stopped container (already done above at line 612-616, just need to ensure it's applied)
    fi
  fi

  # ── Phase 2: Frontend ──
  if [[ -n "$FRONTEND_TAG" ]]; then
    log "── Phase 2: Frontend (blue-green) ──"

    if [[ "$DRY_RUN" != "true" ]]; then
      update_env_var "${inactive_upper}_FRONTEND_TAG" "$FRONTEND_TAG"
      eval "${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
    fi

    # Pull frontend
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would pull frontend-${inactive}"
    else
      docker compose pull "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
    fi

    # Start frontend
    if [[ "$DRY_RUN" != "true" ]]; then
      docker compose up -d --no-build "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
      sleep 5
      if ! health_check "frontend-${inactive}" "http://127.0.0.1:3000/"; then
        err "Frontend health check failed! Old frontend-${ACTIVE_COLOR} still serving."
        docker compose stop "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE" || true
        exit 1
      fi
    fi

    # Switch frontend upstream
    if [[ "$inactive" == "green" ]]; then
      generate_frontend_upstream 0 100
    else
      generate_frontend_upstream 100 0
    fi
    if [[ "$DRY_RUN" != "true" ]]; then
      reload_nginx
    fi
    log "Frontend switched to ${inactive}."

    # Drain and stop old frontend
    if [[ "$DRY_RUN" != "true" ]]; then
      log "Draining frontend connections (${DRAIN_WAIT}s)..."
      sleep "$DRAIN_WAIT"
      log "Stopping old frontend-${ACTIVE_COLOR}..."
      docker compose stop "frontend-${ACTIVE_COLOR}" 2>&1 | tee -a "$LOG_FILE" || true
    fi
  fi

  # Update state
  ACTIVE_COLOR="$inactive"
  DEPLOY_STRATEGY="rolling"
  CANARY_WEIGHT=0

  if [[ "$DRY_RUN" != "true" ]]; then
    write_state
    grafana_annotate "Deploy (rolling): switched to ${inactive}. Backend: ${BACKEND_TAG:-unchanged}, Frontend: ${FRONTEND_TAG:-unchanged}" "deploy,rolling"
  fi

  log ""
  log "============================================"
  log "  ${GREEN}Rolling Deploy Successful${NC}"
  log "  Active: ${CYAN}${ACTIVE_COLOR}${NC}"
  log "============================================"
}

# ── Deploy: Progressive (Blue-Green + Rolling + Canary) ──
# Combines all three strategies into one pipeline:
#   - Blue-green infra (two colors, instant rollback)
#   - Rolling phases (backend first → frontend second)
#   - Canary traffic shifting (20% → 50% → 100% per phase)
deploy_progressive() {
  local inactive
  inactive=$(get_inactive_color)
  local old_color="$ACTIVE_COLOR"

  log "============================================"
  log "  Strategy: ${CYAN}Progressive${NC} (rolling + canary)"
  log "  Active: ${ACTIVE_COLOR} → Deploying to: ${inactive}"
  log "  Canary stages: 20% → 50% → 100%"
  log "============================================"

  # Update tags for inactive color
  local inactive_upper active_upper
  inactive_upper=$(echo "$inactive" | tr '[:lower:]' '[:upper:]')
  active_upper=$(echo "$ACTIVE_COLOR" | tr '[:lower:]' '[:upper:]')

  if [[ -n "$BACKEND_TAG" ]]; then
    if [[ "$DRY_RUN" != "true" ]]; then
      update_env_var "${inactive_upper}_BACKEND_TAG" "$BACKEND_TAG"
      eval "${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
      log "Set ${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
    else
      info "[DRY RUN] Would set ${inactive_upper}_BACKEND_TAG=${BACKEND_TAG}"
    fi
  else
    local active_btag_var="${active_upper}_BACKEND_TAG"
    local active_btag="${!active_btag_var:-latest}"
    update_env_var "${inactive_upper}_BACKEND_TAG" "$active_btag"
    eval "${inactive_upper}_BACKEND_TAG=${active_btag}"
    log "Copied active backend tag: ${inactive_upper}_BACKEND_TAG=${active_btag}"
  fi

  if [[ -n "$FRONTEND_TAG" ]]; then
    if [[ "$DRY_RUN" != "true" ]]; then
      update_env_var "${inactive_upper}_FRONTEND_TAG" "$FRONTEND_TAG"
      eval "${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
      log "Set ${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
    else
      info "[DRY RUN] Would set ${inactive_upper}_FRONTEND_TAG=${FRONTEND_TAG}"
    fi
  else
    local active_ftag_var="${active_upper}_FRONTEND_TAG"
    local active_ftag="${!active_ftag_var:-latest}"
    update_env_var "${inactive_upper}_FRONTEND_TAG" "$active_ftag"
    eval "${inactive_upper}_FRONTEND_TAG=${active_ftag}"
    log "Copied active frontend tag: ${inactive_upper}_FRONTEND_TAG=${active_ftag}"
  fi

  # Pull all needed images upfront
  log "Pulling images for ${inactive}..."
  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would pull: backend-${inactive} frontend-${inactive}"
  else
    docker compose pull "backend-${inactive}" "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
  fi

  # Run Prisma migrations before starting any containers
  if [[ "$SKIP_MIGRATIONS" == "false" && -n "$BACKEND_TAG" ]]; then
    log "Running Prisma migrations (via backend-${inactive})..."
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would run migrations via backend-${inactive}"
    else
      if docker compose run --rm --no-deps "backend-${inactive}" npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE"; then
        log "Migrations completed successfully."
      else
        err "Migration failed! Aborting deploy."
        exit 1
      fi
    fi
  else
    info "Skipping migrations."
  fi

  local canary_stages=(20 50 100)
  local backend_phase_done=false

  # Helper: undo backend phase if it was completed (called on frontend failure)
  _undo_backend() {
    if [[ "$backend_phase_done" != "true" || "$DRY_RUN" == "true" ]]; then return; fi
    warn "Undoing backend phase — restoring backend to ${old_color}..."
    docker compose up -d --no-build "backend-${old_color}" 2>&1 | tee -a "$LOG_FILE"
    sleep 5
    if health_check "backend-${old_color}" "http://127.0.0.1:5000/health/live"; then
      if [[ "$old_color" == "blue" ]]; then
        generate_backend_upstream 100 0
      else
        generate_backend_upstream 0 100
      fi
      reload_nginx || true
      log "Draining backend from ${inactive} (${DRAIN_WAIT}s)..."
      sleep "$DRAIN_WAIT"
      docker compose stop "backend-${inactive}" 2>&1 | tee -a "$LOG_FILE" || true
      log "Backend restored to ${old_color}."
    else
      err "Old backend-${old_color} unhealthy! Backend stays on ${inactive}. Manual intervention needed."
    fi
  }

  # ── Phase 1: Backend ──
  if [[ -n "$BACKEND_TAG" ]]; then
    log ""
    log "── Phase 1: Backend (canary 20% → 50% → 100%) ──"

    # Start new backend alongside old (leader election handles worker singleton)
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would start backend-${inactive}"
    else
      docker compose up -d --no-build "backend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
      sleep 5
      if ! health_check "backend-${inactive}" "http://127.0.0.1:5000/health/live"; then
        err "Backend health check failed! Old backend-${old_color} still serving — zero downtime."
        docker compose stop "backend-${inactive}" 2>&1 | tee -a "$LOG_FILE" || true
        exit 1
      fi
    fi

    # Canary progression for backend
    for weight in "${canary_stages[@]}"; do
      local be_old_weight=$((100 - weight))

      if [[ "$inactive" == "green" ]]; then
        generate_backend_upstream "$be_old_weight" "$weight"
      else
        generate_backend_upstream "$weight" "$be_old_weight"
      fi

      if [[ "$DRY_RUN" != "true" ]]; then
        reload_nginx
        log "Backend canary: ${CYAN}${weight}%${NC} → ${inactive}"

        if [[ $weight -lt 100 ]]; then
          log "  Observing under ${weight}% traffic (${CANARY_STAGE_WAIT}s)..."
          sleep "$CANARY_STAGE_WAIT"

          if ! health_check "backend-${inactive}" "http://127.0.0.1:5000/health/live"; then
            err "Backend unhealthy at ${weight}%! Rolling back backend to ${old_color}..."
            if [[ "$old_color" == "blue" ]]; then
              generate_backend_upstream 100 0
            else
              generate_backend_upstream 0 100
            fi
            reload_nginx
            docker compose stop "backend-${inactive}" 2>&1 | tee -a "$LOG_FILE" || true
            exit 1
          fi
        fi
      else
        info "[DRY RUN] Backend canary stage: ${weight}%"
      fi
    done

    # Drain + stop old backend
    if [[ "$DRY_RUN" != "true" ]]; then
      log "Draining backend connections from ${old_color} (${DRAIN_WAIT}s)..."
      sleep "$DRAIN_WAIT"
      log "Stopping old backend-${old_color}..."
      docker compose stop "backend-${old_color}" 2>&1 | tee -a "$LOG_FILE" || true

      # Regenerate upstream to exclude stopped container
      if [[ "$inactive" == "green" ]]; then
        generate_backend_upstream 0 100
      else
        generate_backend_upstream 100 0
      fi
    fi

    backend_phase_done=true
    log "Backend phase complete — ${inactive} at 100%."
  fi

  # ── Phase 2: Frontend ──
  # If frontend fails at any point, also undo backend phase (atomic deploy)
  if [[ -n "$FRONTEND_TAG" ]]; then
    log ""
    log "── Phase 2: Frontend (canary 20% → 50% → 100%) ──"

    # Start new frontend alongside old
    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would start frontend-${inactive}"
    else
      docker compose up -d --no-build "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE"
      sleep 5
      if ! health_check "frontend-${inactive}" "http://127.0.0.1:3000/"; then
        err "Frontend health check failed! Old frontend-${old_color} still serving."
        docker compose stop "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE" || true
        _undo_backend
        exit 1
      fi
    fi

    # Canary progression for frontend
    for weight in "${canary_stages[@]}"; do
      local fe_old_weight=$((100 - weight))

      if [[ "$inactive" == "green" ]]; then
        generate_frontend_upstream "$fe_old_weight" "$weight"
      else
        generate_frontend_upstream "$weight" "$fe_old_weight"
      fi

      if [[ "$DRY_RUN" != "true" ]]; then
        reload_nginx
        log "Frontend canary: ${CYAN}${weight}%${NC} → ${inactive}"

        if [[ $weight -lt 100 ]]; then
          log "  Observing under ${weight}% traffic (${CANARY_STAGE_WAIT}s)..."
          sleep "$CANARY_STAGE_WAIT"

          if ! health_check "frontend-${inactive}" "http://127.0.0.1:3000/"; then
            err "Frontend unhealthy at ${weight}%! Rolling back frontend to ${old_color}..."
            if [[ "$old_color" == "blue" ]]; then
              generate_frontend_upstream 100 0
            else
              generate_frontend_upstream 0 100
            fi
            reload_nginx
            docker compose stop "frontend-${inactive}" 2>&1 | tee -a "$LOG_FILE" || true
            _undo_backend
            exit 1
          fi
        fi
      else
        info "[DRY RUN] Frontend canary stage: ${weight}%"
      fi
    done

    # Drain + stop old frontend
    if [[ "$DRY_RUN" != "true" ]]; then
      log "Draining frontend connections from ${old_color} (${DRAIN_WAIT}s)..."
      sleep "$DRAIN_WAIT"
      log "Stopping old frontend-${old_color}..."
      docker compose stop "frontend-${old_color}" 2>&1 | tee -a "$LOG_FILE" || true

      # Regenerate upstream to exclude stopped container
      if [[ "$inactive" == "green" ]]; then
        generate_frontend_upstream 0 100
      else
        generate_frontend_upstream 100 0
      fi
    fi

    log "Frontend phase complete — ${inactive} at 100%."
  fi

  # Update state
  ACTIVE_COLOR="$inactive"
  DEPLOY_STRATEGY="progressive"
  CANARY_WEIGHT=0

  if [[ "$DRY_RUN" != "true" ]]; then
    write_state
    grafana_annotate "Deploy (progressive): switched to ${inactive}. Backend: ${BACKEND_TAG:-unchanged}, Frontend: ${FRONTEND_TAG:-unchanged}" "deploy,progressive"
  fi

  log ""
  log "============================================"
  log "  ${GREEN}Progressive Deploy Successful${NC}"
  log "  Active: ${CYAN}${ACTIVE_COLOR}${NC}"
  log "============================================"
}

# ── Promote Canary ──
do_promote() {
  read_state

  if [[ "$DEPLOY_STRATEGY" != "canary" || "$CANARY_WEIGHT" == "0" ]]; then
    err "No active canary to promote. Current strategy: ${DEPLOY_STRATEGY}, weight: ${CANARY_WEIGHT}%"
    exit 1
  fi

  local inactive
  inactive=$(get_inactive_color)

  log "============================================"
  log "  ${CYAN}Promoting Canary${NC}: ${inactive} → 100%"
  log "============================================"

  # Health check the canary one more time
  if [[ "$DRY_RUN" != "true" ]]; then
    if ! health_check_color "$inactive"; then
      err "Canary health check failed! Not promoting. Run --rollback instead."
      exit 1
    fi
  fi

  # Switch to 100% inactive
  if [[ "$inactive" == "green" ]]; then
    set_upstream_weights 0 100
  else
    set_upstream_weights 100 0
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    reload_nginx
  fi

  # Drain in-flight requests, then stop old containers
  local old_color="$ACTIVE_COLOR"
  if [[ "$DRY_RUN" != "true" ]]; then
    log "Draining connections from ${old_color} (${DRAIN_WAIT}s)..."
    sleep "$DRAIN_WAIT"
    log "Stopping old ${old_color} containers..."
    docker compose stop "backend-${old_color}" "frontend-${old_color}" 2>&1 | tee -a "$LOG_FILE" || true
  fi

  # Update state
  ACTIVE_COLOR="$inactive"
  DEPLOY_STRATEGY="blue-green"
  CANARY_WEIGHT=0

  if [[ "$DRY_RUN" != "true" ]]; then
    write_state
    grafana_annotate "Canary promoted: 100% → ${inactive}" "deploy,promote"
  fi

  log ""
  log "============================================"
  log "  ${GREEN}Canary Promoted Successfully${NC}"
  log "  Active: ${CYAN}${ACTIVE_COLOR}${NC} (100%)"
  log "============================================"
}

# ── Rollback ──
do_rollback() {
  read_state

  local previous
  previous=$(get_inactive_color)

  log "============================================"
  log "  ${RED}Rollback${NC}: ${ACTIVE_COLOR} → ${previous}"
  log "============================================"

  # If canary is active, just remove canary traffic
  if [[ "$DEPLOY_STRATEGY" == "canary" && "$CANARY_WEIGHT" -gt 0 ]]; then
    log "Rolling back canary — restoring 100% to ${ACTIVE_COLOR}..."
    if [[ "$ACTIVE_COLOR" == "blue" ]]; then
      set_upstream_weights 100 0
    else
      set_upstream_weights 0 100
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
      reload_nginx

      # Stop canary containers to free resources
      local canary_color
      canary_color=$(get_inactive_color)
      log "Stopping canary ${canary_color} containers..."
      docker compose stop "backend-${canary_color}" "frontend-${canary_color}" 2>&1 | tee -a "$LOG_FILE" || true

      CANARY_WEIGHT=0
      DEPLOY_STRATEGY="blue-green"
      write_state
      grafana_annotate "Canary rolled back: 100% → ${ACTIVE_COLOR}" "deploy,rollback"
    fi

    log "${GREEN}Canary rollback complete.${NC} Active: ${ACTIVE_COLOR}"
    return
  fi

  # Full rollback: switch to previous color
  # Health check previous color first
  if [[ "$DRY_RUN" != "true" ]]; then
    log "Health checking previous environment (${previous})..."
    # Ensure previous containers are running
    docker compose up -d --no-build "backend-${previous}" "frontend-${previous}" 2>&1 | tee -a "$LOG_FILE"
    sleep 5

    if ! health_check_color "$previous"; then
      err "Previous environment (${previous}) is unhealthy! Cannot rollback automatically."
      err "Manual intervention required."
      exit 1
    fi
  fi

  # Switch traffic to previous
  if [[ "$previous" == "blue" ]]; then
    set_upstream_weights 100 0
  else
    set_upstream_weights 0 100
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    reload_nginx
  fi

  # Drain and stop the failed current containers (ACTIVE_COLOR = current failing color)
  if [[ "$DRY_RUN" != "true" ]]; then
    log "Draining connections from ${ACTIVE_COLOR} (${DRAIN_WAIT}s)..."
    sleep "$DRAIN_WAIT"
    log "Stopping old ${ACTIVE_COLOR} containers..."
    docker compose stop "backend-${ACTIVE_COLOR}" "frontend-${ACTIVE_COLOR}" 2>&1 | tee -a "$LOG_FILE" || true
  fi

  # Update state
  ACTIVE_COLOR="$previous"
  DEPLOY_STRATEGY="rollback"
  CANARY_WEIGHT=0

  if [[ "$DRY_RUN" != "true" ]]; then
    write_state
    grafana_annotate "Rollback: switched to ${previous}" "deploy,rollback"
  fi

  log ""
  log "============================================"
  log "  ${GREEN}Rollback Successful${NC}"
  log "  Active: ${CYAN}${ACTIVE_COLOR}${NC}"
  log "============================================"
}

# ── Status ──
do_status() {
  read_state

  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════${NC}"
  echo -e "${CYAN}  Hire Adda — Deployment Status${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Active Color:    ${GREEN}${ACTIVE_COLOR}${NC}"
  echo -e "  Strategy:        ${DEPLOY_STRATEGY}"
  echo -e "  Canary Weight:   ${CANARY_WEIGHT}%"
  echo -e "  Last Deploy:     ${LAST_DEPLOY}"
  echo ""
  echo -e "  ${BLUE}Blue${NC}  Backend:   ${BLUE_BACKEND_TAG}"
  echo -e "  ${BLUE}Blue${NC}  Frontend:  ${BLUE_FRONTEND_TAG}"
  echo -e "  ${GREEN}Green${NC} Backend:   ${GREEN_BACKEND_TAG}"
  echo -e "  ${GREEN}Green${NC} Frontend:  ${GREEN_FRONTEND_TAG}"
  echo ""

  # Show running containers
  echo -e "  ${CYAN}Container Status:${NC}"
  docker ps --format "    {{.Names}}\t{{.Status}}\t{{.Image}}" 2>/dev/null | grep -E "backend_blue|backend_green|frontend_blue|frontend_green" || echo "    (no containers found)"
  echo ""

  # Show upstream config
  if [[ -f "${UPSTREAM_DIR}/backend.conf" ]]; then
    echo -e "  ${CYAN}Backend Upstream:${NC}"
    grep "server " "${UPSTREAM_DIR}/backend.conf" 2>/dev/null | sed 's/^/    /'
  fi
  if [[ -f "${UPSTREAM_DIR}/frontend.conf" ]]; then
    echo -e "  ${CYAN}Frontend Upstream:${NC}"
    grep "server " "${UPSTREAM_DIR}/frontend.conf" 2>/dev/null | sed 's/^/    /'
  fi
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════${NC}"
}

# ── Main ──
cd "$COMPOSE_DIR"

case "$ACTION" in
  status)
    do_status
    exit 0
    ;;

  promote)
    acquire_lock
    do_promote
    ;;

  rollback)
    acquire_lock
    do_rollback
    ;;

  deploy)
    acquire_lock

    # Validate inputs
    if [[ -z "$BACKEND_TAG" && -z "$FRONTEND_TAG" ]]; then
      err "No tags specified. Use --backend-tag and/or --frontend-tag"
      exit 1
    fi

    if [[ ! -f "$ENV_FILE" ]]; then
      err ".env file not found at $ENV_FILE"
      exit 1
    fi

    read_state

    # Regenerate upstream configs to match current container state.
    # rsync may have copied stale static files; ensure nginx -t always
    # succeeds even when only one service's containers are running.
    if [[ "$ACTIVE_COLOR" == "blue" ]]; then
      generate_backend_upstream 100 0
      generate_frontend_upstream 100 0
    else
      generate_backend_upstream 0 100
      generate_frontend_upstream 0 100
    fi

    # Recreate nginx so bind-mount picks up the current compose directory.
    # If the deploy path changed since the container was first created,
    # the old bind-mount still points to the previous directory.
    if [[ "$DRY_RUN" != "true" ]]; then
      log "Ensuring nginx container has fresh bind-mounts..."
      docker compose up -d --force-recreate nginx 2>&1 | tee -a "$LOG_FILE"
    fi

    log "============================================"
    log "  Hire Adda — Deploy Starting"
    log "  Strategy: ${STRATEGY}"
    log "  Active Color: ${ACTIVE_COLOR}"
    log "============================================"

    case "$STRATEGY" in
      progressive) deploy_progressive ;;
      blue-green)  deploy_blue_green ;;
      canary)      deploy_canary ;;
      rolling)     deploy_rolling ;;
    esac

    # Cleanup old images
    if [[ "$DRY_RUN" != "true" ]]; then
      log "Cleaning up dangling images..."
      docker image prune -f 2>/dev/null || true
    fi
    ;;
esac
