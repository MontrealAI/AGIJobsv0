# AGI Jobs v0 (v2) — TypeScript Orchestrator SDK

[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![Static analysis](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml)

`packages/orchestrator` exposes the Intent Control Specification (ICS) router and LLM helpers used by front-ends, CLI tooling, and
agent services. It converts high-level intents (create job, stake, dispute) into deterministic execution plans with dry-run
support so operators can preview calldata before broadcast.

## Highlights

- **ICS validation** – `ICSSchema` validates intent payloads (job creation, staking, governance admin) and normalises ENS proofs
  and metadata before execution.【F:packages/orchestrator/src/ics.ts†L1-L120】
- **Router** – `route()` dispatches intents to typed helpers in `tools/`, emitting step-by-step transcripts that the UI renders.
  Every helper exposes `dryRun` and `execute` variants so non-technical owners can approve calldata explicitly.【F:packages/orchestrator/src/router.ts†L1-L67】
- **Governance actions** – `tools/governance.ts` loads on-chain snapshots and prepares admin-set transactions, including
  simulations for owner consoles.【F:packages/orchestrator/src/tools/governance.ts†L1-L200】
- **LLM integrations** – `llm.ts` and `providers/openai.ts` wrap deterministic prompts for the orchestration copilot experience.

```mermaid
flowchart LR
    Intent[Intents JSON] --> Validate[ICSSchema] --> Router[route()] --> Tools
    Tools --> DryRun[Dry run transcript]
    Tools --> Execute[Signed transaction payload]
    DryRun --> UI[Owner console]
    Execute --> Gateway[Agent gateway / CLI]
```

## Usage

```ts
import { ICSSchema, route } from "@agi/orchestrator";

const ics = ICSSchema.parse({
  intent: "create_job",
  params: {
    job: { rewardAGIA: "100", deadline: Date.now() + 86_400_000, spec: { goal: "curate report" } },
  },
});

for await (const line of route(ics)) {
  process.stdout.write(line);
}
```

Callers can consume the async generator to render streaming transcripts in CLIs or web consoles. To execute transactions, invoke
`createJobExecute`, `depositExecute`, or the equivalent helper exported from `tools/**`.

## Testing & linting

```bash
npm install
npm run lint -- --filter packages/orchestrator
npm run test -- --packages orchestrator  # executes vitest suite if defined
```

The SDK is linted in `ci (v2) / Lint & static checks` and type-checked via the shared webapp workflow. Update snapshots in
`packages/orchestrator/__tests__` (if present) whenever command transcripts change so CI stays green.【F:.github/workflows/ci.yml†L44-L70】

## Extending the router

1. Add the new intent shape to `ics.ts` and update the discriminated union.
2. Implement matching helpers under `tools/` with `dryRun`/`execute` exports.
3. Extend `route()` with the new branch so transcripts stream correctly.
4. Regenerate documentation in owner tooling (`npm run owner:diagram`) to surface the new capability.

Keeping this SDK authoritative means every interface—web, CLI, or automated agent—consumes the same deterministic orchestration
logic the owner relies on for safe production roll-outs.
