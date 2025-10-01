# Audit Test Vectors & Drill Playbook

This guide captures the reproducible flows we exercise before handing the
protocol to external auditors.  It complements the unit/integration suites by
collecting end-to-end scenarios, expected outcomes, and the commands that
produce them.

## Prerequisites

1. Install dependencies once: `npm ci`
2. Compile the contracts (required for scripts and Hardhat tests): `npm run compile`
3. For forked drills export an Ethereum mainnet RPC endpoint with archive
   history.  Either set `MAINNET_FORK_URL` or reuse `MAINNET_RPC_URL`.

```bash
export MAINNET_RPC_URL="https://mainnet.example"
# optionally pin the block for deterministic forks
export MAINNET_FORK_BLOCK=21543789
```

## Scenario Matrix

| Scenario | Command | Purpose |
| --- | --- | --- |
| Happy-path lifecycle on forked mainnet state | `npm run test:fork` | Executes a complete job lifecycle against a forked mainnet, reusing the canonical `$AGIALPHA` token and verifying NFT/marketplace flows. |
| Validator dispute and slashing (local hardhat) | `npx hardhat test --no-compile test/v2/jobLifecycleWithDispute.integration.test.ts` | Demonstrates dispute escalation, validator penalties, and treasury accounting. |
| Stake invariants & withdrawal bounds | `npx hardhat test --no-compile test/v2/StakeManagerSlashing.test.js` | Validates that withdrawals and slashing never exceed the staked balance. |
| Commit-reveal fuzz harness | `npm run echidna` | Runs Echidna assertions on the commit/reveal harness covering validator misbehaviour search space. |

Each scenario logs success/failure details that should be attached to the audit
package.  Store raw outputs under `internal_docs/security/drills/` when preparing
an external report.

## Generating Artefacts for Auditors

1. Run each command above and capture the terminal output.
2. For `npm run test:fork`, note the block number used and the resulting agent
   token balances.  Auditors can replay the run by using the same block.
3. Export the resulting JSON traces (if available) using Hardhat's
   `--show-stack-traces` or by appending `> drills/<scenario>.log`.
4. Update `SECURITY.md` with any deviations or discovered regressions.

## Troubleshooting

- **Fork setup fails with `insufficient data`** – ensure your RPC endpoint is an
  archive node and the block number is within range.
- **`test:fork` skips automatically** – the environment variables were not
  provided.  Set `MAINNET_RPC_URL` or `MAINNET_FORK_URL` before running.
- **Different `$AGIALPHA` balances** – rerun the fork at the same block height;
  state drift between blocks affects holder balances and slashing expectations.

Maintaining these artefacts ensures auditors and internal reviewers can quickly
replay critical flows and verify the protocol's security posture.
