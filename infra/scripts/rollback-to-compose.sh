#!/usr/bin/env bash
# ============================================================
# Emergency Rollback: K3s → Docker Compose
# Restarts the Docker Compose stack and stops K3s ingress.
# ============================================================
# Usage:
#   ./infra/scripts/rollback-to-compose.sh
# ============================================================

set -euo pipefail

# ── Configuration (override via env vars) ──
DEPLOY_PATH="${VPS_DEPLOY_PATH:-/root/hire_adda}"
DOMAIN="${DOMAIN:-hireadda.in}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING:${NC} $*"; }

echo -e "${RED}═══════════════════════════════════════════════${NC}"
echo -e "${RED}  ROLLBACK: Reverting from K3s to Docker Compose${NC}"
echo -e "${RED}═══════════════════════════════════════════════${NC}"
echo ""

# Step 1: Scale down K3s ingress to free ports 80/443
log "Step 1: Scaling down K3s ingress controller..."
kubectl scale daemonset ingress-nginx-controller -n ingress-nginx --replicas=0 2>/dev/null || \
  warn "Could not scale down ingress (may not be running)"
sleep 3

# Step 2: Restart Docker Compose
log "Step 2: Starting Docker Compose stack..."
cd "$DEPLOY_PATH/infra/docker"
docker compose up -d

# Step 3: Wait for containers to be healthy
log "Step 3: Waiting for Docker containers to start..."
sleep 10

docker ps --format "table {{.Names}}\t{{.Status}}"

# Step 4: Verify
log "Step 4: Verifying endpoints..."
sleep 5

check_url() {
  local url="$1"
  local name="$2"
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "200" || "$STATUS" == "301" || "$STATUS" == "302" ]]; then
    log "  $name: ${GREEN}$STATUS OK${NC}"
  else
    warn "  $name: ${RED}$STATUS FAIL${NC}"
  fi
}

check_url "https://${DOMAIN}" "Frontend"
check_url "https://api.${DOMAIN}/health" "Backend API"
check_url "https://mail.${DOMAIN}" "Webmail"

echo ""
log "╔══════════════════════════════════════════╗"
log "║  Rollback Complete                       ║"
log "║  Docker Compose is serving traffic.      ║"
log "║  K3s ingress is scaled to 0.             ║"
log "║                                          ║"
log "║  To re-attempt K3s migration:            ║"
log "║  1. Fix the issue                        ║"
log "║  2. Scale ingress back up                ║"
log "║  3. Re-run migrate-to-k3s.sh             ║"
log "╚══════════════════════════════════════════╝"
