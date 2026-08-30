# Celestial Imperium Operating System Exhibition

The **Celestial Imperium Operating System Exhibition** curates the repository's flagship `demo:agi-os:first-class` run into an
executive-grade experience for non-technical operators. It uses only battle-tested functionality that already ships in the
repository – chiefly the Astral Omnidominion First-Class demo pipeline – and layers a guided narrative, live-ops checklist, and
push-button launch script so that a business owner can rehearse a planet-scale AGI mission without touching code.

## What This Exhibition Delivers

- **Push-button bootstrap.** A single launcher script wraps the existing Astral Omnidominion wizard so operators can confirm
  configuration, trigger one-click infrastructure, and execute the full AGI OS mission rehearsal in one go.
- **Human-friendly runbook.** Companion documents translate the underlying scripts into a checklist that mirrors the control-room
  procedure used by the core engineering team.
- **Audit-grade evidence.** Every artefact produced by `demo:agi-os:first-class` – simulations, owner authority matrices, HTML
  executive summaries, SHA-verified manifests – is preserved under `reports/agi-os/first-class/` for downstream review.
- **Owner supremacy.** The exhibition emphasises the owner’s total ability to pause, resume, or retune every governed module using
  the existing control matrix tooling and governance console.
- **CI v2 compliance.** It instructs operators how to re-run and enforce the full green CI suite so that any demonstration mirrors
  production guardrails.

## Quick Launch (Non-Technical Friendly)

1. Install Docker Desktop (or Docker Engine + Compose plugin) and clone this repository.
2. Open a terminal at the repository root and execute:

   ```bash
   demo/CELESTIAL-IMPERIUM-OPERATING-SYSTEM-EXHIBITION/bin/launch.sh
   ```

3. Follow the Astral Omnidominion wizard prompts. Accept the default **Local Hardhat (Anvil)** network for a self-contained demo
   or select Sepolia if you already manage a funded governance safe. When asked, opt-in to automatically start Docker Compose so
   the owner console, enterprise portal, and validator dashboard come online.
4. Allow the pipeline to finish. The console will stream emoji-tagged progress for each phase (preflight, deployment wizard, AGI
   OS rehearsal, owner control verification, HTML rendering, manifest synthesis, cross-verification). When you see the
   `🌠 Astral Omnidominion demo completed successfully` banner, the bundle is ready.
5. Open the generated artefacts:
   - `reports/agi-os/grand-summary.md` – executive briefing for stakeholders.
   - `reports/agi-os/grand-summary.html` – dark-mode HTML rendering for presentations.
   - `reports/agi-os/owner-control-matrix.json` – exhaustive owner control matrix.
   - `reports/agi-os/first-class/first-class-run.json` – end-to-end telemetry and log index.
   - `reports/agi-os/first-class/first-class-manifest.json` – SHA-256 inventory for audit traceability.

## Exhibition Flow

The launcher is a thin veneer over `scripts/v2/agiOsFirstClassDemo.ts`, which already bundles:

1. **Preflight validation** – verifies Docker, Compose, Node version, git cleanliness, and dependency presence before any mission
   step executes.
2. **Interactive network & deployment wizard** – wraps the one-click stack orchestrator so operators can review and accept
   configuration before containers and contracts deploy.
3. **Grand demonstration** – executes the deterministic ASI labour-market rehearsal, generates simulation telemetry, and produces
   the mission dossier under `reports/agi-os/`.
4. **Owner control diagram & verification** – renders an updated Mermaid system map, verifies control-surface coverage, and checks
   that owner modules match the published summary.
5. **Executive HTML & manifest** – converts the Markdown summary into a presentation-friendly HTML sheet and enumerates every
   artifact with SHA-256 hashes.
6. **Integrity reconciliation** – cross-verifies the owner matrix, summary, and manifest to guarantee consistency before the run
   completes.

Because the flow only invokes existing repository scripts and Hardhat tasks, it inherits the same reliability and security
assurances that gate production releases.

## Owner Control Spotlight

- Review the generated owner matrix (`reports/agi-os/owner-control-matrix.json`) and the mirrored section inside
  `grand-summary.md` to confirm every governed module is ready, needs configuration, or has missing surfaces.
- Use the Owner Console (served via Docker Compose on `http://localhost:3000`) to unpause modules or adjust parameters through the
  existing governance forms. The wizard deploys contracts in the globally paused state so the owner can safely stage changes
  before resuming the protocol.
- If you need to apply a change via CLI, the control matrix includes the exact Hardhat command for each module. Combine those with
  the `owner:verify-control` script to validate outcomes after execution.

## CI v2 Enforcement

1. Execute the CI suite locally to mirror the required GitHub checks:

   ```bash
   npm run lint:ci
   npm test
   npm run coverage:check
   npm run check:access-control
   npm run coverage
   ```

2. Regenerate coverage and audit artefacts if the demo introduced new logs you want to capture with the bundle.
3. Confirm branch protection is wired to enforce these checks on GitHub using the built-in verifier:

   ```bash
   npm run ci:verify-branch-protection
   ```

A successful exhibition therefore doubles as a CI v2 rehearsal. Any red step means production CI would have failed as well,
ensuring the operator never diverges from engineering-grade safeguards.

## Clean Shutdown

After reviewing the mission bundle and UI dashboards, tear down the infrastructure with:

```bash
docker compose down --remove-orphans
```

Artefacts remain under `reports/agi-os/` for future audits or investor hand-offs.

## Next Steps

- Share the mission bundle with stakeholders. The manifest includes SHA-256 digests so recipients can verify integrity.
- Rerun the exhibition on Sepolia (or mainnet dry-runs) by providing the corresponding configuration files to the wizard.
- Extend the package with additional AGI use-cases by posting live jobs through the enterprise portal – the orchestrator and
  validator dashboards are already online once the one-click stack is running.

Enjoy commanding the Celestial Imperium.
