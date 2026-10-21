# source-v2.1.0-rc.17 — Resume owned source drafts safely

This source prerelease candidate repairs publication and telemetry recovery.
It preserves contracts, deployment and ENS records, historical rc.16
notes/profile, reserved rc.16 tag and unpublished rc.16 draft. It does not
republish the previous producer under a new identity.

## Publication changes

- Use a bounded UTF-8 release description with an exact-source link, full-notes
  asset link and SHA-256 digest. The complete notes remain a checksummed asset.
- Discover drafts through complete authenticated repository release-list pages
  when the published-release-by-tag endpoint cannot see them. Require one exact
  owned release, source, tag, marker, title and prerelease state. Reject
  ambiguous, inconsistent or foreign records rather than creating a duplicate.
- Retain useful bounded API validation details on a failed request without
  logging credentials. The rc.16 create failure returned HTTP 422, but its
  response body was not retained, so a body-size diagnosis is not established.
- Preserve exact main-push/source identity, fresh scanner and independent
  review bindings, compiler/native semantics, all 25 uploaded/downloaded
  evidence assets, immutable tag checks and guarded final publication.

## Telemetry correction and finite source scope

- Validate supported numeric fields at shared ingress and before submission.
  HTTP and gRPC preflight the complete request before telemetry-report or
  sample-publication side effects. Omitted numeric fields retain their defaults.
- Preserve acknowledged successful prefixes. Retain bounded, observable
  rejection evidence before removing invalid restored records, and continue
  with later valid work. Valid transport failures remain retryable failures.
- Require the deterministic telemetry regressions in the existing CI Tests job.
  Add no endpoint privilege, scanner exclusion or conditional test bypass.
- Pin the exact eight-file correction plus that additive CI step and
  two existing test-loader adaptations for the pure validation module to source
  `9dbdba4048b5d85273e61803ffef8f474088c57a`, tree
  `42c46b733a38dd47c0ab0688a9fd65b0ed708a1d`, over the publisher parent
  `d27d752cf552bc7f45108c962b6501d912d1e715`. The finite inventory binds every
  before/after blob and mode, with no general runtime-path exception.
- Require actual extraction of all six affected gateway source files in fresh
  JavaScript scanner evidence. Review the exact branch producer context and
  complete current raw findings; earlier candidate archives remain historical.

See [operator telemetry](../operator-telemetry.md) for rejection retention,
explicit truncation/eviction and crash-reconciliation limits. This is source
qualification, not an assertion about any deployed runtime.

## Qualification and review

This candidate is not qualified for publication. Fresh independent notes,
JavaScript and Python scanner reviews must bind its actual source and retained
producer evidence. Historical rc.16 approvals do not approve changed source.
The ordinary existing workflow must qualify the final merged main SHA, using
all existing required workflows, checks, semantic and native gates.

The package comparison baseline remains the explicitly pinned rc.15
implementation baseline. This is a finite source-comparison convention, not a
claim that rc.16 did not exist. The new release identity is rc.17.

## Inherited behavior and limits

The complete inherited computer-receipt, native Alpha compatibility, source
policy, historical scanner and deployment explanations remain in the unchanged
[rc.16 notes](https://github.com/MontrealAI/AGIJobsv0/blob/83065adf18a6ee987f8fa479a496a052d35db682/docs/production/RELEASE_NOTES_SOURCE_RC16.md).
Historical records retain their original source identities and observation
limits. The 12 and 18 October Mainnet deployment records are evidence, not a
claim that their deployed bytecode equals this source candidate.

Production approval remains false. This unsigned source prerelease does not
activate a worker, accept a job, send a transaction, sign, fund, unpause,
migrate obligations or change on-chain authority. AGIALPHA18 and Manager
USDC6 remain distinct. Live operation and independent acceptance are separate.

<!-- rc16-scanner-review
null
-->
