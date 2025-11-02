# Formal Verification Briefing — AGI Jobs v2

> **Audience.** Security researchers and external auditors preparing mathematical proofs for AGI Jobs v2.
>
> **Scope.** Highlights the mission-critical invariants, annotated verification targets, and concrete entry points for tools such as Scribble, Verx, or Certora Prover.

## 1. Objectives

1. **Guard user funds.** Demonstrate that no execution path can mint or burn protocol balances without an authorised owner or governance action.
2. **Maintain staking soundness.** Ensure stake balances never underflow, are never double-counted, and can only be slashed through validated dispute flows.
3. **Guarantee pause authority.** Prove that the `SystemPause` module is the single chokepoint for halting and resuming operations, and that the contract owner (or configured pause guardian) can always exercise that control.
4. **Preserve deterministic routing.** Show that job lifecycle transitions (commit, reveal, validation, settlement) respect ordering constraints already codified in the Hardhat + Foundry suites.

These objectives align with the production-readiness gates captured in the [invariants catalogue](../invariants.md) and the owner control playbooks requested by the contract owner.【F:docs/invariants.md†L1-L210】【F:docs/owner-control-master-checklist.md†L1-L176】

## 2. Artefact preparation

Run the existing audit dossier pipeline to regenerate ABI artefacts, coverage reports, and owner control manifests:

```bash
npm run audit:dossier
npm run owner:verify-control -- --json > reports/audit/owner-control.json
```

These outputs provide concrete state expectations (`reports/audit/summary.json`, `reports/audit/final-readiness.json`) that formal tools can ingest as reference traces.【F:docs/AUDIT_DOSSIER.md†L14-L96】【F:scripts/audit/final-readiness.ts†L1-L305】

## 3. Instrumentation plan

| Module | Source | Suggested annotations | Tooling notes |
| ------ | ------ | -------------------- | ------------- |
| **StakeManager** | `contracts/v2/StakeManager.sol` | Annotate stake accounting flows (`stake`, `slash`, `release`). Track invariants from property-based tests to ensure balances remain non-negative and slashes correspond to active disputes. | Export Scribble annotations (`forge test --ffi`) or Certora rules referencing `docs/stake-guidelines.md` for acceptable stake ratios.【F:contracts/v2/StakeManager.sol†L1-L400】【F:docs/stake-guidelines.md†L1-L112】 |
| **FeePool / RewardEngine** | `contracts/v2/FeePool.sol`, `contracts/v2/RewardEngine.sol` | Assert conservation of funds between treasury, burn, and participant rewards. Link to constants derived via `scripts/generate-constants.ts`. | Use Verx to symbolically explore reward distribution; align with coverage tests verifying emission caps.【F:contracts/v2/FeePool.sol†L1-L320】【F:contracts/v2/RewardEngine.sol†L1-L360】【F:scripts/generate-constants.ts†L1-L200】 |
| **SystemPause** | `contracts/v2/SystemPause.sol` | Require that only configured roles can toggle the pause, and that paused state blocks lifecycle calls (`jobRouter`, `platformRegistry`). | Compose rules referencing [`docs/system-pause.md`](../system-pause.md) to confirm emergency controls map to expected addresses.【F:contracts/v2/SystemPause.sol†L1-L250】【F:docs/system-pause.md†L1-L92】 |
| **JobLifecycleRouter** | `contracts/v2/JobLifecycleRouter.sol` | Maintain ordering invariants from commit → reveal → validation. Ensure transitions respect stake thresholds and pause guards. | Cross-reference dispute and settlement runbooks to anchor environment assumptions.【F:contracts/v2/JobLifecycleRouter.sol†L1-L420】【F:docs/job-lifecycle.md†L1-L180】 |

Document any Scribble or Certora annotations beside the Solidity contracts under `contracts/v2/annotations/` so they remain versioned with the codebase.

## 4. Suggested workflows

1. **Scribble + Foundry loop**
   ```bash
   npm run compile
   npx scribble contracts/v2 --output-mode files --output contracts/v2/annotations
   forge test -vvvv --ffi --fuzz-runs 256
   ```
   Integrate generated instrumentation into `forge` profiles to reuse the existing fuzz suites (already orchestrated in CI via the Foundry job).【F:.github/workflows/ci.yml†L75-L117】

2. **Certora Prover run**
   * Export ABIs with `npm run abi:export` (part of the CI pipeline).【F:package.json†L10-L101】
   * Configure the owner and governance addresses from `config/owner-control.json` to mirror production parameters.【F:config/owner-control.json†L1-L400】
   * Encode invariants as Certora rules referencing the reward and pause modules.

3. **Verx / Model checking**
   * Translate the pause and stake modules into Verx semantics focusing on temporal properties (e.g., “once paused, no settlement occurs until resumed”).
   * Use traces generated from `test/e2e/localnet.gateway.e2e.test.ts` as witness sequences.【F:test/e2e/localnet.gateway.e2e.test.ts†L1-L220】

## 5. Deliverables for the audit dossier

* Annotated Solidity files under `contracts/v2/annotations/` (or attached zipped archive) with Scribble assertions.
* Proof transcripts or HTML reports from Certora/Verx with command-line invocations.
* Summary memo mapping each invariant in `docs/invariants.md` to a proof artefact.
* Update `reports/audit/summary.json` with a new entry referencing the formal verification run ID.

## 6. Hand-off checklist

- [ ] All annotations committed or archived with matching Git revision.
- [ ] Proof commands reproducible using the same Node/Foundry versions recorded in `reports/audit/summary.json`.
- [ ] Optional: Attach zipped proof artefacts using the audit packaging helper (`npm run audit:package -- --extra <proof-dir>`).【F:scripts/audit/package-kit.ts†L1-L259】

This briefing transforms the “Formal Verification of Critical Invariants” recommendation into an actionable, auditable plan aligned with the production sprint. Auditors receive precise entry points, parameter bindings, and output expectations so the proofs slot directly into the existing deployment and governance workflows.
