#!/bin/bash
# ============================================================
# Mail Server Verification Script
# Tests connectivity, DNS, and mail sending capability
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { echo -e "  ${RED}FAIL${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC} $1"; }

FAILURES=0

echo "============================================================"
echo "  Mail Server Verification — hireadda.in"
echo "============================================================"
echo ""

# ── 1. Container Running ──
echo "[1/8] Container status..."
if docker compose ps mailserver 2>/dev/null | grep -q "running"; then
    pass "Mailserver container is running"
else
    fail "Mailserver container is NOT running"
    echo "  Run: make mail-up"
    exit 1
fi

# ── 2. Port Checks ──
echo "[2/8] Port connectivity..."
for port in 25 465 587 993; do
    if docker compose exec -T mailserver ss -tlnp | grep -q ":${port} " 2>/dev/null; then
        pass "Port $port is listening"
    else
        fail "Port $port is NOT listening"
    fi
done

# ── 3. DNS: MX Record ──
echo "[3/8] DNS MX record..."
MX=$(dig MX hireadda.in +short 2>/dev/null || echo "")
if echo "$MX" | grep -qi "mail.hireadda.in"; then
    pass "MX record points to mail.hireadda.in"
else
    fail "MX record not found or incorrect: $MX"
fi

# ── 4. DNS: SPF Record ──
echo "[4/8] DNS SPF record..."
SPF=$(dig TXT hireadda.in +short 2>/dev/null || echo "")
if echo "$SPF" | grep -q "v=spf1"; then
    pass "SPF record exists"
else
    fail "SPF record not found"
fi

# ── 5. DNS: DKIM Record ──
echo "[5/8] DNS DKIM record..."
DKIM=$(dig TXT mail._domainkey.hireadda.in +short 2>/dev/null || echo "")
if echo "$DKIM" | grep -q "v=DKIM1"; then
    pass "DKIM record exists"
else
    fail "DKIM record not found (add it from: make mail-dkim)"
fi

# ── 6. DNS: DMARC Record ──
echo "[6/8] DNS DMARC record..."
DMARC=$(dig TXT _dmarc.hireadda.in +short 2>/dev/null || echo "")
if echo "$DMARC" | grep -q "v=DMARC1"; then
    pass "DMARC record exists"
else
    fail "DMARC record not found"
fi

# ── 7. SSL Certificate ──
echo "[7/8] SSL certificate..."
if docker compose exec -T mailserver openssl s_client -connect localhost:993 -servername mail.hireadda.in </dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
    pass "SSL certificate is valid"
else
    warn "SSL certificate may not be valid (check manually)"
fi

# ── 8. Email Accounts ──
echo "[8/8] Email accounts..."
ACCOUNTS=$(docker compose exec -T mailserver setup email list 2>/dev/null || echo "")
if echo "$ACCOUNTS" | grep -q "support@hireadda.in"; then
    pass "support@hireadda.in exists"
else
    fail "support@hireadda.in not found"
fi
if echo "$ACCOUNTS" | grep -q "noreply@hireadda.in"; then
    pass "noreply@hireadda.in exists"
else
    fail "noreply@hireadda.in not found"
fi

# ── Summary ──
echo ""
echo "============================================================"
if [ $FAILURES -eq 0 ]; then
    echo -e "  ${GREEN}All checks passed!${NC}"
else
    echo -e "  ${RED}$FAILURES check(s) failed${NC}"
fi
echo ""
echo "  Next: Send a test email to https://www.mail-tester.com"
echo "  to check your deliverability score (aim for 9+/10)"
echo "============================================================"
