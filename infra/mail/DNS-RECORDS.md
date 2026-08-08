# DNS Records for hireadda.in Mail Server

Add these records in **Hostinger hPanel > Domain DNS** for `hireadda.in`.

Replace `YOUR_VPS_IP` with your actual Hostinger VPS public IP address.

---

## Required Records

### 1. A Record — Mail Server

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | mail | YOUR_VPS_IP | 3600 |

Points `mail.hireadda.in` to your VPS.

---

### 2. MX Record — Mail Routing

| Type | Name | Value | Priority | TTL |
|------|------|-------|----------|-----|
| MX | @ | mail.hireadda.in | 10 | 3600 |

Tells other mail servers to deliver `@hireadda.in` mail to `mail.hireadda.in`.

---

### 3. SPF Record — Sender Authorization

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | @ | `v=spf1 mx ip4:YOUR_VPS_IP -all` | 3600 |

Authorizes your VPS IP and MX record to send mail for `hireadda.in`. The `-all` means reject all other sources (strict).

---

### 4. DKIM Record — Email Signing

After running `make mail-setup`, get the DKIM key:

```bash
make mail-dkim
```

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | mail._domainkey | (paste the DKIM public key from the command output) | 3600 |

The value will look like: `v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBg...`

**Note:** If the key is too long for a single TXT record, split it into multiple quoted strings (Hostinger may do this automatically).

---

### 5. DMARC Record — Policy & Reporting

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | _dmarc | `v=DMARC1; p=quarantine; sp=quarantine; rua=mailto:dmarc@hireadda.in; ruf=mailto:dmarc@hireadda.in; adkim=s; aspf=s; pct=100; fo=1` | 3600 |

Breakdown:
- `p=quarantine` — Quarantine emails that fail DMARC (start here, upgrade to `reject` after testing)
- `sp=quarantine` — Same policy for subdomains
- `rua=mailto:dmarc@hireadda.in` — Aggregate reports sent to your dmarc account
- `ruf=mailto:dmarc@hireadda.in` — Forensic reports
- `adkim=s` — Strict DKIM alignment
- `aspf=s` — Strict SPF alignment
- `pct=100` — Apply to 100% of messages
- `fo=1` — Generate forensic reports on any failure

---

## Recommended Records

### 6. Reverse DNS (PTR Record)

Set the PTR record for your VPS IP to `mail.hireadda.in` in the **Hostinger VPS control panel** (not in domain DNS). This is critical for deliverability.

Go to: **Hostinger VPS > Settings > Reverse DNS** and set `mail.hireadda.in`.

---

### 7. Autodiscover / Autoconfig (for mail clients)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | autoconfig | mail.hireadda.in | 3600 |
| CNAME | autodiscover | mail.hireadda.in | 3600 |
| SRV | _imaps._tcp | 0 1 993 mail.hireadda.in | 3600 |
| SRV | _submission._tcp | 0 1 587 mail.hireadda.in | 3600 |

These help email clients (Outlook, Thunderbird, mobile) auto-configure.

---

## Verification

After adding all DNS records, wait 15-30 minutes for propagation, then:

```bash
# Verify MX
dig MX hireadda.in +short
# Expected: 10 mail.hireadda.in.

# Verify SPF
dig TXT hireadda.in +short
# Expected: "v=spf1 mx ip4:YOUR_VPS_IP -all"

# Verify DKIM
dig TXT mail._domainkey.hireadda.in +short
# Expected: "v=DKIM1; h=sha256; k=rsa; p=..."

# Verify DMARC
dig TXT _dmarc.hireadda.in +short
# Expected: "v=DMARC1; p=quarantine; ..."

# Verify A record
dig A mail.hireadda.in +short
# Expected: YOUR_VPS_IP

# Verify PTR (reverse DNS)
dig -x YOUR_VPS_IP +short
# Expected: mail.hireadda.in.
```

## Online Verification Tools

After your mail server is running:
- **MX Toolbox:** https://mxtoolbox.com/SuperTool.aspx — check MX, SPF, DKIM, DMARC, blacklists
- **Mail-tester:** https://www.mail-tester.com — send a test email and get a deliverability score
- **DKIM Validator:** https://dkimvalidator.com — verify DKIM signing

## Upgrading DMARC Policy

After 2-4 weeks of monitoring DMARC reports and confirming no legitimate mail is failing:

1. Change `p=quarantine` to `p=reject`
2. This tells receiving servers to outright reject spoofed emails

```
v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@hireadda.in; ruf=mailto:dmarc@hireadda.in; adkim=s; aspf=s; pct=100; fo=1
```
