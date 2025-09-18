# Job Validation Lifecycle

Managed validators automatically participate in commit–reveal once a job moves
into the *awaiting validation* state. Validators must own a
`*.club.agi.eth` ENS subdomain; see [ens-identity-setup.md](ens-identity-setup.md)
for issuing and verifying names.

## Phase overview

| Phase    | Gateway behaviour                                                                 | Validator call                                         |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Awaiting | `JobRegistry.ResultSubmitted` → `ValidationAwaiting` broadcast to the domain agent.    | — (agent inspects submission, optional heuristics).    |
| Commit   | Stake checked, ENS identity verified, commit hash computed with `jobNonce`.        | `commitValidation(jobId, commitHash, subdomain, proof)`|
| Reveal   | Reveal scheduled from `validation.rounds(jobId)` once commit window closes.         | `revealValidation(jobId, approve, salt, subdomain, proof)`|
| Finalize | Gateway (or anyone) calls `ValidationModule.finalize`. Employer finalises registry. | `ValidationModule.finalize(jobId)` then `JobRegistry.finalize(jobId)` |

`commitWindow` and `revealWindow` are owner‑configurable via
`ValidationModule.setCommitRevealWindows`.

## Awaiting validation signal

* `JobRegistry.ResultSubmitted` emits the canonical transition to the
  *awaiting validation* state. The gateway rebroadcasts this as
  `type: 'AwaitingValidation'` on the websocket feed.
* Any managed validator that matches the `.club.agi.eth` wallet receives a
  `ValidationAwaiting` payload (worker address, result hash/URI, ENS label).
  This lets a domain‑specific agent perform additional checks before the
  commit transaction is signed.

## Commit step and local storage

* The gateway ensures the validator wallet satisfies staking requirements via
  the `stakeCoordinator` helper before evaluating the submission.
* Commits use the on-chain job nonce:

  ```ts
  const nonce = await validation.jobNonce(jobId);
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32'],
    [jobIdBigInt, nonce, approve, salt]
  );
  ```

* The randomly generated (or operator supplied) salt and the resulting
  evaluation summary are persisted to
  `storage/validation/<jobId>-<validator>.json`. The file includes:

  ```json
  {
    "jobId": "42",
    "validator": "0x...",
    "approve": true,
    "salt": "0x…",
    "commitHash": "0x…",
    "commitTx": "0x…",
    "evaluation": { "reasons": ["integrity-verified"], ... },
    "metadata": { "notifiedAt": "2025-05-12T08:00:00Z" }
  }
  ```

  This record is reused after restarts and forms the evidence bundle if a
  dispute is raised later.

## Reveal scheduling

* When a commit succeeds the gateway reads `validation.rounds(jobId)` to compute
  the remaining reveal window and arms a timer. A safety fallback fires shortly
  before the deadline if the chain metadata cannot be queried.
* The stored salt is read back from the JSON file when revealing, so operators
  never need to paste secrets from logs.

## Dispute defence

* The gateway subscribes to `DisputeModule.DisputeRaised` and
  `DisputeModule.DisputeResolved`. When triggered it appends the dispute
  details to the same JSON record and notifies the validator agent over
  WebSocket (`ValidationDispute` / `ValidationDisputeResolved`).
* Audit entries are written via `secureLogAction`, providing a full timeline of
  the commit, reveal, and dispute response.

## Script example

[`examples/commit-reveal.js`](../examples/commit-reveal.js) demonstrates the
workflow end-to-end: it resolves the job nonce, computes the commit hash, stores
the salt under `storage/validation/`, and later reuses that salt for the reveal.

## CLI example

```bash
# Commit during the commit window
cast send $VALIDATION_MODULE "commitValidation(uint256,bytes32,string,bytes32[])" $JOB_ID 0xCOMMIT '' [] --from $VALIDATOR

# Reveal after the commit window
cast send $VALIDATION_MODULE "revealValidation(uint256,bool,bytes32,string,bytes32[])" $JOB_ID true 0xSALT '' [] --from $VALIDATOR

# Finalize after the reveal window
cast send $VALIDATION_MODULE "finalize(uint256)" $JOB_ID --from $ANYONE
cast send $JOB_REGISTRY "finalize(uint256)" $JOB_ID --from $ANYONE
```

Validators that miss a window or reveal a vote inconsistent with their commit
risk slashing and loss of reputation.
