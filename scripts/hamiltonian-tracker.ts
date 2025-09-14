import hre from 'hardhat';

function parseArgs() {
  const argv = process.argv.slice(2);
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i++;
      }
    }
  }
  return args;
}

const WAD = 10n ** 18n;

async function main() {
  const args = parseArgs();
  const engine = args['engine'];
  if (!engine) throw new Error('--engine <address> required');
  const fromBlock = args['from'] ? parseInt(args['from']) : 0;
  const toBlock = args['to']
    ? parseInt(args['to'])
    : await hre.ethers.provider.getBlockNumber();
  const lambda = BigInt(args['lambda'] ?? '1');

  const abi = [
    'event EpochSettled(uint256 indexed epoch,uint256 budget,int256 dH,int256 dS,int256 systemTemperature,uint256 leftover)',
  ];
  const contract = new hre.ethers.Contract(engine, abi, hre.ethers.provider);
  const events = await contract.queryFilter(
    contract.filters.EpochSettled(),
    fromBlock,
    toBlock
  );

  for (const ev of events) {
    const { epoch, budget, dH, dS, systemTemperature } = ev.args as any;
    const h = BigInt(dH) - lambda * BigInt(budget);
    const free = BigInt(dH) - (BigInt(systemTemperature) * BigInt(dS)) / WAD;
    console.log(
      `epoch ${epoch.toString()} h=${h.toString()} free=${free.toString()}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
