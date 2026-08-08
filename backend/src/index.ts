// Trigger CI/CD rebuild again after postgres migration and backend tag fix in migration and nginx policy fix and canary comparison fix
// Trigger CI/CD rebuild — refresh ghcr-credentials after VPS reboot (token expired during downtime)
// Trigger CI/CD rebuild again — full pipeline (backend + frontend builds + deploy-k8s)
// Trigger CI/CD rebuild — verify deploy-k8s SSH after MaxAuthTries fix and IdentitiesOnly flag
// Trigger CI/CD rebuild — alertmanager webhook 403 fix (mount route before CSRF)
// Trigger CI/CD rebuild — re-run full pipeline after SiLinkedin → FaLinkedinIn fix
// Trigger CI/CD rebuild — full pipeline (backend + frontend) with command-palette SSR fix
// Trigger CI/CD rebuild — CD for 6365b7e (root loading.tsx removal) was cancelled by
// concurrency cancel-in-progress when 27e1f97 pushed moments later, so no frontend
// image was ever built from it. Rebuilding both images from current main.
import './server';
