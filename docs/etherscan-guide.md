# Etherscan Interaction Guide

## Quick Links
- AGIJobManager v0: [Etherscan](https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477#code) | [Blockscout](https://blockscout.com/eth/mainnet/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477/contracts)
- $AGI Token: [Etherscan](https://etherscan.io/address/0xf0780F43b86c13B3d0681B1Cf6DaeB1499e7f14D#code) | [Blockscout](https://eth.blockscout.com/address/0xf0780F43b86c13B3d0681B1Cf6DaeB1499e7f14D?tab=contract)

## Module Addresses & Roles
| Module | Address | Role |
| --- | --- | --- |
| JobRegistry | *TBD* | Posts jobs, escrows payouts, tracks lifecycle |
| ValidationModule | *TBD* | Selects validators and runs commit‑reveal voting |
| StakeManager | *TBD* | Custodies collateral and executes slashing |
| ReputationEngine | *TBD* | Updates reputation scores and applies penalties |
| DisputeModule | *TBD* | Handles appeals and renders final rulings |
| CertificateNFT | *TBD* | Mints ERC‑721 certificates for completed jobs |

> Addresses will be published after deployment. Always verify each on multiple explorers before interacting.

## Module Diagram
```mermaid
graph TD
    Employer -->|createJob| JobRegistry
    Agent -->|apply/submit| JobRegistry
    JobRegistry -->|selectValidators| ValidationModule
    ValidationModule -->|stake| StakeManager
    ValidationModule -->|reputation| ReputationEngine
    ValidationModule -->|dispute?| DisputeModule
    DisputeModule -->|final ruling| JobRegistry
    JobRegistry -->|mint| CertificateNFT
```

## Role-based Instructions

### Employers
1. Open the AGIJobManager v0 address on Etherscan.
2. In **Write Contract**, connect an employer wallet.
3. Call **createJob** with job parameters and escrowed token amount.
4. Monitor **JobCreated** events to confirm posting.

### Agents
1. Visit the same contract address.
2. Under **Write Contract**, connect your agent wallet.
3. Use **applyForJob** and **submitWork** as needed.
4. Call **requestJobCompletion** when work is ready for validation.

### Validators
1. Navigate to the contract and connect a validator wallet.
2. Stake required AGI via **stake**.
3. During validation, send hashed votes with **commitValidation**.
4. Reveal decisions using **revealValidation** before the window closes.

### Disputers
1. Open the `DisputeModule` address on Etherscan.
2. In **Write Contract**, connect your wallet.
3. Call **raiseDispute(jobId)** to escalate a contested job.
4. After the ruling, verify **DisputeResolved** in the `DisputeModule` and `JobRegistry` event logs.

## Parameter Glossary

| Parameter | Description |
| --- | --- |
| `commitWindow` | Seconds allowed for validators to submit hashed votes. |
| `revealWindow` | Seconds validators have to reveal votes. |
| `reviewWindow` | Delay before validation begins. |
| `resolveGracePeriod` | Buffer after reveal before anyone can resolve a stalled job. |
| `burnPercentage` | Portion of payout burned on job finalization (basis points). |
| `validationRewardPercentage` | Share of payout granted to correct validators. |
| `cancelRewardPercentage` | Share awarded to the caller when cancelling expired jobs. |

## Security Warnings
- Contracts are unaudited; interact at your own risk.
- Verify contract and token addresses on multiple explorers.
- Prefer hardware wallets for privileged actions.

## Governance Notes
- All modules are owned by a community multisig. Only the owner may call parameter‑setting functions.
- To update parameters, open the module's **Write** tab and submit the relevant setter transaction from the multisig.
- After each change, verify emitted events and new values on at least two block explorers.

## Verification Checklist
- [ ] Confirm addresses and bytecode match official releases.
- [ ] Cross-check transactions on at least two block explorers.
- [ ] Review parameter settings via read functions before calling write methods.
- [ ] Ensure the AGI token address `0xf0780F43b86c13B3d0681B1Cf6DaeB1499e7f14D` matches the token in your wallet.
