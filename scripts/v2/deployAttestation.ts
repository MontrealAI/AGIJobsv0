import { ethers } from 'hardhat';

const MAINNET_ENS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const MAINNET_NAME_WRAPPER = '0x253553366Da8546fC250F225fe3d25d0C782303b';

function usage() {
  console.log('Usage:');
  console.log(
    '  IDENTITY_REGISTRY=<addr> npx hardhat run scripts/v2/deployAttestation.ts --network <network> [ensRegistry nameWrapper]'
  );
  console.log(
    '  ensRegistry and nameWrapper default to mainnet addresses if omitted'
  );
}

async function main() {
  const [ensArg, wrapperArg] = process.argv.slice(2);
  const identityAddr = process.env.IDENTITY_REGISTRY;
  if (!identityAddr) {
    usage();
    throw new Error('IDENTITY_REGISTRY env var required');
  }

  const ensAddr = ethers.getAddress(
    ensArg || process.env.ENS_REGISTRY || MAINNET_ENS
  );
  const wrapperAddr = ethers.getAddress(
    wrapperArg || process.env.NAME_WRAPPER || MAINNET_NAME_WRAPPER
  );

  const Attestation = await ethers.getContractFactory(
    'contracts/v2/AttestationRegistry.sol:AttestationRegistry'
  );
  const att = await Attestation.deploy(ensAddr, wrapperAddr);
  await att.waitForDeployment();

  const identity = await ethers.getContractAt(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry',
    identityAddr
  );
  await identity.setAttestationRegistry(await att.getAddress());

  console.log('AttestationRegistry:', await att.getAddress());
  console.log('IdentityRegistry:', identityAddr);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
