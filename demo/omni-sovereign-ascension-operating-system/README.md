# Omni-Sovereign Ascension Operating System Showcase 🚀

The **Omni-Sovereign Ascension Operating System Showcase** packages the existing `demo:agi-os:first-class` pipeline into a concierge-grade experience for non-technical operators. It leverages the battle-tested automation that already ships with AGI Jobs v0 (v2)—no new smart contracts or bespoke binaries are introduced. Instead, we provide a hardened orchestration script, clear UX guidance, and audit-ready checklists so that a business stakeholder can launch the entire AGI Jobs operating system (including blockchain deployment, ASI take-off rehearsal, owner control matrix synthesis, dashboards, and mission dossier generation) with a single command.

This showcase intentionally **reuses only upstream functionality**:

- Infrastructure bootstrapping is delegated to the Docker-based one-click deployer (`npm run deploy:oneclick:wizard`).
- The flagship OS demonstration is powered by `scripts/v2/agiOsFirstClassDemo.ts` (`npm run demo:agi-os:first-class`).
- Governance controls, dashboards, and validation UIs come from the existing Owner Console, Enterprise Portal, and Validator UI containers defined in `compose.yaml`.
- Safety and audit guarantees inherit the proven CI v2 workflows, coverage gates, and owner-control assets that already ship in `reports/agi-os` and `docs/`.

Together, these components deliver a **push-button, planet-scale operating system rehearsal** that remains production-grade and fully governed by the contract owner.

## 1. Zero-to-Orbit Launch (One Command)

The fastest way to witness the full operating system in action is to run the launch script bundled with this showcase:

```bash
npm run demo:omni-sovereign
```

The script performs the following high-level actions:

1. Runs the **One-Click Deployment Wizard** with safe defaults, deploying the complete AGI Jobs v0 (v2) stack to the local Anvil network inside Docker containers.
2. Invokes the **First-Class Operating System Demo**, which compiles the contracts, executes the deterministic ASI take-off labour-market simulation, synthesises the Owner Control Authority Matrix, emits live progress indicators, and packages an audit-grade mission bundle under `reports/agi-os/first-class/`.
3. Prints the URLs for the Owner Console, Enterprise Portal, and Validator Dashboard so the operator can immediately interact with the running stack via large, friendly action buttons.

> 💡 **Non-technical ready:** The wizard provides descriptive prompts (with defaults you can accept by pressing Enter), while the demo automatically answers any follow-up confirmations. No manual editing of JSON or environment files is required.

## 2. Manual Launch (Step-by-Step)

Prefer to run each step explicitly? Follow this path—every command below already exists in the repository:

1. **Bootstrap environment variables (optional)**
   ```bash
   npm run deploy:env
   ```
   This mirrors the one-click helper that fills in `deployment-config/oneclick.env` with safe local settings.

2. **Deploy the full stack with guided prompts**
   ```bash
   npm run deploy:oneclick:wizard
   ```
   Respond to the prompts (press Enter to accept the defaults). The wizard provisions Docker containers, migrates contracts, publishes ownership snapshots, and pauses all modules for safety.

3. **Execute the first-class operating system rehearsal**
   ```bash
   npm run demo:agi-os:first-class -- --auto-yes
   ```
   The script streams colourised status updates for each pipeline stage. On completion you will find:
   - `reports/agi-os/grand-summary.md` – executive-friendly mission dossier
   - `reports/agi-os/owner-control-matrix.json` – machine-readable owner command centre map
   - `reports/agi-os/first-class/first-class-manifest.json` – SHA-256 integrity manifest for every artifact

4. **Open the user interfaces** (Docker Compose exposes them automatically):
   - Owner Console: http://localhost:3000
   - Enterprise Portal: http://localhost:3001
   - Validator Operations Centre: http://localhost:3002

   Each UI includes explicit confirmation buttons, live status boards, and form-driven workflows for creating jobs, reviewing submissions, or issuing governance actions.

## 3. Mission Playbook

To support high-stakes production rehearsals, consult the accompanying [MISSION-PLAYBOOK.md](./MISSION-PLAYBOOK.md). It contains:

- A preflight checklist confirming Docker, Node, and Compose versions.
- A live-ops timeline detailing when to run the wizard, the demo, and UI validation flows.
- Explicit owner-control drills (pause/unpause, parameter updates) executed via the Owner Console or existing Hardhat scripts.
- Audit log collation steps, including how to verify `first-class-manifest.json` hashes and cross-check the CI v2 pipeline status.

## 4. Owner Control Guarantees

The showcase emphasises that **the contract owner retains complete control** over every protocol lever:

- The generated Owner Control Matrix enumerates all managed modules and surfaces any configuration gaps.
- The Owner Console exposes pause/resume toggles and parameter update forms backed by the existing `SystemPause.executeGovernanceCall` capabilities.
- Emergency operations are backed by runbooks (`npm run owner:emergency`) and pause tests (`npm run pause:test`).

Operators should review the matrix inside `reports/agi-os/grand-summary.md` after each run and execute drills from the playbook to familiarise themselves with every lever.

## 5. CI v2 Readiness & Verification

This showcase does not replace the CI v2 pipeline—it makes it more accessible:

- Re-running the demo on a clean tree mirrors the CI execution path (compilation, deterministic simulation, artifact generation). Any CI failure will also surface here.
- Use the existing guardrails to **triple-verify** production readiness:
  - `npm run lint:ci`
  - `npm run test`
  - `npm run coverage:check`
  - `npm run check:access-control`
  - `npm run ci:verify-branch-protection`

Document every run by storing the terminal transcripts alongside the mission bundle for auditability.

## 6. Extending or Customising the Demo

Because the showcase relies exclusively on upstream scripts, the contract owner can customise parameters without touching code:

- Adjust deployment parameters in `deployment-config/oneclick.env` before launch.
- Pass `--network sepolia` to `npm run demo:agi-os:first-class` to target the Sepolia preset after populating the required RPC credentials.
- Use the Owner Console to update fees, staking thresholds, treasury wallets, or to pause specific subsystems—changes are immediately reflected in the generated mission bundle.

Should you need to iterate on mission narratives or visuals, simply edit the Markdown assets in this directory; the underlying automation remains unchanged and production-hardened.

---

**TL;DR** – Press the big green button (`npm run demo:omni-sovereign`) and watch AGI Jobs v0 (v2) orchestrate a full operating system rehearsal, complete with blockchain execution, live dashboards, and audit-grade documentation—without writing a single line of code.
