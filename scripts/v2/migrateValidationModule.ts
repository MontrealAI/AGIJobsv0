import { ethers } from 'hardhat';

async function main() {
  const [caller] = await ethers.getSigners();
  const installerAddr = process.env.INSTALLER;
  const registryAddr = process.env.REGISTRY;
  const newValidationAddr = process.env.NEW_VALIDATION;
  if (!installerAddr || !registryAddr || !newValidationAddr) {
    throw new Error('INSTALLER, REGISTRY and NEW_VALIDATION env vars required');
  }

  const installer = await ethers.getContractAt(
    'contracts/v2/ModuleInstaller.sol:ModuleInstaller',
    installerAddr
  );
  const tx = await installer
    .connect(caller)
    .replaceValidationModule(registryAddr, newValidationAddr, []);
  await tx.wait();
  console.log('validation module migrated');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
