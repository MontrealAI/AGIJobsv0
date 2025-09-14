# Monitoring Dashboard

The repository includes a CLI/web dashboard for tracking reward minting and token burning.

## Reward/Burn Dashboard

`scripts/monitor/reward-burn-dashboard.ts` listens to `RewardBudget` and `SlashingStats` events and aggregates
values per epoch. It reports how many tokens were minted and burned and computes the `burned / minted`
ratio. An alert is emitted when the ratio diverges from `1.0` by more than a configurable threshold.

### Usage

```bash
RPC_URL=https://rpc.example.org \
REWARD_ENGINE=0xRewardEngineAddress \
STAKE_MANAGER=0xStakeManagerAddress \
ALERT_THRESHOLD=0.1 \ # optional, default 10%
PORT=3000 \            # optional, exposes JSON metrics
npx ts-node scripts/monitor/reward-burn-dashboard.ts
```

Metrics for all processed epochs are exposed at `http://localhost:PORT` as JSON while the script logs
anomalies and epoch summaries to the console.

### Thresholds

`ALERT_THRESHOLD` defines the acceptable divergence between minted and burned tokens per epoch.
A value of `0.1` means the `burned/minted` ratio can differ from `1.0` by up to 10% before an alert is triggered.

## Hamiltonian State Monitor

`scripts/monitor/hamiltonian-state.ts` derives a coarse grained Hamiltonian for the
protocol economy. For each epoch it aggregates `RewardBudget` and `SlashingStats`
events, computes dissipation `D = minted + burned - redistributed` and utility
`U = redistributed`, and reports `H = D - λ·U` where `λ` defaults to `1`.

### Usage

```bash
RPC_URL=https://rpc.example.org \
REWARD_ENGINE=0xRewardEngineAddress \
STAKE_MANAGER=0xStakeManagerAddress \
LAMBDA=1 \             # optional, scales utility weight
PORT=3001 \            # optional, exposes JSON metrics
MAX_EPOCHS=100 \      # optional, retain last 100 epochs
npx ts-node scripts/monitor/hamiltonian-state.ts
```

The script logs the Hamiltonian for each processed epoch and serves the latest
metrics at `http://localhost:PORT`. Only the most recent `MAX_EPOCHS` epochs
are kept in memory (default `100`).
