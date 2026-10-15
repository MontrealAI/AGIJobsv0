# Supplier comparison: shared browser protocol laboratory

This reproducible test connects the existing One-Box supplier task to Alpha's fixed
computer worker. It drives real Chromium using keyboard, scroll and wait actions,
then derives deliverables from the observed page text. The existing Jobs reviewer
recalculates acceptance from the synthetic source quotes.

The Responses transport is a scripted fixture. This demonstrates browser execution
and protocol compatibility, not autonomous model decision quality. The worker runs
as a direct laboratory subprocess here; production Alpha execution requires its
networkless Docker worker and separate qualification. This test does not authorize
market assignment, production execution, settlement or purchases.

## Run

This laboratory requires Linux with readable `/proc` identities and fails closed on unsupported hosts. Use a trusted local Alpha checkout with its Python dependencies and Playwright
Chromium already installed. The harness imports and executes that checkout's code;
it records worker and advisor source hashes. It requires the advisor's
`usage_events` interface. No provider key or external service is needed.

```sh
PLAYWRIGHT_BROWSERS_PATH=/path/to/playwright-cache \
  /path/to/alpha/.venv/bin/python -O \
  integrations/alpha-agent/supplier-browser-lab.py \
  --alpha-source /path/to/AGI-Alpha-Agent-v0 \
  --output /path/to/new-evidence-directory
```

A successful run exits 0. Repeat with a different output directory and
`--inject-error`: the deliberately wrong recommendation must be rejected and return exit code 1. Existing evidence directories are refused rather than overwritten.

## Acceptance and evidence

The task compares 40 units with a seven-day delivery limit. The browser must show
Stellar as the cheapest eligible supplier at $490; Laurentian's cheaper quote is
late. `comparison.json` and `recommendation.md` are generated from actual browser
observations, committed by SHA-256 in `receipt.json`, and passed to the existing
11-check `demo/One-Box/computer-work/review.cjs` reviewer. The negative run changes
the recommendation while preserving internally consistent artifact hashes, proving
that checksums alone cannot establish correctness.

`evidence.json` retains the source/task hashes, screenshots and observation hashes,
action sequence, provider-fixture call count, external fetch count, wall-clock
measurement, usage observations and complete review. Screenshots are synthetic
fixture evidence; callers should inspect outputs before publishing them. The
checked-in summary omits local paths and the full screenshots.

Bounds are three advisor turns, eight actions, five actions per response and
60 seconds. Worker input writes and JSON frame reads use nonblocking I/O with one absolute deadline, including partial-line stalls. Messages are size bounded. Every worker fetch request receives
403; the successful fixture requires zero fetches. The worker process group is
terminated on completion or exception, with bounded wait and group-wide kill fallback even when the leader exits first. Linux process-group inspection verifies no live members remain. Reviewer execution also has a ten-second timeout. Exceptions retain partial observations and cleanup status in `failure-evidence.json`.
Validation remains enabled under Python's optimized `-O` mode. A failed or
interrupted run requires a fresh output directory; it never automatically retries
a billed request. The host laboratory is not an operating-system network sandbox.

No live provider was called. Token counts and dollar cost are unknown, not inferred
from elapsed time. Recorded elapsed time is a single laboratory observation, not a
performance benchmark or human-effort saving estimate. Live usage, cost ceilings,
recovery and Docker isolation require the separately authorized Alpha runtime path.

## API surfaces

Verified against the official documentation on 2026-10-15:

- [OpenAI computer use](https://developers.openai.com/api/docs/guides/tools-computer-use):
  native `computer` tool, batched actions and call-ID-bound screenshot outputs.
- [OpenClaw OpenResponses API](https://docs.openclaw.ai/gateway/openresponses-http-api):
  client function tools and `function_call_output` are a separate transport surface.

This harness exercises Alpha's native computer interface. It does not treat the
OpenClaw client-function surface as interchangeable or add a generic Jobs/Fleet
production browser adapter.

Process-group closure covers the trusted fixed worker and children that retain its group. It does not prove termination of a malicious descendant that deliberately escapes the group, and is not operating-system containment.
