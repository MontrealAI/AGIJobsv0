import { ethers } from 'hardhat';

function parseArgs() {
  const argv = process.argv.slice(2);
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = '';
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  if (!args.installer) throw new Error('--installer required');
  if (!args.governance) throw new Error('--governance required');

  const installer = await ethers.getContractAt(
    'contracts/v2/ModuleInstaller.sol:ModuleInstaller',
    args.installer
  );

  const currentOwner = await installer.owner();
  if (currentOwner.toLowerCase() !== args.governance.toLowerCase()) {
    const tx = await installer.transferOwnership(args.governance);
    await tx.wait();
  }

  const gov = await ethers.getSigner(args.governance);
  const tx = await installer
    .connect(gov)
    .initialize(
      args.registry,
      args.stake,
      args.validation,
      args.reputation,
      args.dispute,
      args.nft,
      args.incentives,
      args.platformRegistry,
      args.jobRouter,
      args.feePool,
      args.taxPolicy || ethers.ZeroAddress,
      args.identity,
      args.clubRootNode || ethers.ZeroHash,
      args.agentRootNode || ethers.ZeroHash,
      args.validatorMerkleRoot || ethers.ZeroHash,
      args.agentMerkleRoot || ethers.ZeroHash,
      []
    );
  await tx.wait();
  console.log('modules initialized and ownership returned to governance');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
