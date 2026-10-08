# Compatibility and migration

This release adds a mission layer. Existing funded jobs, contracts, legacy task digests and recorded outcomes keep their actual semantics. They do not gain retroactive independent proof, Chronicle admission or successor authority.

## Computer-work task v1

`ComputerWorkTask` schema v1 rejects unknown fields. Put mission and successor references in an outer sealed work order; do not insert them into `metadata.computerWork`. Preserve `computerTaskDigest` normalization exactly. Raw-file hashes and normalized semantic hashes answer different questions: whitespace/key ordering may alter the former without changing the latter.

An existing `approvedJobs(jobId, taskSha256)` entry approves the legacy task under its configured deployment. It cannot approve a changed mission, candidate, outer work-order digest, proof commitment or authority envelope. The successor bridge must bind the reviewed outer digest as well as the job/task identity before dispatch. Material semantic changes require a new seal and fresh approval; old results remain historical.

The implemented outer field is `metadata.successorComputerWork` with schema version `1.0.0`. Its protected profile admission adds `approvedJobs[].successorManifestSha256`, a `sha256:`-prefixed digest, alongside the unchanged legacy task digest. Removing outer metadata cannot downgrade a sealed admission into legacy execution.

`SUCCESSOR_COMPUTER_WORK_POLICY_FILE` points to a protected UTF-8 JSON policy containing `schemaVersion: 1`, `trustStore`, current `state` (`stopped`, `revocationEpochs`, `actions`) and `assurance`. Supply trusted operator configuration, never job-controlled policy. A fixture lease has purpose `successor.job-lease.v1`, an authorized underwriter, A2 scope and zero spend. This file configures rehearsal checks; setting its assurance Booleans does not enable live mode or prove real commissioning. Retained nonce/journal records survive uncertain and denied outcomes; preserve them for reconciliation.

The policy's state must come from a real `compileJobs` → `registerCompilation` result. The effect check requires the exact registered work-order digest, mission, principal, masks, budget unit and expiry; a missing order returns `WORK_ORDER_UNREGISTERED`. The signed action includes `workOrderAction`, and its network timeout must fit remaining action/job/lease/key validity. Do not replace registration with handcrafted status flags or re-register a descendant to clear an upstream revocation.

The new bridge is fixture/local only until real external enforcement is commissioned. It must reject live successor dispatch. The existing separately admitted legacy OpenClaw path remains available under its existing rules; neither its presence nor the new local bridge certifies remote network/action/spend/cleanup confinement. Use the [computer-work commissioning and recovery guide](../computer-work.md) for that boundary.

Preserve legacy artifact types, UTF-8 and size constraints, exact admitted task checks, endpoint policy, per-job sessions and uncertain-outcome journal. Never delete a replay barrier or reinterpret a provider completion as independent acceptance.

## Economic records

The repository's existing v2 deployment uses configured 18-decimal AGIALPHA. Keep actual chain ID, token address, decimals and integer base-unit amounts bound to the deployment manifest. A six-decimal USDC quote from a planner is not AGIALPHA funding or an exchange instruction. Reject unconfigured/zero addresses and ambiguous assets; do not add silent conversion, new issuance, token access thresholds or new settlement rules.

Link an existing job/evidence/specification commitment off-chain where suitable. No Solidity change is justified solely by a new display field. Any future contract change needs separate ABI/storage/economic, size/gas/security and deployment review.

Record performed work, acceptance, disputes, settlement, proof and mission authority independently. A well-executed evaluation can be paid for a FAIL finding. No token holding, ENS name, vote or successful transaction certifies mission truth.

`apps/orchestrator/successorSettlement.ts` exposes two different boundaries. `describeSuccessorSettlement` validates an economic observation's fields; consistent fields alone are not chain evidence. `reconcileSuccessorSettlement` reads an actual configured local-chain payout using original committed specification and completed-deliverable bytes. It checks their registry hashes, configured chain/registry/token/decimals, transaction/canonical block, finalization/payout events and required confirmations. Neither helper broadcasts. Reconciliation remains fixture-deployment-only; a local configured RPC is not externally independent proof, and payout never grants a favorable candidate verdict or authority.

## Restoring knowledge

1. Keep the original pack and inspect its version, manifest, rights, exclusions and historical receipts.
2. Verify manifest/artifact digests, safe paths, limits and compatibility before interpretation. Current JSON Mission Packs return `authenticated: false`: they establish internal byte consistency, not authenticated origin. Verify separately signed historical proof through its explicit trust configuration. Do not execute imported code or follow arbitrary external links.
3. Restore to a clean, unprivileged workspace. Preserve allowed evidence, methods, failures and lineage; do not restore active envelopes, keys or provider credentials.
4. Replay the declared bounded tests. Verify declared supplier substitutions as new candidates, with explicit unsupported dependencies.
5. Obtain new proof/admission if operation requires them. A restored parent receipt cannot authorize its descendant.

Archives, raw private data and executable extensions are supported only when the importer explicitly implements their format and controls. Unsupported content fails closed; renaming it does not make it safe.

Credential-field and private-key screening is an additional defense, not proof that arbitrary text contains no secret. Export only the reviewed synthetic/public mission artifacts or independently rights-cleared, classified content; exclude sensitive material before packaging. A recomputed digest cannot establish ownership, truth or permission to export.

## Rollback and coexistence

Stop new successor dispatch first and preserve its journals, receipts and latest independently retained checkpoint. Reconcile uncertain effects before retry or downgrade. Reverting code cannot undo an already-final external action, restore a revoked right or make expired evidence current.

Keep old record versions readable only through explicit validators/migrations. Unknown schemas fail closed. Maintain the previous known-good code/artifact digest and restore recipe; fallback operation requires its own current authorization. Do not union old and new permissions.

Use the [current production readiness](../production/readiness.md) record for existing provider migration, validator reveal/round-reset recovery, signing and deployment limits. Those gates survive this release.
