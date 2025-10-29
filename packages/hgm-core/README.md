# hgm-core

`hgm-core` implements the scheduling primitives shared between the agent
orchestrator and the backend control plane. The package is intentionally
minimalistic and pure Python so it can be embedded in services that do not
ship with the full TypeScript orchestrator runtime.

## Components

- **HGMEngine** – asynchronous safe scheduler that coordinates expansion and
  evaluation phases using Monte-Carlo tree search style widening rules.
- **AgentNode** – dataclass describing the state tracked for each node in the
  search tree including Thompson sampling weights and CMP aggregates.
- **CMP utilities** – helpers to compose cumulative metric propagation results
  across the tree.
- **Thompson sampling** – deterministic wrappers around the Beta distribution
  sampling strategy used by the exploration policy.

## Usage

```python
from hgm_core import EngineConfig, HGMEngine

engine = HGMEngine(EngineConfig(widening_alpha=0.5, seed=1234))
```

Both synchronous and asynchronous callbacks can be supplied through the
constructor using `on_expansion_result` and `on_evaluation_result`. These
callbacks are executed outside of the engine lock to preserve responsiveness.

Refer to `tests/` for a detailed walkthrough that mirrors the orchestrator's
integration points.
