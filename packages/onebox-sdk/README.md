# AGI Jobs v0 (v2) — Onebox SDK

[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![Static analysis](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml)

The Onebox SDK is a lightweight TypeScript client for the shard registry that powers the Onebox consoles and validator tooling. It
wraps the registry ABI, normalises shard/job identifiers, and exposes typed helpers for creating, linking, and finalising jobs.

## Feature summary

- **Typed adapters** – `ShardRegistryAdapter` exposes strongly typed methods for listing shards, creating jobs, assigning agents,
  finalising work, and linking jobs across shards.【F:packages/onebox-sdk/src/shardRegistry.ts†L33-L137】
- **Safety guards** – Helper methods normalise shard IDs, spec hashes, and bigint conversions before calling the contract to
  prevent malformed calldata.【F:packages/onebox-sdk/src/shardRegistry.ts†L139-L214】
- **Administrative controls** – Includes `pauseShard`, `setShardParameters`, and global `pause/unpause` helpers so the contract
  owner or delegated operators can change capacity settings without crafting raw calldata.【F:packages/onebox-sdk/src/shardRegistry.ts†L169-L210】

## Quick start

```ts
import { ethers } from "ethers";
import { ShardRegistryAdapter, shardRegistryAbi } from "@agi/onebox-sdk";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
const signer = new ethers.Wallet(process.env.OWNER_KEY!, provider);
const registry = new ethers.Contract(process.env.SHARD_REGISTRY_ADDRESS!, shardRegistryAbi, signer);
const adapter = new ShardRegistryAdapter(registry);

const shards = await adapter.listShards();
const { job } = await adapter.createJob(shards[0], ethers.id("spec"), "ipfs://metadata");
await adapter.assignAgent(job, signer.address);
```

All helpers return ethers.js transaction responses so callers can await confirmations or pipe them through owner dashboards.

## Testing

The SDK is covered by the shared lint/typecheck jobs in `ci (v2)` and is exercised indirectly by the Onebox apps’ integration
suites. Add targeted unit tests under `packages/onebox-sdk/__tests__` if you introduce complex transformations.

## Extensibility

- Export new helpers through `src/index.ts` when additional registry methods become available.
- Keep method names aligned with on-chain function names so owner scripts (for example `npm run owner:command-center`) can import
  them without adaptation.
- Update the Onebox console documentation (`apps/onebox-static/README.md`) whenever the SDK surface changes so operators know how
  to trigger the new capability.

The SDK remains intentionally small: it is the reliable building block that lets non-technical owners operate the shard registry
through console or CLI flows without touching raw ABI encodings.
