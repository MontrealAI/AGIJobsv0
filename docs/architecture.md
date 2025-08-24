# Architecture

## Modules
- [JobRegistry](../contracts/v2/JobRegistry.sol) – orchestrates job lifecycle and coordinates with external modules.
- [StakeManager](../contracts/v2/StakeManager.sol) – holds deposits, pays rewards, and slashes stake.
- [ReputationEngine](../contracts/v2/ReputationEngine.sol) – tracks reputation scores for participants.
- [ValidationModule](../contracts/v2/ValidationModule.sol) – returns preset validation outcomes for jobs.
- [CertificateNFT](../contracts/v2/CertificateNFT.sol) – mints ERC721 certificates for successful jobs.

## Module Interactions
```mermaid
graph TD
    JobRegistry --> ValidationModule
    JobRegistry --> StakeManager
    JobRegistry --> ReputationEngine
    JobRegistry --> CertificateNFT
```

## Job Flow
```mermaid
sequenceDiagram
    participant Employer
    participant Agent
    participant Validator
    participant AGI as "AGI Token"

    Employer->>Agent: Post job & escrow AGI
    Agent->>Validator: Submit work
    Validator->>Employer: Approve work
    Employer->>AGI: Release payment
    AGI-->>Agent: Payout
    AGI-->>Validator: Validation reward
```

## Employer-Win Dispute Flow
```mermaid
sequenceDiagram
    participant Employer
    participant Agent
    participant Validator
    participant AGI as "AGI Token"

    Employer->>Agent: Post job & escrow AGI
    Agent->>Validator: Submit work
    Validator-->>Employer: Reject work
    AGI-->>Validator: Split reward & slashed stake
    AGI-->>Employer: Return remaining escrow
```
