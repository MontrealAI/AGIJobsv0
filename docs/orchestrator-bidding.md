# Orchestrator Bidding

This module provides helper utilities for selecting the most suitable agent to apply for a job and automatically submitting the application. It relies on on‑chain data from the `JobRegistry`, `StakeManager` and `ReputationEngine` contracts, and on a local capability matrix describing agent categories.

## Configuration

Create `config/agents.json` to map job categories to candidate agents. Each agent entry may include historical metadata used by the selector: `skills` enumerates the tasks the agent is trained for, `reputation` provides an off-chain score when no on-chain history is available, and `energy` represents the predicted energy cost for a unit of work.

```json
{
  "data-entry": [
    {
      "address": "0x1111111111111111111111111111111111111111",
      "skills": ["ocr", "transcription"],
      "reputation": 0.92,
      "energy": 100
    },
    {
      "address": "0x2222222222222222222222222222222222222222",
      "skills": ["classification"],
      "reputation": 0.88,
      "energy": 80
    }
  ],
  "image-labeling": [
    {
      "address": "0x3333333333333333333333333333333333333333",
      "skills": ["annotation", "segmentation"],
      "reputation": 0.95,
      "energy": 90
    }
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
2. Merge ENS identity metadata, telemetry, and `config/agents.json` to build a profile for every locally managed agent. Configured skills, reputation baselines, and energy predictions are persisted alongside on-chain metrics.
3. Analyse job metadata (category, skills, thermodynamic hints and historical energy telemetry) to rank agents. The orchestrator first filters out jobs whose required skills are not advertised by any agent. It then ignores jobs where the required stake exceeds the available collateral across the matching pool.
4. Score the remaining agents by combining category alignment, configured/off-chain reputation, measured success rate, predicted energy usage, stake adequacy and efficiency metrics. The highest scoring agent becomes the candidate.
5. Ensure the chosen agent has sufficient stake, first attempting to top up via `StakeManager.stake`. If the contract does not expose the new entry point the coordinator falls back to `depositStake`. Jobs that cannot satisfy the requirement after this step are skipped.
6. Submit the job application on behalf of the selected agent.

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
