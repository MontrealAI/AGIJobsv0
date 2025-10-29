# Ultra-Deep Planning Log — AGI Alpha Node Demo Upgrade

This log captures the rigorous upfront reasoning requested: every assumption is challenged, every path is double-checked, and verification methods are catalogued before any code is touched.

## Situational Analysis

- **Reality check**: The existing demo already spans ENS verification, staking flows, AI planning, compliance, metrics, Docker, and CI. Incremental work must avoid regressions while elevating the “superintelligent economic engine” narrative. Key risk: introducing complex AI logic that destabilises deterministic tests or operator UX.
- **Ambition alignment**: The ask emphasises MuZero++ world-modelling, antifragile intelligence, and institutional-grade empowerment. The current planner lacks a forward-simulation layer. Filling that gap while keeping the operator experience simple is the highest leverage move.
- **Constraints**: We must remain TypeScript-first, keep `npm run build:agi-alpha-node` + `npm run test:agi-alpha-node` green, and preserve existing CLI/server contracts. Determinism is non-negotiable for CI.
- **Opportunities**: Enhancing planning with a transparent Monte Carlo world-model gives the dashboard a richer story, feeds compliance scoring with deeper intelligence, and lets metrics surface actionable forecasts. This directly shows non-technical operators the power of AGI Jobs v0 (v2).

## Issues & Tasks

**Issue 1 – Missing forward-simulation layer for MuZero++ claims.** Without a world-model, the planner cannot justify long-horizon decisions or quantify downside risk. This undermines the “break capitalism” promise and limits operator insight.
:::task-stub{title="Embed deterministic MuZero-style world-model"}
Step 1. Design a deterministic RNG helper (e.g., Mulberry32) and Monte Carlo simulator that samples job sequences, respecting reward, risk, and discounting (`src/ai/worldModel.ts`).
Step 2. Extend the configuration schema with a new `ai.worldModel` block (horizon, simulations, riskAversion, discountFactor, seed) and normalisation logic (`src/config.ts`, config fixtures, schema tests).
Step 3. Wire the world-model into `AlphaNode.plan` so every planning cycle returns `{summary, insights, worldModel}` and feed metrics/compliance/CLI with the richer data.
Step 4. Update dashboard + server endpoints to surface the projection, ensuring non-technical operators see expected return, downside risk, and best/worst paths.
Step 5. Write exhaustive unit tests for the simulator, planner integration, and compliance scoring updates; re-run CI commands (`npm run build:agi-alpha-node`, `npm run test:agi-alpha-node`).
:::

**Issue 2 – Operator tooling lacks transparency into world-model metrics.** New intelligence must be observable (Prometheus gauges, CLI, compliance). Otherwise, institutions cannot audit or trust the upgrade.
:::task-stub{title="Expose world-model telemetry across UX surfaces"}
Step 1. Add Prometheus gauges (expected return, downside risk, volatility) and update `AlphaNodeMetrics` to publish them.
Step 2. Extend CLI commands (`bootstrap`, `heartbeat`, `compliance`, `jobs autopilot`) and dashboard UI to display world-model summaries with clear messaging.
Step 3. Enhance the compliance scorecard to factor world-model health (e.g., penalise high downside risk, reward strong expected returns) while documenting reasoning in notes.
Step 4. Back the changes with tests covering metrics updates, compliance dimension calculations, and UI JSON rendering stability.
:::

## Verification Toolkit

- **Deterministic simulation tests**: Node’s `node:test` suite with fixed seeds ensures Monte Carlo paths are reproducible. Will compare mean/percentiles computed by code to hand-derived expectations.
- **Static typing & build**: `npm run build:agi-alpha-node` verifies TypeScript integration and catches interface drift.
- **Runtime CLI smoke**: Local `node demo/AGI-Alpha-Node-v0/src/cli.ts heartbeat --config ...` dry-run to eyeball JSON outputs (manual spot-check in addition to automated tests).
- **Prometheus snapshot**: Inspect `metrics.render()` output to confirm new gauges register correctly and emit plausible numbers.
- **Dashboard fetch**: Use `curl localhost:4318/api/heartbeat` (after bootstrap) to ensure JSON includes world-model fields consumed by the UI.

## Assumption Challenges & Contingencies

- **Assumption**: Monte Carlo outputs will remain numerically stable across Node versions. *Challenge*: floating-point variations could break snapshot tests. *Mitigation*: rely on rational arithmetic where possible, round results to fixed precision before assertions.
- **Assumption**: Expanding the plan payload will not break downstream consumers. *Challenge*: Unknown third-party tooling may depend on previous shape. *Mitigation*: Preserve existing keys, only append new `worldModel` field, and document schema in README.
- **Assumption**: Risk-adjusted scoring integrates cleanly into compliance. *Challenge*: Over-penalising risk could cause false alarms. *Mitigation*: Clamp scores, provide descriptive notes, and expose tuning knobs in config if future adjustment is needed.

## Verification Redundancy

For each major change we will:
1. Run automated tests (`npm run test:agi-alpha-node`).
2. Execute targeted manual CLI command to validate JSON semantics.
3. Inspect the dashboard output (HTML) for structural regressions.
4. Review Prometheus metrics text to confirm new gauges exist.

## Final Sanity Check Commitment

After implementation and verification, we will revisit every assumption above to confirm it still holds, explicitly documenting any residual uncertainty before final delivery.
