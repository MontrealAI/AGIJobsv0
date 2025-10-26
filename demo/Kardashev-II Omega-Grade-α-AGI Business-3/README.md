# Kardashev-II Omega-Grade α-AGI Business 3 Demo

> A flagship demonstration that shows how **AGI Jobs v0 (v2)** empowers a non-technical
> operator to command a planetary-scale, tokenised AGI workforce.  This demo turns the
> toolkit into a fully autonomous, Kardashev-II–grade business platform with recursive
> delegation, validator governance, and energy-aware economics.

## Why this demo matters

* **Non-technical mastery.** A single operator launches a multi-domain AGI enterprise by
  running one friendly CLI command.  The platform self-coordinates, spawns sub-agents,
  performs validation and resource accounting, and keeps running for hours or days.
* **Production-ready primitives.** Long-running orchestration, structured JSON logging,
  check-pointing, pausing/resuming, staking, and commit–reveal validation mirror the
  exact muscles needed for production deployments on the AGI Jobs protocol.
* **Planetary-scale simulation hooks.** The orchestration loop can attach to synthetic
  economy simulations, so strategy decisions can be stress-tested across global energy,
  compute, and governance feedback loops.

## Launching the experience

```bash
python demo/"Kardashev-II Omega-Grade-α-AGI Business-3"/kardashev_ii_omega_grade_alpha_agi_business_3/cli.py \
  --owner omega-operator --autopilot --cycles 25 --sleep 0.25
```

The CLI bootstraps a fully configured orchestrator, launches domain-specialist agents
(finance, energy, supply chain) plus validator agents, seeds an alpha mission, and runs
for the specified number of cycles (use `--cycles 0` for continuous operation).  All
state transitions, ledger moves, commits, and reveals are emitted as structured JSON logs
for effortless monitoring.

### Operator controls

* `--pause` / `--resume` – issue governance commands before the run starts.
* `--checkpoint` – select where long-running state is checkpointed for disaster recovery.
* `--reward` – determine the token reward assigned to the initial α-job.

During execution the owner can modify parameters programmatically:

```python
import sys
from pathlib import Path

PACKAGE = Path("demo/Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_alpha_agi_business_3")
sys.path.append(str(PACKAGE))

from config import DemoConfig

config = DemoConfig(owner="omega-operator")
config.update(caller="omega-operator", stake_ratio=0.25, validator_count=5)
```

These methods match the contract-owner capabilities in the on-chain deployment: every
parameter (staking ratios, validator quorum, resource caps) is adjustable by the owner.

## Architecture highlights

```mermaid
diagram TB
    subgraph Operator
        CLI[Omega CLI]
        Gov[Governance Console]
    end
    subgraph Orchestrator
        OrchestratorCore[Omega Orchestrator]
        Registry[Hierarchical Job Registry]
        Checkpointer[Checkpoint Writer]
        Scheduler[Deadline & Event Scheduler]
    end
    subgraph Agents
        Finance[Finance α-Agent]
        Energy[Energy α-Agent]
        Supply[Supply Chain α-Agent]
        Validators[Validator Swarm]
    end
    subgraph Infrastructure
        Bus[Async A2A Message Bus]
        Resources[Planetary Resource Manager]
        Simulation[Synthetic Economy Sim]
    end
    CLI --> OrchestratorCore
    Gov --> OrchestratorCore
    OrchestratorCore --> Registry
    OrchestratorCore --> Checkpointer
    OrchestratorCore --> Scheduler
    OrchestratorCore -- publish --> Bus
    Bus -- subscribe --> Finance
    Bus -- subscribe --> Energy
    Bus -- subscribe --> Supply
    Bus -- commit/reveal --> Validators
    Finance -- delegate --> OrchestratorCore
    Supply -- actions --> Simulation
    OrchestratorCore -- token flows --> Resources
    Resources -- pricing --> OrchestratorCore
```

* **Long-running resilience.** Jobs, balances, and configuration snapshots are written to
  disk at a configurable cadence so the mission survives restarts.
* **Recursive job graph.** Agents can spawn sub-jobs via `delegate`, producing a directed
  acyclic graph that tracks dependencies, deadlines, and results.
* **Validator governance.** Commit–reveal votes, staking, and slashing simulation ensure
  outputs are trustworthy and economically aligned.
* **Planetary accounting.** Every job consumes compute/energy, updates dynamic pricing, and
  rewards contributors using AGIALPHA-inspired token flows.

## Files of interest

| Path | Description |
| --- | --- |
| `kardashev_ii_omega_grade_alpha_agi_business_3/orchestrator.py` | Autonomous orchestrator with scheduling, validation, staking, and checkpointing. |
| `kardashev_ii_omega_grade_alpha_agi_business_3/agents.py` | Domain agents plus validator agents with recursive delegation. |
| `kardashev_ii_omega_grade_alpha_agi_business_3/resources.py` | Planetary resource & AGIALPHA ledger accounting. |
| `kardashev_ii_omega_grade_alpha_agi_business_3/messaging.py` | Async publish/subscribe bus with audit trail. |
| `kardashev_ii_omega_grade_alpha_agi_business_3/simulation.py` | Plug-in planetary simulation interface and synthetic economy example. |
| `tests/test_orchestrator.py` | Unittests covering job lifecycle, governance pause, and delegation. |

## CI coverage

The repository now includes `.github/workflows/demo-kardashev-ii-omega-grade-alpha-agi-business-3.yml`
which spins up Python 3.11, runs the orchestrator unit tests, and exposes the status badge
for both PRs and main.  This keeps the entire Omega-grade pipeline continuously green.

## Observability

* JSON logs stream key facts (`job_posted`, `job_finalised`, `pricing_adjusted`, etc.).
* The message bus records a SHA3 audit trail of every agent-to-agent message for trust and
  forensic replay.
* Checkpoints capture all jobs, resources, and configuration so the run can resume after
  a pause or failure.

## Planetary simulation hooks

Developers can plug in any world model:

```python
import sys
from pathlib import Path

PACKAGE = Path("demo/Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_alpha_agi_business_3")
sys.path.append(str(PACKAGE))

from config import DemoConfig
from orchestrator import Orchestrator
from myworld.power_grid import PowerGridSim

config = DemoConfig(owner="omega-operator")
orchestrator = Orchestrator(config, simulation=PowerGridSim())
```

The orchestrator relays agent actions (`build_solar`, `expand_compute`, etc.) to the
simulation, enabling planetary-scale experimentation and feedback.

## Next steps

1. Connect the orchestrator to the on-chain AGI Jobs registry via the provided hooks.
2. Swap the synthetic economy stub with your detailed planetary model.
3. Attach observability pipelines (DataDog, ELK, or on-chain data availability layers).

**Result:** AGI Jobs v0 (v2) demonstrably lets any operator instantiate a planetary-scale
AGI enterprise—complete with economic governance, validator oversight, and recursive
problem solving—without writing a single line of code.
