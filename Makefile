.PHONY: dev dev-backend dev-frontend build build-backend build-frontend \
       test test-backend test-frontend lint lint-fix format \
       db-push db-migrate db-studio db-seed db-seed-dev \
       docker-up docker-down docker-build clean install help \
       backup-db backup-db-restore backup-db-local \
       backup-cleanup backup-status \
       ssl-init ssl-renew ssl-status ssl-dev \
       mail-setup mail-up mail-down mail-logs mail-test \
       mail-accounts mail-dkim mail-restart mail-add-account \
       monitoring-up monitoring-down monitoring-logs \
       kafka-up kafka-down kafka-logs kafka-topics \
       kafka-create-topics kafka-describe kafka-consumer-lag \
       grafana-reset-pw \
       deploy-dry deploy-backend deploy-frontend deploy-all deploy-status \
       deploy-blue-green deploy-canary deploy-promote deploy-rollback

# ─── Development ─────────────────────────────────────────
dev:                    ## Start both backend and frontend
	npm run dev

dev-backend:            ## Start backend only
	npm run dev:backend

dev-frontend:           ## Start frontend only
	npm run dev:frontend

# ─── Build ───────────────────────────────────────────────
build:                  ## Build both projects
	npm run build

build-backend:          ## Build backend only
	npm run build:backend

build-frontend:         ## Build frontend only
	npm run build:frontend

# ─── Testing ─────────────────────────────────────────────
test:                   ## Run all tests
	npm test

test-backend:           ## Run backend tests
	cd backend && npm test

test-frontend:          ## Run frontend tests
	cd frontend && npm test

test-cov:               ## Run tests with coverage
	cd backend && npm run test:cov
	cd frontend && npm run test:ci

# ─── Code Quality ────────────────────────────────────────
lint:                   ## Lint all workspaces
	npm run lint

lint-fix:               ## Lint and auto-fix
	cd backend && npm run lint:fix
	cd frontend && npm run lint:fix

format:                 ## Format all code with Prettier
	cd backend && npm run format
	cd frontend && npm run format

type-check:             ## Type-check both projects
	cd backend && npm run type-check
	cd frontend && npm run type-check

# ─── Database ────────────────────────────────────────────
db-push:                ## Push Prisma schema to database
	cd backend && npm run db:push

db-migrate:             ## Run Prisma migrations (dev)
	cd backend && npm run db:migrate

db-migrate-prod:        ## Deploy migrations to production
	cd backend && npm run db:migrate:prod

db-studio:              ## Open Prisma Studio
	cd backend && npm run db:studio

db-seed:                ## Seed super admin
	cd backend && npm run db:seed

db-seed-dev:            ## Seed full development data
	cd backend && npm run db:seed:dev

db-generate:            ## Generate Prisma client
	cd backend && npm run db:generate

# ─── Docker (Production) ─────────────────────────────────
docker-up:              ## Start production stack (infra/docker)
	cd infra/docker && docker compose up -d

docker-down:            ## Stop production stack
	cd infra/docker && docker compose down

docker-build:           ## Build production Docker images
	cd infra/docker && docker compose build

docker-logs:            ## View production Docker logs
	cd infra/docker && docker compose logs -f

docker-restart:         ## Restart production stack
	cd infra/docker && docker compose restart

docker-ps:              ## Show running containers
	cd infra/docker && docker compose ps

# ─── Kafka ──────────────────────────────────────────────
kafka-up:               ## Start Kafka broker + exporter
	cd infra/docker && docker compose up -d kafka kafka-exporter

kafka-down:             ## Stop Kafka broker + exporter
	cd infra/docker && docker compose stop kafka kafka-exporter

kafka-logs:             ## View Kafka logs
	cd infra/docker && docker compose logs -f kafka

kafka-topics:           ## List Kafka topics
	cd infra/docker && docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

kafka-create-topics:    ## Create consolidated Kafka topics (ha.users, ha.jobs, etc.)
	cd infra/docker && docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic ha.users --partitions 3 --replication-factor 1 --if-not-exists
	cd infra/docker && docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic ha.jobs --partitions 3 --replication-factor 1 --if-not-exists
	cd infra/docker && docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic ha.applications --partitions 3 --replication-factor 1 --if-not-exists
	cd infra/docker && docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic ha.notifications --partitions 3 --replication-factor 1 --if-not-exists
	cd infra/docker && docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic hire-adda.dlq --partitions 1 --replication-factor 1 --if-not-exists

kafka-describe:         ## Describe all Kafka topics with partition details
	cd infra/docker && docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe

kafka-consumer-lag:     ## Check consumer group lag
	cd infra/docker && docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group hire-adda-backend-group --describe

# ─── Monitoring ─────────────────────────────────────────
monitoring-up:          ## Start monitoring stack (Prometheus + Grafana + Loki)
	cd infra/docker && docker compose up -d prometheus grafana loki promtail node-exporter redis-exporter kafka-exporter

monitoring-down:        ## Stop monitoring stack
	cd infra/docker && docker compose stop prometheus grafana loki promtail node-exporter redis-exporter kafka-exporter

monitoring-logs:        ## View monitoring stack logs
	cd infra/docker && docker compose logs -f prometheus grafana loki promtail

grafana-reset-pw:       ## Reset Grafana admin password (PASS=newpassword)
	cd infra/docker && docker compose exec grafana grafana cli admin reset-admin-password $(PASS)

# ─── VPS Deploy (Blue-Green / Canary / Rolling) ───────
deploy-dry:             ## Dry-run deploy (show what would happen)
	bash infra/scripts/deploy.sh --strategy blue-green --backend-tag latest --frontend-tag latest --dry-run

deploy-backend:         ## Deploy backend only (blue-green)
	bash infra/scripts/deploy.sh --strategy blue-green --backend-tag latest

deploy-frontend:        ## Deploy frontend only (blue-green)
	bash infra/scripts/deploy.sh --strategy blue-green --frontend-tag latest

deploy-all:             ## Deploy both backend and frontend (blue-green)
	bash infra/scripts/deploy.sh --strategy blue-green --backend-tag latest --frontend-tag latest

deploy-blue-green:      ## Blue-green deploy (zero-downtime instant swap)
	bash infra/scripts/deploy.sh --strategy blue-green --backend-tag latest --frontend-tag latest

deploy-canary:          ## Canary deploy (20% traffic to new version)
	bash infra/scripts/deploy.sh --strategy canary --backend-tag latest --frontend-tag latest --canary-weight 20

deploy-promote:         ## Promote canary to 100% traffic
	bash infra/scripts/deploy.sh --promote

deploy-rollback:        ## Instant rollback to previous version
	bash infra/scripts/deploy.sh --rollback

deploy-status:          ## Show deployment state (active color, tags, weights)
	bash infra/scripts/deploy.sh --status

# ─── Backup & Recovery ──────────────────────────────────
# Automated: BullMQ runs pg_dump → R2 daily at 2AM UTC
# Manual: Use these commands from your local machine
backup-db:              ## Create DB backup locally (pg_dump → ./backups/)
	bash infra/scripts/db-backup.sh

backup-db-restore:      ## Restore database from local backup (FILE=path/to/backup.sql.gz)
	bash infra/scripts/db-restore.sh $(FILE) --confirm

backup-cleanup:         ## Remove old local backups beyond retention period
	bash infra/scripts/backup-cleanup.sh

backup-status:          ## Show last automated backup timestamps from Redis
	@echo "=== Backup Status (Redis) ===" && \
	cd backend && node -e " \
		const Redis = require('ioredis'); \
		const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379'); \
		Promise.all([ \
			r.get('backup:last-success:db'), \
			r.get('backup:last-failure:db'), \
			r.get('backup:last-success:cleanup'), \
		]).then(([ds,df,cl]) => { \
			console.log('DB last success:       ', ds || 'never'); \
			console.log('DB last failure:       ', df || 'none'); \
			console.log('Cleanup last run:      ', cl || 'never'); \
			r.quit(); \
		}).catch(e => { console.error(e.message); r.quit(); }); \
	"

# ─── SSL / Let's Encrypt ───────────────────────────────
ssl-init:               ## Request initial Let's Encrypt certs for hireadda.in
	cd infra/docker && docker compose exec certbot certbot certonly --webroot \
		-w /var/www/certbot \
		-d hireadda.in -d www.hireadda.in -d api.hireadda.in -d grafana.hireadda.in \
		--agree-tos --non-interactive --email $(EMAIL)

ssl-renew:              ## Force certificate renewal
	cd infra/docker && docker compose exec certbot certbot renew --webroot -w /var/www/certbot
	cd infra/docker && docker compose exec nginx nginx -s reload

ssl-status:             ## Show certificate expiry dates
	cd infra/docker && docker compose exec certbot certbot certificates

ssl-dev:                ## Generate self-signed certs for local development
	cd infra/docker/nginx/ssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
		-keyout privkey.pem -out fullchain.pem -subj "/CN=localhost"

# ─── Mail Server (Docker Mailserver) ──────────────────────
mail-setup:             ## Initial mail server setup (accounts, DKIM, aliases)
	cd infra/mail && bash setup.sh

mail-up:                ## Start mail server
	cd infra/mail && docker compose up -d

mail-down:              ## Stop mail server
	cd infra/mail && docker compose down

mail-restart:           ## Restart mail server
	cd infra/mail && docker compose restart mailserver

mail-logs:              ## View mail server logs
	cd infra/mail && docker compose logs -f mailserver

mail-test:              ## Test mail server connectivity and configuration
	cd infra/mail && bash test.sh

mail-accounts:          ## List all email accounts
	cd infra/mail && docker compose exec mailserver setup email list

mail-dkim:              ## Show DKIM DNS record
	cd infra/mail && docker compose exec mailserver cat /tmp/docker-mailserver/opendkim/keys/hireadda.in/mail.txt

mail-add-account:       ## Add new email account (EMAIL=user@hireadda.in PASS=password)
	cd infra/mail && docker compose exec -T mailserver setup email add $(EMAIL) $(PASS)

# ─── Maintenance ─────────────────────────────────────────
install:                ## Install all dependencies
	npm install

clean:                  ## Clean all build artifacts and node_modules
	npm run clean

# ─── Help ────────────────────────────────────────────────
help:                   ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
