import { ethers } from 'hardhat';

async function main(): Promise<void> {
  const governance =
    process.env.SHARD_REGISTRY_GOVERNANCE || (await ethers.getSigners())[0].address;
  const factory = await ethers.getContractFactory(
    'contracts/v2/modules/ShardRegistry.sol:ShardRegistry'
  );
  const registry = await factory.deploy(governance);
  const address = await registry.getAddress();
  console.log(`ShardRegistry deployed at ${address}`);
  console.log(`Governance controller: ${governance}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
