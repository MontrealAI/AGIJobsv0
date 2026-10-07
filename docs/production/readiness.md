# Current production readiness

This is the stable entry point for deployment status. Dated reports describe the exact checks and limitations observed at the time; they are not perpetual production certifications.

## What can be used now

The public website provides the complete preserved demo collection, guided experiences, original diagrams, browser workbenches and a local job planner. The repository supplies executable local-chain workflows and an operator-admitted OpenClaw computer-work adapter. These capabilities require their documented environments and have distinct evidence boundaries.

The [local evidence reviewer](../EVIDENCE_REVIEW.md) checks delivered artifact integrity against the original task and records an unsigned reviewer assessment. It does not authenticate provider provenance or satisfy independent acceptance by itself. The adapter rejects malformed UTF-8, invalid Unicode strings and text artifacts exceeding 128,000 UTF-8 bytes.

## What a live deployment still needs

| Gate | Evidence needed |
| --- | --- |
| Release trust | Authorized maintainer signing identities and verified release artifacts |
| Merge enforcement | Active repository rules requiring the intended checks and review policy, verified against GitHub configuration |
| Security | Independent review, current dependency findings resolved or explicitly assessed, and validated provider configuration |
| Worker commissioning | An isolated real runtime with verified permissions, account selection, action/network policy, spending limits, stop behavior and representative success/rejection cases |
| Independent acceptance | Reviewers qualified for the work category, conflict disclosures, reproducible checks and actual buyer acceptance |
| Network commissioning | Correct token/chain/addresses, deployment and ownership verification, identity/tax/stake prerequisites, monitored settlement and tested recovery |
| Recovery | Reconciled uncertain actions, durable dispatch/settlement journals and a validated procedure for lost validator reveal secrets |

The generic validator currently keeps reveal secrets in memory; restarting it during a commit/reveal cycle needs operator reconciliation. Computer-work evidence requires independent acceptance and is not automatically approved by structural validation. Legacy Web3.Storage publishing routes also remain dependent on a retired provider API until migrated and commissioned. The static GitHub Pages site does not use that API.

## Verification records

- [Platform and website update, 2026-10-07](platform-update-2026-10-07.md): current integration, dependency refresh and validation scope.
- [Computer-work correctness and remaining gates](readiness-2026-10-04.md).
- [Dependency maintenance and legacy provider limitations](dependency-review-2026-10-04.md).
- [Original production readiness record](readiness-2026-10-03.md).
- [Reproducible production rehearsal](rehearsal.md).
- [Fixed implementations and staged deployment](fixed-implementations.md).

Use current CI results for the exact candidate commit and rerun the documented checks when dependencies or deployment settings change. Do not infer production authorization from local simulation receipts, self-signed fixture evidence or a successful website deployment.
