# Architecture Diagram

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

