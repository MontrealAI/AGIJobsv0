import { ethers } from 'hardhat';

function normalizeShardId(value: string): string {
  if (value.startsWith('0x')) {
    return value;
  }
  return ethers.encodeBytes32String(value);
}

async function main(): Promise<void> {
  const shardValue = process.env.SHARD_ID || process.argv[2];
  if (!shardValue) {
    throw new Error('Provide SHARD_ID env var or first argument (e.g. EARTH)');
  }
  const owner = process.env.SHARD_QUEUE_OWNER || (await ethers.getSigners())[0].address;
  const factory = await ethers.getContractFactory(
    'contracts/v2/modules/ShardJobQueue.sol:ShardJobQueue'
  );
  const queue = await factory.deploy(normalizeShardId(shardValue), owner);
  const address = await queue.getAddress();
  console.log(
    `ShardJobQueue deployed for ${shardValue} at ${address} (owner ${owner})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
