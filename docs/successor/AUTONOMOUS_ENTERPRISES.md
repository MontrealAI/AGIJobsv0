# Autonomous Enterprise receiver — source integration

This current-main integration retains the exact receiver and original tests from
[#4014](https://github.com/MontrealAI/AGIJobsv0/pull/4014) at
`76b49c751e5f022f3e3e6f6a920bd9c162b90dac`. The original branch, review and failed or successful workflow records remain unchanged.
Historical results do not qualify this integration.

## Interface and limits

`integrations/alpha-agent/enterprise-work-request.mjs` exports
`createEnterpriseReceiver({installedContext, inspectNativeRequest, priorJournal})`
and `enterpriseReceiverCapabilities()`. The independently selected fixed inspector
receives a bounded inert `{request, docket}` transport. Incoming data cannot choose code.
`receive(rawTransport)` preserves original bytes, source-bound receipt and resource
accounting; `exportJournal()` returns custody for the existing mission history.

The route remains **AGIALPHA18 (18 decimals), cap zero, DRAFT_NOT_SUBMITTED**. Manager and
Jobs are alternative routes, not convertible balances or two settlements for one job.
This module grants no signing, reservation of financial funds, submission, settlement,
profile creation or remote execution authority. Installed-source authenticity remains
unqualified. The exported historical `ownerCandidate` identifies original provenance,
not the current checkout or an approved installation.

The receiver reserves its context before awaiting the inspector. Concurrent duplicates
and restored pending or consumed journals cannot invoke it again. Unknown replay or
reservation evidence stays INCONCLUSIVE, including negative receipts. Validated work,
original errors and exact failure totals survive presentation failures. Output space is
reserved separately from the two-million-byte input ceiling. These are conservative
encoded-size and soft replay limits, not measured peak heap or hard preemption.
Durable cross-process custody and actual installed-source authentication remain separate.

## Reproduce and qualify

```sh
node --test --test-reporter=tap integrations/alpha-agent/enterprise-work-request.test.mjs
```

Use Node 22.23.3, as pinned by this repository. The five literal controls test
zero-cap routes, known/unknown negative reports, stale context, reservation refusal
and interrupted-inspector recovery. Six actual-Alpha tests are explicitly NOT_RUN
without the separately reviewed fixed runtime; a green literal suite is not native
integration, release, installed-package or operational acceptance.

The additive Enterprise receiver source checks workflow records exact HEAD, file
hashes, runtime and full TAP output. All existing mandatory workflows and finite
source-inventory gates remain authoritative; none is waived. Existing Alpha pins,
browser receipts, deployed contracts, versions and published assets are unchanged.
Fresh source-inventory admission, complete CI, review, resulting-main acceptance and
release/download/install verification are required before release qualification.

This source receiver does not import the new Python invention-automation checkpoint.
Any future connection requires a separately qualified adapter and exact-source evidence;
the old Discovery pins cannot be silently repurposed.
