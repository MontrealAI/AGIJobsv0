import { JsonRpcProvider, Contract, Interface } from 'ethers';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL as string;
const REWARD_ENGINE = process.env.REWARD_ENGINE as string;
const STAKE_MANAGER = process.env.STAKE_MANAGER as string;
const LAMBDA = Number(process.env.LAMBDA || '1');
const PORT = Number(process.env.PORT || '3001');
const MAX_EPOCHS = Number(process.env.MAX_EPOCHS || '100');

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
  h: number;
}
const epochs: Record<number, EpochStats> = {};
const epochOrder: number[] = [];
let currentEpoch = 0;
let currentStats: EpochStats | undefined;

function finalizeEpoch(epoch: number) {
  if (!currentStats) return;
  const minted = Number(currentStats.minted) / 1e18;
  const burned = Number(currentStats.burned) / 1e18;
  const redistributed = Number(currentStats.redistributed) / 1e18;
  const dissipation = minted + burned - redistributed;
  const h = dissipation - LAMBDA * redistributed;
  currentStats.h = h;
  epochs[epoch] = { ...currentStats };
  epochOrder.push(epoch);
  if (MAX_EPOCHS > 0 && epochOrder.length > MAX_EPOCHS) {
    const outdated = epochOrder.shift();
    if (outdated !== undefined) delete epochs[outdated];
  }
  console.log(
    `Epoch ${epoch} H=${h.toFixed(4)} D=${dissipation.toFixed(
      4
    )} U=${redistributed.toFixed(4)}`
  );
}

reward.on(
  'RewardBudget',
  (epoch: bigint, minted: bigint, burned: bigint, redistributed: bigint) => {
    if (currentEpoch !== Number(epoch)) {
      if (currentEpoch !== 0) finalizeEpoch(currentEpoch);
      currentEpoch = Number(epoch);
      currentStats = { minted, burned, redistributed, h: 0 };
    } else if (currentStats) {
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
  res.json({ currentEpoch, lambda: LAMBDA, epochs });
});

app.listen(PORT, () => {
  console.log(`Hamiltonian monitor running at http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  if (currentEpoch !== 0) finalizeEpoch(currentEpoch);
  process.exit(0);
});
