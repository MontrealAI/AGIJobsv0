import { ethers } from 'hardhat';

function normalizeShardId(value: string): string {
  if (value.startsWith('0x')) {
    return value;
  }
  return ethers.encodeBytes32String(value);
}

type Command =
  | 'register'
  | 'pause'
  | 'unpause'
  | 'set-params'
  | 'link';

async function main(): Promise<void> {
  const [, , rawCommand, ...rest] = process.argv;
  const command = (rawCommand ?? '').toLowerCase() as Command;
  const registryAddress = process.env.SHARD_REGISTRY_ADDRESS;
  if (!registryAddress) {
    throw new Error('SHARD_REGISTRY_ADDRESS env var is required');
  }

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt(
    'contracts/v2/modules/ShardRegistry.sol:ShardRegistry',
    registryAddress,
    signer
  );

  switch (command) {
    case 'register': {
      const [shardValue, queueAddress] = rest;
      if (!shardValue || !queueAddress) {
        throw new Error('Usage: register <shard> <queueAddress>');
      }
      const shardId = normalizeShardId(shardValue);
      const queue = await ethers.getContractAt(
        'contracts/v2/modules/ShardJobQueue.sol:ShardJobQueue',
        queueAddress,
        signer
      );
      const currentController = await queue.controller();
      if (currentController.toLowerCase() !== registryAddress.toLowerCase()) {
        const ownershipTx = await queue.setController(registryAddress);
        await ownershipTx.wait();
      }
      const tx = await registry.registerShard(shardId, queueAddress);
      await tx.wait();
      console.log(`Shard ${shardValue} registered -> ${queueAddress}`);
      break;
    }
    case 'pause': {
      const [shardValue] = rest;
      if (!shardValue) throw new Error('Usage: pause <shard>');
      const tx = await registry.pauseShard(normalizeShardId(shardValue));
      await tx.wait();
      console.log(`Shard ${shardValue} paused.`);
      break;
    }
    case 'unpause': {
      const [shardValue] = rest;
      if (!shardValue) throw new Error('Usage: unpause <shard>');
      const tx = await registry.unpauseShard(normalizeShardId(shardValue));
      await tx.wait();
      console.log(`Shard ${shardValue} unpaused.`);
      break;
    }
    case 'set-params': {
      const [shardValue, maxRewardRaw, maxDurationRaw, maxOpenJobsRaw, maxActiveJobsRaw] = rest;
      if (!shardValue || !maxRewardRaw || !maxDurationRaw) {
        throw new Error(
          'Usage: set-params <shard> <maxReward> <maxDurationSeconds> [maxOpenJobs] [maxActiveJobs]'
        );
      }
      const shardId = normalizeShardId(shardValue);
      const maxReward = BigInt(maxRewardRaw);
      const maxDuration = BigInt(maxDurationRaw);
      const maxOpenJobs = maxOpenJobsRaw ? Number(maxOpenJobsRaw) : 0;
      const maxActiveJobs = maxActiveJobsRaw ? Number(maxActiveJobsRaw) : 0;
      const tx = await registry.setShardParameters(shardId, [
        maxReward,
        maxDuration,
        maxOpenJobs,
        maxActiveJobs,
      ]);
      await tx.wait();
      console.log(
        `Updated parameters for ${shardValue}: reward=${maxReward.toString()} duration=${maxDuration.toString()} maxOpen=${maxOpenJobs} maxActive=${maxActiveJobs}`
      );
      break;
    }
    case 'link': {
      const [sourceShard, sourceIdRaw, targetShard, targetIdRaw] = rest;
      if (!sourceShard || !sourceIdRaw || !targetShard || !targetIdRaw) {
        throw new Error('Usage: link <sourceShard> <sourceJobId> <targetShard> <targetJobId>');
      }
      const tx = await registry.linkJobs(
        [normalizeShardId(sourceShard), BigInt(sourceIdRaw)],
        [normalizeShardId(targetShard), BigInt(targetIdRaw)]
      );
      await tx.wait();
      console.log(
        `Linked ${sourceShard}#${sourceIdRaw} -> ${targetShard}#${targetIdRaw}`
      );
      break;
    }
    default:
      throw new Error(
        'Unknown command. Supported commands: register, pause, unpause, set-params, link'
      );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
