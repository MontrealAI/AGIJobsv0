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

async function main() {
  const args = parseArgs();
  const address = args['thermostat'];
  if (!address) throw new Error('--thermostat <address> required');

  const emission = BigInt(args['emission'] ?? '0');
  const backlog = BigInt(args['backlog'] ?? '0');
  const sla = BigInt(args['sla'] ?? '0');

  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();

  const abi = ['function tick(int256,int256,int256)'];
  const thermostat = new ethers.Contract(address, abi, signer);

  const tx = await thermostat.tick(emission, backlog, sla);
  console.log(`tick tx: ${tx.hash}`);
  await tx.wait();
  const current = await thermostat.systemTemperature();
  console.log(`systemTemperature: ${current}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
