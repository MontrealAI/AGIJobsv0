# Percentage-based collateral for new JobRegistry deployments

This is a new deployment candidate, not an upgrade of the recorded mainnet contracts. It is separate from source release rc8 and its artifacts. No deployment, migration, unpause or token movement is authorized by this document.

> Historical stake-only stage: PR3970. The subsequent terminal-reputation-v3 candidate changes engine/controller compatibility and supersedes the module IDs below; see [terminal policy and qualification gates](terminal-reputation-v3.md). No old deployment is altered.

## Economics

- Default rate: 1,000 basis points (10%). Only the registry's actual governance authority can set `setJobStakeBps(uint256)`; the accepted range is 0 through 10,000 inclusive. Zero explicitly disables per-job collateral for future jobs. One basis point is 0.01%; fractional basis points and rates over 100% are unsupported.
- Basis: the job's gross `reward`, excluding the protocol fee and unrelated balances. Required collateral is `ceil(reward * jobStakeBps / 10000)` in the token's smallest units. Positive fractional base-unit amounts round up, so reward 1 at 10% requires stake 1, not zero. Rewards use AGIALPHA's 18 decimals.
- `quoteJobStake(reward)` returns a prospective amount. It rejects rewards above uint128 and collateral above uint96, rather than truncating. The multiplication is bounded: reward <= uint128.max and rate <= 10,000, so both product and rounding addition fit uint256.
- The rate effective when creation is **mined** determines `Job.stake`. A quote made while preparing a transaction can change before mining. Clients must warn about this and display the recorded `Job.stake` and `JobCreated.stake` after confirmation. Applicants must use the posted job snapshot, not a fresh quote based on today's rate.
- Owner rate changes affect future jobs only. Existing nonterminal jobs keep their recorded amount through application, locking, settlement, cancellation and slashing. Existing terminal cleanup may clear `Job.stake`; historical events preserve the original amount.
- Zero-reward job creation is rejected. A zero reward quote is zero, but does not imply creation is permitted. Positive-reward jobs with a zero rate are supported.
- `JobRegistry.minAgentStake` and `StakeManager.minStake/minStakeFloor` remain independent global admission/deposit requirements. The deprecated fixed per-job 500 AGIALPHA amount is not retained as a hidden floor or added to the percentage.

## Explicit API and configuration migration

New current API: `jobStakeBps()`, `quoteJobStake(uint256)`, `setJobStakeBps(uint256)`. `JobStakeBpsUpdated(previousBps,newBps)` announces rate changes. Existing `jobs(jobId).stake` and `JobCreated.stake` retain token-amount semantics. The legacy `JobParametersUpdated` fixed-stake fields are zero/inactive compatibility fields; listeners must not interpret them as the new collateral policy. Use `JobStakeBpsUpdated`, prospective quotes and recorded job snapshots instead.

Legacy `jobStake()`, `DEFAULT_JOB_STAKE()`, `setJobStake(uint96)` and `setJobParameters(maxReward,fixedStake)` reject with `LegacyFixedStakeUnsupported`. A batch `applyConfiguration` that requests its old `setJobStake` flag also rejects atomically. A nonzero legacy constructor fixed-stake argument rejects. No fixed token amount is reinterpreted as a basis-point rate. Use the separate maximum-reward setter and new rate setter; the old compound API is not silently redefined.

Deployment JSON uses integer `econ.jobStakeBps`, normally 1000. `econ.jobStake` is rejected, including on local staged deployment. Public deployment requires explicit basis points; configuration samples still require real governance, reviewed tax choices and other launch settings. The coordinator's economic tuple changes its last field from uint96 fixed stake to uint256 basis points, intentionally changing function selectors. Old calldata must be regenerated; it must not be relabeled.

The three JobRegistry delegates use `JobRegistryConfiguration:percentage-stake-v2`, `JobRegistryLifecycle:percentage-stake-v2`, and `JobRegistrySettlement:percentage-stake-v2` module IDs. The new controller rejects v1 implementations. This prevents a new percentage quote from being paired with an old fixed-stake lifecycle. Preserve complete matched controller/implementation sets. Historical prebuilt demo bundles retain their matched v1 controller and v1 delegates and are not production candidates.

The old fixed storage slot is retained as an inactive internal slot, and rate storage is appended. This does **not** make old immutable controllers upgradeable, authorize storage transplantation or establish a migration mechanism. Deploy a separately verified new stack; reconcile and drain old jobs, escrow, claims and stakes under their existing rules. Do not repoint old clients or token approvals until their supported version and the user's migration decision are explicit.

## Review and tests

Required coverage: boundary/reference arithmetic; zero and tiny rewards; bounded owner access and events; mixed-version rejection; mined-time snapshot behavior; real-token funded fee exclusion; global minimum interaction; concurrent locks and repeated application; cancellation/refund, successful release, rejection and timeout slash; stale getter/setter/constructor/config rejection; frontend and owner-tool basis-point units; exact compiled runtime/initcode sizes and immutable comparisons.

Compilation and local test results must identify their exact source snapshot. No local-chain test is a mainnet-fork rehearsal. The current candidate remains subject to full legacy regression migration, independent AI-assisted review, canonical artifact policy, pinned mainnet-fork rehearsal and unresolved mainnet settings. AI-assisted review is not an external independent audit. The owner's separate no-audit/no-Sepolia choice does not waive these technical checks.

Historical HGMControlModule fixed-stake forwarding remains a legacy-only interface: its `setJobStake` configuration flag cannot configure this release and reverts through the deliberately unsupported fixed setter. Use the reviewed owner `setJobStakeBps` route for this controller; do not deploy an old automation expecting fixed-stake updates. Historical prebuilt demo artifacts and their matched v1 tests are retained as historical compatibility evidence, not advertised as percentage-enabled deployments.

## Separate pre-existing reputation policy consideration

The baseline failed-job settlement path calls `ReputationEngine.onFinalize(agent, false, 0, 0)`. The current reputation formula computes zero points from that input, so an agent who met the admission reputation threshold remains at that score after failure and is not automatically blacklisted at the unchanged threshold. The real ValidationModule failure path also supplies zero payout/duration. This behavior predates the percentage-stake change and was reproduced while repairing unreachable historical lifecycle fixtures.

The posted collateral is still slashed according to the job snapshot and existing slashing policy. An authorized reputation subtraction can separately trigger blacklisting, and a later addition can rehabilitate the agent; these are distinct mechanisms, not evidence that failed settlement automatically penalizes reputation. The former test expectation of automatic failure blacklisting did not describe current production policy. Selecting a failure-reputation penalty basis or minimum requires an explicit decision and a separate reviewed change; this candidate does not invent that economic policy. Record this policy consideration explicitly during production review; passing collateral tests does not establish automatic reputation penalties. Independent local reproduction confirmed score preservation, and funded lifecycle checks confirmed collateral slashing exactly once.

The inherited success path also scales agent payout by `1e12` before the reputation formula, which divides by `TOKEN_SCALE = 1e18`. Confirm the intended reputation input units separately; the percentage-stake change does not modify or certify that inherited scaling policy.
