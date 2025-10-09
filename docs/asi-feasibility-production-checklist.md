# ASI Feasibility Production Checklist

> **Audience:** Executive sponsors, governance councils, and contract owners who must sign off on
> AGI Jobs v0 (contracts v2) against the *Achieving ASI with Meta-Agentic Program Synthesis and
> α‑AGI Architecture* feasibility bar.
>
> **Goal:** Condense the repository's evidence into a single decision checklist that confirms the
> platform is meta-agent ready, self-improving, owner-controlled, and protected by the fully-green
> CI v2 pipeline before institutional deployment.

---

## 1. Meta-agentic capability review

1. **Validate orchestrator surfaces.** Exercise the planner → simulator → executor flow via the
   Onebox orchestrator endpoints and archive the transcript so reviewers can trace the meta-agent's
   task decomposition and result integration.【F:docs/orchestration.md†L3-L62】
2. **Inspect learning artefacts.** Confirm `storage/learning/records.jsonl`, sandbox reports, and
   identity metadata update when agents complete jobs or clones are spawned. These artefacts prove
   the evolutionary program synthesis loop is capturing state for future iterations.【F:docs/continuous-learning.md†L1-L58】
3. **Re-run retraining.** Execute `npm run learning:refresh` and `npm run learning:retrain` for all
   active agents, then diff the updated identity files. File the console output and diffs with the
   audit package to demonstrate the self-improvement loop is live.【F:docs/continuous-learning.md†L33-L58】

---

## 2. Owner authority and safety barriers

1. **Dry-run configuration changes.** Use the owner control wizard and dashboard commands to preview
   every parameter update, capture receipts, and prove the owner has deterministic authority without
   editing Solidity.【F:docs/owner-control-non-technical-guide.md†L31-L170】
2. **Verify emergency controls.** Run `npm run pause:test -- --network <network> --json` and attach
   the generated report, confirming `SystemPause` can halt each module and that pauser keys align
   with governance expectations.【F:docs/system-pause.md†L1-L60】
3. **Document authority snapshots.** Export `owner:verify-control`, `owner:surface`, and
   `owner:parameters` artefacts so auditors can confirm every setter and circuit breaker remains
   under owner or governance control.【F:docs/production/deployment-readiness-index.md†L36-L80】

---

## 3. Economic drive and thermodynamic calibration

1. **Regenerate thermodynamic reports.** Produce the Maxwell–Boltzmann reward summary with
   `npm run thermodynamics:report` and file the Markdown output alongside the finance-approved
   baseline to demonstrate tuning remains within policy.【F:docs/thermodynamics-operations.md†L1-L82】
2. **Review RewardEngineMB configuration.** Confirm role shares, thermostat binding, and energy
   oracle wiring match the documented parameters before releasing funds.【F:docs/reward-settlement-process.md†L34-L110】【F:contracts/v2/RewardEngineMB.sol†L13-L115】
3. **Cross-check stake and treasury manifests.** Use the owner control scripts to diff
   `config/*.json` against on-chain state, ensuring rewards and treasury routes align with the
   economics playbooks.【F:docs/owner-control-parameter-playbook.md†L12-L94】

---

## 4. CI v2 and test evidence

1. **Confirm branch protection.** Run `npm run ci:verify-branch-protection` (with a scoped token) and
   store the output showing all five required contexts and administrator enforcement, keeping the CI
   summary gate authoritative.【F:docs/v2-ci-operations.md†L33-L91】
2. **Replay the pipeline locally.** Execute the CI-equivalent sequence (`format:check`, `lint:ci`,
   `test`, `coverage`, `forge test`) and archive logs for the release ticket. This reproduces the
   fully green signal required by institutional controls.【F:docs/asi-feasibility-verification-suite.md†L16-L32】
3. **Capture coverage artefacts.** Persist the `coverage-lcov` artifact and branch protection proof
   with the launch package so reviewers can independently validate quality bars.【F:docs/ci-v2-branch-protection-checklist.md†L12-L60】

---

## 5. Deployment readiness dossier

1. **Update the readiness index.** Walk through the Production Readiness Index and mark each row
   green only after capturing the primary and independent evidence listed, reinforcing the
   triple-verification rule.【F:docs/production/deployment-readiness-index.md†L11-L77】
2. **Attach ASI feasibility evidence.** Use the verification suite to collect agent transcripts,
   thermodynamics proofs, pause drills, and owner authority receipts, then file them in the
   governance vault with countersignatures.【F:docs/asi-feasibility-verification-suite.md†L12-L86】
3. **Record change tickets.** Update `docs/owner-control-change-ticket.md` with links to every
   artefact, CI run URL, and Safe bundle used for the release so the governance trail stays
   immutable.【F:docs/owner-control-change-ticket.md†L1-L120】

---

## 6. Sign-off procedure

1. Review the completed checklist with the Validator Council and confirm no warnings remain in the
   owner, thermodynamics, or pause reports.
2. Capture signatures from the governance multisig or timelock controllers approving the release.
3. Archive the signed checklist, artefacts, and CI proof with the institutional records team before
   announcing go-live.

Maintaining this checklist alongside the existing crosswalk and verification suite ensures every
release demonstrably satisfies the ASI feasibility roadmap while keeping the contract owner in full
command of AGI Jobs v0.
