import { Contract, JsonRpcProvider, type EventLog } from 'ethers';
import {
  cultureRegistryAbi,
  selfPlayArenaAbi,
  decodeArenaResult,
  type ArenaMatchResult
} from './contracts.js';
import type { GraphStore } from './graph.js';
import { logger } from './logger.js';

export interface IndexerOptions {
  readonly rpcUrl: string;
  readonly cultureRegistryAddress: string;
  readonly selfPlayArenaAddress?: string;
  readonly startBlock?: number;
  readonly finalityDepth?: number;
  readonly pollIntervalMs?: number;
  readonly blockBatchSize?: number;
  readonly reorgBuffer?: number;
}

interface BlockInfo {
  readonly hash: string;
  readonly timestamp: number;
}

export class CultureGraphIndexer {
  private readonly provider: JsonRpcProvider;
  private readonly cultureRegistry: Contract;
  private readonly selfPlayArena?: Contract;
  private readonly store: GraphStore;
  private readonly finalityDepth: number;
  private readonly pollIntervalMs: number;
  private readonly blockBatchSize: number;
  private readonly startBlock: number;
  private readonly reorgBuffer: number;

  private readonly blockCache = new Map<number, BlockInfo>();
  private isRunning = false;
  private pollHandle: NodeJS.Timeout | null = null;

  constructor(store: GraphStore, options: IndexerOptions) {
    this.store = store;
    this.provider = new JsonRpcProvider(options.rpcUrl);
    this.cultureRegistry = new Contract(options.cultureRegistryAddress, cultureRegistryAbi, this.provider);
    if (options.selfPlayArenaAddress) {
      this.selfPlayArena = new Contract(options.selfPlayArenaAddress, selfPlayArenaAbi, this.provider);
    }
    this.startBlock = options.startBlock ?? 0;
    this.finalityDepth = options.finalityDepth ?? 3;
    this.pollIntervalMs = options.pollIntervalMs ?? 15_000;
    this.blockBatchSize = options.blockBatchSize ?? 2_000;
    this.reorgBuffer = options.reorgBuffer ?? 6;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    await this.catchUp();
    this.schedulePolling();
    logger.info('CultureGraphIndexer started');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.blockCache.clear();
  }

  private schedulePolling() {
    this.pollHandle = setInterval(() => {
      if (!this.isRunning) return;
      this.catchUp().catch((error) => {
        logger.error({ err: error }, 'Indexer polling failed');
      });
    }, this.pollIntervalMs);
    this.pollHandle.unref();
  }

  private async catchUp(): Promise<void> {
    const latestBlock = await this.provider.getBlockNumber();
    const targetBlock = latestBlock - this.finalityDepth;
    if (targetBlock < this.startBlock) {
      return;
    }
    await this.syncCultureRegistry(targetBlock);
    if (this.selfPlayArena) {
      await this.syncSelfPlayArena(targetBlock);
    }
  }

  private async syncCultureRegistry(targetBlock: number): Promise<void> {
    const checkpoint = this.store.getCheckpoint('CultureRegistry');
    const fromBlock = Math.max(this.startBlock, (checkpoint?.blockNumber ?? this.startBlock) - this.reorgBuffer);
    await this.syncContract(
      this.cultureRegistry,
      'CultureRegistry',
      fromBlock,
      targetBlock,
      (event) => this.handleCultureEvent(event)
    );
  }

  private async syncSelfPlayArena(targetBlock: number): Promise<void> {
    if (!this.selfPlayArena) return;
    const checkpoint = this.store.getCheckpoint('SelfPlayArena');
    const fromBlock = Math.max(this.startBlock, (checkpoint?.blockNumber ?? this.startBlock) - this.reorgBuffer);
    await this.syncContract(
      this.selfPlayArena,
      'SelfPlayArena',
      fromBlock,
      targetBlock,
      (event) => this.handleArenaEvent(event)
    );
  }

  private async syncContract(
    contract: Contract,
    name: string,
    fromBlock: number,
    toBlock: number,
    handler: (event: EventLog) => Promise<void>
  ): Promise<void> {
    if (toBlock < fromBlock) {
      return;
    }
    logger.debug({ name, fromBlock, toBlock }, 'Syncing contract');
    for (let start = fromBlock; start <= toBlock; start += this.blockBatchSize) {
      const end = Math.min(start + this.blockBatchSize - 1, toBlock);
      const events = await contract.queryFilter('*', start, end);
      events.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return a.blockNumber - b.blockNumber;
        }
        const aIndex = a.index ?? a.logIndex ?? 0;
        const bIndex = b.index ?? b.logIndex ?? 0;
        return aIndex - bIndex;
      });
      for (const event of events) {
        await handler(event as EventLog);
        const logIndex = event.index ?? event.logIndex ?? 0;
        this.store.updateCheckpoint(name, event.blockNumber, logIndex);
      }
    }
  }

  private async handleCultureEvent(event: EventLog): Promise<void> {
    const fragmentName = event.fragment?.name ?? event.topics?.[0];
    if (!fragmentName) return;
    if (fragmentName === 'ArtifactMinted') {
      const [artifactId, author, kind, cid, parentIdRaw] = event.args as unknown[];
      const block = await this.getBlock(event.blockNumber);
      const parentId = parentIdRaw ? BigInt(parentIdRaw).toString() : null;
      const normalizedParent = parentId === '0' ? null : parentId;
      await this.store.recordArtifact({
        id: BigInt(artifactId).toString(),
        author: String(author),
        kind: String(kind),
        cid: String(cid),
        parentId: normalizedParent,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash!,
        logIndex: event.index ?? event.logIndex ?? 0,
        timestamp: block.timestamp * 1000
      });
    } else if (fragmentName === 'ArtifactCited') {
      const [artifactId, citedArtifactId] = event.args as unknown[];
      await this.store.recordCitation({
        fromId: BigInt(artifactId).toString(),
        toId: BigInt(citedArtifactId).toString(),
        blockNumber: event.blockNumber,
        blockHash: event.blockHash!,
        logIndex: event.index ?? event.logIndex ?? 0
      });
    }
  }

  private async handleArenaEvent(event: EventLog): Promise<void> {
    const [matchId, artifactId, opponentId, resultRaw] = event.args as unknown[];
    const result = decodeArenaResult(Number(resultRaw)) as ArenaMatchResult;
    await this.store.recordArenaMatch({
      matchId: String(matchId),
      artifactId: BigInt(artifactId).toString(),
      opponentId: String(opponentId),
      result,
      blockNumber: event.blockNumber,
      blockHash: event.blockHash!,
      logIndex: event.index ?? event.logIndex ?? 0
    });
  }

  private async getBlock(blockNumber: number): Promise<BlockInfo> {
    const cached = this.blockCache.get(blockNumber);
    if (cached) return cached;
    const block = await this.provider.getBlock(blockNumber);
    if (!block) {
      throw new Error(`Unable to load block ${blockNumber}`);
    }
    const info: BlockInfo = { hash: block.hash!, timestamp: block.timestamp };
    this.blockCache.set(blockNumber, info);
    if (this.blockCache.size > 128) {
      const oldest = Math.min(...Array.from(this.blockCache.keys()));
      this.blockCache.delete(oldest);
    }
    return info;
  }
}
