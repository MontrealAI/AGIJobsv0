# Culture Studio UI

A Vite + React control room for CULTURE-v0 that lets owners:

- Stream new knowledge artifacts through a chat-style assistant, upload them to IPFS, and mint them on the CultureRegistry.
- Visualise the CultureRegistry network with an interactive influence graph and one-click derivative job shortcuts.
- Launch arena rounds with a guided wizard, live telemetry charts, and an owner control panel for pausing or re-tuning success targets.

## Getting started

```bash
npm install
npm run dev
```

The UI expects the orchestrator and indexer mock services exposed by `server.mjs`, but the interface will fall back to friendly demo data if they are unavailable.

## Cypress end-to-end tests

```bash
npm run preview
npx cypress run --config-file ../../../../cypress.config.ts --project .
```

The tests stub orchestrator endpoints to exercise the Create Artifact and Self-Play Arena flows with non-technical copy and responsive layout checks.
