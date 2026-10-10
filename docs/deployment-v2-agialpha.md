# Deploy AGI Jobs v2: the current Hardhat path

Use this guide for a **new deployment**. Existing deployments are not upgraded by a new source release. This repository uses the compiled **18-decimal $AGIALPHA** token; do not copy token or settlement assumptions from another AGI Jobs repository.

Start with the [current readiness report](production/readiness.md). A source prerelease is useful for review and rehearsal, but is not authorization to commission a production service. The signing, dependency, independent review and commissioning gates still apply.

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

The last command prints a unique evidence filename under `reports/`. It uses a local token fixture, deploys ten fixed implementations and fourteen components, wires the stack and records actual chain values. The in-process chain disappears when the command exits. Use a persistent local node and `--network localhost` when testing recovery or services.

Expected final message: **Managed modules remain paused for commissioning.** Review `status`, `pauseState`, `pendingOwnership`, `explorerVerification`, `coordinator` and `configurationHash` in the JSON report. Local success does not clear production gates.

## 3. Prepare a reviewed public-network configuration

Copy `deployment-config/sepolia.json` or `deployment-config/mainnet.json` to a new reviewed file. The supplied files contain placeholders and are intentionally not deployment-ready.

| Field | What to enter |
| --- | --- |
| `network`, `chainId` | `sepolia` / `11155111`, or `mainnet` / `1` |
| `governance` | The verified, nonzero governance address |
| `agialpha` | The token address in the selected `config/agialpha.<network>.json`; 18 decimals |
| `econ` | All nine documented fee, burn, slashing, timing and stake fields; whole percentages and decimal token strings |
| `identity` | Deployed ENS registry, optional wrapper, matching names/root hashes and explicit Merkle roots |
| `tax` | Explicit `enabled`; when enabled, reviewed URI and acknowledgement text, without sample metadata |
| `secureDefaults.pauseOnLaunch` | `true` until commissioning |
| Other `secureDefaults` | Requested reward/duration/timing limits; these remain pending governance application and appear in the report |
| `output` | A new evidence path; never reuse a prior report |

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
DEPLOY_DEFAULTS_CONFIG=deployment-config/reviewed-sepolia.json \
DEPLOY_DEFAULTS_OUTPUT=reports/sepolia-deployment-01.json \
npm run deploy:staged -- --network sepolia
```

Hardhat accepts `--network`, but does **not** forward arbitrary script flags. Its `--config` option selects a Hardhat JavaScript/TypeScript file, not deployment JSON. Use the environment variables above. Public-network parameter overrides on the script CLI are rejected so the reviewed JSON remains authoritative.

The script reserves a new private evidence file before transactions. It records coordinator and component transaction hashes, commits a digest of the resolved plan on the coordinator, and updates evidence as components confirm. Its append-only `.journal.jsonl` companion retains prior checkpoints if the latest report write is interrupted; use the last complete journal line and reconcile every submitted hash. Tax metadata is installed during creation, before ownership handoff. `Deployer.deployPaused` wires and hands off all eight managed modules atomically in the paused state. Existing direct coordinator entrypoints retain their historical unpaused behavior for compatibility; the current script uses the paused path by default.

The report is deliberately labelled `productionApproved: false`. Explorer verification failures remain visible as `pending`; skipping verification does not count as success. The report contains public addresses and configuration, never private keys or raw provider errors.

## 5. Recover without losing evidence

1. Stop and reconcile every submitted transaction using the recorded hashes, account nonce and coordinator state. A transport timeout does not prove a transaction failed.
2. Keep the original report, including an incomplete or interrupted one. Do not delete it to make a retry pass.
3. Use the **same source release and resolved parameters**, the original `coordinator`, and a **new** output filename:

```bash
DEPLOYER_ADDRESS=0xYourRecordedCoordinator \
DEPLOY_DEFAULTS_CONFIG=deployment-config/reviewed-sepolia.json \
DEPLOY_DEFAULTS_OUTPUT=reports/sepolia-recovery-02.json \
npm run deploy:staged -- --network sepolia
```

The script checks coordinator runtime, signer ownership, the committed plan digest, and each existing component's creation-code hash. It refuses configuration drift. A fully finalized deployment can regenerate its report without deploying another stack. Outstanding connected-owner acceptance may still require transactions. An implementation submitted before interruption can remain unused; reconcile it before budgeting a retry. Never treat a blind rerun as free or universally idempotent.

An old coordinator without the current plan commitment must be reconciled using its original release and procedure. Do not use the new script to pretend it was deployed with the new safeguards.

## 6. Complete governance and commissioning

The eight managed modules are JobRegistry, StakeManager, ValidationModule, ReputationEngine, DisputeModule, PlatformRegistry, FeePool and ArbitratorCommittee. Their owner is **SystemPause**; SystemPause's owner is the requested governance. CertificateNFT, JobRouter and PlatformIncentives are owned directly by governance. IdentityRegistry and TaxPolicy use two-step acceptance, listed under `pendingOwnership` until complete.

Keep this topology. For a managed-module setter, governance calls `SystemPause.executeGovernanceCall(target, encodedCall)`; a direct EOA call to that module is not the same authority. Configure requested launch limits while paused, compare confirmed values with the reviewed plan, then complete source verification, token burnability, ENS/identity admission, worker isolation, independent review, settlement, monitoring and recovery drills. The limits helper accepts the staged report and routes managed setters through SystemPause. Prepare the calls without transactions first:

```bash
ONECLICK_CONFIG=deployment-config/reviewed-sepolia.json \
ONECLICK_ADDRESSES=reports/sepolia-deployment-01.json \
ONECLICK_DRY_RUN=1 \
npx hardhat run --no-compile scripts/v2/apply-secure-defaults.ts --network sepolia
```

Review each returned `to`, `data`, `requiredCaller` and chain ID. A multisig or timelock must execute these calls through its approved process. A directly connected governance signer may remove `ONECLICK_DRY_RUN=1` to execute; this sends transactions and prints each hash before waiting. All configuration and caller checks run before the first send. The helper preserves omitted job reward/stake values and can pause a partly paused stack. Reconcile receipts before any retry; several setter transactions are not an atomic batch.

For an existing legacy one-click deployment whose modules remain owned by governance, the helper sends setters directly to the module owner and pause calls through SystemPause after validating its delegated pauser role. It supports mixed pause states and rejects missing pause authority before sending any transaction. This compatibility path does not change the staged ownership topology above.

Only the actual governance authority may approve `SystemPause.unpauseAll()` after those gates pass. A restart or recovery run is never an instruction to unpause.

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
