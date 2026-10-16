# source-v2.1.0-rc.9 — reviewed demo workspaces and safer local operations

This source prerelease consolidates the reviewed changes from pull requests #3935–3966 while preserving their commit ancestry. It builds on the explicit Alpha JobRegistry integration in rc.8. Original design documents and diagrams remain available alongside the bounded implementations.

## Known contract defect — deployment blocked

The inherited ReputationEngine can reduce an accumulated score while applying positive credit and then revert with arithmetic panic `0x11`, rolling back job settlement. A 20,000-point award produces 19,036; a subsequent one-point award or successful-finalization hook can trigger the defect. The separately scoped [repair in PR #3971](https://github.com/MontrealAI/AGIJobsv0/pull/3971) has local regression and fuzz evidence but is not included in this demo-only source snapshot. Reputation payout-unit and terminal/dispute-scoring corrections also remain open. Do not deploy or commission these contracts from this prerelease.

This release distributes source and evidence for bounded demo evaluation. Passing demo/software checks do not clear those contract defects. The separately developed percentage-stake policy is also excluded. Existing deployments remain governed by their own source and obligations; no migration or live settlement approval is implied.

## Useful, inspectable workspaces

Nine browser workspaces provide governance rehearsal, dependency and recovery planning, supplier evidence review, quorum receipt exploration, resource contingency planning, exact regional budget reconciliation, checkpoint replay, initiative evidence review and disruption planning. Their interfaces provide English and French labels, explicit assumptions, bounded inputs and recovery/export checks. Submitted evidence is recomputed; a self-consistent report does not authenticate its origin, establish real-world impact or authorize a transaction.

The original fifteen dashboard routes remain in the explicit route inventory. Mandatory Pages qualification exercises every added workspace, including malformed-input rejection, exact-byte recovery, keyboard use and accessibility. The Omniphoenix download test preserves all twenty-nine exact-byte assertions while pacing download requests at the browser's documented throttle boundary.

## Safer launchers and honest results

Launcher changes make planning explicit and prevent non-interactive execution from implying consent. Local rehearsals use bounded ownership/readiness checks, scoped report archives and advisory locks. Unsupported plan settings are rejected or visibly identified as context for a shared fixture. These checks assume the documented trusted local filesystem and Linux process inspection; they do not provide operating-system containment against an adversarial worker.

Other corrections preserve planned versus admitted work counts, recovered attempt history, numerical stability and actual solver convergence diagnostics. Optional MuZero dependencies are loaded only when execution needs them. An absent training environment remains an unqualified training path.

Aurora reports distinguish validator finalization from JobRegistry settlement and bind the displayed settlement transaction to the matching job summary. Placeholder URI hashing remains distinct from artifact-content verification.

## Retained local integration evidence

The supplier browser proof connects a fresh disposable JobRegistry assignment to the fixed Alpha browser worker, observed output, deterministic review, explicit local approval, signed delivery and mock settlement. Model responses are scripted laboratory data; Docker and live-provider commissioning are not established by that proof. The negative path refuses an incorrect observed comparison before export or submission.

Cosmic evidence covers four actual governance scripts on an owned, unforked disposable chain, with source/artifact consistency checks, receipt decoding, pause behavior and cleanup. It does not qualify the complete flagship pipeline or independently rebuild the compiler output.

Insight retains the source-bound compiler inputs, three artifacts, report manifest and raw local block/receipt/log evidence. Its qualified CI archive supports independent structural and event review. Archive consistency is not an independent compiler rebuild, replay or deployed-runtime attestation.

## Exact-source publication

Publication still requires every checked-in required context, named release workflow and observed main-push workflow on the exact merged commit. A reviewed combined source checkpoint replaces the earlier source-scope checkpoint because these changes include demo and launcher sources. The Solidity 0.8.37 / Cancun / viaIR / 200 optimizer-run policy and historical deployment-evidence baseline remain unchanged.

The publisher verifies immutable tag identity, checksummed assets and the qualified compiler producer archive. Existing rc.7 and rc.8 identities and assets are never replaced. This is an unsigned source prerelease; production profiles, independent security review, provider/worker commissioning, signing and live settlement remain separate admission requirements.
