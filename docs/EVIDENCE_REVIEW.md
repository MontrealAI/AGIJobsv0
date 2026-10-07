# Review a computer-work delivery

The [local evidence reviewer](https://montrealai.github.io/AGIJobsv0/review/) connects a delivered computer-work receipt to its original task. It checks file integrity and helps a reviewer record substantive findings. It does not dispatch work, upload evidence, authenticate a provider or release payment.

## Bring three independent references

1. The original `task.json` admitted by the operator, not a task reconstructed from the worker's receipt.
2. The expected job ID and deployment ID from the trusted operator admission record.
3. The complete `evidence-ready` receipt from the persistent dispatch journal described in the [computer-work guide](computer-work.md). Keep the original bytes. A proposal, raw model response or blockchain transaction receipt is not this format.

Use only approved public, licensed or synthetic evidence. The page accepts computer-work task schema v1 (up to 512 KiB) and adapter receipts (up to 2 MiB). It reads files locally in the current tab and makes no source fetches or uploads. Reloading clears the review.

## Inspect, reproduce, assess

Enter the expected job and deployment, choose the files and select **Inspect evidence**. The page compares the normalized task digest with the actual adapter format, checks the embedded task and required deliverables, then recomputes UTF-8 byte counts and SHA-256 for every artifact. JSON artifacts must also parse. It records SHA-256 fingerprints of both original input files so formatting changes remain distinguishable from semantic task changes.

Inspect each delivered artifact as plain text. HTML, Markdown and source code are not executed or rendered. Downloads preserve exact UTF-8 content but append `.txt` to the original artifact name. No file is automatically opened.

Reproduce the work against the admitted criteria and original sources. Record **Pass**, **Fail** or **Not checked**, with evidence or an explanation for every criterion. Add a public reviewer identifier, role/conflict disclosure, reproduction notes and a recommendation. **Recommend acceptance** requires every criterion to pass; revisions and rejection can explain failures or unfinished checks.

**Download review assessment** exports an unsigned JSON record bound to the exact task, receipt and attempt. It records the reviewer's stated recommendation, not authenticated independent acceptance. Every export retains `providerAuthenticated: false`, `buyerAccepted: false`, `settlementApproved: false` and `productionApproved: false`. A fixture receipt remains explicitly simulated even if a reviewer recommends accepting its test deliverable.

Changing either input file or an expected identifier immediately clears the inspected result and findings. Edits during file reading or hashing invalidate the pending check. Editing review notes requires a new export to capture them. Keep exported files with the operator's evidence; this page does not persist them or modify the dispatch journal.

## What still requires independent verification

A fabricated receipt with consistent hashes can pass this integrity check. Matching bytes do not prove execution, provider identity, task correctness, reviewer independence, source rights or buyer use. Verify provenance against trusted operator/provider records, reproduce the calculations and acceptance tests, disclose conflicts and obtain actual buyer acceptance through the deployment's established process.

If a check fails, preserve the originals and request the correct evidence. Do not edit hashes until they pass. Missing evidence, interrupted execution or an uncertain external effect requires operator reconciliation before another dispatch. Settlement follows the configured contracts and authorized signing path, separately from this review page.

See the [delivery workflow](MACHINE_LABOR.md) and [current readiness requirements](production/readiness.md).
