# SSL Certificate Placeholder

Place your SSL certificates here:

- `fullchain.pem` - Full certificate chain
- `privkey.pem` - Private key

## For Development (Self-Signed)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem -out fullchain.pem \
  -subj "/CN=localhost"
```

## For Production (Let's Encrypt)

Certificates are managed automatically by the certbot container in docker-compose.

### Initial Setup

Start nginx + certbot to obtain the first certificate:

```bash
# 1. Start services (certbot will auto-request certs)
make docker-up

# 2. Or manually request via certbot container
docker compose exec certbot certbot certonly --webroot \
  -w /var/www/certbot \
  -d hireadda.in \
  -d www.hireadda.in \
  -d api.hireadda.in \
  --email your-email@hireadda.in \
  --agree-tos \
  --non-interactive
```

### Renewal

Certbot container automatically attempts renewal every 12 hours.
After renewal, nginx reloads via the entrypoint command.

### Manual Renewal

```bash
make ssl-renew
```

### Certificate Location

Certificates are stored in the `certbot/conf/` volume and symlinked to:

- `/etc/nginx/ssl/fullchain.pem`
- `/etc/nginx/ssl/privkey.pem`
