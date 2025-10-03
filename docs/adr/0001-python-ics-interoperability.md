# ADR 0001: Python ↔ ICS Interoperability

- Status: Accepted
- Date: 2024-10-19
- Authors: Meta-Orchestrator Team
- Supersedes: None

## Context

The FastAPI meta-orchestrator exposes a `plan → simulate → execute → status` pipeline implemented in Python. Plans consist of DAG steps, policy guards and budgets that ultimately have to be executed by the Intent Canonical Schema (ICS) handlers implemented in `packages/orchestrator`. The TypeScript layer owns the canonical ICS schema, streaming UX and transaction choreography, while the Python layer owns natural-language planning, risk simulation and run-state persistence.【F:routes/meta_orchestrator.py†L1-L60】【F:orchestrator/models.py†L42-L113】【F:packages/orchestrator/src/ics.ts†L1-L163】【F:packages/orchestrator/src/llm.ts†L6-L80】

Without an explicit contract the two halves can drift: planners may emit step identifiers or tool names that the ICS router cannot execute, ICS handlers may assume metadata fields (such as `meta.userId`) that planners fail to populate, or simulators may estimate fees with different percentages than the ICS settlement logic. The resulting misalignment would surface as failed confirmations, incorrect validator policies, or unexpected fee drains when governance-approved plans hit production.

## Decision

We codify the following interoperability expectations:

1. **Shared step vocabulary** – Python planners must continue to emit `Step.tool` identifiers that map directly onto ICS router intents (`job.post`, `job.apply`, `validator.quorum`, etc.), preserving the implicit binding between the DAG and the async generators exposed in `packages/orchestrator/src/tools`. Any new step kind or tool name requires a coordinated change to the ICS router switch-case and handler modules.【F:orchestrator/planner.py†L85-L146】【F:packages/orchestrator/src/router.ts†L21-L39】【F:packages/orchestrator/src/tools/job.ts†L15-L151】
2. **Metadata propagation** – Execution requests must preserve `meta.userId`, `meta.traceId` and (when present) `meta.txMode` so the TypeScript layer can select the correct signer, surface confirmations and replay pending intents. The Python runner therefore treats these metadata fields as immutable once a plan is approved and never strips them when marshalling to ICS payloads or storing run state.【F:packages/orchestrator/src/ics.ts†L14-L40】【F:packages/orchestrator/src/llm.ts†L65-L126】【F:orchestrator/models.py†L96-L113】
3. **Policy and budget parity** – Both layers source tool allow/deny lists and daily budget caps from the same JSON configuration so that simulation guarantees match runtime enforcement. Python planners already hydrate `OrchestrationPlan.policies` from `config/policies.default.json`; ICS handlers must treat those values as authoritative when building policy overrides or enforcing spend limits.【F:orchestrator/models.py†L90-L113】【F:config/policies.default.json†L1-L7】【F:packages/orchestrator/src/tools/job.ts†L22-L50】
4. **Fee schedule alignment** – The simulator’s fee and burn percentages come from `orchestrator/config.get_fee_fraction()`/`get_burn_fraction()` which read JSON and environment overrides. ICS handlers that escrow rewards or validate budgets rely on the same percentages via policy helpers; any change to fee sourcing must update both layers together.【F:orchestrator/simulator.py†L1-L58】【F:orchestrator/config.py†L60-L85】【F:packages/orchestrator/src/tools/job.ts†L22-L50】
5. **Streaming contract** – Python runners consume the ICS handler output as streaming text logs and must tolerate multi-phase confirmations (pending intent cache, human confirmation, final execution). The ADR therefore locks in the expectation that ICS handlers remain async generators of newline-delimited status messages, and that Python-side status logs surface them verbatim without truncation.【F:packages/orchestrator/src/llm.ts†L25-L125】【F:packages/orchestrator/src/router.ts†L21-L39】【F:orchestrator/runner.py†L1-L78】

## Consequences

- Coordinated schema evolution becomes part of the change-management checklist: planners cannot ship new step kinds without a matching ICS handler PR and vice versa.
- Run metadata becomes a compatibility surface; observability tooling can rely on `traceId` and `userId` fields surviving the entire orchestration lifecycle.
- Governance sign-off on fee or tool policy changes requires verifying both Python (`config/*.json`) and TypeScript (`policyManager`) consumption, preventing silent drift.
- Testing must cover end-to-end plan execution, asserting that a Python-generated plan yields successful ICS handler output for each supported intent.

## Alternatives considered

- **Duplication of ICS schema in Python** – Rejected to avoid divergence. We instead treat the TypeScript definition as source of truth and keep Python focused on plan synthesis and simulation.
- **Synchronising via generated gRPC interfaces** – Deferred; current HTTP/JSON contract is sufficient given the streaming model and the desire to keep the LLM planner decoupled from blockchain dependencies.

## Status

Accepted. Future ADRs should amend this decision if we migrate the runner into the TypeScript layer or adopt a unified codebase for ICS execution.
