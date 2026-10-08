# ADR: a mission institution above bounded AGI Jobs

Status: implementation decision for the SUCCESSOR Ω release. This ADR describes the chosen boundaries; the [acceptance matrix](acceptance-matrix.md) records which are implemented and tested. A design decision is not evidence of commissioning.

## Context and decision

AGIJobsv0 already supplies job execution, artifact review, validation and settlement. The next layer preserves the purpose, evidence, executable methods and failure history of one mission while its models or operators change. Existing protocol semantics remain authoritative for economic settlement.

Use a shared, browser-safe domain core in `packages/successor-core/src/` with separate Node trust, persistence and execution adapters. The public website and local CLI use the same deterministic mission calculations. Neither the static website nor a model receives production authority. Live integrations need enforcement outside the model at the actual effect boundary.

The new orchestrator bridge is initially fixture/local only and refuses live successor dispatch until the external action boundary is commissioned. This restriction does not disable or certify the existing separately admitted legacy computer-work path. See [migration](migration.md).

## Reuse map

| Existing boundary | New layer | Compatibility rule |
| --- | --- | --- |
| `contracts/v2/`, `config/agialpha.json` | Attributable economic links to work orders | Preserve asset, decimals, lifecycle, fees, stake, dispute and authorization rules |
| `apps/orchestrator/computerWork.ts` | Outer mission/work-order binding | Preserve schema v1 and its normalized digest; require new outer admission |
| Existing worker admission and journals | Explicit successor runtime bridge | Legacy permission never authorizes a changed outer mission or successor |
| `website/assets/review-model.mjs` | Evidence inspection and comparison views | An unsigned integrity assessment remains unsigned and is not independent proof |
| Existing demo catalog/Pages build | One `/successor/` public rehearsal | Preserve original routes, source links and diagrams; deploy under `/AGIJobsv0/` |
| `shared/worldModel.ts`, training records | Restricted executable WORLD and Chronicle | Operational summaries and best-effort learning logs are not durable authority |

The core uses ordinary versioned JSON data and explicit references rather than a service per domain record. Pure calculations must not import wallet/provider secrets, filesystem access, browser state or protected final cases. Node adapters own signatures, persistence and effects. Generated WORLD/POLICY programs use a restricted interpreter; importing a document or pack must never execute supplied code.

## Trust and state

| Plane | Permitted role | Boundary that must remain enforced |
| --- | --- | --- |
| Evidence | Preserve permitted sources and lineage | Documents are data, never instructions or permission |
| Foundry/Gym | Hypothesize, synthesize, simulate, falsify and request proof | No protected labels/scorer secrets, release keys or self-admission |
| Proof | Examine an exact frozen system under a preregistered protocol | No candidate rewrite, payment release or authority grant by virtue of verification |
| Governance | Underwrite, accept, admit, allocate and revoke | No silent rewrite of unfavorable evidence |
| Action | Check exact identity, target, effect, limits and current revocation immediately before dispatch | A model proposal is not authorization |
| Chronicle | Preserve scoped knowledge and failures | Stored data is not admitted knowledge; restoration grants no permissions |

Role names, separate prompts, different models and different wallets do not establish independent organizations or evidence custody. Shared host, administrator, model supplier and evidence sources can create correlated failures. Production separation requires reviewed identities, access controls, storage/process isolation and separate signing capabilities. The local fixture demonstrates protocol mechanics on one operator-controlled machine.

Maintain independent state axes:

- **Work:** draft, underwritten, authorized, executing, verified, accepted, Chronicle eligible, with explicit failure/refusal/repair routes. A correctly performed evaluation whose candidate verdict is FAIL can still be accepted work.
- **Candidate:** proposed/forming, frozen, examination requested, examined, rejected/inconclusive/qualified within scope/superseded.
- **Proof:** verdict and currency are different. Historical PASS can become expired or impaired without rewriting history.
- **Admission:** a separately accountable grant or denial, then suspension, expiry, revocation or retirement.
- **Knowledge:** proposed, challenged, admitted within scope, quarantined, expired or revoked.
- **Economics:** funding/settlement is an existing protocol outcome, not a mission-proof verdict.

These are design vocabularies; consult exported schemas for exact wire enums. No generic `success` value should advance all axes.

Four objects stay distinct: **WORLD** states a fallible executable belief; **POLICY** proposes a decision; **PROOF** records what an examination demonstrated; **AUTHORITY** permits a bounded effect. A stronger prediction does not authorize a bank transfer.

## SEIZE and coverage

SEIZE selects evidence before irreversible commitment:

1. **Surface the succession event:** provenance, changed assumption, owner, cost of waiting and required evidence.
2. **Evaluate the successor frontier:** retain, repair, rent, form, partner, acquire, reserve, hedge, retire or do nothing, with falsifiers and reasons against each alternative.
3. **Instantiate the succession constitution:** freeze mission, comparators, rights, gates, limits, human decisions and stop conditions.
4. **Zero in on decisive proof:** choose the smallest permitted experiment that can change the decision after its complete cost.
5. **Elevate one challenger:** freeze the whole system and issue a Promotion Request.

SEIZE never issues a production Release Certificate. The local underwriting API binds the declared candidate digest in its Promotion Request; the proof harness must verify the actual frozen manifest. Its unsigned records do not authenticate the principal or prove a freeze by themselves. New evidence or changed mission/objective/comparators requires renewed underwriting. Underwrite, Execute, Accept, Admit and Allocate are separately attributable decisions. The [21 portfolio obligations](portfolio.md) may be combined into fewer jobs; combining work never merges incompatible trust roles.

Execution dependencies must terminate. Bounded iteration creates explicit attempts/versions with limits. Evidence, control, challenge, rollback and invalidation links are not interchangeable execution edges. The compiler must reject missing rights, acceptance owners, enforceable limits, required critical coverage and rollback; dependency changes must invalidate affected descendants with an explanation. The matrix identifies any unimplemented diagnostics.

## Comparison, signatures and claims

The baseline is the stronger credible alternative, including simple software or a human workflow when appropriate. Alpha means residual mission advantage after complete cost, risk and human burden; it is not a stage, token-price prediction or reward for novelty. Report `no demonstrated advantage` as an ordinary outcome. A higher average score cannot compensate for a failed critical-error gate.

Metrics, confidence method, sample/stopping rules, exclusions, utility units and costs are fixed before examination. Correlated observations do not create independent votes. A change in case frequency, comparator capability or costs can weaken a claim without changing the candidate.

The implemented protected-proof interface supports one fixed-sample attempt with bounded paired net gains and a Hoeffding union bound. Its sampling contract is `independent-case-groups`, one case per independent group, with a custodian assurance digest. Reused correlation-group IDs are rejected. The confidence calculation is conditional on actual independent sampling established by the custodian; distinct IDs do not establish that independence. Other clustered/adaptive sampling needs a separately reviewed method.

Freeze mission, WORLD/POLICY, objectives, comparators, evidence, memory, tool/runtime/provider configuration and allowed adaptation. A material change creates a new release/proof requirement. Opaque hosted providers do not promise immutable weights merely because an endpoint name is unchanged.

The Node WORLD examination adapter connects the actual public journey to this interface: it freezes 16 complete-system bindings, reruns the actual challenger and both actual comparators on 60 development cases, and signs an internal I0 FAIL because the strongest comparator removes the advantage. Component material, source commitment, case evidence and conditional tariff/sampling assumptions remain inspectable. The adapter records missing production assurances and denies independent admission. This closes the local execution path without relabeling public development data as protected proof.

Use domain- and version-bound canonical digests and purpose-bound signatures with explicit trusted key IDs, environment/mode, mission and release. A valid signature establishes attribution/integrity within its trust assumptions, not factual truth. Fixture keys cannot authorize live execution. Unknown or revoked trust roots fail closed.

Independence levels are separate from authority: I0 internal critic; I1 claimant organization role/team; I2 separately governed enterprise custody; I3 independent third party; I4 multiple independent organizations. I3 is the default mandate for public independent-proof claims and consequential admission. A local fixture is never promoted by changing a label.

Authority levels are A0 observe/read-only, A1 recommend, A2 isolated sandbox, A3 reversible bounded action and A4 consequential action with the required controls. The ordinal is insufficient: tool, target, data, identity, effect, budget, time, proof scope, approvals and revocation remain explicit. Admission specifies a maximum level and a named principal provisioned in the signing trust. Formation/evaluation jobs can authorize narrow experiments on unproven candidates; those leases do not become the candidate's production envelope.

## Persistence and portability

Durable transitions need expected versions, idempotency, aggregate reservations and a dispatch journal. The broker's transaction committing `dispatching` is its dispatch linearization point; later revocation is an in-flight event and cannot promise to undo an effect. An uncertain external effect is reconciled, never blindly repeated. An append-only local hash chain detects many edits; it cannot alone prove that its writer did not remove the newest suffix. Truncation claims require an independently retained head/checkpoint. Critical persistence failure must stop affected effects.

Mission Packs preserve permitted knowledge, historical evidence and negative findings. They exclude active permission, private keys, provider secrets and restricted source bytes. Restore is an unprivileged operation; historical proof remains historical until its exact identity, trust and freshness are checked. Supplier substitution creates a new candidate even when compatibility tests pass.

## Source and scope

Vincent Boucher's *Mission-Sovereign Successors*, v5.0.0, defines SEIZE (printed pp. 20–22), authority (23–24), the 21 jobs (29–30) and fresh proof (31–32). *SUCCESSOR Ω × AGI Jobs*, v2.0.0, and *Neural-Symbolic SUCCESSOR Ω*, Canonical Edition 7.0, supply complementary work-order and WORLD/POLICY/PROOF/AUTHORITY doctrine. These are design sources, not evidence that this implementation has independently proven or admitted a real Specialist ASI.

Manifold/gradient language guides constrained architecture search; it does not require pretending discrete candidates form a smooth physical system. Other GoalOS products' access-token rules and commercial release versions do not alter this repository's settlement or release numbering.
