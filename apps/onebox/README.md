# AGI Jobs v0 (v2) — Onebox Next.js Console

[![Webapp](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml)
[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)

The Onebox console is a Next.js 14 operator UI that guides mission owners through orchestrating jobs, staking, and governance
scenarios. It renders streamed transcripts from the TypeScript orchestrator SDK, exposes onboarding for non-technical operators,
and pulls live contract metadata from environment/runtime configuration.

## Features

- **Mission cockpit** – `OneBoxMissionPanel` curates prompts, quick actions, and ENS onboarding for operators, while
  `ChatWindow` streams the ICS transcript returned by the orchestrator router.【F:apps/onebox/src/app/page.tsx†L1-L60】
- **Runtime configuration** – `readOneboxConfig()` merges server-provided JSON with `NEXT_PUBLIC_*` environment variables to
  surface contract addresses, explorer links, and orchestrator endpoints inside the UI.【F:apps/onebox/src/lib/environment.ts†L1-L120】
- **Governance intelligence** – `lib/governanceScenario.ts` and `lib/governanceSnapshot.ts` hydrate the dashboard with current
  council compositions and snapshot proposals so owners can confirm authority before executing transactions.【F:apps/onebox/src/lib/governanceSnapshot.ts†L1-L160】
- **Health surface** – `lib/orchestratorHealth.ts` polls the orchestrator status API and flags drift for the operator to resolve
  before committing changes.【F:apps/onebox/src/lib/orchestratorHealth.ts†L1-L120】

```mermaid
flowchart LR
    Owner[Owner / Operator] --> UI[Next.js interface]
    UI --> OrchestratorSDK[@agi/orchestrator]
    OrchestratorSDK --> AgentGateway
    UI --> Metrics[Gateway metrics & health]
    Metrics --> UI
```

## Local development

```bash
cd apps/onebox
npm install
npm run dev
```

Set the following env variables to display contract wiring inside the cockpit:

```bash
export NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL="https://orchestrator.local"
export NEXT_PUBLIC_JOB_REGISTRY_ADDRESS=0x...
export NEXT_PUBLIC_SYSTEM_PAUSE_ADDRESS=0x...
```

Run `npm run lint` and `npm run typecheck` before committing; these commands are executed automatically inside `webapp.yml` and
`ci (v2) / Lint & static checks`.

## Testing

Use Vitest or Playwright suites under `test/` to exercise conversational flows. The webapp workflow builds and smoke-tests the
console on every pull request, ensuring the experience stays production-ready.

## Extending the console

1. Add new prompts or panels under `src/components/`.
2. Extend the orchestrator SDK so transcripts include the new capability.
3. Update `readOneboxConfig()` to surface any additional contract addresses required by the feature.
4. Capture UI snapshots for documentation and update `apps/onebox-static` if the static export changes.

The Onebox console remains the fast onboarding surface for the superintelligent machine—keep it aligned with the orchestrator SDK
so operators retain end-to-end visibility and control.
