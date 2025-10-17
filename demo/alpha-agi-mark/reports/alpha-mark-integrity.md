# α-AGI MARK Integrity Report

Generated: 2025-10-17T13:12:40.494Z

## Recap Envelope

- Network: hardhat (chainId 31337) (chain 31337, block 0)
- Dry-run mode: enabled
- Checksum (sha256/json-key-sorted): 7ad550522dac8b424fbc45a250a8941cba4febe7b87f76b16bb2f23a5d0bf41f

### Orchestrator Telemetry

- Mode: dry-run
- Git commit: 6b15cfab6dcbdf70b7df550b8d804ed88e1aed11
- Git branch: work
- Workspace dirty: yes

### Actor Registry

- Owner: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
- Investors: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8, 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 0x90F79bf6EB2c4f870365E785982E1f101E93b906
- Validators: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65, 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc, 0x976EA74026E726554dB657fA54763abd0C3a0aa9

## Confidence Summary

- Confidence index: 100.00% (4/4 checks recorded)
- Core invariant coverage: 100.00% (11/11 checks)
- Validator quorum: 2/2
- Ledger supply processed: 11 whole tokens
- Gross capital processed: 4500000000000000000 wei (4.5 ETH)
- Net capital secured in sovereign reserve: 3850000000000000000 wei (3.85 ETH)

## Operator Empowerment Index

- Narrative: AGI Jobs orchestrated 22 mission events from 1 command, sustaining 100.00% confidence across 4/4 invariants.
- Automation multiplier: 22.00x (22 orchestrated actions from 1 command)
- Verification confidence: 100.00% (4/4 checks, validators 2/2)
- Capital formation: 3 participants · Gross 4.5 · Reserve 0.0
- Command deck depth: 16 actuators recorded
- Control highlights: `pauseMarket`, `whitelistEnabled`, `emergencyExitEnabled`, `validationOverrideEnabled`

| Check | Status | Expected | Observed |
|---|:---:|---|---|
| Ledger supply equals recorded supply | ✅ | 11 | 11 |
| Participant balances equal supply | ✅ | 11000000000000000000 | 11000000000000000000 |
| Next price matches base + slope * supply | ✅ | 650000000000000000 wei (0.65 ETH) | 650000000000000000 wei (0.65 ETH) |
| Vault receipts + reserve equal net capital | ✅ | 3850000000000000000 wei (3.85 ETH) | 3850000000000000000 wei (3.85 ETH) |
| Vault intake split matches aggregate | ✅ | 3850000000000000000 wei (3.85 ETH) | 3850000000000000000 wei (3.85 ETH) |
| Participant contributions equal gross capital | ✅ | 4500000000000000000 wei (4.5 ETH) | 4500000000000000000 wei (4.5 ETH) |
| Funding cap respected | ✅ | 1000000000000000000000 wei (1000.0 ETH) | 4500000000000000000 wei (4.5 ETH) |
| Embedded verification: supply | ✅ | - | - |
| Embedded verification: pricing | ✅ | - | - |
| Embedded verification: capital flows | ✅ | - | - |
| Embedded verification: contributions | ✅ | - | - |
| Verification summary total checks | ❌ | 11 | 4 |
| Verification summary passed checks | ❌ | 11 | 4 |
| Verification summary confidence index | ✅ | 100.00% | 100.00% |
| Verification summary verdict | ✅ | PASS | PASS |

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
| Sovereign native intake | 3850000000000000000 wei (3.85 ETH) |
| Sovereign external intake | 0 wei (0.0 ETH) |
| Last ignition mode | Native asset |
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
