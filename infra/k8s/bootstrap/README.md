# `infra/k8s/bootstrap` — manually-applied manifests

Everything in this directory is applied **by hand**. No ArgoCD Application
syncs this path, and that is deliberate.

Verified app source paths (none of them is `bootstrap`):

```
infra/k8s/apps        infra/k8s/logging      infra/k8s/monitoring
infra/k8s/backup      infra/k8s/mail-tls     infra/k8s/security
infra/k8s/ingress
```

## Why these can't be GitOps-managed

**`argocd-repo-credentials.sealed.yaml`** — the credential ArgoCD uses to clone
this repository, now that it is private.

Two independent reasons it must never live under a synced path:

1. **Circular dependency.** ArgoCD needs this credential in order to read the
   repo. If the credential were only delivered *through* the repo, a cluster
   rebuild could never bootstrap: ArgoCD couldn't clone the repo to find the
   secret that lets it clone the repo.

2. **Namespace mismatch.** This Secret targets the `argocd` namespace, while
   the `hire-adda-security` Application (which syncs `infra/k8s/security`,
   where this file originally lived) has destination namespace `hire-adda`.
   ArgoCD would flag the mismatch rather than apply it.

There was also a near-miss worth recording: `hire-adda-security` syncs with
`directory.recurse=true` **and** `syncPolicy.automated` (prune + selfHeal), so
any `*.yaml` placed there is applied automatically within minutes. An earlier
draft of this manifest carried `REPLACE_ME` placeholders; had it been committed
there as `.yaml`, the sealed-secrets controller would have failed to decrypt it
and taken the Application Degraded. Hence the `.template` extension on the
recipe file, and hence this directory.

## Files

| file | purpose |
|---|---|
| `argocd-repo-credentials.yaml.template` | the generator recipe — how to mint and seal the credential, which PAT scope and which account to use |
| `argocd-repo-credentials.sealed.yaml` | the **live** sealed credential, kept as a disaster-recovery copy |

## Is the sealed copy safe to commit?

Yes. SealedSecret payloads are RSA-encrypted against **this cluster's**
sealed-secrets private key and are additionally bound to the exact
`namespace/name` pair (`argocd/argocd-repo-hire-adda`). The ciphertext is
useless to anyone without that key, and cannot be re-targeted at a different
namespace or name even with it.

The **raw PAT** is never committed and never should be.

## Restore procedure (cluster rebuild / DR)

The sealed key pair was migrated from the previous VPS, so blobs sealed against
either cluster decrypt on both. If that ever stops being true, the sealed copy
below is worthless and the credential must be regenerated from the `.template`
recipe with a fresh PAT.

```bash
kubectl apply -f argocd-repo-credentials.sealed.yaml

# the controller must materialise a real Secret carrying the discovery label —
# ArgoCD finds repo credentials ONLY via this label, and a missing one fails
# silently: the app looks healthy until the first fetch returns 401
kubectl get secret argocd-repo-hire-adda -n argocd \
  -o jsonpath='{.metadata.labels}'

kubectl get applications -n argocd     # all 7 → Synced / Healthy
```

## Rotating the PAT

Follow the recipe in the `.template`, then overwrite
`argocd-repo-credentials.sealed.yaml` with the new output and commit it.
Rotation is a re-seal, never an edit — the encrypted values cannot be
hand-modified.
