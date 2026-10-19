# Inherited CodeQL remediation — 19 October 2026

This is a source remediation review, not production approval. The complete
96-result main-branch baseline comprises 33 high, 23 medium and 40 quality
scanner results. Each result has its own entry in `findings.json`. Scanner
severity is retained separately from exploitability and disposition.

## Source and immutable evidence

- Starting main: `6a18192e915230440f288923b25814e4a87ed7c5`, tree
  `899508ecc40c33086a8d8a6198198ee7f441fa42`.
- Previous main: `fecde507f770481bfd68efddcb92230a0d885b53`.
- Original full-source producer: run `39190559244`, artifact `12159908367`.
  `baseline/original-codeql.zip` SHA-256:
  `c7dd344ab78de98d423d3294db17c1c7b810afa531df7416271f813096c25ba9`.
- Fresh full-source baseline: CodeQL job rerun of scheduled main run
  `39191552445`, attempt 2, artifact `12185570581`.
  `baseline/fresh-codeql.zip` SHA-256:
  `034193954e5183c07469dd097cfdf0f7f1fd334bb39e656ffab6d919c03e16d6`.
  Both contain 96 results and match by rule, path and complete region, retaining
  multiplicity. Artifact-array indices and run metadata differ and are not used
  as finding identities. Both original SARIF files retain all thread flows.
- Compiler, contracts, governance, economics, ENS, published addresses, wallet
  routing, historical receipts, tags and release assets are outside this change.
  Deployed Jobs source remains `818b3a246871e4cd4dde86558dbb91ef82b15eef`.

The complete scanner query configuration is unchanged. The existing static
analysis workflow additionally runs on pushes to `fix/inherited-codeql-*` so a
complete branch scan is available before merge, alongside the existing PR scan.
No path exclusions, queries or security gates are removed.

## Candidate behavior

Onebox builds application controls as DOM nodes and displays user text,
planner summaries, simulation fields, run steps, exceptions and persisted
receipts as text. Receipt navigation accepts absolute HTTPS without credentials.
The built client retains its actual CSP and integrity checks. The static build
also packages the DOM helper and resolves its JSON catalog inside the bundle.

The enterprise portal resolves absolute HTTPS and supported `ipfs://` resource
paths. It rejects other schemes, whitespace/control characters, credentials,
backslashes and encoded IPFS path confusion. Invalid values are inert text;
components and metadata consumers do not fall back to the raw value for links
or requests. The console's independently validated `ethereum:` top-up helper
remains supported.

HTTP authentication uses operator API keys or consumed, expiring nonce
signatures from an exact managed wallet. A wallet principal cannot become an
operator or select a different managed wallet. Contributor role, label,
metadata and unsigned digests are evidence annotations; they are never
authorization credentials. Supplied contributor signatures require the signed
payload and matching recovered address. Existing stored signatures remain historical annotations; this change does not re-verify or upgrade them. A valid signature attests to that
payload, not to a new job-specific permission or a production approval.

Plan identifiers are validated at the filesystem boundary, including identifiers
inside persisted records. Receipt kind and canonical timestamp are validated
before filename generation, and persisted records must match their filenames.
Storage reads use no-follow file descriptors, regular-file and hardlink checks;
writes use exclusive private temporary files and atomic replacement or exclusive
creation. Existing receipts cannot be overwritten by a repeated write. Snapshot
filenames also enforce containment. The service must own its storage tree;
another process with the same OS identity and arbitrary write access to its
ancestors is outside that isolation boundary. No Node pathname helper can
provide an OS security boundary against such a process.

Report data is encoded in its Markdown or Mermaid context. Notifications apply
a process-wide peer rate limit before JSON parsing. Console values use JSON
encoding to prevent forged log lines. Constructor-argument files use unique
private temporary directories and exclusive private files, with cleanup on
success and failure. Fixed-file JSON persistence and intentional exports are
assessed individually in the ledger; dataflow to a file or HTTP body alone
does not establish arbitrary access or exfiltration.

## Reproduction and qualification

Use the repository-pinned Node `22.23.3` and npm 10. Install with
`./scripts/ci/npm-ci.sh`. In environments that cannot set ownership while
extracting Node headers, point `npm_config_nodedir` to the already verified
Node distribution; do not modify the lockfile or skip native modules.

```sh
node --test test/security/inherited-codeql.test.cjs
node apps/onebox/scripts/build.mjs
node apps/onebox/scripts/verify-sri.mjs
npx playwright install chromium
node test/security/browser-regressions.mjs
npx tsc --noEmit -p agent-gateway/tsconfig.json
npx tsc --noEmit -p apps/orchestrator/tsconfig.json
npm ci --prefix apps/enterprise-portal
npm run typecheck --prefix apps/enterprise-portal
node --test test/scripts/verification-evidence.test.cjs test/scripts/owner-report-markdown.test.cjs
npm run successor:test
npm run site:build
npm run successor:qa
```

Browser tests can use `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to select an installed
Chromium. Their transport uses local fixture responses and ephemeral test
identities. No wallet extension, signing account, public transaction or
activation is involved. Security browser results are written to
`reports/security/remediation-browser/result.json`.

The PR qualification record must identify the exact final commit/tree, hosted
complete push scan and artifact digest, test results and independent review.
An intermediate run or a PR-only result set cannot qualify the final source.
The exact-commit PR qualification record and hosted artifacts determine whether
those checks are complete; an uncommitted working tree cannot qualify a commit.

The 96 original results have these source dispositions (scanner severity is
unchanged):

| Severity | Fixed | Already fixed on baseline | False positive | Unresolved |
| --- | ---: | ---: | ---: | ---: |
| High | 28 | 0 | 5 | 0 |
| Medium | 11 | 1 | 11 | 0 |
| Quality | 40 | 0 | 0 | 0 |

The first complete candidate push scan at `642d857…` retains 24 reported results:
11 high and 13 medium, with no quality results. Its archive and per-result
reconciliation are retained in the ledger. Validated URL helpers and contained
file descriptors can still carry scanner taint; their actual guard/caller and
browser/filesystem evidence is recorded without disabling or suppressing queries.
The final scan must still be run on the exact final commit.

Three additional findings are separately recorded: the adjacent world-model
snapshot filename boundary, an independently reported gRPC compatibility
gap in the initial remediation, and an independently reported missing-value
regression in a quality cleanup of the read-only wiring verifier. All have
focused regressions. The gRPC correction adds
optional contributor `signed_payload` field 8: send the exact UTF-8 EIP-191
message (including an empty string when applicable). A signature with only an
unverified digest is rejected. Historical evidence is not rewritten.


## Portal comment reconciliation

The original F008/F009 arbitrary-scheme fallbacks are fixed. The fresh scanner
can still report the validated paths as `js/xss-through-dom`; this post-fix
assessment is separate from the original finding disposition.

- Deliverable: typed `event.target.value` → `setCid` → `cid` →
  `resolveResourceUri` → `deliverableUrl` → conditional React `href`.
  Event-derived `ResultSubmitted.meta.args.resultURI` (or `args[3]`) passes
  through `toStringOrUndefined` and the same resolver for the table link;
  “Load details” feeds `setCid`. Verification resolves the CID independently
  before any fetch and rejects a nonempty invalid value.
- SLA: typed value → `setUri` → `resolveResourceUri` → guarded fetch →
  `response.json` → `parseSla` → `document`. Both fetched `document.uri` and
  the typed fallback pass through the resolver again before the Source `href`.
  Invalid values render in a text span. Metadata text arrays are validated and
  rendered as React text; malformed objects produce a recoverable error.

The resolver returns only canonical absolute HTTPS or a supported IPFS path
appended to an independently validated HTTPS gateway. It rejects credentials,
control/whitespace characters, backslashes, inappropriate/encoded schemes and
encoded IPFS traversal or separators. React sets an attribute and escapes text;
there is no raw-value fallback or HTML parser on either path. Retained taint
through the IPFS segments cannot change the HTTPS scheme. These are justified
post-fix scanner false positives, not evidence that the baseline was safe.
HTTPS destinations remain external untrusted content; the policy does not
endorse them or sanitize pages they serve.

`test/security/browser-regressions.mjs` uses the actual React components and
Chromium. Every hostile vector is exercised as typed input and fetched SLA
metadata; the test checks absent navigable links, no invalid-input fetch,
inert markup/controls, event-prefill handling and valid HTTPS/IPFS links.
The same hosted artifact includes Onebox's built CSP and lifecycle checks.

The gRPC contributor field is additive (`optional string signed_payload = 8`);
existing field numbers and unsigned clients remain supported. Real protobuf
round trips cover unsigned legacy metadata plus valid UTF-8, empty, altered
and omitted signed payloads. A client sending a signature without its message
must supply that message (or remain unsigned); a digest alone cannot prove
what was signed. This intentional rejection is not a new authorization role.
Independent exact-head re-review must complete before final qualification.
