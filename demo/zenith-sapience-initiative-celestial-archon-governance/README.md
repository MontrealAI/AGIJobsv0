# Zenith Sapience Initiative — Celestial Archon Governance Demonstration

The **Celestial Archon Demonstration** elevates AGI Jobs v0 (v2) into an
iconic, planetary-scale command rehearsal. Without introducing any new code,
it orchestrates the repository's existing governance stack into an
"unstoppable" closed loop that a non-technical mission owner can launch end to
end. Everything rides on hardened, production-ready components: the on-chain
RewardEngineMB + StakeManager kernel, IdentityRegistry enforcement, the
orchestrator planning scripts, and the full owner-control suite.

> **Prime directive:** parameterise the canonical `npm run demo:asi-global`
pipeline so that it choreographs a multi-sovereign mega-project while the
contract owner retains absolute authority (pause, timelock, thermostat,
upgrade, treasury, and identity controls) at every step.

## Scenario at a Glance

- **Mission codename** — *Zenith Sapience · Celestial Archon*: a global
  resilience surge that fuses orbital energy relays, oceanic megafarms, and
  humanitarian response corridors across six sovereign coalitions.
- **Governance spine** — Multisig + timelock owners operating AGIGovernor,
  SystemPause, and mission playbooks generated directly from existing owner
  scripts.
- **Economic kernel** — RewardEngineMB, StakeManager, Thermodynamic thermostat,
  and Dispute resolution modules already shipped in AGI Jobs v0 (v2).
- **Automation loop** — `scripts/v2/asiGlobalDemo.ts` drives a
  plan → simulate → dry-run → artifact cycle, fuelled solely by environment
  overrides defined here.
- **Audit trail** — Deterministic reports, SHA-256 governance kits, Mermaid
  topologies, and mission dashboards recorded under
  `reports/zenith-celestial-archon/`.

## Quickstart for Mission Owners

1. **Install prerequisites** — Node.js 20+, npm, and optional Foundry (see
   [docs/setup.md](../../docs/setup.md)).
2. **Generate the deterministic governance kit**

   ```bash
   npm run demo:zenith-sapience-celestial-archon
   ```

   The wrapper injects scenario-specific environment variables into
   `scripts/v2/asiGlobalDemo.ts`, materialising the audit kit inside
   `reports/zenith-celestial-archon/zenith-celestial-archon-kit.*`.
3. **(Optional) Execute the local rehearsal loop** — spins up an Anvil/Hardhat
   network, deploys defaults, and replays the mission with agent/validator
   telemetry:

   ```bash
   npm run demo:zenith-sapience-celestial-archon:local
   ```

4. **Inspect the dashboards** in `reports/zenith-celestial-archon/`:
   - `summary.md` — planetary executive briefing + KPI checkpoints.
   - `mission-control.md` — live owner dossier (pause state, treasury routes,
     multisig wiring).
   - `command-center.md` — stateful control matrix for emergency manoeuvres.
   - `governance.mmd` / `governance.md` — rendered owner topology.
   - `thermodynamics.json` — incentive thermostat telemetry.

All owner scripts default to preview mode. Append `--execute` only when human
signers have approved the action; every execution is captured in the kit.

## Included Assets

| File | Purpose |
| --- | --- |
| [`project-plan.json`](./project-plan.json) | Structured orchestration inputs consumed by `scripts/v2/asiGlobalDemo.ts`. |
| [`RUNBOOK.md`](./RUNBOOK.md) | Stage-by-stage operator playbook and contingency drills. |
| [`OWNER-CONTROL.md`](./OWNER-CONTROL.md) | Owner authority catalogue covering pause, treasury, thermostat, and identity levers. |
| [`bin/zenith-celestial-archon.sh`](./bin/zenith-celestial-archon.sh) | Deterministic wrapper around the stock `demo:asi-global` script. |
| [`bin/zenith-celestial-archon-local.sh`](./bin/zenith-celestial-archon-local.sh) | Local rehearsal harness targeting Hardhat/Anvil. |

## How the Demonstration Works

The wrappers modify **only** environment variables already supported by the
existing demo harness:

- `ASI_GLOBAL_PLAN_PATH` references this scenario's `project-plan.json`.
- `ASI_GLOBAL_REPORT_ROOT` relocates outputs to
  `reports/zenith-celestial-archon/` so the base pipeline remains untouched.
- `ASI_GLOBAL_OUTPUT_BASENAME`/`ASI_GLOBAL_BUNDLE_NAME` rename the governance
  kit and artifact bundle.
- `ASI_GLOBAL_REFERENCE_DOCS_APPEND` and
  `ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND` attach the new runbook and owner
  control dossier to the generated kit.
- `ASI_GLOBAL_MERMAID_TITLE` retitles the Mermaid topology without altering the
  renderer implementation.

Because no bespoke code is introduced, the deployed contracts, migrations, and
on-chain behaviour remain identical to production. Every step executes through
battle-tested TypeScript/Hardhat entrypoints already vetted by the CI suite.

## Owner Supremacy and Safety

[`OWNER-CONTROL.md`](./OWNER-CONTROL.md) documents the full command surface for
SystemPause, thermostat overrides, treasury redirection, ENS/Identity
management, Safe transaction bundling, and telemetry refreshes. The generated
Mission Control report cross-links each command, allowing auditors to confirm
that the owner retains final say over every automated action.

## Continuous Integration Hooks

`.github/workflows/demo-zenith-sapience-celestial-archon.yml` executes both the
planetary deterministic kit and the local rehearsal on every relevant PR or
main-branch update. The main `ci (v2)` workflow depends on this job, keeping the
Celestial Archon loop green and enforceable under branch protection.

## Next Steps for Operators

- Re-run `npm run demo:zenith-sapience-celestial-archon` after any plan or
  policy changes to regenerate the governance kit.
- Mirror `reports/zenith-celestial-archon/governance.md` into executive portals
  for live topology visibility.
- Execute `npm run owner:verify-control -- --network hardhat` post-deployment to
  confirm multisig + timelock dominance.

The Celestial Archon demonstration is thus comprehensive, user-friendly,
auditable, and immediately deployable on mainnet using the repo's existing
superstructure.
