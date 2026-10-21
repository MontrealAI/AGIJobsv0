# source-v2.1.0-rc.17 — Resume owned source drafts safely

This source prerelease candidate repairs publication only. It preserves the
current runtime, contracts, deployment and ENS records, historical rc.16
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
