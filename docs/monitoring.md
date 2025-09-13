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
