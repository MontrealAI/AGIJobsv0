# Orchestrator Bidding

This module provides helper utilities for selecting the most suitable agent to apply for a job and automatically submitting the application. It relies on on‑chain data from the `JobRegistry`, `StakeManager` and `ReputationEngine` contracts, and on a local capability matrix describing agent categories.

## Configuration

Create `config/agents.json` to map job categories to candidate agents. Each entry may optionally include a historical energy usage metric used as a tie‑breaker when reputation scores are equal.

```json
{
  "data-entry": [
    { "address": "0x1111111111111111111111111111111111111111", "energy": 100 },
    { "address": "0x2222222222222222222222222222222222222222", "energy": 80 }
  ],
  "image-labeling": [
    { "address": "0x3333333333333333333333333333333333333333", "energy": 90 }
  ]
}
```

Environment variables supply chain endpoints and contract addresses:

- `RPC_URL` – JSON‑RPC endpoint
- `JOB_REGISTRY_ADDRESS` – deployed `JobRegistry`
- `STAKE_MANAGER_ADDRESS` – deployed `StakeManager`

## Usage

```ts
import { Wallet } from 'ethers';
import { applyForJob } from '../apps/orchestrator/bidding';

const wallet = new Wallet(PRIVATE_KEY, provider);
await applyForJob(1, 'data-entry', wallet, REPUTATION_ENGINE_ADDRESS);
```

`applyForJob` will:
1. Read job requirements from `JobRegistry`.
2. Select the registered agent with the highest reputation for the requested category. If all reputations are equal, the agent with the lowest historical energy usage is chosen.
3. Ensure the agent has sufficient stake, topping up via `StakeManager.depositStake` if required.
4. Submit the job application on behalf of the selected agent.
