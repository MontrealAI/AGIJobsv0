# SUCCESSOR Ω engineering security review

Review scope: local source review and adversarial tests of mission commitments, signing/proof, action authorization, persistence, portability and the existing computer-work bridge. This is an engineering review, not an external security audit, independent mission examination or production commissioning.

Base: `5b4cebb309a83a7a6749d8911d8bf96a1921e042`. Generated release evidence records the checkout revision, working-tree state and executable source digest; the release PR identifies the final head. The [acceptance matrix](acceptance-matrix.md) records validation scope; [release notes](release-notes.md) preserve remaining gates.

## Reviewed findings and corrections

| Finding | Correction and evidence |
| --- | --- |
| A signed mission-A context could refer to a mission-B candidate | Proof verification now binds the candidate's mission to the signature context; the cross-mission test in `test/proof-runtime.test.mjs` rejects it |
| A trusted signature could carry internally contradictory PASS fields | Verification checks comparator roster, finite statistics, costs, attempts and hard-gate consistency as well as signatures; contradictory signed reports fail the proof/runtime tests |
| Distinct case hashes could be mistaken for independent samples | Protocol explicitly commits independent-case groups, one case per group and custodian assurance; repeated correlation groups fail. Bounds are labelled separate one-sided bounds; actual independence remains an external evidence obligation |
| Credential aliases or mislabeled authority levels could imply extra permission | Key fingerprints/custody, named principal trust, admission maximum level and effect classification are checked; A3 cannot relabel a consequential-payment effect to avoid A4 dual controls |
| Dependency closure was initially separate from active runtime state | Compilation registration connects verified seals and mission-qualified source/job dependencies to durable impairment; linked proof and authority contract while unrelated missions remain intact. `test/institution.test.mjs` checks actual compiled invoice and fresh-lease denial after rights loss |
| A state path could follow a symlink; malformed knowledge expiry could remain current | Store rejects nonregular/symlink paths, including dangling symlinks; knowledge expiry is validated and compared as time. `test/store-pack.test.mjs` covers both reproduced cases |
| Known credential aliases or modified restored lineage could enter portable data | Additional credential-field checks and original-pack revalidation reject those cases. Public journey export also matches supported fixture bytes and recomputed results; store/pack and journey tests cover altered content |
| Outer metadata could be stripped or changed while reusing a task-v1 approval | Protected admission binds `successorManifestSha256`; removing metadata cannot downgrade a sealed job into legacy execution. The orchestrator bridge tests cover unchanged task/changed outer envelope |
| Retries or revocation races could repeat effects | Durable reservations, nonce/idempotency bindings, a pre-dispatch recheck and unknown-outcome reconciliation prevent blind replay in tested fixture drivers. Revocation after committed dispatch remains an in-flight event |
| Economic observations could be confused with mission proof | Local-chain reconciliation binds original specification/result bytes and exact registry payout/finality evidence; a paid FAIL evaluation remains failed and unadmitted with no authority |
| A generic proof rehearsal could be mistaken for examination of the actual WORLD candidate | `src/examination.mjs` freezes all 16 actual bindings and reexecutes the 60 public cases against the actual comparators. `test/examination.test.mjs` checks the signed I0 FAIL, tamper rejection, absence of private keys and independent-admission denial |

Package test paths in the table are relative to `packages/successor-core/`; bridge tests are `apps/orchestrator/__tests__/successorComputerWork.test.ts`, and the actual local-chain case is `test/v2/JobRegistry.test.js`.

## Boundaries that remain material

- **No live successor effect driver is enabled.** Caller-supplied assurance flags cannot activate it. The existing legacy worker route retains its separate commissioning requirements.
- **Independent custody is external.** Fixture keys, names, distinct hashes and software role checks do not prove organizational independence or prevent a privileged host administrator from reading protected material. Real examiner/runtime/storage/key isolation requires review.
- **Trust configuration is an operator responsibility.** Provision authorized keys, principals, expiry and revocation outside claimant-controlled inputs. Cryptographic attribution is not empirical truth.
- **Local state assumes a protected operator-controlled directory.** SQLite transactions serialize writers; the store is not a distributed service or a sandbox against a peer allowed to replace parent directories. A nearby checkpoint is not independently retained custody.
- **Pack verification is integrity-only.** It returns `authenticated: false`. Field screening cannot detect every secret encoded in arbitrary text, and claimed rights do not prove ownership. Export only reviewed permitted material; no imported code executes automatically.
- **Remote and irreversible effects require commissioning.** Test network/action/spend/cleanup boundaries where the effect occurs. A timeout is not proof of nonexecution; rollback cannot undo an already-final external action.
- **Repository release gates remain blocked where evidence fails.** Maintainer signer configuration is invalid, and the observed production dependency audit reports seven high findings. Neither is waived by local tests or a successful public website.

Keep source, manifests, failure findings and recovery evidence. Any material code, configuration, supplier or trust change requires the affected checks again and, where applicable, new proof/admission. No clean local test suite establishes universal ASI, customer Alpha or production authority.
