import hre from 'hardhat';

const { artifacts, ethers, network } = hre;
const TOKEN_ADDRESS = '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA';

async function main() {
  let artifact;
  try {
    artifact = await artifacts.readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Artifact')) {
      await hre.run('compile');
      artifact = await artifacts.readArtifact(
        'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
      );
    } else {
      throw error;
    }
  }

  const tokenAddress = ethers.getAddress(TOKEN_ADDRESS);
  const [deployer] = await ethers.getSigners();
  const ownerSlot = ethers.toBeHex(5, 32);
  const ownerValue = ethers.zeroPadValue(deployer.address, 32);

  await network.provider.send('hardhat_setCode', [
    tokenAddress,
    artifact.deployedBytecode,
  ]);
  await network.provider.send('hardhat_setStorageAt', [
    tokenAddress,
    ownerSlot,
    ownerValue,
  ]);

  console.log(`[aurora-local] Prepared AGIALPHA token at ${tokenAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
