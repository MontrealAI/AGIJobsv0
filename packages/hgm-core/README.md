# AGI Jobs v0 (v2) — Higher Governance Machine Core

[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![Python unit tests](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)

`packages/hgm-core` is the Python package that powers the Higher Governance Machine (HGM). It implements Thompson-sampling-based
search, widening heuristics, and ROI-aware pruning that the orchestrator and thermostat services consume to steer missions safely.

## Capabilities

- **Concurrency-safe engine** – `HGMEngine` tracks agent nodes, applies widening rules, and evaluates rewards while guarding
  against concurrent mutation using asyncio locks.【F:packages/hgm-core/src/hgm_core/engine.py†L15-L118】
- **Callbacks for observability** – Expansion/evaluation callbacks let the orchestrator stream metrics to sentinel monitors and
  telemetry sinks without blocking core scheduling.【F:packages/hgm-core/src/hgm_core/engine.py†L19-L118】
- **Beta-posterior sampling** – `sampling.py` provides Thompson sampling primitives with deterministic RNG seeding so CI runs are
  reproducible.【F:packages/hgm-core/src/hgm_core/sampling.py†L1-L140】
- **Comparative performance metrics** – `cmp.py` encodes cumulative mean performance snapshots used by the thermostat and
  sentinel monitors to decide when to prune agents.【F:packages/hgm-core/src/hgm_core/cmp.py†L1-L160】

## Layout

| Path | Description |
| ---- | ----------- |
| `src/hgm_core/engine.py` | HGM engine entry point (state machine, sampling, pruning). |
| `src/hgm_core/config.py` | Typed dataclasses describing tuning knobs (widening alpha, priors, thresholds). |
| `src/hgm_core/types.py` | Pydantic dataclasses for agent nodes and metadata. |
| `src/hgm_core/sampling.py` | Thompson sampling + beta posterior helpers. |
| `src/hgm_core/cmp.py` | Comparative metrics tracker backing ROI dashboards. |
| `tests/` | Pytest suite covering sampling maths and engine state transitions. |

## Using the engine

```python
from hgm_core.engine import HGMEngine
from hgm_core.config import EngineConfig

engine = HGMEngine(EngineConfig(seed=42))
next_action = await engine.next_action("mission/root", ["expand-l2", "harvest"])
await engine.record_expansion("mission/root", next_action, payload={"score": 0.71})
await engine.record_evaluation("mission/root/expand-l2", reward=0.9, weight=2.0)
snapshot = await engine.snapshot()
```

The orchestrator wires callbacks to `observe_expansion` / `observe_evaluation` so sentinel monitors can react in real time.

## Tests & CI

Run the local suite with:

```bash
pip install -r requirements-python.txt
pytest packages/hgm-core/tests -q
```

CI v2 executes these tests inside `ci (v2) / Python unit tests`, and the coverage job enforces global thresholds before merging.【F:.github/workflows/ci.yml†L118-L349】

## Extending HGM

1. Add new configuration parameters to `EngineConfig` and update its validators.
2. Extend `HGMEngine` with the necessary state or callbacks.
3. Write tests mirroring production behaviour in `packages/hgm-core/tests` and regenerate coverage artefacts with
   `npm run coverage`.
4. Update downstream orchestrator or thermostat modules to consume the new metrics so owner dashboards stay accurate.

The core module remains lightweight, deterministic, and fully covered, ensuring the superintelligent machine’s governance layer
responds instantly to owner-issued directives.
