# ASI Take-Off Demonstration

This directory houses the deterministic artefacts that back the **ASI Take-Off Demonstration for AGI Jobs v0**.  The goal is to
produce a national-scale governance simulation using only the platform capabilities that already exist inside this repository.

The demonstration is orchestrated by the `scripts/v2/asiTakeoffDemo.ts` pipeline which automatically:

1. Compiles the protocol and regenerates constants required by the governance scripts.
2. Exercises the owner dry-run harness to simulate an end-to-end labour-market execution with staking, delivery, validation and payout.
3. Captures live thermodynamic telemetry (role shares, entropy, temperature) for the epoch.
4. Produces an owner mission-control report with a Mermaid governance diagram, safe-ready bundles, and change-surface analysis.
5. Verifies the owner-control wiring to prove that the SystemPause, treasury, and thermostat permissions match the repo's hardening
   playbooks.
6. Emits an audit-grade summary that maps the deterministic outputs to the high-speed rail initiative defined in
   `project-plan.json`.

The demo uses the following canonical actors:

- **engineering.agent.agi.eth** – parametric design lead
- **north.contractor.agi.eth** – northern corridor builder
- **south.contractor.agi.eth** – southern corridor builder
- **inspection.validator.agi.eth** – primary validator quorum
- **civic.validator.agi.eth** and **safety.validator.agi.eth** – supplemental auditors

Outputs are collected under `reports/asi-takeoff` and can be published as CI artefacts or ingested into downstream dashboards.
