#!/bin/bash
# ============================================================
# Docker Mailserver Setup Script for hireadda.in
# Run this ONCE on your VPS to initialize the mail server.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[SETUP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

# ── Prerequisites ──
command -v docker >/dev/null 2>&1 || error "Docker is not installed"
command -v docker compose >/dev/null 2>&1 || error "Docker Compose is not installed"

# ── Load .env ──
if [ ! -f .env ]; then
    cp .env.example .env
    warn ".env created from .env.example — please edit it before continuing"
    warn "Set SUPPORT_EMAIL_PASSWORD to a strong password"
    exit 1
fi

source .env

if [ "$SUPPORT_EMAIL_PASSWORD" = "CHANGE_ME_TO_A_STRONG_PASSWORD" ]; then
    error "Please set SUPPORT_EMAIL_PASSWORD in .env before running setup"
fi

# ── Step 1: Request SSL cert for mail.hireadda.in ──
log "Step 1: Checking SSL certificate for mail.hireadda.in..."

if [ -d "${LETSENCRYPT_PATH}/live/mail.hireadda.in" ]; then
    log "SSL cert for mail.hireadda.in already exists"
else
    log "Requesting SSL certificate for mail.hireadda.in..."
    info "Make sure DNS A record for mail.hireadda.in points to this server's IP"
    read -p "Press Enter to continue (or Ctrl+C to abort)..."

    docker run --rm -it \
        -v "${LETSENCRYPT_PATH}:/etc/letsencrypt" \
        -p 80:80 \
        certbot/certbot certonly \
        --standalone \
        -d mail.hireadda.in \
        --email "admin@hireadda.in" \
        --agree-tos \
        --non-interactive

    log "SSL certificate obtained for mail.hireadda.in"
fi

# ── Step 2: Start mailserver temporarily for setup commands ──
log "Step 2: Starting mailserver for initial setup..."
docker compose up -d mailserver
sleep 10  # Wait for container to initialize

# ── Step 3: Create email accounts ──
log "Step 3: Creating email accounts..."

# Support account
docker compose exec -T mailserver setup email add support@hireadda.in "$SUPPORT_EMAIL_PASSWORD"
log "Created: support@hireadda.in"

# No-reply account (for application emails)
NOREPLY_PASS=$(openssl rand -base64 24)
docker compose exec -T mailserver setup email add noreply@hireadda.in "$NOREPLY_PASS"
log "Created: noreply@hireadda.in (password: $NOREPLY_PASS)"
info "Save the noreply password — you'll need it for the app's SMTP config"

# Admin account
ADMIN_PASS=$(openssl rand -base64 24)
docker compose exec -T mailserver setup email add admin@hireadda.in "$ADMIN_PASS"
log "Created: admin@hireadda.in (password: $ADMIN_PASS)"

# DMARC reports receiver
DMARC_PASS=$(openssl rand -base64 24)
docker compose exec -T mailserver setup email add dmarc@hireadda.in "$DMARC_PASS"
log "Created: dmarc@hireadda.in (password: $DMARC_PASS)"

# ── Step 4: Set up aliases ──
log "Step 4: Setting up aliases..."
docker compose exec -T mailserver setup alias add postmaster@hireadda.in admin@hireadda.in
docker compose exec -T mailserver setup alias add abuse@hireadda.in admin@hireadda.in
docker compose exec -T mailserver setup alias add webmaster@hireadda.in admin@hireadda.in
docker compose exec -T mailserver setup alias add info@hireadda.in support@hireadda.in
docker compose exec -T mailserver setup alias add contact@hireadda.in support@hireadda.in
docker compose exec -T mailserver setup alias add help@hireadda.in support@hireadda.in
log "Aliases created (postmaster, abuse, webmaster → admin; info, contact, help → support)"

# ── Step 5: Generate DKIM keys ──
log "Step 5: Generating DKIM keys..."
docker compose exec -T mailserver setup config dkim keysize 2048 domain hireadda.in selector mail
log "DKIM keys generated"

# ── Step 6: Extract DKIM record ──
log "Step 6: Extracting DKIM DNS record..."
echo ""
echo "============================================================"
echo "  DKIM DNS Record (add this to Hostinger DNS)"
echo "============================================================"

# The DKIM key is stored in the container
docker compose exec -T mailserver cat /tmp/docker-mailserver/opendkim/keys/hireadda.in/mail.txt 2>/dev/null || \
    warn "DKIM key file not found yet. Check after restart with: make mail-dkim"

echo ""
echo "============================================================"

# ── Step 7: Set quotas ──
log "Step 7: Setting mailbox quotas..."
docker compose exec -T mailserver setup quota set support@hireadda.in 5G
docker compose exec -T mailserver setup quota set noreply@hireadda.in 1G
docker compose exec -T mailserver setup quota set admin@hireadda.in 5G
docker compose exec -T mailserver setup quota set dmarc@hireadda.in 1G
log "Quotas set (support/admin: 5GB, noreply/dmarc: 1GB)"

# ── Step 8: Restart to apply all changes ──
log "Step 8: Restarting mailserver to apply changes..."
docker compose restart mailserver
sleep 10

# ── Done ──
echo ""
echo "============================================================"
echo -e "${GREEN}  Mail server setup complete!${NC}"
echo "============================================================"
echo ""
echo "  Accounts created:"
echo "    support@hireadda.in  (password from .env)"
echo "    noreply@hireadda.in  (password: $NOREPLY_PASS)"
echo "    admin@hireadda.in    (password: $ADMIN_PASS)"
echo "    dmarc@hireadda.in    (password: $DMARC_PASS)"
echo ""
echo "  Next steps:"
echo "    1. Add DNS records (see DNS-RECORDS.md)"
echo "    2. Run: make mail-test"
echo "    3. Configure app SMTP with noreply@hireadda.in"
echo ""
echo "  IMPORTANT: Save these passwords securely!"
echo "============================================================"
