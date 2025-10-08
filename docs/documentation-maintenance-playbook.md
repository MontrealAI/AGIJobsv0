# Documentation Maintenance Playbook (AGI Jobs v0)

> **Audience:** Documentation stewards, release managers, and contract owners who must guarantee that every published guide, runbook, and README entry reflects the live `contracts/v2` implementation and CI guardrails.
>
> **Goal:** Provide a repeatable audit trail that proves all documentation is current before every release or governance vote. The steps below combine automated link validation, contract-sourced parameter matrices, and owner-control verification so non-technical stakeholders can trust the corpus.

---

## 1. Daily Drift Scan

Run the automated link verifier to detect stale or renamed files referenced across the repository:

```bash
npm run docs:verify
```

- Scans `docs/`, `README.md`, `CHANGELOG.md`, `MIGRATION.md`, and `SECURITY.md` for relative links.
- Ignores external (`https://`, `ipfs://`, `mailto:`) links so the check remains deterministic offline.
- Fails fast with the list of missing files if any link no longer resolves locally.

> **Tip:** Add `npm run docs:verify` to pull-request templates and pre-merge CI when editing documentation-heavy features. The command is Node-only and completes in milliseconds on standard hardware.

---

## 2. Contract Truth Source Refresh

Every documentation review must refresh the on-chain control surfaces directly from Solidity:

1. **Regenerate owner parameter matrix**
   ```bash
   npm run owner:parameters -- --network <network>
   ```
   - Produces Markdown tables that mirror the [Owner Control Authority Reference](owner-control-authority-reference.md) so any setter added to contracts like [`JobRegistry`](../contracts/v2/JobRegistry.sol) and [`ValidationModule`](../contracts/v2/ValidationModule.sol) is captured automatically.【F:contracts/v2/JobRegistry.sol†L1096-L1359】【F:contracts/v2/ValidationModule.sol†L254-L807】

2. **Diff ABIs**
   ```bash
   npm run abi:diff
   ```
   - Ensures documentation that quotes function signatures (e.g., pausing, treasury updates) reflects the live ABI surface of governance-critical modules such as [`SystemPause`](../contracts/v2/SystemPause.sol).【F:contracts/v2/SystemPause.sol†L16-L168】

3. **Verify constants**
   ```bash
   npm run compile
   ```
   - Regenerates `contracts/v2/Constants.sol` from `config/` manifests so doc tables referencing `$AGIALPHA`, burn percentages, and validator thresholds stay aligned with production deployments.【F:contracts/v2/Constants.sol†L14-L63】

Archive the CLI outputs under `reports/<date>/documentation-audit/` for review boards.

---

## 3. Owner Control Validation

Confirm the contract owner retains authority over every mutable parameter before publishing updated instructions:

1. **Surface current control state**
   ```bash
   npm run owner:surface -- --network <network>
   ```
   - Summarises the active owner, pauser, and governance Safe wiring across modules.

2. **Run the owner control verifier**
   ```bash
   npm run owner:verify-control -- --network <network> --strict
   ```
   - Executes read-only checks to ensure the owner can pause [`JobRegistry`](../contracts/v2/JobRegistry.sol), update fee routing in [`FeePool`](../contracts/v2/FeePool.sol), and rotate thermodynamic parameters via [`RewardEngineMB`](../contracts/v2/RewardEngineMB.sol).【F:contracts/v2/FeePool.sol†L154-L441】【F:contracts/v2/RewardEngineMB.sol†L112-L227】

3. **Document emergency flows**
   - Cross-reference outputs with the [Owner Control Operations Playbook](owner-control-operations.md) and [System Pause guide](system-pause.md) to guarantee non-technical runbooks describe the latest pause/unpause, treasury, and validator rotation mechanics.

If any check fails, halt documentation publication until the discrepancy is corrected in code or configuration.

---

## 4. CI Gate Review

`ci (v2)` already enforces formatting, coverage, Foundry fuzzing, and ABI drift on every pull request. Before marking documentation "current":

1. Confirm branch protection still requires the `CI summary` check and its dependent jobs described in [v2 CI Operations](v2-ci-operations.md).
2. Re-run `gh api repos/:owner/:repo/branches/main/protection --jq '{required_status_checks: .required_status_checks.contexts}'` and attach the JSON excerpt to the documentation audit ticket.
3. Update [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md) if GitHub renames or adds workflows (for example, new security scans).

---

## 5. Publication Checklist

| Step | Command / Evidence | Notes |
| --- | --- | --- |
| Link integrity | `npm run docs:verify` | Attach stdout to the ticket. |
| Contract diff | `npm run owner:parameters`, `npm run abi:diff` | Include generated Markdown tables and ABI diff summaries. |
| Owner authority | `npm run owner:verify-control -- --strict` | Store JSON/Markdown proof under `storage/owner-ledger.json`. |
| CI enforcement | Screenshot or JSON from branch protection APIs | Confirms non-technical maintainers see every required status check. |
| Final sign-off | `storage/owner-ledger.json` entry | Log the documentation update event for auditors. |

Completing the checklist guarantees the documentation set remains trustworthy for regulators, auditors, and the contract owner.

---

## 6. Escalation Path

If the audit surfaces missing or inaccurate documentation:

1. **Open a change ticket** via `docs/owner-control-change-ticket.md` summarising the drift.
2. **Assign remediators** from the CODEOWNERS list mapped to the affected modules.
3. **Schedule a fix** within the next CI window and block releases until `npm run docs:verify` returns green.
4. **Capture lessons learned** in `docs/postmortems/<date>-documentation-gap.md` to prevent recurrence.

Following this playbook keeps AGI Jobs v0 documentation production-grade, tightly coupled to the Solidity truth source, and verifiably accurate for non-technical stakeholders.
