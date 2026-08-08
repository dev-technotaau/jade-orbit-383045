# Disaster Recovery Runbook — Hire Adda

## Infrastructure Overview

| Component          | Type                 | Location | Backup Method                             |
| ------------------ | -------------------- | -------- | ----------------------------------------- |
| Backend + Frontend | K3s Deployments      | VPS      | Velero (daily)                            |
| PostgreSQL         | K3s StatefulSet      | VPS      | pg_dump CronJob (daily 2AM) + Velero      |
| Redis              | K3s StatefulSet      | VPS      | Not critical (cache, rebuilds on startup) |
| OpenSearch         | K3s StatefulSet      | VPS      | Snapshot CronJob (daily 3AM) + Velero     |
| Mail Server        | Docker Compose       | VPS      | Docker volumes (manual)                   |
| Kafka              | Managed (Aiven)      | External | Aiven handles                             |
| DNS                | Cloudflare/Registrar | External | Export zone file                          |

---

## Scenario 1: Single Pod Crash

**Impact:** Brief service interruption (10-30 seconds)
**Detection:** Prometheus alert: `PodCrashLooping`
**Action:** None required — K3s auto-restarts the pod.
**Verify:** `kubectl get pods -n hire-adda`

---

## Scenario 2: Database Corruption

**Impact:** Application errors, data loss
**Detection:** Backend readiness probe fails, Prometheus alert: `DatabaseDown`

**Recovery Steps:**

1. Identify the issue: `kubectl logs statefulset/postgres -n hire-adda`
2. List available backups: `ls /opt/k3s-storage/backups/db/`
3. Stop the backend: `kubectl scale deploy/backend -n hire-adda --replicas=0`
4. Restore from backup:

   ```bash
   # From CronJob backup
   kubectl exec -i statefulset/postgres -n hire-adda -- \
     psql -U postgres -d hireadda < /backups/db/hire_adda_YYYYMMDD_HHMMSS.sql.gz

   # OR from Velero
   velero restore create --from-backup daily-full-backup-YYYYMMDD
   ```

5. Restart backend: `kubectl scale deploy/backend -n hire-adda --replicas=1`
6. Verify: `curl https://api.hireadda.in/health`

**RTO:** 10-20 minutes
**RPO:** Up to 24 hours (daily backup)

---

## Scenario 3: OpenSearch Data Loss

**Impact:** Search degradation (app still works, just no search results)
**Detection:** Prometheus alert: `OpenSearchDown`

**Recovery Steps:**

1. Check cluster health: `kubectl exec statefulset/opensearch -n hire-adda -- curl localhost:9200/_cluster/health`
2. Restore from snapshot:
   ```bash
   kubectl exec statefulset/opensearch -n hire-adda -- \
     curl -X POST "localhost:9200/_snapshot/hireadda_snapshots/snapshot_YYYYMMDD/_restore?wait_for_completion=true"
   ```
3. OR let backend auto-reindex on restart:
   ```bash
   kubectl rollout restart deploy/backend -n hire-adda
   ```

**RTO:** 5-15 minutes (auto-reindex from DB)
**RPO:** Zero (reindexes from PostgreSQL)

---

## Scenario 4: Redis Failure

**Impact:** Degraded performance, BullMQ jobs pause, no caching
**Detection:** Prometheus alert: `RedisDown`, backend health shows Redis error

**Recovery Steps:**

1. Redis will auto-restart via K3s StatefulSet
2. If PVC is corrupted:
   ```bash
   kubectl delete pvc redis-data-redis-0 -n hire-adda
   kubectl delete statefulset redis -n hire-adda
   kubectl apply -f infra/k8s/apps/redis/
   ```
3. BullMQ jobs will resume automatically when Redis reconnects

**RTO:** 1-5 minutes (auto-restart)
**RPO:** N/A (Redis is cache + queue, not source of truth)

---

## Scenario 5: Full VPS Failure (Total Loss)

**Impact:** Complete outage
**Detection:** All monitoring alerts fire, site unreachable

**Recovery Steps:**

1. **Provision new VPS** (Hostinger panel, 16GB RAM, Ubuntu 22.04)
2. **Harden server:**
   ```bash
   cd infra/ansible
   # Update inventory with new IP
   ansible-playbook -i inventory/production.ini playbooks/01-harden.yml
   ansible-playbook -i inventory/production.ini playbooks/02-k3s-install.yml
   ansible-playbook -i inventory/production.ini playbooks/03-post-install.yml
   ```
3. **Install Velero:**
   ```bash
   helm install velero vmware-tanzu/velero \
     --namespace velero -f infra/k8s/backup/velero-values.yaml
   ```
4. **Restore from Velero backup:**
   ```bash
   velero backup get  # List available backups
   velero restore create --from-backup daily-full-backup-YYYYMMDD
   ```
5. **Restore database:**
   ```bash
   # Velero restores the PVCs, but for consistency:
   kubectl exec -i statefulset/postgres -n hire-adda -- \
     psql -U postgres -d hireadda < /backups/db/latest.sql.gz
   ```
6. **Reinstall Helm charts:**
   ```bash
   helm install cert-manager jetstack/cert-manager --namespace cert-manager --set installCRDs=true
   helm install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx -f ...
   helm install kube-prometheus prometheus-community/kube-prometheus-stack -n monitoring -f ...
   helm install argocd argo/argo-cd --namespace argocd -f ...
   ```
7. **Restore mail server:**
   ```bash
   cd infra/mail
   docker compose up -d
   ```
8. **Update DNS** to point to new VPS IP
9. **Verify all endpoints:**
   ```bash
   curl https://hireadda.in
   curl https://api.hireadda.in/health
   curl https://mail.hireadda.in
   ```

**RTO:** 30-60 minutes
**RPO:** Up to 24 hours (daily Velero + pg_dump)

---

## Scenario 6: Security Breach / Ransomware

**Impact:** Compromised data, possible data exfiltration

**Response Steps:**

1. **Isolate:** Disable all UFW rules except SSH from admin IP
   ```bash
   sudo ufw reset
   sudo ufw allow from YOUR_IP to any port 22
   sudo ufw enable
   ```
2. **Assess:** Check audit logs, K8s events, auth logs
   ```bash
   kubectl get events -A --sort-by=.metadata.creationTimestamp
   sudo journalctl -u k3s --since "1 hour ago"
   cat /var/log/auth.log | tail -100
   ```
3. **Contain:** Stop compromised pods, rotate all secrets
4. **Recover:** Follow Scenario 5 (full rebuild from Velero backup)
5. **Verify:** Ensure backups in R2 are not compromised (check R2 versioning)

---

## Backup Verification Checklist

Run monthly:

- [ ] `velero backup get` — recent backups exist and completed
- [ ] Test restore to separate namespace: `velero restore create --from-backup <name> --namespace-mappings hire-adda:test-restore`
- [ ] Verify pg_dump backups: `ls -la /opt/k3s-storage/backups/db/`
- [ ] Verify OpenSearch snapshots: `curl opensearch:9200/_snapshot/hireadda_snapshots/_all`
- [ ] Verify R2 bucket has recent uploads
- [ ] Test DNS failover process

---

## Contacts

| Role          | Contact                 |
| ------------- | ----------------------- |
| VPS Provider  | Hostinger support panel |
| Domain/DNS    | Registrar admin panel   |
| Kafka (Aiven) | Aiven console           |
| On-call       | TBD                     |
