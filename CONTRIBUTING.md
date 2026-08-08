# Contributing to Hire Adda (Internal)

Hire Adda is **proprietary, closed-source software**. This document is for
authorized team members — employees, contractors, and approved collaborators
who already have access to the private repository. Public pull requests and
forks are not accepted; the codebase is not licensed for redistribution.

If you are not on the team and arrived here by mistake, please see the
[LICENSE](LICENSE) file.

---

## Getting Repository Access

Repository access is granted by the tech lead. New team members should:

1. Send your GitHub username to the tech lead at `support@hireadda.in`.
2. Accept the GitHub invitation to the `dev-technotaau/hire-adda` org.
3. Generate an SSH key and add it to your GitHub account.

Do **not** mirror, clone to public hosting, or share the repository URL
outside the team.

---

## Local Setup

```bash
git clone git@github.com:dev-technotaau/hire-adda.git
cd hire-adda
npm install      # installs root + backend + frontend (npm workspaces)
```

Required tooling: Node 18+, Docker, kubectl, Make. See [README.md](README.md)
for full prerequisites and `make help` for available targets.

---

## Branch & PR Workflow

We work directly off the canonical repository — **do not fork**.

1. Pull the latest `main`:
   ```bash
   git checkout main && git pull --rebase
   ```
2. Create a topic branch:
   ```bash
   git checkout -b <type>/<short-description>
   # e.g. feat/whatsapp-otp, fix/login-redirect-loop, chore/bump-prisma
   ```
3. Make focused commits. Keep unrelated changes in separate branches.
4. Push and open a PR against `main`:
   ```bash
   git push -u origin <branch>
   gh pr create
   ```
5. Fill in the PR description: **what** changed, **why**, and any **risk**
   (data migration, prod-only behavior, third-party calls). Link the
   ticket/issue if applicable.
6. Request review from at least one peer; security-sensitive changes
   (auth, RBAC, secrets, infra) require tech-lead approval.
7. Merge with **squash & merge** once CI is green and review is approved.
   Delete the branch after merge.

### CI gates

The PR must pass:

- ESLint + Prettier (root + backend + frontend)
- TypeScript type-check
- Jest tests (backend + frontend)
- `commitlint` against the conventional-commits config

The pre-commit + commit-msg Husky hooks already enforce these locally.

---

## Commit Message Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/), enforced
by `@commitlint/config-conventional`. Format:

```
<type>(<scope>): <subject>

[optional body explaining the WHY, not the WHAT]

[optional footer: Closes #123, BREAKING CHANGE: …]
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`,
`build`, `ci`, `revert`, `style`.

Allowed scopes (configured in `commitlint.config.cjs`): `backend`,
`frontend`, `api`, `auth`, `jobs`, `candidate`, `employer`, `admin`, `db`,
`infra`, `ci`, `deps`, `config`, `ui`, `seo`, `a11y`, `perf`, `security`.

Examples:

```
feat(jobs): add radius filter to candidate search
fix(auth): refresh-token leak on logout race
chore(deps): bump prisma to 7.4
```

Never bypass hooks (`--no-verify`) without tech-lead approval — fix the
underlying lint/test failure.

---

## Code Standards

- TypeScript strict mode is enforced; no `any` without a `// reason: …`
  comment.
- Backend errors must use `AppError(message, statusCode, 'ERROR_CODE')` and
  flow through the central error middleware.
- Frontend network calls go through the typed axios client + React Query
  hooks; do not hand-roll `fetch` in components.
- Secrets never go in committed files. Sealed via `kubeseal` for K8s, or
  injected via env at runtime. Run `git secrets --scan` if unsure.
- Database migrations: edit `schema.prisma`, then
  `npm run db:migrate --workspace=backend`. Review the generated SQL
  before merging — destructive migrations must be reviewed by tech lead.

---

## Security & Confidentiality

This codebase contains business logic, customer data handling, and
infrastructure secrets. Do **not**:

- Paste source, configuration, or logs into public chats, paste sites, AI
  tools, or screenshots without redacting secrets.
- Push WIP branches to public mirrors.
- Share screen recordings of the codebase outside the team.

Report a suspected leak or vulnerability to `security@hireadda.in`
immediately — do not file it as a public issue.

---

## Reporting Issues Internally

Internal bug reports and feature requests go in our project tracker (Linear
/ GitHub Issues, ask the tech lead for the link), not in public channels.
Customer-facing bugs found in production should be reported to the on-call
engineer first via the team's incident-response channel.

---

## Code of Conduct

All contributors are expected to follow the company's professional conduct
standards documented in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
