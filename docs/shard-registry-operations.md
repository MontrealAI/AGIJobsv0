# Shard registry deployment & operator guide

This guide walks non-technical operators through deploying the shard-aware
registry contracts, registering shard queues, and executing common governance
actions using the supplied scripts. It also highlights the TypeScript SDK helper
that provides a unified API across shards for backend services.

## Prerequisites

- Node.js 18+
- `npm install`
- Access to a signer that controls governance for the shard registry (often a
  timelock or multisig). The scripts assume the first signer returned by
  Hardhat, but you can inject a private key via `HARDHAT_NETWORK` configuration
  or environment variables such as `PRIVATE_KEY`.
- Network RPC configuration in `hardhat.config.js` for the target chain.

## 1. Deploy the shard registry

```bash
export SHARD_REGISTRY_GOVERNANCE=<timelock-or-multisig-address>
npx hardhat run --network <network> scripts/shards/deploy-registry.ts
```

The script prints the deployed registry address and the governance controller.
Record this address and export it for subsequent steps:

```bash
export SHARD_REGISTRY_ADDRESS=<deployed-registry-address>
```

## 2. Deploy shard queues

Each shard gets its own queue contract. Provide a human-readable shard name or a
pre-computed bytes32 identifier. You can optionally override the owner with the
`SHARD_QUEUE_OWNER` environment variable.

```bash
# Deploy an Earth shard queue owned by the same governance signer
npx hardhat run --network <network> scripts/shards/deploy-queue.ts -- EARTH

# Deploy a Luna shard queue with an explicit owner
export SHARD_QUEUE_OWNER=<owner-address>
npx hardhat run --network <network> scripts/shards/deploy-queue.ts -- LUNA
unset SHARD_QUEUE_OWNER
```

Record each queue address that is printed. The deploy script automatically
encodes the shard label to `bytes32` for you.

## 3. Register shard queues with the registry

Use the `manage-shards.ts` helper to register queues and wire them to the
registry. The script ensures the registry is set as the queue controller before
registration.

```bash
# Register the Earth shard queue
npx hardhat run --network <network> scripts/shards/manage-shards.ts -- \
  register EARTH <earth-queue-address>

# Register the Luna shard queue using a hex shard id
npx hardhat run --network <network> scripts/shards/manage-shards.ts -- \
  register 0x4d415253000000000000000000000000000000000000000000000000000000 \
  <luna-queue-address>
```

You can verify the mapping by calling `listShards` and `getShardQueue` from a
Hardhat console or via the SDK adapter described below.

## 4. Day-to-day operator actions

The same script exposes high-level subcommands for owner governance controls:

```bash
# Pause a shard-specific queue
npx hardhat run --network <network> scripts/shards/manage-shards.ts -- pause EARTH

# Resume a shard queue
npx hardhat run --network <network> scripts/shards/manage-shards.ts -- unpause EARTH

# Update reward/duration parameters
npx hardhat run --network <network> scripts/shards/manage-shards.ts -- \
  set-params EARTH 1000000000000000000 86400

# Link jobs across shards for auditing or spillover tracking
npx hardhat run --network <network> scripts/shards/manage-shards.ts -- \
  link EARTH 1 LUNA 7
```

Set `SHARD_REGISTRY_ADDRESS` before running any of the commands above. The
script confirms success on stdout so operators can paste the output directly in
runbooks.

## 5. SDK integration

The `@agijobs/onebox-sdk` package now exports a `ShardRegistryAdapter` that wraps
an `ethers` contract instance. Services can use it to treat all shards as a
single logical registry:

```ts
import { ethers } from 'ethers';
import {
  ShardRegistryAdapter,
  ShardJobStatus,
} from '@agijobs/onebox-sdk';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const registry = new ethers.Contract(
  process.env.SHARD_REGISTRY_ADDRESS!,
  shardRegistryAbi,
  signer,
);
const adapter = new ShardRegistryAdapter(registry);

const { job } = await adapter.createJob('EARTH', 'spec-123', 'ipfs://metadata');
await adapter.assignAgent(job, '<agent-address>');
await adapter.startJob(job);
await adapter.submitResult(job, 'result-hash');
await adapter.finalizeJob(job, true);
```

The adapter automatically normalises shard identifiers (human strings or
hex-encoded bytes32) and hashes non-hex spec or result identifiers. It also
exposes helper methods for pausing shards, updating parameters, and reading
cross-shard links.

## 6. Upgrades

To rotate governance or upgrade shard queues:

1. Deploy the new implementation (queue or registry) using the deployment
   scripts above.
2. Point governance to the new address using the existing timelock flow.
3. Use `manage-shards.ts register` to migrate shard IDs to the new queue if you
   rotate queue contracts. The script updates the controller safely before the
   registry call.

Record every operation in your governance audit log, including the command
executed, transaction hash, and shard identifier. The scripts echo these details
for copy/paste into existing runbooks.
