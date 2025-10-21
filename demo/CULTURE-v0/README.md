# CULTURE Demo (v0)

This directory scaffolds the CULTURE demonstration for AGI Jobs v0 (v2). It documents the
architecture, task breakdown, and quality guardrails required to deliver the cultural
accumulation and self-play capabilities highlighted in the sprint description.

The deliverable intentionally emphasises extreme clarity and operational readiness so that
a non-technical owner can supervise implementation and operation of the demo. The files in
this folder provide:

- A comprehensive sprint plan with deeply cross-checked subtasks.
- Operational runbooks and configuration templates for one-click deployments.
- Reference implementations and TypeScript helpers that encode the critical control loops
  (Elo rating, difficulty thermostat) in a testable fashion.

> **Note**: The repository still requires full integration work to stitch these components
> into the broader AGI Jobs v0 (v2) platform. The sprint artefacts here are designed so that
> implementation teams can proceed deterministically without ambiguity.

## Contents

- [`RUNBOOK.md`](./RUNBOOK.md) – Owner-facing operational guidance and emergency controls.
- [`SPRINT_PLAN.md`](./SPRINT_PLAN.md) – Ultra-rigorous breakdown of all engineering workstreams.
- [`docker-compose.yml`](./docker-compose.yml) and [`.env.example`](./.env.example) – Deployment
  skeleton for orchestrator, indexer, UI, and ancillary services.
- [`contracts/`](./contracts/) – Solidity scaffolding for `CultureRegistry` and `SelfPlayArena`.
- [`backend/arena-orchestrator/`](./backend/arena-orchestrator/) – TypeScript modules with core
  adaptive loops and comprehensive unit tests.
- [`indexers/culture-graph-indexer/`](./indexers/culture-graph-indexer/) – Reference schema and
  handlers for the culture graph API.
- [`apps/culture-studio/`](./apps/culture-studio/) – Placeholder UI wiring, including Cypress test
  shells that encode expected user journeys.

Each component intentionally includes explicit TODOs and verification gates so that future
contributors maintain the extreme standard of robustness required by the CULTURE initiative.
