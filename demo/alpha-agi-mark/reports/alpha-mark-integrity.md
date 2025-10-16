# α-AGI MARK Integrity Report

Generated: 2025-10-16T20:09:48.930Z

## Confidence Summary

- Confidence index: 100.00% (10/10 checks passed)
- Validator quorum: 2/2
- Ledger supply processed: 11 whole tokens
- Gross capital processed: 4500000000000000000 wei (4.5 ETH)
- Net capital secured in sovereign reserve: 3850000000000000000 wei (3.85 ETH)

| Check | Status | Expected | Observed |
|---|:---:|---|---|
| Ledger supply equals recorded supply | ✅ | 11 | 11 |
| Participant balances equal supply | ✅ | 11000000000000000000 | 11000000000000000000 |
| Next price matches base + slope * supply | ✅ | 650000000000000000 wei (0.65 ETH) | 650000000000000000 wei (0.65 ETH) |
| Vault receipts + reserve equal net capital | ✅ | 3850000000000000000 wei (3.85 ETH) | 3850000000000000000 wei (3.85 ETH) |
| Participant contributions equal gross capital | ✅ | 4500000000000000000 wei (4.5 ETH) | 4500000000000000000 wei (4.5 ETH) |
| Funding cap respected | ✅ | 1000000000000000000000 wei (1000.0 ETH) | 4500000000000000000 wei (4.5 ETH) |
| Embedded verification: supply | ✅ | - | - |
| Embedded verification: pricing | ✅ | - | - |
| Embedded verification: capital flows | ✅ | - | - |
| Embedded verification: contributions | ✅ | - | - |

## Participant Contribution Constellation

```mermaid
pie title Contribution resonance (ETH)
    "0x7099…79C8" : 1.0000
    "0x3C44…93BC" : 1.2000
    "0x90F7…b906" : 2.3000
```

## Launch Telemetry

| Metric | Value |
|---|---|
| Supply | 11 SeedShares |
| Next price | 650000000000000000 wei (0.65 ETH) |
| Base price | 100000000000000000 wei (0.1 ETH) |
| Slope | 50000000000000000 wei (0.05 ETH) |
| Reserve balance | 0 wei (0.0 ETH) |
| Sovereign vault receipts | 3850000000000000000 wei (3.85 ETH) |
| Last acknowledged amount | 3850000000000000000 wei (3.85 ETH) |
| Vault balance | 3850000000000000000 wei (3.85 ETH) |
| Treasury address | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 |
| Sovereign vault | ipfs://alpha-mark/sovereign/genesis |
| Sovereign metadata | α-AGI Sovereign ignition: Nova-Seed ascends |

## Owner Command Deck Snapshot

- ✅ Market paused
- ✅ Whitelist enforced
- ❌ Emergency exit armed
- ✅ Launch finalized
- ❌ Launch aborted
- ❌ Validation override enabled

### Control Parameters

| Parameter | Value |
|---|---|
| Funding cap | 1000.0 |
| Max supply | 100 SeedShares |
| Sale deadline | 0 |
| Treasury | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 |
| Risk oracle | 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 |
| Base asset | 0x0000000000000000000000000000000000000000 |
| Uses native asset | Yes (native ETH) |
| Base price (wei) | 100000000000000000 |
| Slope (wei) | 50000000000000000 |
