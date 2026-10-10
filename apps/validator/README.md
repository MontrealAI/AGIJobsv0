# Validator service: explicit review and durable recovery

This service observes submitted jobs, checks candidate artifact integrity and casts an **explicit reviewer decision** through the current v2 commit/reveal contracts. It saves private reveal material before broadcasting, resumes saved rounds after restart and refuses automatic transaction retries when the outcome is uncertain.

Artifact hashes and placeholder checks are advisory. They do not establish whether a job was done correctly. A qualified reviewer must check the actual work against the committed specification, disclose conflicts and choose approval or rejection. This includes computer work performed through OpenClaw, ChatGPT Work or another admitted worker.

For a browser interface, use the [validator review console](../validator-ui/README.md). For a fixed-decision local rehearsal, use [`agent:validator`](../../docs/AGENTIC_QUICKSTART.md). This service has its own state directory and explicit review file; these paths are not interchangeable.

## 1. Build and configure

Run from the repository root with the [pinned Node/npm toolchain](../../docs/START_HERE.md):

```bash
npm ci
npm run build:validator
npm run validator:service -- --help
```

Set `RPC_URL`, `CHAIN_ID`, `JOB_REGISTRY_ADDRESS` and `VALIDATION_MODULE_ADDRESS` to the checked deployment. The service verifies that the validation module points to this registry, and repeats that check during recovery. Use an archival RPC capable of serving the deployment's selection and reveal history. Set `VALIDATOR_ADDRESS` to the reviewer's wallet address for read-only inspection; no private key is needed.

Copy `apps/validator/persona.json` to your operator configuration and set `VALIDATOR_PERSONA_PATH` to its absolute path. Set the actual `.club.agi.eth` identity, label and optional address. A persona/wallet mismatch stops startup. Identity registration, tax acknowledgements and stake remain contract prerequisites; the example persona is not a registered identity.

Keep configuration and signing credentials outside the checkout. An example private directory on a POSIX host is:

```bash
umask 077
mkdir -p "$HOME/.agi-jobs/validator-service"
chmod 700 "$HOME/.agi-jobs/validator-service"
export VALIDATOR_STATE_DIR="$HOME/.agi-jobs/validator-service/reveals"
export VALIDATOR_REPORT_DIR="$HOME/.agi-jobs/validator-service/reports"
export VALIDATOR_REVIEW_FILE="$HOME/.agi-jobs/validator-service/reviews.json"
```

Use absolute, non-symlink paths. Reveal journals require a filesystem owned by the service account that supports private permissions, exclusive hard links, atomic rename and file/directory `fsync`. Native Windows permission semantics are not supported by this journal; use a commissioned Linux/WSL filesystem or a supported POSIX host. Run one process per signing wallet; serialization inside this service is not distributed nonce coordination.

## 2. Inspect a selected job without signing

After the reviewer is selected for a submitted job, export a draft from the actual chain:

```bash
node apps/validator/dist/apps/validator/index.js --inspect-job 123 \
  > "$HOME/.agi-jobs/validator-service/reviews.draft.json"
```

This command performs reads and prints JSON. It creates no reveal journal and submits no transaction. The draft binds the chain, registry, validation module, validator, job ID, nonce, canonical selection block/hash/log index, specification hash and result hash. Its `approve` value is deliberately `null`, so the draft cannot authorize work.

Independently retrieve and hash-check the specification and candidate deliverables, assess the acceptance criteria, and inspect relevant source/application state. The [evidence reviewer](../../docs/EVIDENCE_REVIEW.md) can assist with supported computer-work receipts; its unsigned export does not authenticate the provider or qualify the reviewer automatically.

In the draft, set `approve` to the JSON boolean `true` or `false`, enter `reviewedBy`, and record `reviewedAt` as an ISO UTC timestamp, such as `2026-10-08T22:30:00.000Z`. These are operator assertions, not cryptographic identity attestations. Preserve every chain/round/hash field. Multiple independently reviewed jobs may appear in `decisions`; duplicate entries for one round are rejected.

Check the private file before admitting it:

```bash
chmod 600 "$HOME/.agi-jobs/validator-service/reviews.draft.json"
node apps/validator/review-admission.cjs --check \
  "$HOME/.agi-jobs/validator-service/reviews.draft.json"
mv "$HOME/.agi-jobs/validator-service/reviews.draft.json" "$VALIDATOR_REVIEW_FILE"
```

**Installing an approved file authorizes its matching votes when the signing service is running.** Use atomic replacement as shown so the service never reads a partially written configuration. An empty `decisions` array authorizes no new votes. The service rereads the file before committing, including when resuming a preparation that was saved before a crash.

## 3. Start the signing service

Provision `PRIVATE_KEY` through the protected service environment or your existing secret manager, then run:

```bash
npm run validator:service
```

The key must match `VALIDATOR_ADDRESS` and any address specified in the persona. Without `PRIVATE_KEY`, the service runs as an observer and cannot vote. With a key but no admitted decision, it abstains. Polling checks the review file as well as live events, so a reviewer can admit a job after its selection event has already occurred.

For approvals, candidate integrity checks must also pass. Their failure blocks the vote rather than changing it to rejection. An explicit rejection can record failed integrity checks. Private evaluation reports distinguish the advisory suggestion from the admitted verdict. The service cannot substitute for independent professional judgment or buyer acceptance.

Downloads use the shared bounded artifact reader: 15-second timeout, 4 MiB streaming limit, no redirects and exact operator-approved origins. Configure `ORCHESTRATOR_ARTIFACT_ORIGINS` as a JSON array of additional HTTPS origins when needed; `IPFS_GATEWAY_URL` grants only its checked gateway route. Untrusted job URLs cannot add origins. The former `SUBMISSION_FETCH_TIMEOUT_MS` and `SUBMISSION_MAX_BYTES` settings no longer bypass these bounds.

A dispute event supplies an evidence hash, not a download location. Without a commissioned mapping, the service records that hash as unavailable rather than inventing an IPFS CID. To retrieve evidence, configure `EVIDENCE_URI_TEMPLATE` with exactly one `{hash}` placeholder and approve its origin. The legacy explicit `EVIDENCE_GATEWAY` mapping remains supported. Retrieved bytes must hash to the event commitment before the report marks them verified.

## Recovery and operating limits

| Observation                             | Meaning and action                                                                                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-required`                       | No matching current admission, or a prepared vote was revoked/changed. Inspect the exact round and review file. No new commit is sent.                                                                                                               |
| `VALIDATOR_REVIEW_ARTIFACT_MISMATCH`    | Approval was admitted but the artifact integrity checks failed. Reconcile the evidence; the service does not silently vote rejection.                                                                                                                |
| `committed` / `waiting-for-reveal`      | The original private decision and salt are retained. The service uses the contract's deadline and confirmed chain state.                                                                                                                             |
| `commit-uncertain` / `reveal-uncertain` | A transaction may have been broadcast. Inspect its actual chain effects and wallet nonce; automatic resending is blocked.                                                                                                                            |
| `complete`                              | The saved reveal was confirmed in canonical chain evidence. Records remain available for reconciliation after a reorg.                                                                                                                               |
| `VALIDATOR_ROUND_CHANGED`               | Selection, nonce, specification, domain or network no longer matches. Reconcile the retained record; never overwrite it with a new salt.                                                                                                             |
| `VALIDATOR_REGISTRY_MISMATCH`           | Configured routing or the validation module's registry binding changed. Stop and verify the deployment.                                                                                                                                              |
| `VALIDATOR_LEGACY_REQUIRES_REVIEW`      | Old unscoped secret files exist under `storage/validation`. Preserve them and inspect historical transactions before archiving them outside the active legacy directory. They used the old commitment encoding and are never imported automatically. |
| `VALIDATOR_QUEUE_FULL`                  | The process has 64 queued operations. Admission polling can rediscover reviewed jobs; investigate sustained backlog and deadlines.                                                                                                                   |

`VALIDATOR_POLL_MS` defaults to 5,000 and accepts 1,000–60,000. New secrets and phase markers are stored under registry/chain/module/wallet scope with mode `0600` inside `0700` directories. Reports are scoped separately. Back up both private directories and the review file; these files are **not encrypted**. Historical submission, dispute and secret files are retained unchanged. Protect parent directories and run under a dedicated standard account.

Removing admission blocks a prepared, never-broadcast commitment. It cannot undo a mined or uncertain transaction; an already committed vote retains its original decision and reveal material. Stop the service if further actions must cease, then reconcile on-chain state. Preserve journals during upgrades and recovery. Do not delete an uncertainty marker to force a retry.

The runtime requires two confirmations for recovery decisions; this is not economic finality. RPC availability, reorgs, private disk durability, missed offline selection events without an explicit review entry, and contract deadlines still require monitoring. The contract's opaque commitment API cannot reject an old pending transaction solely because an administrator reset the round; reconcile in-flight transactions before reset/reselection. This service does not change that protocol limitation or the recovery behavior of the other validator implementations.

See [current production readiness](../../docs/production/readiness.md) for the remaining dependency, signing, security audit, network and worker commissioning gates.

## Reproduce the verification

```bash
npm run build:validator
npx hardhat test test/agentic/validator-recovery.spec.js \
  test/agentic/validator-review-admission.spec.js \
  test/agentic/validator-service.spec.js \
  test/agentic/validator-evidence.spec.js
```

These tests include actual deployed registry/validation contracts, explicit approvals and rejections, restart recovery, round reset rejection, configuration binding, revoked preparation, private file permissions, malformed admissions and uncertain transactions. They exercise local contracts; they do not spend public-network funds or commission a live reviewer.
