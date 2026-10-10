# Operating and commissioning a successor

The default journey is synthetic local research: A0/A1 analysis and recommendations, with explicitly isolated A2 rehearsal. It needs no wallet, API credential, production connection or model download. Public fixture results demonstrate implemented mechanics, not externally independent proof, realized customer Alpha or production authority.

Use the [acceptance matrix](acceptance-matrix.md) for exact validation status and [current platform readiness](../production/readiness.md) for inherited gates. The new successor bridge refuses live dispatch until the remote effect boundary is commissioned. Existing legacy worker operations retain their own commissioning requirements.

## Local state assumptions

The Node store is a single-host SQLite file with WAL, full synchronous writes and serialized writer transactions. It records expected versions and event IDs; each committed state is limited to 8 MiB. This is not a distributed control plane or an authenticated multiuser service. The CLI runs with the local operator's filesystem authority; protect its directory and signing configuration accordingly.

The demo writes `chronicle-checkpoint.json` beside its database for inspection. That neighboring file is not independent custody. Retain an authenticated latest head outside the database writer's control before claiming suffix-truncation detection against that writer. `chronicle inspect --checkpoint` checks the explicitly supplied head; a local hash chain by itself establishes consistency only.

JSON file imports require platform support for no-follow and nonblocking file opens (the supported Linux/macOS runtime). Imports fail closed when those primitives are unavailable. The CLI reads at most 16 MiB and the standalone proof harness at most 8 MiB per file. Checks and bounded reads use one descriptor; final-component symlinks, nonregular inputs, invalid UTF-8 and observed in-place changes are rejected. Parent directories and operator trust configuration must remain protected.

## Before an examination

- Record mission owner, outcome, rights, incumbent and strongest credible alternative. Freeze metrics, critical-error limits, complete cost method, minimum meaningful gain, sample/stopping rule and expiry.
- Freeze the whole decision system and record its manifest digest: WORLD, POLICY, evidence, memory, configuration, tools, runtime and provider guarantees. Undeclared adaptation creates a new candidate.
- Separate formation from final case/scorer custody. Do not place protected material in GitHub, Pages bundles/source maps, logs or public CI artifacts. The local fixture is public by design.
- Configure signer trust by purpose, role and environment. A fixture signature proves no production trust. Record conflicts and shared evidence/supplier risks.
- Preserve negative and abandoned attempts. Insufficient evidence is an explicit result, not zero failures.

## Proof and authority inspection

Inspect release identity, protocol/comparator bindings, actual independence, verdict, proof currency and permitted scope separately. An attractive score does not override a hard gate. A conditional result cannot bypass its unresolved condition. Historical PASS is still visible after expiry or impairment, but cannot support current authority.

Underwrite approves evidence spend. Execute permits a bounded job. Accept decides whether its delivered work met criteria. Admit controls future use or mission authority. Allocate decides which verified available value may fund further work. Every decision has its own accountable actor and evidence; a completed or paid job does not perform the others.

Before any real effect, the commissioned broker must recheck authenticated actor, mission/release, target/action, envelope/admission/proof, budget reservation, deadline and current revocation. The check belongs outside the model immediately before dispatch. Record whether the effect was attempted, observed, denied or uncertain.

## Failure and recovery

| Observation | Required response |
| --- | --- |
| Unknown signer, role conflict or replayed authorization | Deny; inspect authorized trust configuration and original record; never accept a key because it verifies its own signature |
| Material model/program/provider/configuration change | Create a new candidate; retain old evidence as historical and seek fresh proof |
| Expired rights, stale proof, stronger comparator or distribution shift | Impair affected claims; contract dependent authority; record the dependency and reason |
| Revoked authority after proposal | Deny any not-yet-dispatched effect; do not reuse the proposal's earlier permission snapshot |
| External outcome unknown after timeout/crash | Stop affected work; preserve the dispatch ID, journal and observed effects; reconcile before deciding on retry |
| Lost monitor, failed cleanup/rollback or unavailable freshness | Fail closed; capture nonsecret diagnostics; require explicit recovery rather than a healthy-heartbeat auto-reset |
| Persistence failure, event mismatch or checkpoint disagreement | Stop affected critical transitions; preserve all copies; reconcile against independently held evidence |
| Budget exhausted or concurrent reservations conflict | Deny new spend; reconcile reserved liabilities without silently dropping them |
| Restored or substituted candidate | Start without active authority; verify compatibility and obtain new proof/admission when needed |

Do not delete a journal, fabricate a successful receipt, repeat an uncertain payment, weaken a gate or restore an old envelope to make a run continue. Irreversible effects need containment/compensation and human escalation, not a claim of transactional rollback. An incumbent fallback needs its own valid permission and evidence.

## External commissioning checklist

| Gate | Required evidence and accountable owner |
| --- | --- |
| Maintainer release trust | Authorized signing identities, exact source/artifact digests, provenance and active repository review/check enforcement |
| Independent examination | Separately controlled protected cases/runtime, authorized evaluator trust, disclosed conflicts and the signed exact-candidate result |
| Live provider | Tested supported endpoint/model/runtime, isolated credentials, bounded request/response, failure and substitution evidence |
| Worker/action enforcement | Dedicated identity/sandbox, tool/network/target/action controls, aggregate budgets, stop/revocation race, cleanup and recovery tests at the actual worker boundary |
| Durable operation | Reviewed persistence/concurrency model, unique dispatch IDs, outbox/journal, crash reconciliation and independently retained checkpoints where claimed |
| Real governance | Named accountable acceptance/admission principals, current scope/rights, required professional/dual controls, expiry and revocation |
| Network settlement | Actual chain/token/addresses, deployment/ownership/identity/stake prerequisites, confirmations/reorg handling and validator recovery |
| Security and dependencies | Current findings, explicit assessments, isolation/security review, redaction/retention policy and incident response |

Missing credentials or a third-party examiner do not block local development. They do block claims of live provider success, independent proof or production admission. No fixture or local-chain transaction substitutes for these gates.

## Release evidence

Record base and final candidate SHA, lockfiles/toolchain, exact test commands and exit codes, artifact digests, licenses/BOM, fixture results, screenshots, failures, unsupported paths and responsible external owners. Run the impacted existing contract/runtime/site/diagram checks as well as the successor suite. Regenerate evidence after material edits. Report separately local computation, local-chain transactions, live-provider tests, independent examination and production commissioning.

The publication of a public website or a source archive does not clear runtime, settlement or mission admission gates. A clean negative finding is valuable evidence; an unrun required check remains unrun.
