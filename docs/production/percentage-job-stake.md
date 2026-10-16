# Percentage-based collateral for new JobRegistry deployments

The percentage policy and the subsequent reputation corrections are merged in source release `source-v2.1.0-rc.12` (`b936efe066dc1b1f7a2fcc18ab9950d77cdf96d5`). This is source qualification for a separate new deployment; it does not qualify a Mainnet signing campaign or update recorded deployments. The dated test checkpoints below retain their original scope and limitations. No deployment, migration, unpause or token movement is authorized by this document.

## Economics

- Default rate: 1,000 basis points (10%). Only the registry's actual governance authority can set `setJobStakeBps(uint256)`; the accepted range is 0 through 10,000 inclusive. Zero explicitly disables per-job collateral for future jobs. One basis point is 0.01%; fractional basis points and rates over 100% are unsupported.
- Basis: the job's gross `reward`, excluding the protocol fee and unrelated balances. Required collateral is `ceil(reward * jobStakeBps / 10000)` in the token's smallest units. Positive fractional base-unit amounts round up, so reward 1 at 10% requires stake 1, not zero. Rewards use AGIALPHA's 18 decimals.
- `quoteJobStake(reward)` returns a prospective amount. It rejects rewards above uint128 and collateral above uint96, rather than truncating. The multiplication is bounded: reward <= uint128.max and rate <= 10,000, so both product and rounding addition fit uint256.
- The rate effective when creation is **mined** determines `Job.stake`. A quote made while preparing a transaction can change before mining. Clients must warn about this and display the recorded `Job.stake` and `JobCreated.stake` after confirmation. Applicants must use the posted job snapshot, not a fresh quote based on today's rate.
- Owner rate changes affect future jobs only. Existing nonterminal jobs keep their recorded amount through application, locking, settlement, cancellation and slashing. Existing terminal cleanup may clear `Job.stake`; historical events preserve the original amount.
- Zero-reward job creation is rejected. A zero reward quote is zero, but does not imply creation is permitted. Positive-reward jobs with a zero rate are supported.
- `JobRegistry.minAgentStake` and `StakeManager.minStake/minStakeFloor` remain independent global admission/deposit requirements. The deprecated fixed per-job 500 AGIALPHA amount is not retained as a hidden floor or added to the percentage.

## Explicit API and configuration migration

New current API: `jobStakeBps()`, `quoteJobStake(uint256)`, `setJobStakeBps(uint256)`. `JobStakeBpsUpdated(previousBps,newBps)` announces rate changes. Existing `jobs(jobId).stake` and `JobCreated.stake` retain token-amount semantics.

Legacy `jobStake()`, `DEFAULT_JOB_STAKE()`, `setJobStake(uint96)` and `setJobParameters(maxReward,fixedStake)` reject with `LegacyFixedStakeUnsupported`. A batch `applyConfiguration` that requests its old `setJobStake` flag also rejects atomically. A nonzero legacy constructor fixed-stake argument rejects. No fixed token amount is reinterpreted as a basis-point rate. Use the separate maximum-reward setter and new rate setter; the old compound API is not silently redefined.

Deployment JSON uses integer `econ.jobStakeBps`, normally 1000. `econ.jobStake` is rejected, including on local staged deployment. Public deployment requires explicit basis points; configuration samples still require real governance, reviewed tax choices and other launch settings. The coordinator's economic tuple changes its last field from uint96 fixed stake to uint256 basis points, intentionally changing function selectors. Old calldata must be regenerated; it must not be relabeled.

The current three JobRegistry delegates use `JobRegistryConfiguration:percentage-stake-v4`, `JobRegistryLifecycle:percentage-stake-v4`, and `JobRegistrySettlement:percentage-stake-v4` module IDs, incorporating the terminal-reputation correction. The current controller rejects earlier generations. Preserve complete matched controller/implementation sets. Historical prebuilt demo bundles retain their original matched controller and delegates and are not production candidates.

The old fixed storage slot is retained as an inactive internal slot, and rate storage is appended. This does **not** make old immutable controllers upgradeable, authorize storage transplantation or establish a migration mechanism. Deploy a separately verified new stack. Previous deployments are strictly outside this campaign's mutation scope: clearing old jobs, escrow, claims or stakes is not a prerequisite. Do not transact with old deployments, repoint their clients or change their approvals as part of this campaign.

## Review and tests

Required coverage: boundary/reference arithmetic; zero and tiny rewards; bounded owner access and events; mixed-version rejection; mined-time snapshot behavior; real-token funded fee exclusion; global minimum interaction; concurrent locks and repeated application; cancellation/refund, successful release, rejection and timeout slash; stale getter/setter/constructor/config rejection; frontend and owner-tool basis-point units; exact compiled runtime/initcode sizes and immutable comparisons.

Compilation and local test results must identify their exact source snapshot. No local-chain test is a mainnet-fork rehearsal. The current candidate remains subject to full legacy regression migration, independent AI-assisted review, canonical artifact policy, pinned mainnet-fork rehearsal and unresolved mainnet settings. AI-assisted review is not an external independent audit. The owner's separate no-audit/no-Sepolia choice does not waive these technical checks.

The current HGMControlModule preserves the old economic tuple layout but rejects its `setJobStake` flag with `LegacyFixedStakeUnsupported`. Its separate owner-only `updateJobStakeBps(uint256)` calls the new registry policy, accepts 0–10000 and is tested against a real percentage registry. Do not relabel old tuple calldata or deploy old automation expecting fixed-stake updates. Historical prebuilt demo artifacts and their matched v1 tests are retained as historical compatibility evidence, not advertised as percentage-enabled deployments.

## Current candidate evidence

The recovered prototype now has a canonical native 0.8.37 build, 865 passing official Hardhat tests, the real-collateral lifecycle suite and 1,000 cases per new fuzz property. See [the current preparation record](second-mainnet-review-2026-10-16.md#recovered-percentage-candidate--current-local-observations) for scope, source/log hashes and the explicitly unresolved supplemental TypeScript fixtures. This is a draft economic candidate, not a released or deployed policy.

### Caller migration and final local regression

The [additive caller receipt](percentage-stake-caller-migration-evidence.json) records a fresh canonical build and **867 passing official Hardhat tests**, including the HGM facade's explicit percentage route, legacy rejection and real-registry governance call. The original 865-test receipt and fork/invariant receipt remain unchanged as earlier checkpoints.

The redenomination planner keeps dimensionless basis points unchanged while converting token eligibility/reward fields, rejects both legacy fixed-stake keys, and labels the independent eligibility floor. Its 44 regressions, 44 Omega business regressions and local Chromium EN/FR/mobile/safe-rendering checks pass. The historical fixed-stake planning snapshots are retained under `demo/REDENOMINATION/archives/fixed-stake-before-percentage`; current snapshots are regenerated and playbook version 2.1.0 is explicit. Remote Mermaid loading was blocked in this browser run; the diagram fallback passed.

The owner dry-run now deposits the full 10% collateral and accounts for separately retained stake. Aurora uses explicit basis points bounded by funded demo collateral, restores the original basis-point rate and rejects legacy deployment configuration. The deterministic ASI kit, one-job local Aurora journey and three-job local ASI journey passed with simulated token/work inputs and operator-controlled validators. These journeys occurred before the additive HGM change; the final 867-test run covers that separate facade. Existing retained `reports/asi-takeoff` examples are preserved rather than overwritten by this run. These are not independent reviews, real revenue, mainnet-fork completion or commissioning.

## Confirmed inherited deployment blocker and reconciled fixtures

**Later correction in this candidate:** the separately scoped
[positive-growth repair](reputation-growth-correction-2026-10-15.md) preserves
earned scores and fixes the arithmetic panic described in this historical
checkpoint. Actual Registry settlement, payout and collateral-release regressions
now pass. Payout-unit and terminal/dispute-scoring defects remain deployment
blockers; no production approval follows from this correction.

**Deployment/release blocked:** the unchanged baseline ReputationEngine can reduce an accumulated score during a positive award and underflow `newScore - current`. The [executed diagnostic receipt](reputation-growth-blocker-2026-10-15.json) records `add(20000) → 19036`, then arithmetic panic `0x11` on `add(1)` and on the successful-finalization hook (34 calculated points). This local diagnostic uses the actual engine and MockStakeManager. Registry settlement rollback is an implication of its uncaught hook call; this diagnostic does not claim a real Registry settlement execution. Concurrent PR #3970 separately reports that reproduction. A separately reviewed reputation repair, producer-unit/exactly-once review and fresh whole-candidate qualification are mandatory. The owner's audit/Sepolia omissions do not waive this defect.

The published stake-stage commits from #3970 and owner-plan #3969 are reconciled as merge parents, preserving their ancestry alongside the additional real-collateral/invariant/HGM/demo work. Core percentage contracts match the other stake stage; production Solidity remains byte-for-byte unchanged from the canonical 6ca2230 checkpoint. The bounded compiler-metadata comparison is retained, and neither the additional collateral tests nor Foundry properties were removed.

The formerly failing supplemental fixtures now use the current minimum of three validators, full required module wiring, proper approvals and snapshot accounting. Failure settlement retains the current zero-payout reputation behavior; the original blacklist and rehabilitation assertions remain in a separate explicit authorized-penalty case. No new automatic-failure penalty policy is implied. Owner-plan tests assert every original poststate, delegated-manager preservation, explicit changes and a no-op repeat. **723 recursive v2 cases and 20 focused migration cases pass**, with overlap. CI explicitly registers the lifecycle/governance TypeScript cases. Whole-head hosted qualification and independent review remain open.

The [reconciliation receipt](percentage-stake-reconciliation-evidence.json) binds all three published parents, changed source hashes and the subsequent **867 official Hardhat passes**, 723 recursive v2 passes, focused TypeScript, onebox snapshot, standard orchestrator build and workflow formatting. Counts overlap. Its production Solidity is unchanged from the canonical 6ca2230 build, while new whole-head hosted qualification remains required. The P1 defect is explicitly reproduced rather than counted as a deployment pass.
