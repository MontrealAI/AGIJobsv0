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
  const newOwner = args['new-owner'];
  if (typeof newOwner !== 'string') {
    throw new Error('--new-owner <address> is required');
  }

  const path = join(__dirname, '..', 'docs', 'deployment-addresses.json');
  const addresses = JSON.parse(readFileSync(path, 'utf8')) as Record<
    string,
    string
  >;
  const { ethers } = hre as any;
  const [signer] = await ethers.getSigners();
  const lowerOwner = newOwner.toLowerCase();

  const governable = [
    'stakeManager',
    'jobRegistry',
    'rewardEngine',
    'thermostat',
  ];
  const ownable = [
    'validationModule',
    'reputationEngine',
    'disputeModule',
    'certificateNFT',
    'taxPolicy',
    'feePool',
    'platformRegistry',
    'jobRouter',
    'platformIncentives',
    'systemPause',
  ];

  const governableAbi = [
    'function setGovernance(address)',
    'function owner() view returns (address)',
  ];
  const ownableAbi = [
    'function transferOwnership(address)',
    'function owner() view returns (address)',
  ];

  for (const name of governable) {
    const addr = addresses[name];
    if (!addr || addr === ethers.ZeroAddress) {
      console.log(`Skipping ${name}: no address`);
      continue;
    }
    const code = await ethers.provider.getCode(addr);
    if (code === '0x') {
      console.log(`Skipping ${name}: not deployed at ${addr}`);
      continue;
    }
    const contract = await ethers.getContractAt(governableAbi, addr, signer);
    const current = (await contract.owner()).toLowerCase();
    if (current === lowerOwner) {
      console.log(`${name} already governed by ${newOwner}`);
      continue;
    }
    const tx = await contract.setGovernance(newOwner);
    await tx.wait();
    const updated = (await contract.owner()).toLowerCase();
    if (updated !== lowerOwner) {
      throw new Error(`${name}: governance update failed`);
    }
    console.log(`${name}: governance set to ${newOwner}`);
  }

  for (const name of ownable) {
    const addr = addresses[name];
    if (!addr || addr === ethers.ZeroAddress) {
      console.log(`Skipping ${name}: no address`);
      continue;
    }
    const code = await ethers.provider.getCode(addr);
    if (code === '0x') {
      console.log(`Skipping ${name}: not deployed at ${addr}`);
      continue;
    }
    const contract = await ethers.getContractAt(ownableAbi, addr, signer);
    const current = (await contract.owner()).toLowerCase();
    if (current === lowerOwner) {
      console.log(`${name} already owned by ${newOwner}`);
      continue;
    }
    const tx = await contract.transferOwnership(newOwner);
    await tx.wait();
    const updated = (await contract.owner()).toLowerCase();
    if (updated !== lowerOwner) {
      throw new Error(`${name}: ownership transfer failed`);
    }
    console.log(`${name}: ownership transferred to ${newOwner}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
