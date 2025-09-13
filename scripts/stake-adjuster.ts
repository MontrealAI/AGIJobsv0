import { ethers } from 'ethers';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

/**
 * Stake adjustment policy:
 * Governance runs this script periodically (e.g. weekly) to derive
 * recommended minimum and maximum stake values from recent job rewards.
 * When executed with the `--apply` flag the script calls
 * `setStakeRecommendations` so collateral requirements track off-chain
 * activity without exceeding `MaxStakePerAddress` or lowering security.
 */

function parseArgs() {
  const argv = process.argv.slice(2);
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const rpc = process.env.RPC_URL || 'http://localhost:8545';
  const provider = new ethers.JsonRpcProvider(rpc);

  const stakeAddress =
    (args['stake-manager'] as string) || process.env.STAKE_MANAGER;
  const registryAddress =
    (args['job-registry'] as string) || process.env.JOB_REGISTRY;

  const employerPct = args['employer-pct']
    ? Number(args['employer-pct'])
    : undefined;
  const treasuryPct = args['treasury-pct']
    ? Number(args['treasury-pct'])
    : undefined;

  if (!stakeAddress || !registryAddress) {
    throw new Error('stake-manager and job-registry addresses are required');
  }

  const stakeAbi = [
    'event StakeDeposited(address indexed user,uint8 indexed role,uint256 amount)',
    'function setStakeRecommendations(uint256,uint256)',
    'function setSlashingPercentages(uint256,uint256)',
  ];

  const jobAbi = [
    'event JobFunded(uint256 indexed jobId,address indexed employer,uint256 reward,uint256 fee)',
  ];

  const stake = new ethers.Contract(stakeAddress, stakeAbi, provider);
  const registry = new ethers.Contract(registryAddress, jobAbi, provider);

  const latest = await provider.getBlockNumber();
  const lookback = Number(args['lookback-blocks'] || 50000);
  const fromBlock = latest - lookback > 0 ? latest - lookback : 0;

  const stakeEvents = await stake.queryFilter(
    stake.filters.StakeDeposited(null, 0),
    fromBlock,
    latest
  );

  const agents = new Set<string>();
  for (const ev of stakeEvents) {
    const user = (ev.args as any)[0] as string;
    agents.add(user.toLowerCase());
  }

  const jobEvents = await registry.queryFilter(
    registry.filters.JobFunded(),
    fromBlock,
    latest
  );

  let total = 0n;
  for (const ev of jobEvents) {
    const reward = (ev.args as any)[2] as bigint;
    total += reward;
  }
  const avgReward = jobEvents.length ? total / BigInt(jobEvents.length) : 0n;

  const recommendedMin = avgReward / 10n;
  const recommendedMax = avgReward * 10n;

  console.log(`Active agents: ${agents.size}`);
  console.log(
    `Average reward: ${ethers.formatUnits(avgReward, 18)} tokens over ${
      jobEvents.length
    } jobs`
  );
  console.log(
    `Recommended minStake: ${ethers.formatUnits(recommendedMin, 18)} tokens`
  );
  console.log(
    `Recommended maxStakePerAddress: ${ethers.formatUnits(
      recommendedMax,
      18
    )} tokens`
  );

  if (employerPct !== undefined && treasuryPct !== undefined) {
    console.log(
      `Requested slashing percentages: employer ${employerPct}% treasury ${treasuryPct}%`
    );
  }

  if (args['apply']) {
    const key = process.env.PRIVATE_KEY;
    if (!key) {
      throw new Error('PRIVATE_KEY is required to apply changes');
    }
    const wallet = new ethers.Wallet(key, provider);
    const stakeSigned = stake.connect(wallet);

    const tx1 = await stakeSigned.setStakeRecommendations(
      recommendedMin,
      recommendedMax
    );
    await tx1.wait();
    console.log(`setStakeRecommendations tx: ${tx1.hash}`);
    if (employerPct !== undefined && treasuryPct !== undefined) {
      const tx2 = await stakeSigned.setSlashingPercentages(
        employerPct,
        treasuryPct
      );
      await tx2.wait();
      console.log(`setSlashingPercentages tx: ${tx2.hash}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
