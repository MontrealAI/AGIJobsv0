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
  Keep the suite in the established isolated Node test directory so native
  Hardhat/Mocha discovery does not load it a second time.
  Add no endpoint privilege, scanner exclusion or conditional test bypass.
- Preserve the original eleven-transition proof unchanged: publisher parent
  `d27d752cf552bc7f45108c962b6501d912d1e715`, tree
  `be4aaad8bdd34f7b33ee42a5d2fae577892fd016`, to telemetry origin
  `9dbdba4048b5d85273e61803ffef8f474088c57a`, tree
  `42c46b733a38dd47c0ab0688a9fd65b0ed708a1d`, with historical commitment
  `ff6f82ddd6738d3a0e7481fdd4cd1fc065853b68bc1a20e1defbfaccefea792c`.
- Bind a separate four-path follow-up from that historical origin to source
  `b7f60ff52b87101ecf06681c41b7e13109f63e31`, tree
  `a69606184d7f839e8e256b1eed229d98b776ebaa`: replace the mandatory CI suite
  path, delete its old gateway path, add its scripts path with the exact same
  test blob, and register the scripts path in the discovery regression's
  dedicated list. That list requires discovery before filtering, exclusion
  from Mocha, and exactly one unconditional fresh Node invocation after the
  locked dependency install. The native discovery rule remains unchanged.
- Preserve that four-path isolation proof unchanged under commitment
  `e2a605cfc233ba1cad6061b514aaadc2175a067cd67a1696012a04f3a3bb7137`.
  Its evidence and the `1f7375c9f86cafb97674b95c92e8a1b7270f8a78` candidate
  remain historical; they do not approve a changed runtime.
- Bind a separate two-path durability correction from that isolation origin
  to source `02d73fcdbe2a4827eb4e47c980f25fd31c5efc31`, tree
  `23067b5924f8d9ef81e7d3b99244ba44d07fd66a`. Only the queue module and its
  recovery suite change. After creating the telemetry directory, sync each
  containing ancestor through the filesystem root before creating a temporary
  file. Repeat these barriers on all writes, retries and new instances, so a
  failed ancestor sync cannot disappear behind an already-created directory.
  Keep file sync, atomic rename and final queue-directory sync before success;
  propagate barrier failures without accepting the pending enqueue. Retain the
  earlier 23 cases, extend their durability-order assertion, and append first
  creation and parent-barrier retry/restart cases.
- Verify the complete immutable trees at every endpoint and all four exact
  historical, isolation, durability and aggregate comparisons. Bind every
  before/after/current blob and mode, ancestry and composition into the
  twelve-transition aggregate. The aggregate does not conceal the historical
  deletion or broaden runtime paths. Historical records retain their original
  source identities; changed queue code requires fresh exact-source scanner
  evidence and renewed case-specific review.
- Require actual extraction of all six affected gateway source files in fresh
  JavaScript scanner evidence, in addition to the unchanged producer's declared
  receiver list. Both raw extraction and exact producer sidecars are verified.
  Review the exact branch producer context and
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
