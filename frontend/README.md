# Frontend

The Next.js operator console for the WhatsApp Cloud Module.

Setup, configuration, deployment and architecture all live in the
[root README](../README.md) — this workspace is not meant to be run or
configured on its own.

Two conventions that bite people editing this workspace:

- The middleware file is **`src/proxy.ts`**, not `middleware.ts`. That is
  deliberate and it is the active middleware.
- Do **not** add `src/app/loading.tsx`. A root loading UI wraps the page in a
  Suspense boundary, which streams content into a hidden div revealed by an
  inline script — invisible to anything that does not execute JavaScript.
