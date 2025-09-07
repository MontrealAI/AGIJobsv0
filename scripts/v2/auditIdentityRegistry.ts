import hre from 'hardhat';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  const path = join(__dirname, '..', '..', 'docs', 'deployment-addresses.json');
  const addresses = JSON.parse(readFileSync(path, 'utf8')) as Record<
    string,
    string
  >;
  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();

  const registryAddr =
    typeof args['registry'] === 'string'
      ? (args['registry'] as string)
      : addresses.identityRegistry;
  if (!registryAddr || registryAddr === ethers.ZeroAddress) {
    throw new Error('identity registry address missing');
  }

  const abi = [
    'event AdditionalAgentUpdated(address indexed agent, bool allowed)',
    'event AdditionalValidatorUpdated(address indexed validator, bool allowed)',
    'function removeAdditionalAgent(address agent)',
    'function removeAdditionalValidator(address validator)',
  ];

  const registry = await ethers.getContractAt(abi, registryAddr, signer);

  const agentEvents = await registry.queryFilter(
    registry.filters.AdditionalAgentUpdated()
  );
  const agents = new Set<string>();
  for (const e of agentEvents) {
    const addr = (e as any).args.agent.toLowerCase();
    if ((e as any).args.allowed) agents.add(addr);
    else agents.delete(addr);
  }

  const validatorEvents = await registry.queryFilter(
    registry.filters.AdditionalValidatorUpdated()
  );
  const validators = new Set<string>();
  for (const e of validatorEvents) {
    const addr = (e as any).args.validator.toLowerCase();
    if ((e as any).args.allowed) validators.add(addr);
    else validators.delete(addr);
  }

  console.log('Additional agents:', [...agents]);
  console.log('Additional validators:', [...validators]);

  if (args['clear']) {
    for (const a of agents) {
      const tx = await registry.removeAdditionalAgent(a);
      await tx.wait();
      console.log(`Removed agent ${a}`);
    }
    for (const v of validators) {
      const tx = await registry.removeAdditionalValidator(v);
      await tx.wait();
      console.log(`Removed validator ${v}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
