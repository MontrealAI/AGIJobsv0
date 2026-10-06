# Synthesis Foundry · Operator runbook

This runbook covers a local research demonstration and an explicitly admitted worker integration. Neither engine creates live jobs, signs transactions or transfers tokens.

## 1. Choose an execution mode

| Goal | Command from repository root | Result |
| --- | --- | --- |
| Complete website | `npm run demo:program-synthesis:site` | `build/program-synthesis/index.html`, local assets and regenerated original dashboards |
| Python scenarios | `python3 demo/Meta-Agentic-Program-Synthesis-v0/run_demo.py all --output /tmp/synthesis-python` | Per-scenario report JSON/HTML, batch report and command theatre |
| TypeScript synthesis | `npm run demo:meta-agentic-program-synthesis -- --report-dir /tmp/synthesis-ts` | Dossier, dashboard, summary, triangulation, briefing, local Mermaid and hashes |
| Full offline dossier | `npm run demo:meta-agentic-program-synthesis:full -- --report-dir /tmp/synthesis-full` | Above, plus workflow-declaration inspection and owner-command availability |
| Worker admission inspection | `npm run demo:program-synthesis:worker -- inspect` | Exact normalized task and digest; no dispatch |

Use Node matching `.nvmrc`, `npm ci` and Python 3.11+. Python runtime uses the standard library; the pinned Python requirements install the test runner. Serve the website over loopback or HTTPS, not `file://`, for source loading and SHA-256.

```bash
python3 -m http.server 18792 --bind 127.0.0.1 --directory build/program-synthesis
```

## 2. Run, challenge and export

1. Select one of the three laboratory tasks. Inspect its goal and training examples.
2. Set the candidate limit (1–400) and start the search. Stop cancels the local search; it never controls a remote worker.
3. Try new integer inputs. A successful training match remains review-required.
4. Export `candidate.json` and run the separate Python checker with `--task normalize`, `--task ledger` or `--task catalog`.
5. Export the intentionally wrong candidate and confirm the checker exits with code 1. Unknown operations, wrong task/source, invalid evidence flags and wrong outputs are rejected.
6. Prepare a work order. Unconfirmed authorization, rights or reviewer independence, insufficient budget and unavailable review minutes keep it held. Exporting a held order is useful for correction and does not admit it.

The Python checker reports actual file SHA-256, fixed-case results, and continuing review/settlement limits. Its published fixed acceptance cases support reproducibility; they are not a secret adversarial evaluation or proof of correctness on all inputs. Verify app state and inspect the actual deliverable independently for real work.

## 3. Inspect both research engines

Python example:

```bash
python3 demo/Meta-Agentic-Program-Synthesis-v0/start_demo.py alpha --output /tmp/synthesis-alpha
python3 demo/Meta-Agentic-Program-Synthesis-v0/start_demo.py --list-scenarios
python3 demo/Meta-Agentic-Program-Synthesis-v0/start_demo.py alpha --pause
```

Owner overrides remain available through `--config-file`, individual reward/stake/evolution/verification flags, scenario JSON/files and the simulated governance timelock. `--timelock-fast-forward` is a simulation clock feature. Invalid or non-finite inputs return non-zero. Success and an intentional paused run return zero. A verification verdict of ATTENTION is visible in the evidence and does not prevent exporting the failed experiment.

A final Python winner now belongs to the last reported generation. Rewards and stakes are simulation credits, and validator identifiers are local roles rather than proof of independent organizations. The commit/vote emulator is not a deployed cryptographic commit–reveal protocol.

TypeScript custom mission:

```bash
AGI_META_PROGRAM_MISSION=/absolute/path/custom-mission.json \
  ./demo/Meta-Agentic-Program-Synthesis-v0/bin/launch.sh --report-dir /tmp/custom-synthesis
```

The launcher preserves your custom mission and uses the repository root. `--report-dir` applies to every default artifact, including full-pipeline diagnostics. Explicit per-file paths remain available to programmatic callers. The manifest hashes the actual generated artifacts. Owner-script presence, coverage declarations and workflow structure do not establish live behavior or a passing Actions run.

## 4. OpenClaw or ChatGPT Work execution

Follow [INTEGRATION.md](INTEGRATION.md). The example profile has no approved jobs. The task grants only the local laboratory workflow, not arbitrary work, data disclosure or settlement. The draft work-order export is a planning schema; convert it into a reviewed adapter task and commission its acceptance checks before admission.

Inspect a real worker's tools, runtime version, OS identity, app permissions, exact allowed origins, spending/action limits and cancellation. Work's app plugin and OpenClaw's gateway are separate execution routes; do not copy account credentials between them.

## 5. Stop and recover

| Symptom | Action |
| --- | --- |
| Website says fixtures/records unavailable | Run the site build again, serve its output on loopback, inspect the browser/network error. Do not treat missing evidence as success. |
| Candidate budget exhausted | Preserve the failed attempt; increase the bounded limit or revise the task. No candidate is accepted. |
| Checker rejects a file | Preserve it, inspect individual failed checks, correct the program and export a new candidate. |
| Work order held | Fix the stated authorization, rights, budget or reviewer-capacity condition. A checkbox is an assertion to substantiate. |
| Unknown scenario or malformed policy | Fix the input. The CLI returns non-zero without successful run artifacts. |
| Worker admission rejected | Review the exact task hash and protected profile; do not manufacture admission from untrusted metadata. |
| Provider timeout / unknown outcome | Stop through the provider and host controls, inspect session/app state and retained journal. Do not automatically retry or delete the journal. |
| Archived report conflicts with current guide | Rebuild and use current evidence. Historical presentations/dossiers are retained for traceability. |

## 6. Owner controls and settlement

The original repository owner capabilities—pause/resume, reward-engine and thermostat configuration, upgrade planning and compliance reports—remain available in the broader [operator guide](../../OperatorRunbook.md). They require their own supported arguments, deployment configuration and authority. This demo's offline script audit does not execute them, prove idempotence or authorize live actions. Setting a network variable alone is not a production commissioning procedure.

Before real settlement: verify target contracts and token rules, commission signers separately, prove the accepted artifact and task binding, obtain buyer acceptance, respect dispute/finality rules and obtain the required payment authorization. No step in this runbook authorizes a payment.

## 7. Package the evidence

Keep exact task/source bytes, candidate, checker output, actual session/tool logs, provider usage, independent review and buyer decision together. Hash files before sharing. Do not include credentials, personal session data or signing keys. Preserve unsuccessful and interrupted attempts alongside successes. A portable dossier is evidence for review, not a production certificate.
