# SUCCESSOR Ω: preserve the mission while models change

AGI Jobs are bounded work orders with evidence and acceptance criteria. The SUCCESSOR Ω layer connects that work to a lasting mission: its objective, executable methods, comparisons, permissions and failure history.

Start with one recurring decision and a credible alternative. Develop several candidates, inspect counterexamples, freeze one exact system and examine it. Keep the finding even when no candidate is better. A proof result, payment, knowledge admission and permission to act remain separate decisions.

## Run the local rehearsal

From the repository root after installing its locked dependencies with the pinned Node toolchain:

```bash
npm run successor:demo
npm run successor:verify
npm run successor:test
```

The demo writes a new directory under `reports/successor/` and reports its path. Inspect the invoice, world and resource results, `world-examination.json`, fixture trust record, proof rehearsal, Mission Pack, restored record, descendant and release-evidence JSON. The verification command checks the local journey's explicit invariants; it does not certify production.

For individual steps, run `npm run successor -- help`. For example:

```bash
npm run successor -- mission init --mission invoice --out reports/successor/mission.json
npm run successor -- jobs compile --file reports/successor/mission.json
npm run successor -- mission run --mission world
npm run successor -- pack verify --file reports/successor/RUN_DIRECTORY/mission-pack.json
```

Replace `RUN_DIRECTORY` with the path returned by the demo. `--file` selects input and `--out` creates output without overwriting an existing file. Use a new path on another run. Proof verification and admission require a separately supplied `--trust` file; no demo silently provisions production trust.

## Choose the next step

| Goal | Guide |
| --- | --- |
| Understand components, trust and state boundaries | [Architecture decision](architecture.md) |
| See the 21 portfolio obligations and how jobs cover them | [SEIZE portfolio](portfolio.md) |
| Integrate without breaking task v1 or settlement | [Compatibility and migration](migration.md) |
| Inspect proof, handle failures or prepare commissioning | [Operations and recovery](operations.md) |
| Check exactly what has been verified | [Acceptance and evidence matrix](acceptance-matrix.md) |
| Review corrected security findings and remaining trust limits | [Engineering security review](security-review.md) |
| Inspect candidate changes, validation and release gates | [2.1.0-rc.1 release notes](release-notes.md) |
| Inspect package/API implementation | [Successor core package](../../packages/successor-core/README.md) |
| Check existing platform deployment gates | [Current production readiness](../production/readiness.md) |

## What the first session means

The invoice fixture investigates a synthetic C$18,700 repair bill against a C$12,400 purchase order, possible duplicate billing, changed bank details, incomplete completion evidence and possible warranty coverage. Its recommendation is **HOLD_AND_ESCALATE**, not a fraud finding or payment instruction. A person receives the evidence and decides the next step.

The other workbenches examine an unsafe apparent improvement and a resource-constrained research decision. A stronger comparator or different outcome frequencies can remove a claimed advantage. These negative findings become reusable knowledge.

The Node WORLD examiner freezes all 16 components of the actual synthesized candidate, binds its incumbent and strongest comparator, and reexecutes their 60 public development cases. The strongest comparator ties the challenger, so the signed internal I0 finding is **FAIL: no demonstrated advantage**. The bundle preserves the exact programs, case commitments, conditional calculations and missing production assurances. Its fixture keys establish local integrity only; independent admission is denied. Development cases, authored cost tariffs and nominal sampling groups do not become protected real-world proof.

The first session is public synthetic research. It does not need a wallet or production connection, and it does not establish independent Specialist ASI, realized customer Alpha or live authority. The public website cannot keep confidential evidence or protected final cases. Use the matrix for current implementation and validation limits.

**Beta** is capability others can rent. **Spread** is a possible advantage before all costs and risks. **Alpha** is the residual mission advantage that survives a credible comparison. The **Gym** develops candidates. **Proof** records an examination. **Admission** is an accountable decision. **Authority** is the exact current permission to act. **Chronicle** preserves scoped knowledge and failures. Restoring Chronicle does not restore permission.

## Parcours en français

Choisissez une décision récurrente, un résultat mesurable, un responsable et une solution de référence crédible. Développez des candidats, examinez les échecs, figez un système précis, puis comparez-le. Une conclusion « aucun avantage démontré » est un résultat utile.

La facture synthétique conduit à **SUSPENDRE ET SOUMETTRE AU RESPONSABLE** (`HOLD_AND_ESCALATE`). Elle ne démontre pas une fraude et ne déclenche aucun paiement. Les résultats de répétition locale ne constituent ni une preuve indépendante, ni une admission en production.

Les modèles peuvent changer. La mission, les méthodes autorisées, les preuves et les leçons peuvent être préservées. Une restauration ou un descendant commence sans autorité de production héritée.
