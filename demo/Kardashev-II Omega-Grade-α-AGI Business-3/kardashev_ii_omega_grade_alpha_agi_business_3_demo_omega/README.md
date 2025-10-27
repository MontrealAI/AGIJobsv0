# Kardashev-II Omega-Grade Upgrade for α-AGI Business 3 Demo (Operator Edition)

This demo shows how a non-technical operator can use **AGI Jobs v0 (v2)** to command a
planetary-scale, validator-governed AGI labour market.  The mission ships with a
curated configuration (`config/omega_mission.json`) that unlocks:

- A **multi-hour/day autonomous orchestrator** with checkpointing, pause/resume, and
  structured JSON logging ready for audit.
- Recursive **job graph spawning** so every agent can delegate to specialist crews.
- A tokenised **energy and compute economy** with adjustable stakes and validator
  oversight built directly into the control channel.
- An async **agent-to-agent message bus** with commit–reveal validation and operator
  override hooks that mirror the production AGI Jobs gateways.
- Plug-and-play **planetary simulation hooks** that keep energy and prosperity metrics
  synced with resource tokenomics.

> The goal is to demonstrate that AGI Jobs v0 (v2) empowers operators to run a
> superintelligent economic machine without touching code.

## Quickstart for Operators

```bash
# optional: clone the repo and install python dependencies
python -m kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega init --output-dir my-mission
cd my-mission
python -m kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega --config omega_mission.json --duration 120
```

During the run, the orchestrator writes JSON status snapshots to
`storage/status.jsonl`.  Edit `storage/control-channel.jsonl` to issue governance
commands (pause, resume, parameter updates) exactly like the mainnet system.

## Mission Plan at a Glance

```mermaid
flowchart TD
    mission_core["Launch Stellar Infrastructure Programme\nReward: 16000 tokens\nEnergy: 280000 | Compute: 450000"]
    mission_core --> mission_energy
    mission_energy["Deploy Dyson Foundry Nodes\nReward: 9000 tokens\nEnergy: 180000 | Compute: 240000"]
    mission_energy --> mission_energy_design
    mission_energy_design["Design Dyson Swarm Blueprint\nReward: 3500 tokens\nEnergy: 65000 | Compute: 120000"]
    mission_energy --> mission_energy_fabrication
    mission_energy_fabrication["Coordinate Fabrication Supply Web\nReward: 3200 tokens\nEnergy: 48000 | Compute: 80000"]
    mission_core --> mission_governance
    mission_governance["Institutionalise Validator Syndicate\nReward: 6000 tokens\nEnergy: 80000 | Compute: 120000"]
    mission_governance --> mission_governance_stake
    mission_governance_stake["Configure Staking Ledgers\nReward: 2200 tokens\nEnergy: 20000 | Compute: 40000"]
    mission_governance --> mission_governance_observatory
    mission_governance_observatory["Activate Validator Observatory\nReward: 2400 tokens\nEnergy: 22000 | Compute: 42000"]
    mission_core --> mission_supply
    mission_supply["Orchestrate Interplanetary Supply Corridors\nReward: 7200 tokens\nEnergy: 120000 | Compute: 200000"]
    mission_supply --> mission_supply_resourcing
    mission_supply_resourcing["Secure Resource Offtake Contracts\nReward: 2600 tokens\nEnergy: 42000 | Compute: 60000"]
    mission_supply --> mission_supply_telemetry
    mission_supply_telemetry["Deploy Telemetry Mesh\nReward: 2800 tokens\nEnergy: 38000 | Compute: 58000"]
```

The CLI automatically refreshes the Mermaid plan in `ui/mission-plan.mmd` every
launch, so operators always have an up-to-date visual of the delegated job graph.

## Control Surface

- **Config** – Tune rewards, stakes, validator requirements, energy/compute caps, and
  simulation behaviour by editing `config/omega_mission.json`.
- **Checkpointing** – Snapshots persist in `storage/checkpoint.json`; the orchestrator
  resumes automatically after restarts.
- **Governance channel** – Append JSON commands to `storage/control-channel.jsonl`
  (pause/resume, stake adjustments, or parameter updates).  Validators enforce
  commit–reveal finalisation just like the deployed protocol.
- **Audit** – Structured logs land in `storage/audit-log.jsonl` and can be hashed for
  blockchain notarisation.

## Continuous Integration

The CLI exposes a `ci` command that validates configuration files and renders the
Mermaid mission plan.  A dedicated GitHub Action ensures the Omega-grade operator
experience stays green on every pull request.

## Next Steps

Connect the orchestrator to Ethereum mainnet infrastructure by providing
RPC credentials and enabling the on-chain gateways in the configuration file.  The
interfaces provided here already align with the AGI Jobs v0 (v2) gateway contracts
and can be promoted to production without code changes.
