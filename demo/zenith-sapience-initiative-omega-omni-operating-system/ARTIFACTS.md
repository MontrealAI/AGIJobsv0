# Artefact Index

The Omega Omni Operating System demo emits deterministic artefacts compatible with CI archiving and executive reporting. Use this index to locate each deliverable.

| Artefact | Source Command | Location | Notes |
| --- | --- | --- | --- |
| Mission dashboards | `npm run owner:mission-control -- --network <network> --out runtime/omega-mission.md` | `runtime/omega-mission.md` | Summarises active jobs, stakes, disputes, and treasury balances. |
| Governance diagram | `npm run owner:diagram -- --network <network> --out runtime/omega-governance.mmd` | `runtime/omega-governance.mmd` | Mermaid diagram showing multisig, timelock, pause switches, and contract proxies. |
| Parameter matrix | `npm run owner:parameters -- --network <network> --out runtime/omega-parameters.md` | `runtime/omega-parameters.md` | Tabulates manifest vs on-chain values for every configurable constant. |
| Owner plan | `npm run owner:update-all -- --network <network> --json | tee runtime/omega-plan.json` | `runtime/omega-plan.json` | Dry-run transaction bundle for governance approval. |
| Safe bundle | `npm run owner:update-all -- --network <network> --json --safe runtime/omega-plan.safe.json` | `runtime/omega-plan.safe.json` | Prebuilt payload for Gnosis Safe execution. |
| System pause log | `npx hardhat run --no-compile scripts/v2/pauseTest.ts --network <network> -- --json > runtime/omega-pause-audit.json` | `runtime/omega-pause-audit.json` | Confirms governance authority to invoke `SystemPause.pauseAll()` / `unpauseAll()`. |
| Thermodynamics report | `npm run thermodynamics:report -- --network <network> --out runtime/omega-thermo.md` | `runtime/omega-thermo.md` | Captures thermostat PID telemetry, including temperature, integral, derivative metrics. |
| Aurora demo report | `npm run demo:asi-takeoff:report` | `reports/asi-takeoff/*.md` | Deterministic narrative of the ASI take-off run produced by the aurora reporter. |
| Zenith governance report | `npm run demo:zenith-sapience-initiative:local` | `reports/zenith-sapience-initiative/*.md` | Scenario summary covering multisovereign mission execution. |
| Observability smoke log | `npm run observability:smoke > runtime/omega-observability.log` | `runtime/omega-observability.log` | Captures metrics and notification probe status for archival. |
| Incident tabletop transcript | `npm run incident:tabletop -- --format markdown --out runtime/omega-incident.md` | `runtime/omega-incident.md` | Simulation log capturing decision checkpoints and follow-up actions. |

For production usage, attach SHA-256 hashes of each artefact to your governance ticket and store the bundle in immutable storage (e.g., IPFS, S3 with object lock, or internal archival systems).
