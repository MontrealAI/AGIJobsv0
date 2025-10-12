# AGI Jobs v0 Audit Dossier

This guide packages the exact evidence bundle requested for the "Recommended Next Coding Sprint: External Audit & Final Verification" milestone. It is written for third-party security auditors and internal reviewers that need to recreate the full verification state of the protocol without hunting through the repository. Pair this dossier with the [External Audit & Final Verification Playbook](audit/final-verification-playbook.md) and the `npm run audit:freeze` guardrail to ensure the repository is code-frozen before artefacts are minted.【F:scripts/audit/check-freeze.js†L1-L86】【F:package.json†L10-L101】

The repository already enforces a **green v2 CI** pipeline (`.github/workflows/ci.yml`) that executes linting, tests, coverage validation, ABI checks, and Foundry fuzzing. The instructions below mirror that workflow locally while also capturing artefacts (logs, JSON reports) in a single export directory suitable for hand-off.

## 1. Prerequisites

* Node.js 20.18.1 (automatically checked by the export script).
* `npm` (comes with Node.js).
* Optional but recommended: [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge` on the `PATH`) and [Slither](https://github.com/crytic/slither) for extended static analysis. The export script gracefully skips these steps if the tools are not present, while logging the omission.
* Docker is **not** required for the base dossier export. Echidna and other heavy fuzzers are already covered via the existing CI workflows and can be run separately if an auditor requests them.

## 2. Running the automated export

Execute the helper script to generate a complete dossier:

```bash
npm run audit:dossier
```

The script performs the following actions in a hardened order and stores the logs in `reports/audit/logs`:

1. Capture toolchain fingerprints (`node -v`, `npm -v`).
2. Install reproducible dependencies (`npm ci`).
3. Run Solidity + TypeScript linting (`npm run lint:ci`).
4. Regenerate protocol constants and compile the contracts (Hardhat).
5. Execute the Hardhat unit-test suite (`npm test`).
6. Check ABI compatibility drift (`npm run abi:diff`).
7. Produce coverage and access-control reports (`npm run coverage`, `npm run check:access-control`).
8. Perform dependency vulnerability scanning (`npm run security:audit`).
9. Prove the contract owner retains full operational control (`npm run owner:verify-control`).
10. Optionally run Foundry-based fuzz/property tests and Slither analysis when available.

Each step writes a structured log file and contributes to `reports/audit/summary.json`, which lists the status (`passed`, `failed`, or `skipped`) alongside the command that was executed. A failure aborts the export immediately and makes the failing log trivial to locate.

## 3. Artefacts produced

* `reports/audit/logs/*.log` &mdash; raw execution logs for every step, prepended with timestamps and commands for forensic traceability.
* `reports/audit/summary.json` &mdash; machine-readable overview containing commit hash, branch, generation timestamp, and step status entries.
* `reports/audit/slither.json` (optional) &mdash; emitted when Slither is installed to capture high/medium/low findings using Crytic's JSON schema.

These files, combined with the existing coverage HTML output (`coverage/`), provide auditors with an immutable snapshot of the repository state.

## 4. Manual validation checklist

In addition to the automated export, auditors should review the following manual artefacts:

| Area | Evidence | Location |
| ---- | -------- | -------- |
| Governance & owner controls | Runbooks and CLI automation demonstrating parameter changes, pausing, emergency workflows | `scripts/v2/owner*` commands (see Section 5) |
| Deployment manifests | Deterministic contract manifests and post-deploy diffing utilities | `reports/`, `scripts/release/*` |
| Monitoring & observability | Sentinel templates, validation scripts, tabletop incident drills | `monitoring/`, `scripts/observability-smoke-check.js`, `scripts/security/run-tabletop.ts` |
| Formal safety nets | Property-based tests (`foundry` profiles), Echidna harnesses (`echidna/`), access-control coverage gates | `fuzz/`, `test/`, `.github/workflows/fuzz.yml` |

## 5. Owner control capabilities (audit focus)

The AGI Jobs v0 contracts expose a comprehensive owner/governance interface. The following commands demonstrate key invariants requested by the project owner:

```bash
# Summarise all governance-controlled parameters and their mutability
npm run owner:parameters

# Produce a machine-readable owner control matrix for audit sign-off
npm run owner:verify-control

# Emit the emergency pause runbook (pausing/unpausing, failover paths)
npm run owner:emergency

# Visualise module ownership and delegation graph for the committee/multisig
npm run owner:diagram

# Run an automated health check that fails if any module cannot be updated
npm run owner:health
```

These scripts run without requiring private keys and verify, via call-static simulations, that governance retains the ability to adjust fees, validator requirements, thermodynamic thresholds, and pause/unpause the protocol. They also assert that control is **not** delegated to unknown addresses, satisfying the requirement that the contract owner can modify every relevant parameter.

## 6. CI & branch protection enforcement

The `ci (v2)` workflow (`.github/workflows/ci.yml`) is required on both `main` and pull requests. The branch protection check is verified by `npm run ci:verify-branch-protection`, ensuring external contributors cannot merge code that bypasses the audit gate. The audit dossier export mirrors this configuration locally so auditors can pre-validate changes before raising PRs.

## 7. Suggested audit hand-off package

When freezing the code for audit:

1. Run `npm run audit:dossier` and archive the generated `reports/audit` directory together with the coverage HTML and gas snapshots.
2. Include the latest `reports/release-manifest.json` and `reports/sbom/cyclonedx.json` if supply-chain review is requested.
3. Attach the `docs/` folder, especially this dossier and the existing deployment & runbook documentation.
4. Share the `README.md` sections covering architecture, monitoring, and incident response with auditors.

This package, plus the automated logs, satisfies the "External Audit & Final Verification" readiness checklist.

## 8. Continuous improvement hooks

* Any audit finding should result in a failing unit test or invariant that reproduces the issue. Add it to the repository before shipping the fix.
* Update `reports/audit/summary.json` whenever re-running the dossier so auditors can diff successive exports.
* Extend the export script with additional steps (e.g., `npm run gas:check`, testnet dry-run scripts) as the deployment team finalises the release rehearsal.

By following this guide, teams can present auditors with a deterministic, reproducible dossier that demonstrates production readiness at institutional scale.
