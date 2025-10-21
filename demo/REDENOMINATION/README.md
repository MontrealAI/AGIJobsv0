# 🎖️ REDENOMINATION 👁️✨ Demo

Welcome to the sovereign-grade redenomination showcase for **AGI Jobs v0 (v2)**. This directory packages an end-to-end,
non-technical mission that demonstrates how a single command invokes the platform’s governed autonomy, verifiable compute,
and institutional observability. It is designed to convince even the most risk-averse stakeholder that AGI Jobs v0 (v2) is the
superintelligent control room for global-scale labor markets.

New in this iteration:

- **Multilingual mission control** – all storyboard copy is available in English and French, with instant toggles so
  executive teams across jurisdictions can run the drill together.
- **Interactive phase navigator** – the primary storyboard now ships with an adaptive phase selector that lets a
  non-technical sponsor rehearse each lifecycle checkpoint step-by-step.
- **Artefact integrity verification** – scenario validation now inspects translation catalogues and UI anchors to
  guarantee nothing drifts out of sync before the automation scripts are executed.

---

## Why this demo matters

- **Governance-first** – every privileged action routes through the multi-signature timelock and the moderator council can
  pause or arbitrate at any time.
- **Provable execution** – agents sign and hash every deliverable, validators run commit–reveal voting, and certificate NFTs
  enshrine results on-chain.
- **Institutional telemetry** – audit events, Prometheus metrics, and Grafana dashboards ensure regulators and executives share
a live ground truth.
- **One-click empowerment** – run a single npm script and receive a narrated simulation plus UI assets that explain each
  subsystem without requiring developer knowledge.

---

## Quickstart

1. Install dependencies and compile the protocol (optional but recommended for first-time setup).

   ```bash
   npm install
   npm run compile
   ```

2. Prove the artefacts are production-grade:

   ```bash
   npm run demo:redenomination:verify
   ```

   The verifier inspects `scenario.json`, validates referenced documentation paths, cross-checks automation commands against
   `package.json`, and confirms the storyboard ships with a Mermaid orchestration graph and exportable control-room dataset. If
   anything drifts, the script fails fast with explicit remediation guidance.

3. Launch the **REDENOMINATION** mission transcript:

   ```bash
   npm run demo:redenomination
   ```

   This command prints the governed scenario using `scenario.json`, highlighting actors, phases, operational guardrails, and
   follow-up automation hooks that a non-technical operator can trigger verbatim.

4. Open the immersive UI storyboard in any browser:

   ```bash
   npx serve demo/REDENOMINATION
   ```

   The `index.html` page auto-loads the shared scenario, renders the mermaid architecture graph, and provides a responsive
   timeline, guardrails view, and a one-command runbook. No bundlers or build steps required.

---

## Scenario anatomy

| Component        | Description                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `scenario.json`  | Canonical description of actors, lifecycle phases, operational metrics, and authoritative runbook references. |
| `scripts/`       | Automation entry points. `verify-scenario.mjs` hardens artefacts, while `run-demo.mjs` streams a narrated transcript mirroring the real deployment plan.  |
| `index.html`     | All-in-one web storyboard with mermaid diagrams, responsive cards, and actionable CTAs for stakeholders.      |

The JSON file is intentionally minimal so that governance can amend parameters (stake requirements, committee size, audit
rate) without modifying scripts.

---

## Extend the mission

- **Regenerate confidence:** run `npm run demo:redenomination:verify` after editing the scenario or UI assets to reconfirm every
  reference remains production-safe.
- **Connect to live infrastructure:** export `NETWORK=sepolia` and supply deployed contract addresses through `deployment-config/`
  before invoking the normal deployment scripts.
- **Update policy controls:** run `npm run owner:command-center` to propose allow/deny list changes in the Policy Registry.
- **Trigger safety drills:** execute `npm run owner:system-pause` followed by `npm run owner:command-center` to walk through the
  full emergency-stop playbook.
- **Instrument monitoring:** run `npm run monitoring:validate` to ensure Prometheus + Grafana dashboards are healthy before
  switching to mainnet scale.

---

## Non-technical operator checklist

1. **Deploy stack** – `npm run deploy:oneclick:auto` (accept defaults or point to mainnet addresses).
2. **Transfer control** – approve the generated governance proposal to move ownership to the timelock multi-sig.
3. **Onboard identities** – `npm run identity:register` to bind ENS subdomains to agent and validator nodes.
4. **Set guardrails** – `npm run owner:parameters` to review and update stake thresholds, policy categories, and slashing
   rules.
5. **Launch job** – follow the chat-style UI prompts to post the redenomination job and watch validator commits stream in.
6. **Review telemetry** – open the Grafana dashboards defined in `monitoring/dashboards/` to monitor throughput, validator
   participation, and anomaly alerts in real time.

---

## Verifiability & compliance hooks

- **Audit trail:** every transaction emits audit events consumed by the subgraph and surfaced through the `observability:smoke`
  script.
- **Security posture:** see `SECURITY.md` plus the bug bounty program to invite third-party testing.
- **Formal assurances:** run `npm run echidna` and `npm run coverage` to regenerate the formal checks behind the commit–reveal
  and staking invariants.

---

## Inspiration to build further

This demo is intentionally opinionated. Fork `scenario.json`, adjust guardrails, and iterate on the UI to produce verticalized
missions (e.g., national debt redesign, universal carbon credit issuance). AGI Jobs v0 (v2) gives non-technical leaders the
superintelligent command surface they need to redesign economies with confidence.

