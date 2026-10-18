# Current Jobs mainnet deployment: 18 October 2026

**25 deployed contracts. All eight managed modules recorded as paused. Production approval and activation remain false.**

Use the [current ecosystem directory](https://montrealai.github.io/AGIJobsv0/ecosystem/#contracts) for all **25 Jobs + 5 Alpha** addresses. The two suites use the same Ethereum mainnet [18-decimal AGIALPHA token](https://etherscan.io/token/0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA). AGIJobManager's USDC contracts remain a separate system.

The authoritative Jobs publication is the [18 October closeout guide](https://github.com/MontrealAI/AGIJobsv0/blob/284351148d96c5390a655aec1f9db806284f2400/docs/production/mainnet-2026-10-18/README.md), with its [exact deployment snapshot](https://github.com/MontrealAI/AGIJobsv0/blob/284351148d96c5390a655aec1f9db806284f2400/docs/production/mainnet-2026-10-18/deployment-snapshot.json) and [39 successful deployment receipts](https://github.com/MontrealAI/AGIJobsv0/blob/284351148d96c5390a655aec1f9db806284f2400/docs/production/mainnet-2026-10-18/deployment-receipts.json). These are evidence, not instructions to replay transactions.

## Exact source and observation

| Identity                        | Recorded value                                                       |
| ------------------------------- | -------------------------------------------------------------------- |
| Deployed source                 | `818b3a246871e4cd4dde86558dbb91ef82b15eef`                           |
| Deployed tree                   | `b1c3bb0f4b8d64e0d23376d6b6ef3722c4c67b0d`                           |
| Compiler                        | `0.8.37+commit.f401782d`, Cancun, via-IR, optimizer 200              |
| Original compiler input SHA-256 | `a962576832d4540c4cd682f9251b6eed2a333c87a1ce5fa61ed5716e7091b891`   |
| Finalized state block           | 26,221,285 at 2026-10-18 18:37:11 UTC                                |
| State block hash                | `0x4bd7698479db125e9a7e4f031571fd2844224f822a630ba22b40aea48fb592e6` |
| Readback completed              | 2026-10-18 18:55:20.035 UTC                                          |
| Snapshot SHA-256                | `b4335f5763f73e8da664c3cd45ac7ca8fa6f0d3beb2780b209e50fd1e3def23f`   |

The [exact local snapshot](../../website/data/jobs-mainnet-2026-10-18.json) retains the upstream bytes. Its publication revision and deployed source revision are different identities. The deployed source is on draft PR #3986; current-main or release whole-tree equivalence is **not assumed**. Reproduce deployed bytecode from the exact deployed source and compiler input.

The snapshot records **25 runtime matches**, **25 exact explorer source-metadata comparisons** and **46 explicitly named state checks**. Canonicality and the provider's finalized status were rechecked. Explorer observations were separately timed; Etherscan source metadata is not block-pinned chain state. This website does not perform a fresh live read.

## Authority, economics and remaining work

All eight managed modules were paused and owned by SystemPause [`0x887782AE59A56D1E9923947A6784A4453193e303`](https://etherscan.io/address/0x887782AE59A56D1E9923947A6784A4453193e303#code). Its governor was `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99`. The creator owned none of these 25 contracts; IdentityRegistry and TaxPolicy pending owners were zero. These named checks do not establish exhaustive historical, indirect, external or off-chain authority or physical key custody.

The completed configuration records **10% per-job collateral (1000 basis points)**, distinct from the **1000 AGIALPHA general minimum stake**. StakeManager treasury and FeePool governance are `0xa9eD0539c2fbc5C6BC15a2E168bd9BCd07c01201`; FeePool treasury is the governor above. The snapshot retains the fee, burn, time-window, ENS and immutable tax-policy settings. These configuration fields are not all freshly checked economic observations; the final readback queried only its listed getters.

Paused contracts can later be changed through applicable governance controls. This publication grants no unpause, funding, signing, migration or live execution authorization. Independent acceptance, participant/provider/worker commissioning, monitoring and recovery remain separate from source verification. Consult [production readiness](readiness.md) before proposing live operation.

## Historical deployment records

The [12 October deployment](mainnet-deployment-2026-10-12.md), its 24-address snapshot, source rc.4, original receipts and fixed-stake policy remain historical and unchanged. The old `deployment-addresses*.json` maps refer to that earlier stack; they are not the current directory. No old funds, approvals, obligations or clients are migrated or extinguished by publishing this new record.

The preserved [Atlas workshop](../successor/BUILD_YOUR_OMEGA.md) is also a dated snapshot. Use the current ecosystem directory for current contract addresses.
