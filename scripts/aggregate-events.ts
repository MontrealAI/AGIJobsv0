import { JsonRpcProvider, Interface, Contract } from 'ethers';

async function main() {
  const rpc = process.env.RPC_URL || 'http://localhost:8545';
  const provider = new JsonRpcProvider(rpc);
  const rewardAddr = process.env.REWARD_ENGINE || '';
  const stakeAddr = process.env.STAKE_MANAGER || '';
  const start = process.env.START_BLOCK ? parseInt(process.env.START_BLOCK) : 0;
  const end = process.env.END_BLOCK
    ? parseInt(process.env.END_BLOCK)
    : 'latest';

  const rewardIface = new Interface([
    'event RewardBudget(uint256 indexed epoch,uint256 minted,uint256 burned,uint256 redistributed,uint256 distributionRatio)',
  ]);
  const slashIface = new Interface([
    'event SlashingStats(uint256 timestamp,uint256 minted,uint256 burned,uint256 redistributed,uint256 burnRatio)',
  ]);

  const reward = rewardAddr
    ? new Contract(rewardAddr, rewardIface, provider)
    : undefined;
  const stake = stakeAddr
    ? new Contract(stakeAddr, slashIface, provider)
    : undefined;

  let minted = 0n;
  let burned = 0n;
  let redistributed = 0n;

  if (reward) {
    const events = await reward.queryFilter('RewardBudget', start, end);
    for (const ev of events) {
      minted += ev.args.minted as bigint;
      burned += ev.args.burned as bigint;
      redistributed += ev.args.redistributed as bigint;
    }
  }

  if (stake) {
    const events = await stake.queryFilter('SlashingStats', start, end);
    for (const ev of events) {
      burned += ev.args.burned as bigint;
      redistributed += ev.args.redistributed as bigint;
    }
  }

  console.log('=== Aggregate Totals ===');
  console.log('Minted       :', minted.toString());
  console.log('Burned       :', burned.toString());
  console.log('Redistributed:', redistributed.toString());
  const ratio = burned > 0n ? (redistributed * 10000n) / burned : 0n;
  console.log('Redistributed/Burned x10000:', ratio.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
