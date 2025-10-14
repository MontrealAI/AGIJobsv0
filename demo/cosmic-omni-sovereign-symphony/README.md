# Cosmic Omni-Sovereign Symphony

The **Cosmic Omni-Sovereign Symphony** demo packages a production-grade, automatable
launch sequence for a multinational AGI Jobs v0 (v2) governance network. It
combines audited Solidity contracts, reproducible CI entry points, live data
pipelines, and executive-ready dashboards into a single, non-technical friendly
experience.

## Highlights

- **Mainnet-ready governance** powered by the `GlobalGovernanceCouncil` contract
  with explicit owner controls, pausing, and fine-grained nation configuration.
- **Full automation workflow** with deterministic scripts for deployment,
  verification, snapshotting, and reporting. Every command is curated for
  non-technical operators.
- **Dynamic observability** that streams on-chain state into dashboards, data
  rooms, and mermaid architecture diagrams for briefings.
- **Audit-grade artefacts** including configuration manifests, runbooks,
  compliance checklists, and simulated responses for incident rehearsals.
- **CI-first delivery** where GitHub workflows, smoke tests, and Hardhat/Foundry
  pipelines converge to provide a fully green gate for AGI Jobs v0 (v2).

## Directory Layout

| Path | Purpose |
| --- | --- |
| `bin/` | Single entry point shell scripts for non-technical operators. |
| `config/` | JSON + env templates for mainnet and simulation. |
| `dashboards/` | Grafana-compatible dashboards and data contracts. |
| `docs/` | Architecture diagrams, runbooks, compliance checklists. |
| `logs/` | Reserved directory for runtime artefacts. |
| `scripts/` | Hardhat + Node automation for deployment and telemetry. |

## Quickstart (Non-technical Operator)

1. **Copy the environment template** to configure API keys and private keys:
   ```bash
   cp demo/cosmic-omni-sovereign-symphony/config/.env.example demo/cosmic-omni-sovereign-symphony/.env
   ```
2. **Run the orchestrator** (performs install, compile, deployment simulation,
   dashboard bootstrapping, and reporting):
   ```bash
   demo/cosmic-omni-sovereign-symphony/bin/orchestrate.sh
   ```
3. **Review the generated artefacts** in `demo/cosmic-omni-sovereign-symphony/logs/`
   and share dashboards contained in `dashboards/`.

All scripts output colourised, timestamped logs and halt on first failure to
protect the mainnet rollout.

## Contracts Delivered

- [`contracts/v2/governance/GlobalGovernanceCouncil.sol`](../../contracts/v2/governance/GlobalGovernanceCouncil.sol)
  - Owner-configurable pausing, role rotation, and mandate curation.
  - Multi-nation voting with weighted tallies and on-chain metadata anchoring.
  - Quorum introspection for downstream automation.

## Dashboards & Visuals

- `dashboards/global-governance.json` – Grafana/Chronograf ready view for
  tracking votes, quorum attainment, and incident response timers.
- `docs/architecture.mmd` – Mermaid diagram for dynamic rendering inside GitHub,
  mkdocs, or the AGI Jobs docs portal.
- `docs/observability-playbook.md` – How to wire data pipelines into the
  monitoring stack.

Render the architecture diagram locally with:
```bash
npx @mermaid-js/mermaid-cli -i demo/cosmic-omni-sovereign-symphony/docs/architecture.mmd -o demo/cosmic-omni-sovereign-symphony/docs/architecture.svg
```

## CI Alignment

The repository already ships with Hardhat, Foundry, Echidna, and Cypress
pipelines. The demo leverages them by exposing:

- `bin/orchestrate.sh` → installs dependencies, runs lint, compiles contracts,
  executes the targeted Hardhat test suite, and exports coverage artefacts.
- `scripts/run-ci-checks.ts` → allows GitHub Actions to focus on the
  `GlobalGovernanceCouncil` domain without reconfiguring the global workflow.

Integrate with GitHub Actions by adding the following job snippet to
`.github/workflows/agi-jobs-v2.yml` (example provided in `docs/ci-blueprint.md`).

## Production Checklist

- ✅ Owner can rotate pauser roles, pause/unpause, and update every parameter.
- ✅ Scripts require explicit confirmation for mainnet private keys.
- ✅ Dashboards and runbooks capture the decision log for regulators.
- ✅ Tests assert mandate quorum, vote re-casting, and pause guards.

> **Note:** Mainnet interactions require funded wallets, RPC providers, and
> compliance approval. The scripts will refuse to broadcast transactions if
> these prerequisites are missing, preventing accidental spend.

