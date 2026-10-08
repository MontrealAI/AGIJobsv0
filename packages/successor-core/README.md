# @agijobs/successor-core

A bounded mission-institution core for AGIJobsv0. It combines executable local discovery with work-order coverage, exact evidence bindings, separated proof/authority and portable knowledge. The default mode is synthetic rehearsal; a passing local test is not independent proof or production admission.

Use the repository's pinned **Node 22.23.3** and locked dependencies. Node adapters use `node:sqlite`; the pure browser modules do not import Node storage or credentials. See the [operator guide](../../docs/successor/README.md), [architecture](../../docs/successor/architecture.md), [compatibility rules](../../docs/successor/migration.md) and [acceptance matrix](../../docs/successor/acceptance-matrix.md).

```bash
npm run successor:demo
npm run successor:verify
npm run successor:test
npm run successor -- help
```

The group CLI is `bin/successor.mjs`. It returns JSON or a typed error with a failing exit status. Use `--file` for explicit input, `--out` for a new output path and `--trust` for separately configured proof/admission trust. Output creation refuses overwrites; there is no implicit overwrite flag. The default commands never dispatch live effects.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `src/integrity.mjs` | Canonical JSON, domain-separated content digests and bounded data handling |
| `src/domain.mjs` | Strict versioned mission/work-order/graph validation and pure lifecycle checks |
| `src/templates.mjs`, `src/compiler.mjs` | Portfolio templates, graph constraints, seals, planned coverage and invalidation references |
| `src/underwriting.mjs` | Ordered SEIZE records, mission/objective/comparator/evidence commitments and Promotion Requests |
| `src/invoice.mjs` | Synthetic invoice sources, bounded jobs and evidence-bearing recommendation |
| `src/discovery.mjs` | Restricted executable hypotheses and bounded candidate search |
| `src/workbenches.mjs`, `src/journeys.mjs` | Shared executable reference cases, measured comparison and portable journey records |
| `src/proposer.mjs` | Explicitly configured proposal adapter; generated proposals still require validation |
| `src/proof.mjs`, `src/signatures.mjs` | Exact candidate/protocol bindings, examination findings and explicit signer trust |
| `src/examination.mjs` | Node-only complete WORLD freeze, actual public-case reexecution and signed internal I0 FAIL bundle |
| `src/authority.mjs` | Current scoped permission, role separation, revocation and dependency impairment |
| `src/institution.mjs` | Verified compilation registration, mission-qualified dependencies and effect-time work-order constraints |
| `src/runtime.mjs` | Operator-configured fixture effect boundary, aggregate reservations and unknown-outcome reconciliation |
| `src/store.mjs` | Transactional local state, append-only events, replay and checkpoint verification |
| `src/pack.mjs` | Bounded JSON Mission Packs, rights/exclusion checks and unprivileged restore/descendants |
| `src/bridges.mjs` | Outer mission/task and economic-reference boundaries |
| `src/presentation-state.mjs` | Honest display labels from domain state |

Export names and schema fields are defined in source. Pure functions validate attributed identifiers; they do not authenticate a caller. A deployment must combine them with trusted identities, signed records and the reviewed execution boundary. Mutable caller-supplied Booleans are not evidence of production commissioning.

`schemas/successor-domain.schema.json` supplies Draft-07 interchange validation. Use the asynchronous `transitionSealedJob` wrapper when advancing a sealed order: it verifies the immutable digest before calling the domain reducer. The reducer's trusted preconditions and receipt decisions must come from the authenticated runtime, not job-supplied fields.

`examineWorldJourney(journey, { sourceDigest, now })` verifies a supported authored WORLD journey, freezes all 16 actual component bindings and reexecutes its 60 cases against the actual incumbent and strongest comparator. The CLI supplies a digest of the core modules, CLI, package metadata and root lockfile; the helper requires that commitment but cannot independently authenticate caller-supplied source provenance. Its output contains the frozen candidate, component material, protocol, measurements, signed I0 FAIL receipt and public fixture trust, without private keys. The comparator tie means no demonstrated advantage, and independent admission is denied. Sampling intervals and cost accounting are explicitly conditional on the authored teaching assumptions; these previously visible cases are not fresh protected work. Measured latency covers only local interpreter execution.

## Data and execution rules

- Compile plans and capability requests without granting authority. Coverage is `PLANNED_NOT_ACCEPTED` until the required evidence and decisions exist.
- Keep the immutable sealed payload separate from the job's changing lifecycle state. Material edits create a new seal and invalidate dependent admission.
- Keep a candidate's result separate from acceptance of the evaluation job: a rigorous FAIL report can be successful paid work.
- Preserve rejected hypotheses and counterexamples. More agreement from shared evidence is not more independent proof.
- Restore only permitted knowledge and historical evidence. Restored packs and descendants have no active production authority or current inherited proof.
- Use integer base-unit budgets and the configured chain/token/decimals. A planning quote is not funded escrow.

Mission Packs are versioned JSON artifacts. Unsupported archives/executable payloads are not silently unpacked or run. Restricted evidence remains a governed reference rather than portable raw data. No production key, active authority or provider secret belongs in a pack.

Current pack verification reports `authenticated: false`: digest consistency is not authenticated provenance. Credential-field screening cannot identify every secret encoded in arbitrary text. Export only reviewed permitted content, retain source custody and verify separately signed historical receipts through configured trust.

The current successor runtime bridge is fixture/local only. Live successor dispatch is blocked pending independent review and real effect-boundary commissioning. Existing legacy computer-work execution retains its own admission and recovery contract; it does not automatically become successor-admitted.

## Verification and support limits

Use `node --test packages/successor-core/test/*.test.mjs` from the repository root with the pinned Node version to run the package tests. Record the exact commit and exit status. Run impacted existing runtime, protocol and Pages checks as well; this package suite does not replace repository release gates.

The [matrix](../../docs/successor/acceptance-matrix.md) distinguishes local passing tests, incomplete coverage and external gates. Protected real examination, trusted production identities, provider/worker commissioning and accountable admission remain separately evidenced operations. A static page, local fixture key or self-described verifier cannot satisfy them.
