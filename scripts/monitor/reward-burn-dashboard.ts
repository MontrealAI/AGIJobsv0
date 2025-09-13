import { JsonRpcProvider, Contract, Interface } from 'ethers';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL as string;
const REWARD_ENGINE = process.env.REWARD_ENGINE as string;
const STAKE_MANAGER = process.env.STAKE_MANAGER as string;
const ALERT_THRESHOLD = Number(process.env.ALERT_THRESHOLD || '0.1'); // 10% by default
const PORT = Number(process.env.PORT || '3000');

if (!RPC_URL || !REWARD_ENGINE || !STAKE_MANAGER) {
  console.error('RPC_URL, REWARD_ENGINE and STAKE_MANAGER must be set');
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC_URL);

const rewardIface = new Interface([
  'event RewardBudget(uint256 indexed epoch,uint256 minted,uint256 burned,uint256 redistributed,uint256 distributionRatio)',
]);
const slashIface = new Interface([
  'event SlashingStats(uint256 timestamp,uint256 minted,uint256 burned,uint256 redistributed,uint256 burnRatio)',
]);

const reward = new Contract(REWARD_ENGINE, rewardIface, provider);
const stake = new Contract(STAKE_MANAGER, slashIface, provider);

interface EpochStats {
  minted: bigint;
  burned: bigint;
  redistributed: bigint;
  burnRatio: number;
  distributionRatio: number;
}
const epochs: Record<number, EpochStats> = {};
let currentEpoch = 0;
let currentStats: EpochStats | undefined;

function finalizeEpoch(epoch: number) {
  if (!currentStats) return;
  const burnRatio =
    currentStats.minted > 0n
      ? Number(currentStats.burned) / Number(currentStats.minted)
      : 0;
  const distributionRatio =
    currentStats.minted > 0n
      ? Number(currentStats.redistributed) / Number(currentStats.minted)
      : 0;
  currentStats.burnRatio = burnRatio;
  currentStats.distributionRatio = distributionRatio;
  epochs[epoch] = { ...currentStats };
  console.log(
    `Epoch ${epoch} minted=${currentStats.minted.toString()} burned=${currentStats.burned.toString()} redistributed=${currentStats.redistributed.toString()} burnRatio=${burnRatio.toFixed(
      4
    )} distributionRatio=${distributionRatio.toFixed(4)}`
  );
  const divergence = Math.abs(1 - burnRatio);
  if (divergence > ALERT_THRESHOLD) {
    console.log(
      `ALERT: burn/mint ratio divergence ${divergence.toFixed(
        4
      )} exceeds ${ALERT_THRESHOLD}`
    );
  }
}

reward.on(
  'RewardBudget',
  (epoch: bigint, minted: bigint, burned: bigint, redistributed: bigint) => {
    if (currentEpoch !== Number(epoch)) {
      if (currentEpoch !== 0) finalizeEpoch(currentEpoch);
      currentEpoch = Number(epoch);
      currentStats = {
        minted,
        burned,
        redistributed,
        burnRatio: 0,
        distributionRatio: 0,
      };
    } else if (currentStats) {
      // accumulate if multiple events per epoch
      currentStats.minted += minted;
      currentStats.burned += burned;
      currentStats.redistributed += redistributed;
    }
  }
);

stake.on(
  'SlashingStats',
  (_ts: bigint, minted: bigint, burned: bigint, redistributed: bigint) => {
    if (currentStats) {
      currentStats.minted += minted;
      currentStats.burned += burned;
      currentStats.redistributed += redistributed;
    }
  }
);

const app = express();
app.get('/', (_req, res) => {
  res.json({ currentEpoch, epochs });
});

app.listen(PORT, () => {
  console.log(`Reward/burn monitor running at http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  if (currentEpoch !== 0) finalizeEpoch(currentEpoch);
  process.exit(0);
});
