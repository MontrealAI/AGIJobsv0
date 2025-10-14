# Imperatrix Celestia Operating System Demo

> "Press once. Receive a planetary-scale AGI workforce, complete with governance control, audit artefacts, and live dashboards." – Imperatrix Celestia mission control

## Why this demo exists

Imperatrix Celestia packages the existing AGI Jobs v0 (v2) grand demonstration into a single, ceremonial launch sequence that a non-technical owner can run without editing code. It layers a curated runbook on top of the battle-tested `demo:agi-os:first-class` pipeline so that the operator receives:

- ✅ An end-to-end deterministic labour market rehearsal on-chain via the ASI take-off simulator.
- ✅ Automatic one-click deployment (including Docker Compose orchestration) and environment validation.
- ✅ Governance evidence: owner control matrices, Mermaid diagrams, manifests, and SHA-256 hashes.
- ✅ Big-green-button ergonomics that expose owner pause / resume controls and enterprise UX touchpoints.
- ✅ CI V2 alignment – the same checks and verifications surfaced in an executive-friendly way.

## Quickstart (push-button launch)

```bash
# 1. Ensure Docker Desktop / Engine is running and Node.js 20.x is on PATH.
# 2. From the repository root:
./demo/imperatrix-celestia-operating-system/bin/launch.sh
```

The launcher will:

1. Install dependencies on the first run (skipped on subsequent executions).
2. Execute the first-class demo with safe defaults (`--network localhost`, `--compose`, `--yes`).
3. Run the one-click deployment wizard, bring up Docker Compose, refresh the ASI take-off artefacts, verify owner control, and emit HTML / JSON reports.
4. Leave you with a complete mission bundle under `reports/agi-os/` and a compose stack that serves the Owner Console (port 3000) and Enterprise Portal (port 3001).

To opt into the guided prompts (for example to target Sepolia), run:

```bash
./demo/imperatrix-celestia-operating-system/bin/launch.sh interactive --network sepolia --compose --yes
```

Any additional flags are passed directly to `npm run demo:agi-os:first-class`.

## Artefacts delivered

| Artefact | Purpose |
| --- | --- |
| `reports/agi-os/grand-summary.md` | Executive mission dossier – mission profile, simulation outcomes, and the Owner Control Authority Matrix. |
| `reports/agi-os/grand-summary.html` | Styled HTML rendering for immediate presentation to stakeholders. |
| `reports/agi-os/grand-summary.json` | Machine-readable metadata for automation or downstream dashboards. |
| `reports/agi-os/first-class/first-class-manifest.json` | SHA-256 hash manifest covering every mission artefact for audit/compliance. |
| `reports/agi-os/first-class/first-class-run.json` | Timeline of each automated step with exit codes, durations, and log file references. |
| `reports/agi-os/first-class/logs/*` | Structured logs (per step) for deep inspection. |
| `reports/agi-os/owner-control-matrix.json` | Full module-by-module governance control surface with update commands and config locations. |
| `reports/agi-os/first-class/owner-control-map.mmd` | Mermaid diagram describing ownership, modules, and levers (open in any Mermaid renderer). |
| `reports/asi-takeoff/*` | Thermodynamic telemetry, dry-run scenarios, and constants from the labour market rehearsal. |

Every artefact is regenerated on each launch, guaranteeing freshness and reproducibility.

## Experiencing the user interfaces

1. **Validator Operations Console** – visit `http://localhost:3000` once the compose stack is up. Connect a browser wallet (or burner key in local mode) to inspect pending jobs, issue commit / reveal votes, and observe validator telemetry in real time.
2. **Enterprise Portal** – open `http://localhost:3001` to submit an AGI job using the conversational form. The “Submit job” button dispatches the request through the orchestrator with zero manual wiring.
3. **Paymaster / Bundler surfaces** – `docker compose ps` exposes the paymaster supervisor (port 4000) and bundler (port 4337) for AA flows; the mission bundle documents their endpoints.
4. **One-Box (optional)** – load the static One-Box bundle with `?orchestrator=demo` query parameters to experience natural-language job planning without touching wallets during a dry run.

> 🛑 To stop the stack after the showcase, run `docker compose -f compose.yaml down` from the repository root.

## Owner control & safety checklist

After launch, review the following to confirm full owner authority:

1. **Pause / Resume** – run `npm run owner:pulse` to inspect pause state, then execute the `SystemPause` Hardhat updaters referenced in the matrix (for example `npx hardhat run --no-compile scripts/v2/pauseTest.ts`) to halt and resume the marketplace.
2. **Governance Forwarding** – reference `reports/agi-os/owner-control-matrix.json` for the `executeGovernanceCall` surface ensuring parameters remain tunable without relinquishing emergency control.
3. **Mermaid map** – open `reports/agi-os/first-class/owner-control-map.mmd` in a Mermaid viewer to visualise which contracts inherit `Ownable`, `Governable`, or `Pausable` traits.
4. **Emergency runbooks** – cross-check the generated bundle with `docs/owner-control-non-technical-guide.md` and `docs/owner-control-emergency-runbook.md` (existing repository guides) to verify the operator has immediate playbooks.

## CI v2 alignment & verification

Imperatrix Celestia intentionally mirrors the AGI Jobs CI (v2) requirements. After the demo, you can independently verify the tooling with:

```bash
npm run lint:ci
npm run test
npm run coverage:check
npm run check:access-control
npm run ci:verify-toolchain
npm run ci:verify-branch-protection -- --token <github_token_with_repo_scope>
```

- `lint:ci`, `test`, `coverage:check`, and `check:access-control` correspond to the required contexts consumed by the protected `main` branch.
- `ci:verify-toolchain` confirms lockfiles and compiler versions match the audited toolchain.
- `ci:verify-branch-protection` interrogates GitHub branch protection (requires a token) to guarantee that every CI (v2) job is enforced on PRs and on `main`.

A successful run of `./bin/launch.sh` plus the commands above yields the “fully green” CI badge demanded for production readiness.

## Advanced knobs

- Pass `--skip-deploy` if your infrastructure is already running the one-click stack and you only need refreshed artefacts.
- Combine `--yes --compose --network <target>` with `--env <path>` to drive bespoke environments declared in `deployment-config/`.
- To avoid automatic dependency installation, pre-run `npm install` and export `IMPERATRIX_SKIP_INSTALL=1` before invoking the launcher.

## Support & audit trail

All mission run metadata is summarised in `reports/agi-os/first-class/first-class-run.json`. Each entry lists the step, timestamps, exit code, and associated log file. If any command fails, the launcher stops immediately and surfaces the log path so an operator or auditor can diagnose within seconds.

Because the demo relies exclusively on existing repository scripts, you inherit every audit improvement, contract upgrade, and CI enhancement added to AGI Jobs v0 (v2) without additional maintenance.
