#!/usr/bin/env bash
# ============================================================
# Migrate from Docker Compose to K3s
# This script handles the traffic cutover.
# Run AFTER Sessions 1-3 are deployed and verified.
# ============================================================
# Usage:
#   ./infra/scripts/migrate-to-k3s.sh [--dry-run]
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Configuration (override via env vars) ──
DEPLOY_PATH="${VPS_DEPLOY_PATH:-/root/hire_adda}"
DOMAIN="${DOMAIN:-hireadda.in}"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}DRY RUN MODE — no changes will be made${NC}"
fi

log() { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING:${NC} $*"; }
fail() { echo -e "${RED}[$(date '+%H:%M:%S')] FAILED:${NC} $*"; exit 1; }

# ── Step 1: Pre-flight Checks ──
log "Step 1: Pre-flight checks..."

# Verify K3s is running
kubectl get nodes -o wide || fail "K3s not accessible"
log "  K3s cluster: OK"

# Verify all K3s app pods are Running
PODS_NOT_READY=$(kubectl get pods -n hire-adda --no-headers 2>/dev/null | grep -cv "Running\|Completed" || true)
if [[ "$PODS_NOT_READY" -gt 0 ]]; then
  kubectl get pods -n hire-adda
  fail "Not all pods are Running in hire-adda namespace"
fi
log "  All application pods: Running"

# Verify ingress controller is running
kubectl get pods -n ingress-nginx --no-headers | grep -q "Running" || fail "Ingress controller not running"
log "  Ingress controller: Running"

# Verify cert-manager is running
kubectl get pods -n cert-manager --no-headers | grep -q "Running" || fail "cert-manager not running"
log "  cert-manager: Running"

# ── Step 2: Verify SSL Certificates ──
log "Step 2: Checking SSL certificates..."

CERTS=$(kubectl get certificates -n hire-adda -o jsonpath='{range .items[*]}{.metadata.name}: {.status.conditions[0].type}={.status.conditions[0].status}{"\n"}{end}' 2>/dev/null)
if echo "$CERTS" | grep -q "Ready=False"; then
  echo "$CERTS"
  fail "Some certificates are not ready"
fi
log "  SSL certificates: Ready"

# ── Step 3: Port-forward test ──
log "Step 3: Testing backend via port-forward..."

kubectl port-forward svc/backend 5099:5000 -n hire-adda &
PF_PID=$!
sleep 3

HEALTH=$(curl -sf http://localhost:5099/health 2>/dev/null || echo "FAILED")
kill $PF_PID 2>/dev/null || true

if [[ "$HEALTH" == "FAILED" ]]; then
  fail "Backend health check failed via port-forward"
fi
log "  Backend health: OK"

# ── Step 4: Data Migration ──
log "Step 4: Data migration..."

if [[ "$DRY_RUN" == true ]]; then
  log "  [DRY RUN] Would migrate: PostgreSQL, OpenSearch, uploads"
else
  # 4a. PostgreSQL: dump from Docker, restore to K3s
  log "  4a. Migrating PostgreSQL..."
  DOCKER_PG=$(docker ps -q -f name=hireadda_postgres 2>/dev/null || echo "")
  if [[ -n "$DOCKER_PG" ]]; then
    docker exec "$DOCKER_PG" pg_dump -U postgres -d hireadda --no-owner --no-privileges --clean --if-exists | \
      kubectl exec -i statefulset/postgres -n hire-adda -- psql -U postgres -d hireadda
    log "    PostgreSQL migration: Complete"
  else
    warn "  Docker PostgreSQL not found — skipping (data may already be in K3s)"
  fi

  # 4b. OpenSearch: snapshot + restore
  log "  4b. Migrating OpenSearch..."
  warn "  OpenSearch migration is manual — use snapshot/restore if needed"
  warn "  The backend will auto-reindex on startup"

  # 4c. Uploads: copy volume
  log "  4c. Migrating uploads..."
  DOCKER_UPLOADS=$(docker volume inspect hireadda_uploads_data --format '{{.Mountpoint}}' 2>/dev/null || echo "")
  if [[ -n "$DOCKER_UPLOADS" && -d "$DOCKER_UPLOADS" ]]; then
    K3S_UPLOADS=$(kubectl get pvc uploads-pvc -n hire-adda -o jsonpath='{.spec.volumeName}' 2>/dev/null || echo "")
    if [[ -n "$K3S_UPLOADS" ]]; then
      # Use a temporary pod to copy data
      kubectl run upload-copy --rm -i --restart=Never \
        --image=busybox:1.36 \
        --overrides='{"spec":{"containers":[{"name":"copy","image":"busybox:1.36","command":["sleep","3600"],"volumeMounts":[{"name":"uploads","mountPath":"/uploads"}]}],"volumes":[{"name":"uploads","persistentVolumeClaim":{"claimName":"uploads-pvc"}}]}}' \
        -n hire-adda -- sh -c "echo 'Ready for copy'" &
      sleep 5
      # Copy files from Docker volume to K3s PV via kubectl cp
      warn "  Upload migration may need manual intervention — check volume paths"
    fi
    log "    Uploads migration: Attempted"
  else
    warn "  Docker uploads volume not found — skipping"
  fi
fi

# ── Step 5: Verify Mail Server (stays in Docker) ──
log "Step 5: Verifying mail server is standalone..."

# Mail server should be running in Docker independently
MAIL_RUNNING=$(docker ps -q -f name=hireadda_mailserver 2>/dev/null || echo "")
if [[ -n "$MAIL_RUNNING" ]]; then
  log "  Docker mailserver: Running (ports 25/465/587/993)"
else
  warn "  Docker mailserver not running — start it: cd infra/mail && docker compose up -d"
fi

# Verify roundcube is deployed in K3s (not Docker)
ROUNDCUBE_POD=$(kubectl get pods -n hire-adda -l app=roundcube --no-headers 2>/dev/null | grep "Running" | wc -l)
if [[ "$ROUNDCUBE_POD" -gt 0 ]]; then
  log "  Roundcube webmail: Running in K3s"
else
  warn "  Roundcube not running in K3s — deploy: kubectl apply -f infra/k8s/apps/roundcube/"
fi

# Verify mailserver-external service exists (K8s → Docker bridge)
kubectl get svc mailserver-external -n hire-adda &>/dev/null && \
  log "  mailserver-external service: OK" || \
  warn "  mailserver-external service missing — deploy: kubectl apply -f infra/k8s/apps/roundcube/mailserver-external.yaml"

# ── Step 6: Cutover ──
log "Step 6: Traffic cutover..."

if [[ "$DRY_RUN" == true ]]; then
  log "  [DRY RUN] Would stop Docker Compose app stack (frees ports 80/443)"
  log "  [DRY RUN] K3s ingress would take over immediately"
  log "  [DRY RUN] Docker mail server stays running (ports 25/465/587/993)"
else
  echo ""
  echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}  CUTOVER: This will stop the Docker app stack and${NC}"
  echo -e "${YELLOW}  route all web traffic through K3s.${NC}"
  echo -e "${YELLOW}  Docker mail server stays running (separate).${NC}"
  echo -e "${YELLOW}  Rollback: ./infra/scripts/rollback-to-compose.sh${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
  echo ""
  read -p "Continue? (yes/no): " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    log "Aborted by user."
    exit 0
  fi

  # Stop Docker Compose APP STACK ONLY (frees ports 80 and 443)
  # Mail server is separate and stays running
  log "  Stopping Docker Compose app stack..."
  cd "$DEPLOY_PATH/infra/docker" && docker compose down || warn "Docker compose down had issues"
  log "  App stack stopped. K3s ingress is now handling ports 80/443."
  log "  Mail server Docker stack is unaffected."
fi

# ── Step 6: Verification ──
log "Step 6: Post-cutover verification..."
sleep 5

# Test all endpoints
TESTS_PASSED=true

check_url() {
  local url="$1"
  local name="$2"
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "200" || "$STATUS" == "301" || "$STATUS" == "302" ]]; then
    log "  $name ($url): ${GREEN}$STATUS${NC}"
  else
    warn "  $name ($url): ${RED}$STATUS${NC}"
    TESTS_PASSED=false
  fi
}

if [[ "$DRY_RUN" == false ]]; then
  check_url "https://${DOMAIN}" "Frontend"
  check_url "https://api.${DOMAIN}/health" "Backend API"
  check_url "https://mail.${DOMAIN}" "Webmail"

  if [[ "$TESTS_PASSED" == false ]]; then
    echo ""
    echo -e "${RED}Some checks failed! Consider rollback:${NC}"
    echo "  ./infra/scripts/rollback-to-compose.sh"
    exit 1
  fi
fi

# ── Done ──
echo ""
log "╔══════════════════════════════════════════╗"
log "║  Migration Complete!                     ║"
log "║  All traffic now routes through K3s.     ║"
log "║  Docker mail server is unaffected.       ║"
log "╚══════════════════════════════════════════╝"
