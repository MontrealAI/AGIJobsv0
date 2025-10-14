# AGI Jobs v0 (v2) – Astral Omnidominion Operating System Demo

The Astral Omnidominion demo is the flagship showcase of the AGI Jobs v0 (v2) operating system. It turns the end-to-end ASI take-off rehearsal, owner control checks, and audit bundle packaging into a guided tour that a non-technical owner can launch with a single command.

## Audience

- **Business owners** who need to launch or audit the platform without touching code.
- **Governance leads** who must demonstrate pause/update authority and produce evidence for stakeholders.
- **Security and compliance teams** who require hashes, logs, and configuration manifests for sign-off.

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Docker Desktop **or** Docker Engine + Docker Compose | Used for the one-click stack (Anvil node, backend services, front-ends). |
| Git | To clone the repository. |
| Unix shell (macOS, Linux, WSL) | The helper script is POSIX-friendly; Windows users can run it inside WSL2 or Git Bash. |

Node.js 20.18.1, Hardhat, Foundry, and other toolchains are bundled inside the repository scripts. You do not need to install them globally.

## Launching the Demo

1. Clone and enter the repository:
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   ```
2. Run the Astral Omnidominion orchestrator (both commands are equivalent):
   ```bash
   npm run demo:agi-os:first-class
   # or
   demo/astral-omnidominion-operating-system/bin/astral-omnidominion.sh
   ```
3. Follow the wizard prompts:
   - Choose **Local Hardhat (Anvil)** for an end-to-end offline rehearsal.
   - Confirm Docker Compose launch if you want the Owner Console, Enterprise Portal, and Validator Dashboard to start automatically.
   - Provide optional overrides (e.g. governance address) if you are targeting a shared testnet.
4. Watch the live status log. Each phase emits emoji-coded lines:
   - ✅ successful checks and steps
   - ⚙️ commands currently running
   - ❌ failures with guidance on how to retry

If any critical step fails, the orchestrator stops, records the error in `reports/agi-os/first-class/first-class-run.json`, and prints remediation tips.

## Outputs & Artefacts

After a successful run you will find the following:

- `reports/agi-os/grand-summary.md` – executive recap of the AGI OS mission, including mission profile, simulation results, and owner control matrix.
- `reports/agi-os/grand-summary.html` – automatically generated HTML rendering for sharing with stakeholders.
- `reports/agi-os/owner-control-matrix.json` – machine-readable list of every governable and ownable module plus its update command.
- `reports/agi-os/first-class/` – orchestration ledger containing:
  - `first-class-run.json` (step-by-step telemetry and exit codes)
  - `first-class-manifest.json` (SHA-256 hashes of all relevant artefacts)
  - `logs/*.log` (stdout/stderr for each command)
  - `owner-control-map.mmd` (Mermaid graph of owner/pausable relationships)

Every file is timestamped in ISO 8601 format, enabling auditors to prove freshness and reproducibility.

## Integrity Cross-Checks

Before marking the run as successful, the orchestrator rehydrates the freshly generated artefacts and validates them against each other:

- It recomputes the owner-control totals from the module list and confirms they match both `owner-control-matrix.json` and the embedded copy inside `grand-summary.json`.
- It inspects `first-class-manifest.json` to verify that the Markdown, JSON, HTML, and matrix outputs are all hashed and tracked.
- Any discrepancy produces an immediate ❌ failure with explicit remediation notes in `first-class-run.json`.

These cross-checks guarantee that the evidence bundle is internally consistent and audit-ready.

## Owner Control Verification

The orchestrator automatically:

1. Runs `npm run owner:verify-control` to confirm that every governable surface is wired to the SystemPause controller or direct owner as expected.
2. Regenerates the Owner Control Authority Matrix and Owner Mission Control report.
3. Produces a Mermaid diagram (`owner-control-map.mmd`) suitable for inclusion in board reports.

To experiment manually after the run:

```bash
npm run owner:command-center -- --action pause-all --network localhost
npm run owner:command-center -- --action unpause-all --network localhost
```

You can also explore the Owner Console UI at `http://localhost:3000` to trigger these actions from a browser with a connected wallet.

## Posting a Job via the Enterprise Portal

1. Ensure the Docker Compose stack is running (the demo wizard can start it automatically).
2. Open `http://localhost:3001`.
3. Complete the conversational form describing your task and budget.
4. Click **Submit job** – the portal handles wallet prompts and transaction submission. Validators will see the job in real time at `http://localhost:3002`.

The simulation data from `demo:agi-os` is sufficient for a full dry-run: no additional seeding is required.

## Resetting & Re-running

The demo is idempotent. Rerun the command to refresh all artefacts. To wipe state completely:

```bash
rm -rf deployment-config/generated reports/agi-os reports/asi-takeoff
```

Then rerun the orchestrator. New manifests and hashes are generated each time.

## CI Alignment & Branch Protection

- The orchestrator executes the same compilation, simulation, and owner-control checks that power CI v2, guaranteeing alignment between the demo and required GitHub checks.
- To confirm branch protection settings, run `npm run ci:verify-branch-protection`. The output lists required contexts (lint, tests, fuzzing, coverage, CI summary, end-to-end checks, webapp build, container scan).
- Always merge through a pull request so GitHub enforces the required checks on `main`.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `docker: not found` | Install Docker Desktop or Docker Engine. Re-run the demo after Docker is available in `$PATH`. |
| Wizard cannot copy `deployment-config/oneclick.env` | The wizard automatically creates it from `oneclick.env.example`. If that file was deleted, restore it from Git. |
| `npm run demo:agi-os` fails with missing contracts | Run `npm install` to ensure dependencies are present, then re-run the demo. |
| Ports 3000/3001/3002 already in use | Stop conflicting services or override the ports in `compose.yaml` before running the demo. |

## Escalation Paths

- **Operational issues** – consult [`docs/owner-control-non-technical-guide.md`](./owner-control-non-technical-guide.md).
- **Emergency controls** – run `npm run owner:emergency` to view the emergency response playbook.
- **Security posture** – see [`docs/security/operations.md`](./security/operations.md) for incident response integration.

The Astral Omnidominion demo is the recommended path to onboard new executives, investors, and auditors onto the AGI Jobs platform. It proves readiness, safety, and operational control in under an hour.
