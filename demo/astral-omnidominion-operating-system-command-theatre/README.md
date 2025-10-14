# Astral Omnidominion Operating System Command Theatre 🚀

The **Astral Omnidominion Operating System Command Theatre** showcases the AGI Jobs v0 (v2) platform as a first-class, production-ready operating system for AGI-driven work. This guide stitches together the existing "AGI OS" grand demonstration, one-click deployment stack, and owner command surface so that a **non-technical operator** can go from zero to a full mission dossier and control dashboard with a single session.

The theatre reuses only battle-tested functionality already included in this repository:

- The [`demo:agi-os:first-class`](../../scripts/v2/agiOsFirstClassDemo.ts) orchestrator packages deployment, simulation, control-surface verification, HTML reporting, and manifest attestation into one guided flow.
- Docker Compose one-click deployment spins up the entire stack (contracts, orchestrator, gateways, and UIs) with safe defaults and automatic global pause.
- Owner-focused toolchain (`owner:diagram`, `owner:verify-control`, `owner:command-center`, etc.) exposes every governance lever, ensuring complete operational control including system-wide pause/resume.
- Enterprise, validator, and owner UIs provide **big green buttons** and conversational forms for launching jobs, auditing activity, and reacting in real time.

The Command Theatre includes a set of operator artefacts:

| Artefact | Purpose |
| --- | --- |
| [`launch-playbook.md`](./launch-playbook.md) | Push-button mission flow for non-technical operators, covering prerequisites, launch, live monitoring, and clean shutdown. |
| [`owner-control-field-guide.md`](./owner-control-field-guide.md) | Definitive inventory of owner powers, including pause/resume, parameter updates, and emergency governance execution. |
| [`mission-review-checklist.md`](./mission-review-checklist.md) | Post-run audit routine that verifies bundles, diagrams, manifests, and telemetry with triple validation. |
| [`ci-green-operations.md`](./ci-green-operations.md) | Checklist to keep the CI v2 surface permanently green and branch-protected, including verification commands. |

These documents are written so that an executive stakeholder can execute, monitor, and audit the complete AGI OS demonstration without editing code or JSON files.

> **Tip:** The Astral Omnidominion theatre is self-documenting. Every run produces a signed manifest (SHA-256 checksums) and a machine-readable logbook under `reports/agi-os/first-class/`, enabling forensic review or third-party attestation.

## Fast start

1. **Install prerequisites** listed in the [launch playbook](./launch-playbook.md) (Docker Desktop/Engine with Compose plugin, Node.js 20 LTS, git).
2. Run the guided demo:
   ```bash
   npm install
   npm run demo:agi-os:first-class
   ```
   Accept the defaults for a local rehearsal or customise the wizard prompts (network, compose autostart, skip redeploy) as needed.
3. When the run completes, open `reports/agi-os/grand-summary.html` for an executive overview and follow the [mission review checklist](./mission-review-checklist.md) to validate all artefacts.
4. Launch the one-click stack (if not already running) and explore the UI touchpoints documented in the [launch playbook](./launch-playbook.md) for live coordination and owner control.

## Why this theatre matters

- **Non-technical clarity:** Every interaction is either a prompt, a toggle, or a button. No manual configuration files are required—defaults are safe, and optional settings are validated by the wizard before execution.
- **Owner supremacy:** The owner control matrix, Mermaid system map, and governance command surface prove that the contract owner can pause, resume, or update every managed module instantly, satisfying strict business continuity and compliance requirements.
- **Audit-grade artefacts:** Deterministic simulations, telemetry, manifests, and HTML/JSON summaries are produced in one sweep, enabling executive reporting, due diligence, and third-party audits without additional scripting.
- **CI v2 alignment:** The same stages exercised by the demo mirror the required CI v2 pipeline. Keeping this theatre green ensures the repository’s main branch remains protected by lint, unit tests, fuzzing, coverage, and artefact verification.

Continue into the playbooks to run, observe, and govern the Astral Omnidominion Operating System with confidence.
