import { ethers, network } from 'hardhat';

const AGIALPHA_MAINNET = '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA';

async function main() {
  if (network.name === 'mainnet' && AGIALPHA_MAINNET.toLowerCase() !== process.env.AGIALPHA_TOKEN?.toLowerCase()) {
    throw new Error(`Mainnet requires AGIALPHA token ${AGIALPHA_MAINNET}`);
  }

  const token = process.env.AGIALPHA_TOKEN ?? AGIALPHA_MAINNET;
  if (network.name === 'mainnet' && token.toLowerCase() !== AGIALPHA_MAINNET.toLowerCase()) {
    throw new Error(`Refusing mainnet deploy: token must be ${AGIALPHA_MAINNET}`);
  }

  const owner = process.env.OWNER_ADDRESS;
  if (!owner) throw new Error('OWNER_ADDRESS required');

  const burnBps = Number(process.env.EMPLOYER_BURN_BPS ?? '500');
  const Factory = await ethers.getContractFactory('AGIJobManager');
  const contract = await Factory.deploy(token, burnBps, owner);
  await contract.waitForDeployment();
  console.log(`AGIJobManager deployed: ${await contract.getAddress()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
