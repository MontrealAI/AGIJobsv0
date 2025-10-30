# Absolute Zero Reasoner v0 Demo

> A turnkey, non-technical friendly activation of the Absolute Zero Reasoner
> loop inside **AGI Jobs v0 (v2)**. Launching the demo showcases how the
> platform continuously self-improves economically without human-labelled data.

## Why this matters

- **Immediate self-improvement** – run the demo once and watch the agent design,
  validate, solve, and monetise its own curriculum.
- **Zero-ops deployment** – the included Make target and CLI require only a
  default Python installation. No GPU, no external APIs.
- **Board-ready telemetry** – the run emits gross value, cost, ROI and success
  rate metrics in real time for executive dashboards.

## System architecture

```mermaid
flowchart TD
    subgraph User "Non-technical Operator"
        A["Run demo CLI"]
    end

    subgraph DemoStack "Absolute Zero Reasoner v0"
        B["TaskProposer\n(offline curriculum)"]
        C["SandboxExecutor\n(deterministic)"]
        D["TaskSolver\n(TRR++ thermostat)"]
        E["RewardEngine\n(Eq.4-6 aligned)"]
        F["MarketSimulator\n(economic utility)"]
        G["GuardrailManager\n(thermostat + sentinel)"]
        H["TelemetryTracker\n(CMP metrics)"]
    end

    A --> B --> C --> D --> E --> F --> H
    D --> G
    G --> B
    H -->|GMV / ROI| User
```

## Quickstart

```bash
make absolute-zero-demo
```

The target provisions a virtual environment, installs the minimal dependencies
(`pytest` for tests only) and launches the orchestrator in shadow mode. The CLI
prints a concise dashboard every iteration.

To run the Python script manually:

```bash
python demo/Absolute-Zero-Reasoner-v0/scripts/run_demo.py --iterations 10
```

## Operator controls

Configuration lives in `absolute_zero_demo/config.py`. Every knob is annotated
for clarity. Highlights:

| Setting | Purpose |
| --- | --- |
| `batch_size` | Number of propose/solve pairs per iteration. |
| `guardrails.max_budget_usd` | Hard stop for simulated spend. |
| `reward_weights` | Weighting of learnability, correctness, utility and penalties. |
| `execution_policy` | Sandbox timeouts, memory ceilings, banned tokens. |

Non-technical operators can edit these numbers directly or provide overrides via
environment variables (see CLI options below).

## CLI options

The CLI supports safe overrides:

```bash
python demo/Absolute-Zero-Reasoner-v0/scripts/run_demo.py \
  --iterations 25 \
  --max-budget 5.0 \
  --batch-size 4
```

## Sample output

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Absolute Zero Reasoner – iteration 5 ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━┯━━━━━━━━━━━┫
┃ Tasks proposed           │ 3         ┃
┃ Tasks solved             │ 3         ┃
┃ Simulated GMV            │ $109.87   ┃
┃ Simulated cost           │ $0.01     ┃
┃ ROI                      │ 10986%    ┃
┃ Guardrail events         │ none      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━┛
```

## Tests

```bash
pytest demo/Absolute-Zero-Reasoner-v0/tests
```

## Files

- `absolute_zero_demo/` – production-grade modules.
- `scripts/run_demo.py` – human-centric CLI orchestrator.
- `tests/` – guarantees correctness, security, and regression safety.

Enjoy building with the same force that rewrites global economics.
