# Conventional Hardhat creation with hidden terminal input

This additive entry point uses the ordinary staged writer and v1 authority
journal. It accepts the private key only from the operator's local terminal,
keeps the Wallet in the same process, and does not require an external-manual
signer, raw-signature export, Ledger creation signature, or an empty-code creator.
There is no creator allowlist. Governance and all separate treasury/governance
roles must be explicitly reviewed and distinct from the creator.

This source addition still needs its own exact-head review and qualification.
The example below is an operator preparation interface, not permission to send.

## Prepare the public inputs

Use a clean checkout of the independently qualified commit and its canonical
compiler artifacts. Independently qualify Node and installed dependencies too;
the launcher's tracked-source drift check is not a dependency/bootstrap review.
Do not put a key in `.env`, shell assignments, command arguments, a pipe, a file,
or chat. This launcher refuses a root `.env` and inherited signing/loader
variables. It never edits or removes those files or environment settings for you.

Prepare a separately reviewed, public JSON plan with these exact fields:

```
{
  "schema": "jobs-conventional-tty-v1",
  "sourceCommit": "<qualified commit>",
  "sourceTree": "<qualified tree>",
  "network": "mainnet",
  "creator": "<any selected checksummed creation wallet>",
  "governor": "0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99",
  "config": "/absolute/path/reviewed-config.json",
  "configSha256": "<exact raw configuration SHA-256>",
  "output": "/absolute/path/new-deployment-report.json",
  "lockDirectory": "/absolute/path/shared-private-deployment-locks",
  "firstNonce": 0,
  "rpcUrl": "<operator-selected HTTPS endpoint>",
  "fees": {
    "gasLimit": "<reviewed per-transaction gas ceiling>",
    "maxFeePerGas": "<reviewed wei/gas ceiling>",
    "maxPriorityFeePerGas": "<reviewed wei/gas priority>",
    "maxTotalCost": "<reviewed worst-case wei budget>"
  },
  "resume": null
}
```

All placeholders and the illustrative nonce must be replaced and reviewed.
Fee values are decimal strings. The total must cover 39 times the fixed gas
limit times maxFeePerGas. This is a conservative upper bound, not a balance
check or expected expenditure. The user manages balances. The existing tax-
enabled 39-operation scope and paused launch are required. Contract economic
values come only from the reviewed config; this wrapper chooses none.

The config must retain its explicit campaign block, governor, fee policy,
reputation/stake settings, identity roots and separate authority fields. In
particular, stakeManagerTreasury is not silently set to the governor. Use the
current deployment guide and the existing read-only deployment planner to
prepare those values. The launcher displays the full resolved configuration,
source/artifact identities, sender/nonce and fee ceiling before requesting a key.
Provider URLs are redacted from terminal output; keep credential-bearing plans
private even though no creation key is in them.

## Local operator commands

Run from the qualified repository root in a real terminal:

```
node scripts/deploy/tty-launcher.cjs --plan /absolute/path/plan.json --plan-sha256 <independently-reviewed-plan-sha256> --review
node scripts/deploy/tty-launcher.cjs --plan /absolute/path/plan.json --plan-sha256 <independently-reviewed-plan-sha256> --execute
```

The first command performs read-only preflight. The second repeats it, shows
`DEPLOY <full plan SHA-256>`, and requires that exact phrase before the hidden
key prompt. Enter the key only at that prompt. A key for another creator fails
before submission. Buffer clearing is best effort; JavaScript/V8 does not
promise secure erasure. The operator may disable core dumps in their shell
before launching. Do not attach a debugger or enable shell/process tracing.

Each submitted transaction is type 2, zero-value, source/config guarded and
bounded by the reviewed nonce, gas and fees. The existing writer records the
intent before submission and validates canonical receipts. A failure latches
the signer and retains deployment evidence; the launcher invokes broadcast once and never creates a replacement envelope.
The installed HTTP transport may retry the identical request, for example after
an HTTP 429 response; that is not a new transaction or a new signature. Normal stdout can include public deployment data,
never the private key or a raw provider exception.

## Recovery and governance

Never substitute a historical addressbook. Use the original new-deployment
journal and unchanged config. A recovery plan uses a fresh output path and:

```
"resume": {
  "coordinator": "<original source-bound coordinator>",
  "evidence": "/absolute/path/original-report-or-checkpoint.json",
  "evidenceSha256": "<reviewed original evidence digest>"
}
```

Reconcile uncertain submissions before reviewing a new nonce/budget. The same
creator lock namespace coordinates cooperative runs on one filesystem only;
operator-enforced single execution is required across machines or other tools.
No stale lock is automatically removed. Existing direct recovery scans at most
2048 canonical blocks and rejects mismatched or unresolved operations.

The staged run transfers ten implementation owners and the coordinator to the
explicit governor. Eight modules stay paused and owned by SystemPause, whose
owner is the governor. IdentityRegistry/TaxPolicy pending acceptance and the
separate FeePool/StakeManager commissioning roles remain explicit governor work
on the Mac/Ledger afterward. Verification/readback and later activation remain
separate steps. No old deployment is modified and no automatic unpause occurs.
