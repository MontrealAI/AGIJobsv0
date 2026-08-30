# AGI Jobs v0 (v2) – Transcendent Omniversal First-Class OS Demonstration 🚀

The **Transcendent Omniversal** runbook consolidates every first-class capability that already ships with AGI Jobs v0 (v2) into one push-button showcase. It stays entirely within the repository's existing toolchain – nothing custom is required beyond what the project already supports – yet it choreographs a headline demonstration that a non-technical operator can execute end-to-end.

> **Mission goal:** Prove that a single command can boot the full AGI Jobs operating system, simulate an ASI-scale labour market on-chain, synthesise the owner control surface, and publish audit-grade evidence (Markdown, HTML, JSON, Mermaids, manifests) for executives and regulators.

## Quickstart Capsule

1. **Clone the repository**
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   ```
2. **Launch the one-click environment** – boots the Anvil blockchain, orchestrator, backends, and UIs with secure defaults.
   ```bash
   npm run deploy:oneclick:auto -- --network localhost --compose
   ```
3. **Fire the first-class orchestrator** – runs the canonical `demo:agi-os:first-class` pipeline.
   ```bash
   npm run demo:agi-os:first-class
   ```
4. **Open the mission dossier** located under `reports/agi-os/` and follow the [Operations Playbook](./OPERATIONS-PLAYBOOK.md) to certify every artifact.

The orchestrator emits emoji-coded log lines, pauses immediately on any failure, and leaves remediation hints inside `reports/agi-os/first-class/first-class-run.json` for rapid recovery.

## Evidence Portfolio

After the run completes, validate that the following deliverables exist:

| Artefact | Location | Purpose |
| --- | --- | --- |
| Executive brief | `reports/agi-os/grand-summary.md` | Mission profile, ASI take-off highlights, Owner Control Matrix. |
| Browser-ready brief | `reports/agi-os/grand-summary.html` | Auto-rendered HTML twin for sharing with stakeholders. |
| Control matrix | `reports/agi-os/owner-control-matrix.json` | Machine-readable ledger of every governable/ownable module and its update command. |
| Telemetry log | `reports/agi-os/first-class/first-class-run.json` | Time-stamped status, exit codes, and remediation hints for each orchestrator step. |
| Integrity manifest | `reports/agi-os/first-class/first-class-manifest.json` | SHA-256 hashes of all generated artefacts. |
| Governance diagram | `reports/agi-os/first-class/owner-control-map.mmd` | Mermaid graph of ownership and pause delegations. |

For advanced audits, the orchestrator also copies the full ASI take-off outputs (`reports/asi-takeoff/**`) into the mission bundle so reviewers can trace every simulated contract interaction.

## User Interfaces

Once Docker Compose is online, the three core UIs are ready without additional configuration:

- **Owner Console** – `http://localhost:3000` for governance status, pause/unpause buttons, and transaction forms.
- **Enterprise Portal** – `http://localhost:3001` for conversational job creation and the “Submit job” big green button.
- **Validator Dashboard** – `http://localhost:3002` for live validator workloads and dispute flows.

These front-ends run against the same local Anvil deployment the demo provisions, so a business owner can immediately experience push-button AGI work coordination.

## Assurance Pillars

- **Owner supremacy** – The Owner Control Matrix enumerates every module, its config file, and the exact `npx hardhat` command to update it. Review the [playbook](./OPERATIONS-PLAYBOOK.md) to rehearse pause/unpause and parameter rotations.
- **CI alignment** – The orchestrator replays the same compilation, testing, simulation, and governance verification gates enforced by CI v2. Use the [Greenlight Checklist](./CI-GREENLIGHT.md) to confirm GitHub protections mirror the local policy.
- **Audit trail** – Hash manifests, structured logs, and Mermaid diagrams make it trivial to prove the state of the system to external stakeholders without rerunning the stack.

## Next Steps

- Walk through the [Operations Playbook](./OPERATIONS-PLAYBOOK.md) for a blow-by-blow verification.
- Execute the [CI Greenlight Checklist](./CI-GREENLIGHT.md) to certify that the repository enforces the full CI v2 bar on `main` and on every PR.
- Package the resulting `reports/agi-os/mission-bundle` directory and share it with executives, investors, or auditors as a complete readiness dossier.

When all sections pass, you have conclusively demonstrated AGI Jobs v0 (v2) as a first-class, owner-controlled operating system ready for production-scale AGI labour orchestration.
