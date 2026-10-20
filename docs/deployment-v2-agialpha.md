# Deploy AGI Jobs v2: the current Hardhat path

**Compiler update:** new deployments use Solidity 0.8.37. Keep the original release for recovery or verification of existing deployments. [Understand the warnings and replacement boundary](production/compiler-warnings-2026-10-13.md).

Use this guide for a **new deployment**. Existing deployments are not upgraded by a new source release. This repository uses the compiled **18-decimal $AGIALPHA** token; do not copy token or settlement assumptions from another AGI Jobs repository.

Start with the [current readiness report](production/readiness.md). A source prerelease is useful for review and rehearsal, but is not authorization to commission a production service. The signing, dependency, independent review and commissioning gates still apply.

**Looking for the stack already deployed on Ethereum?** Use the [current mainnet directory and dated status record](production/CURRENT_MAINNET_DEPLOYMENT.md), which identifies the 18 October deployment separately from the preserved [12 October historical record](production/mainnet-deployment-2026-10-12.md). Do not run a new deployment to refresh documentation or retry explorer verification. The example configuration files below remain templates, not the address directory or instructions to replace the existing stack. Treat all previous deployments as read-only.

## Owner-operated deployment requirements

Use public, non-personal inputs only for mission preparation, assessment and qualification. Public availability alone does not make personal data eligible.

For a separately authorized new deployment, preserve the owner's Ubuntu Terminal / Hardhat creation route. The owner enters the deployer's private key locally through a hidden prompt, only for the lifetime of that process. Never store or print the key, pass it in command arguments, or write it to `.env` files, shell history or logs. Governance stays on the Mac Studio's Ledger at `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99`; creation does not move that governance key to Ubuntu. Retain complete authority handover and verify that the deployer has no residual system privileges.

These are operator requirements, not a claim that this main-branch CLI has a qualified hidden-prompt signer. The recorded 18 October deployment used source `818b3a246871e4cd4dde86558dbb91ef82b15eef` on [draft PR #3986](https://github.com/MontrealAI/AGIJobsv0/pull/3986); its source and operator evidence remain separate from current-main qualification. Before any new creation, qualify the exact selected source and its hidden, ephemeral key-entry route without using a real key in tests. Do not substitute the legacy environment-key setup or an external manual-signing route for this requirement.

Live deployment, signing, funding, activation and changes to on-chain authority each require separate authorization. Keep the already-approved ENS configuration work in its own workstream; this guide adds no ENS configuration action or authorization.

## 1. Choose the right operation

| Your goal | Command or guide | What it changes |
| --- | --- | --- |
| Try the system without a wallet | [Welcome guide](https://montrealai.github.io/AGIJobsv0/start/) | Local planning only |
| Rehearse deployment | `npm run deploy:local` after compiling | A temporary local chain and a deployment report; no real funds |
| Inspect a public-network plan | `npm run deploy:plan -- --network sepolia --config deployment-config/reviewed-sepolia.json --out reports/sepolia-plan.json` | A new report; reads RPC, never signs |
| Inspect offline | Add `--offline` to the plan command | A blocked report because chain evidence is unavailable |
| Deploy after review | `npm run deploy:staged -- --network sepolia` with the variables below | Sends multiple paid transactions; leaves all eight managed modules paused |
| Recover an interruption | Section 5 below | Reuses the recorded coordinator and checks the committed configuration |
| Operate a commissioned stack | [Security and governance guide](security-deployment-guide.md) | Command-specific; inspect before signing |

## 2. Install and rehearse locally

Use Node **22.23.3** and npm **10.8.2**, as pinned in the repository. From its root:

```bash
npm ci
npm run ci:preflight
npm run compile
npm run release:check-size
npm run deploy:local
```

This command explicitly selects `demo/aurora/config/deployer.hardhat.json`, with separate disposable creator, governor and treasury accounts. The wrapper accepts no forwarded flags, custom configuration or recovery inputs and requires a fresh in-process Hardhat chain 31337. It is not a public-network fallback. For a custom local rehearsal, supply your reviewed config to the staged entrypoint instead. Public networks always require independently reviewed roles and campaign evidence. The last command prints a unique evidence filename under `reports/`. It uses a local token fixture, deploys ten fixed implementations and fourteen components, wires the stack and records actual chain values. The in-process chain disappears when the command exits. Use a persistent local node and `--network localhost` when testing recovery or services.

Expected final message: **Managed modules remain paused for commissioning.** Review `status`, `pauseState`, `pendingOwnership`, `explorerVerification`, `coordinator` and `configurationHash` in the JSON report. Local success does not clear production gates.

## 3. Prepare a reviewed public-network configuration

Copy `deployment-config/sepolia.json` or `deployment-config/mainnet.json` to a new reviewed file. The supplied files contain placeholders and are intentionally not deployment-ready.

| Field | What to enter |
| --- | --- |
| `campaign` | Reviewed `{chainId, blockNumber, blockHash}` from a fresh canonical block before this new campaign; never reuse a historical campaign anchor |
| `network`, `chainId` | `sepolia` / `11155111`, or `mainnet` / `1` |
| `governance` | The verified, nonzero governance address, distinct from the creation signer |
| `authority.stakeManagerTreasury` | Explicit reviewed StakeManager treasury; never inferred from governance |
| `authority.feePoolTreasury`, `authority.feePoolGovernance` | Two explicit reviewed FeePool roles; never inferred from ownership |
| `agialpha` | The token address in the selected `config/agialpha.<network>.json`; 18 decimals |
| `econ` | All nine documented fee, burn, slashing, timing and stake fields; whole percentages and decimal token strings |
| `identity` | Deployed ENS registry, optional wrapper, matching names/root hashes and explicit Merkle roots |
| `tax` | Explicit `enabled`; when enabled, reviewed URI and acknowledgement text, without sample metadata |
| `secureDefaults.pauseOnLaunch` | `true` until commissioning |
| Other `secureDefaults` | Requested reward/duration/timing limits; these remain pending governance application and appear in the report |
| `output` | A new evidence path; never reuse a prior report |

Each authority address must be nonzero and distinct from the creation signer. For the current proposed new campaign, governance is `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99`; the separately proposed StakeManager treasury is `0xa9eD0539c2fbc5C6BC15a2E168bd9BCd07c01201` and FeePool treasury is `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99`. FeePool governance remains its own reviewed field. These are proposed configuration inputs, not permission to change an existing stack. No treasury or fee-governance setter is sent automatically.

Economic zero values in the coordinator select its defaults: 5% fee, 1% burn, one-day windows, token-scale minimum stake and the registry's default job stake. If you intend an actual zero fee or stake, plan an explicit governance change while paused. The public preflight requires slashing shares to total 100. It rejects unsupported economic fields rather than silently ignoring them.

Compile for the intended token configuration **before** preflight:

```bash
npm run compile:sepolia
# For an approved mainnet candidate instead: npm run compile:mainnet
npm run deploy:plan -- --network sepolia --config deployment-config/reviewed-sepolia.json --out reports/sepolia-plan.json
```

Set `SEPOLIA_RPC_URL` or `MAINNET_RPC_URL` privately for read-only chain inspection. No private key is needed for planning or compilation. The planner checks the chain ID, deployed dependencies and token decimals against a pinned block, and rejects a reorganization during inspection. It checks compiler settings, source freshness, bytecode and ABI against compiler evidence. It does not estimate deployment costs or authorize transactions.

Planner exit codes: **0** means a candidate is ready for review, **2** means a valid report contains blockers, and **1** means no report could be produced. Never interpret an offline report as a chain verification.

## 4. Execute only after approval

A public deployment requires the separately approved signing account, gas funding, exact-commit CI, valid release signing, a passing dependency gate and independent security review. A GitHub source prerelease does not substitute for those requirements.

```bash
DEPLOYMENT_LOCK_DIRECTORY=/absolute/shared/deployment-locks \
DEPLOY_DEFAULTS_CONFIG=deployment-config/reviewed-sepolia.json \
DEPLOY_DEFAULTS_OUTPUT=reports/sepolia-deployment-01.json \
npm run deploy:staged -- --network sepolia
```

Hardhat accepts `--network`, but does **not** forward arbitrary script flags. Its `--config` option selects a Hardhat JavaScript/TypeScript file, not deployment JSON. Use the environment variables above. Public-network parameter overrides on the script CLI are rejected so the reviewed JSON remains authoritative.

The script reserves a new private evidence file before transactions. It records coordinator and component transaction hashes, commits a digest of the resolved plan on the coordinator, and updates evidence as components confirm. Its append-only `.journal.jsonl` companion retains prior checkpoints if the latest report write is interrupted; use the last complete journal line and reconcile every submitted hash. Tax metadata is installed during creation, before ownership handoff. `Deployer.deployPaused` wires and hands off all eight managed modules atomically in the paused state. The staged CLI refuses an unpaused launch. Existing direct coordinator entrypoints retain their historical behavior for compatibility; this tooling does not call them.

The ten fixed implementation owners are transferred explicitly to governance, and the coordinator is transferred only after finalization and topology readback. Seven implementation contracts update their Governable owner/governance together; the other three and coordinator use Ownable. No renounce or zero-address workaround is used. Every signed creation/transfer/staging intent is journaled and fsynced before submission, binding chain, actual sender, role, nonce, target, zero value and input hash. The report preserves the initial canonical block anchor and resolved plan commitment. Ownership handover does not expand the implementations' delegate-only capabilities.

`DEPLOYMENT_LOCK_DIRECTORY` must be an existing shared absolute directory used by every cooperating deployment repository. Atomic directories named `<chainId>-<lowercase actual signer address>` serialize the whole run. A failed run retains its lock; there is no stale-lock auto-break. This is cooperative same-filesystem exclusion, **not** protection against another machine, an external wallet action, or a script ignoring the lock. Prohibit all such concurrent signing. This CLI signs only with the creator; later manual governance calls must be serialized separately across Jobs, Alpha and Manager using the same actual-signer namespace. Different creators sharing one governor are not protected by creator-only locks. A nonce observation or unsigned allocation is never a reservation.

The report is deliberately labelled `productionApproved: false`. Explorer verification failures remain visible as `pending`; skipping verification does not count as success. The report contains public addresses and configuration, never private keys or raw provider errors.

## 5. Recover without losing evidence

1. Stop and reconcile every submitted transaction using the recorded hashes, account nonce and coordinator state. A transport timeout does not prove a transaction failed.
2. Keep the original report, including an incomplete or interrupted one. Do not delete it to make a retry pass.
3. Use the **same source release and resolved parameters**, the original `coordinator`, and a **new** output filename:

```bash
DEPLOYMENT_LOCK_DIRECTORY=/absolute/shared/deployment-locks \
DEPLOYER_ADDRESS=0xYourRecordedCoordinator \
DEPLOY_DEFAULTS_RESUME_EVIDENCE=reports/sepolia-deployment-01.json \
DEPLOY_DEFAULTS_CONFIG=deployment-config/reviewed-sepolia.json \
DEPLOY_DEFAULTS_OUTPUT=reports/sepolia-recovery-02.json \
npm run deploy:staged -- --network sepolia
```

Use the original report or its `.journal.jsonl` companion. Reconcile a retained lock manually before removing it; never delete a lock because it merely appears old. Recovery verifies actual canonical creation transactions/receipts, creator, nonce, exact initcode/runtime, original block anchor, selected roles and committed configuration. The journal’s initial block must be at or after the separately reviewed configuration campaign anchor, and every creation receipt must be strictly later. Public plans require that explicit anchor; disposable local chains may default to their own genesis. The old mainnet addressbook is explicitly excluded. A schema version or new deployment UUID cannot turn a historical addressbook into a new deployment journal. The reviewed campaign configuration remains an authorization trust boundary: no unsigned file can prove that an operator has approved its contents. Do not authorize a backdated anchor or substitute a new config to relabel old receipts.

An interrupted implementation creation or handover is resumed by its exact transaction hash, or a bounded scan of at most 2,048 canonical blocks for its recorded creator/nonce and input. A missing, pending, replaced, failed or ambiguous submission is fatal; the CLI never guesses that it is safe to resend. A fully finalized, handed-over deployment can regenerate its evidence without a second creation or transfer. Changed code, chain, role, owner, source, constructor arguments or commitment fails closed. Only this campaign's newly journaled contracts can be handed over. Previous deployments, funds, approvals and settlement are outside this procedure.

## 6. Complete governance and commissioning

The eight managed modules are JobRegistry, StakeManager, ValidationModule, ReputationEngine, DisputeModule, PlatformRegistry, FeePool and ArbitratorCommittee. Their owner remains **SystemPause**; SystemPause's owner is the requested governance. CertificateNFT, JobRouter and PlatformIncentives are owned directly by governance. IdentityRegistry and TaxPolicy use two-step acceptance, listed under `pendingOwnership` until complete.

Keep this topology. For a managed-module setter, governance calls `SystemPause.executeGovernanceCall(target, encodedCall)`; a direct EOA call to that module is not the same authority. Configure requested launch limits while paused, compare confirmed values with the reviewed plan, then complete source verification, token burnability, ENS/identity admission, worker isolation, independent review, settlement, monitoring and recovery drills. The limits helper accepts the staged report and routes managed setters through SystemPause. Prepare the calls without transactions first:

```bash
ONECLICK_CONFIG=deployment-config/reviewed-sepolia.json \
ONECLICK_ADDRESSES=reports/sepolia-deployment-01.json \
ONECLICK_DRY_RUN=1 \
npx hardhat run --no-compile scripts/v2/apply-secure-defaults.ts --network sepolia
```

Review each returned `to`, `data`, `requiredCaller` and chain ID. A multisig or timelock must execute these calls through its approved process. A directly connected governance signer may remove `ONECLICK_DRY_RUN=1` to execute; this sends transactions and prints each hash before waiting. All configuration and caller checks run before the first send. The helper preserves omitted job reward/stake values and can pause a partly paused stack. Reconcile receipts before any retry; several setter transactions are not an atomic batch.

### Independent authority readback and activation

After manual two-step acceptances, separate treasury/governance configuration and complete explorer verification, run a signer-free audit using the same reviewed source and compiler evidence:

```bash
AUTHORITY_RPC_URL=<read-only-rpc> node scripts/deploy/authority-audit.cjs \
  reports/sepolia-deployment-01.json reports/sepolia-authority-finalized.json
```

The audit pins a finalized canonical block (EIP-1898 on public chains), checks all 24 contracts or 25 with TaxPolicy, compiled source closure/ABI/initcode/runtime, fixed delegates, creation receipts, exact owners, pending owners, SystemPause wiring/pausers and listed creator-specific privileged mappings. It reports those observations as `boundedChecksComplete`. Saved completion flags never replace fresh readback. Explorer address/status entries are reported separately as `reportedExplorerVerificationComplete`; they do not independently prove exact explorer acceptance bound to the compiler input, constructor and source.

Configured ENS roots and their current owners' operator approvals are checked read-only; incomplete reads fail closed. These observations do not enumerate non-enumerable permissions or prove the complete setup history, indirect controllers, ancestor ENS authority or token/NFT approvals. An unlisted third-party rewarder can remain authorized while all creator-address checks pass. Until complete setup/indirect-authority qualification and independently observed exact explorer acceptance are implemented, `authorityComplete`, `sourceVerificationComplete` and `activationReady` remain false. The audit exits blocked even when all bounded observations pass; it cannot authorize activation. Unreviewed identity aliases or attestation controllers are additional blockers.

`systemPauseAction.ts` requires `DEPLOYMENT_AUTHORITY_EVIDENCE` pointing to the complete staged deployment report before **any unpause**, including a dry run. It performs a fresh finalized audit and requires the selected SystemPause to match. This route intentionally refuses historical-stack unpause, including dry runs; operators must keep the original release for any separately authorized legacy operation. This campaign does not authorize such an operation. This is a tooling gate, not a new on-chain restriction: a governor using another tool can still call the contract, so independent security, worker, settlement, monitoring and recovery approval remain mandatory. The certificate always retains `productionApproved: false`. Neither deployment, recovery nor auditing automatically unpauses or changes policy numbers.

Only the actual governance authority may approve `SystemPause.unpauseAll()` after those gates pass. Signing remains manual and transaction-specific; funding and balances are managed separately by the operator.

## Troubleshooting

| Message or condition | Next step |
| --- | --- |
| Existing output file | Keep it; reconcile the earlier run and choose a new filename |
| Configuration changed | Restore the original reviewed parameters; inspect governance changes separately |
| Artifact stale or fast/coverage settings | Recompile the exact reviewed source with the pinned production settings |
| Wrong chain, token or missing dependency code | Correct the network-specific configuration; rerun the read-only plan |
| Pending governance ownership | Have the designated governance call `acceptOwnership()` on the listed contracts |
| Explorer verification pending | Verify exact constructor arguments and all ten implementations separately |
| Invalid release signer or high dependency findings | Production publication stays blocked; see [readiness](production/readiness.md) |

For architecture, read [fixed implementations](production/fixed-implementations.md). For accountable release publication, use the [release checklist](release-checklist.md).
