# AlphaEvolve-v0 Grand Demo

> A first-class, production-grade, self-evolving economic optimizer harnessing **AGI Jobs v0 (v2)**.

## Vision

AlphaEvolve-v0 demonstrates how a non-technical operator can command AGI Jobs v0 (v2) to synthesize, evaluate, and roll out marketplace heuristics that continuously grow net economic utility. The demo packages:

- Automated instrumentation of evolvable heuristics (`EVOLVE-BLOCK`s).
- An asynchronous AlphaEvolve controller with evolutionary islands and Pareto-scored elites.
- Multi-stage evaluation harnesses and safety sentinels.
- A canary/shadow rollout engine.
- Prometheus-friendly telemetry.
- A fully guided CLI for non-technical users.

## Rapid Start

```bash
cd demo/AlphaEvolve-v0
python -m alphaevolve_runner run --generations 40
```

The CLI:

- Spins up sandboxed evaluators.
- Streams telemetry and mermaid diagrams.
- Outputs promotion-ready heuristics, changelogs, and guardrail attestations.

## Architectural Symphony

```mermaid
flowchart TD
    A[Non-technical Operator]
    B[Guided CLI Wizard]
    C[AlphaEvolve Controller]
    D[LLM Ensemble]
    E[Evaluation Cascade]
    F[Guardrail Sentinel]
    G[Program Atlas (MAP-Elites DB)]
    H[Shadow/Canary Rollout]
    I[Marketplace Utility Uplift]

    A --> B --> C --> D
    D --> C --> E --> F
    F -->|Pass| H --> I
    F -->|Breach| C
    E --> G --> D
    H -->|Prometheus Telemetry| A
```

## Demo Highlights

- **Day-One Lift**: Generates measurable uplift against stored baselines in minutes.
- **Safety First**: Automatic sandboxing, import allowlists, and SLO sentinels.
- **Complete Control**: Owner-controlled thermostat, budgets, pause switches, and manual approvals.
- **Explainable**: Markdown reports with diffs, rationales, and Pareto frontiers.
- **Deployable**: Canary/shadow toggles wired for live operations.
- **Economic Singularity Engine**: Demonstrates a market optimizer capable of compounding improvements beyond conventional operational limits.

See [`alphaevolve_runner.py`](alphaevolve_runner.py) and the `alphaevolve/` package for implementation details.

## Verification Suite

Run the hermetic AlphaEvolve tests with the dedicated runner so that pytest disables external plugin auto-discovery before initialisation:

```bash
python demo/AlphaEvolve-v0/tests/run_demo_tests.py
```

Additional arguments are forwarded directly to pytest, e.g. `python demo/AlphaEvolve-v0/tests/run_demo_tests.py -k trade_flow`.
