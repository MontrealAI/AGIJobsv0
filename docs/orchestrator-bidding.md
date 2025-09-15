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
2. Analyse job metadata (skills, thermodynamic hints and historical energy telemetry) to rank agents. Candidates with matching skills are preferred; ties are broken by highest on-chain reputation and then by the lowest predicted energy usage.
3. Skip the job altogether when the offered reward cannot cover the projected energy cost plus the configured profit margin.
4. Ensure the chosen agent has sufficient stake, topping up via `StakeManager.depositStake` when their locked $AGIALPHA balance is below the job requirement.
5. Submit the job application on behalf of the selected agent.

## Offline analysis CLI

Use `scripts/agents/analyze.ts` to inspect how the selector ranks agents for a
given job without submitting an application. The script accepts either a JSON
metadata file or command line flags for the job category, skill requirements,
reward, and staking thresholds. It queries the on-chain reputation engine and
stake manager to mirror the live selection, returning the winning agent together
with diagnostic rankings.

```bash
npx ts-node scripts/agents/analyze.ts \
  --category data-entry \
  --skills "ocr,transcription" \
  --reward 150 \
  --reward-decimals 18 \
  --reputation 0x...reputationEngine
```
