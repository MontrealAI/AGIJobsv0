import { Interface, JsonRpcProvider, Log } from 'ethers';
import type { PrismaClient } from '@prisma/client';
import { cultureRegistryAbi, selfPlayArenaAbi } from '../contracts.js';
import { InfluenceService } from './influence-service.js';
import type {
  ArtifactCitedEvent,
  ArtifactMintedEvent,
  RoundFinalizedEvent,
} from './types.js';

export interface EventIngestionConfig {
  readonly rpcUrl?: string;
  readonly cultureRegistryAddress?: string;
  readonly selfPlayArenaAddress?: string;
  readonly pollIntervalMs?: number;
  readonly blockBatchSize?: number;
  readonly finalityDepth?: number;
}

export class EventIngestionService {
  private provider: JsonRpcProvider | null = null;
  private readonly cultureInterface = new Interface(cultureRegistryAbi);
  private readonly arenaInterface = new Interface(selfPlayArenaAbi);
  private readonly artifactMintedTopic: string;
  private readonly artifactCitedTopic: string;
  private readonly roundFinalizedTopic: string;
  private backfillInFlight: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly influence: InfluenceService,
    private readonly config: EventIngestionConfig
  ) {
    const minted = this.cultureInterface.getEvent('ArtifactMinted');
    const cited = this.cultureInterface.getEvent('ArtifactCited');
    const finalized = this.arenaInterface.getEvent('RoundFinalized');
    if (!minted || !cited || !finalized) {
      throw new Error('Culture graph ABI is missing required events');
    }
    this.artifactMintedTopic = minted.topicHash;
    this.artifactCitedTopic = cited.topicHash;
    this.roundFinalizedTopic = finalized.topicHash;
  }

  async start(): Promise<void> {
    if (!this.config.rpcUrl || !this.config.cultureRegistryAddress) {
      return;
    }

    this.provider = new JsonRpcProvider(this.config.rpcUrl);

    if (this.config.pollIntervalMs) {
      this.provider.pollingInterval = this.config.pollIntervalMs;
    }

    await this.backfillHistoricalEvents();

    const mintedFilter = {
      address: this.config.cultureRegistryAddress,
      topics: [this.artifactMintedTopic],
    };
    const citedFilter = {
      address: this.config.cultureRegistryAddress,
      topics: [this.artifactCitedTopic],
    };

    this.provider.on(mintedFilter, async (log) => {
      try {
        const event = await this.parseArtifactMinted(log);
        await this.handleArtifactMinted(event);
      } catch (error) {
        console.error('Failed to handle ArtifactMinted event', error);
      }
    });

    this.provider.on(citedFilter, async (log) => {
      try {
        const event = await this.parseArtifactCited(log);
        await this.handleArtifactCited(event);
      } catch (error) {
        console.error('Failed to handle ArtifactCited event', error);
      }
    });

    if (this.config.selfPlayArenaAddress) {
      const finalizedFilter = {
        address: this.config.selfPlayArenaAddress,
        topics: [this.roundFinalizedTopic],
      };
      this.provider.on(finalizedFilter, async (log) => {
        try {
          const event = await this.parseRoundFinalized(log);
          await this.handleRoundFinalized(event);
        } catch (error) {
          console.error('Failed to handle RoundFinalized event', error);
        }
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.provider) {
      return;
    }

    this.provider.removeAllListeners();
    this.provider = null;
  }

  async handleArtifactMinted(event: ArtifactMintedEvent): Promise<void> {
    await this.prisma.artifact.upsert({
      where: { id: event.artifactId },
      update: {
        author: event.author,
        kind: event.kind,
        cid: event.cid,
        parentId: event.parentId,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        logIndex: event.logIndex,
        timestamp: event.timestamp,
      },
      create: {
        id: event.artifactId,
        author: event.author,
        kind: event.kind,
        cid: event.cid,
        parentId: event.parentId,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        logIndex: event.logIndex,
        timestamp: event.timestamp,
      },
    });

    await this.recordCursor(event.blockNumber, event.logIndex);
    const affected = [event.artifactId, event.parentId ?? undefined].filter(
      (value): value is string => typeof value === 'string'
    );
    await this.influence.recompute(affected);
  }

  async handleArtifactCited(event: ArtifactCitedEvent): Promise<void> {
    await this.prisma.citation.upsert({
      where: {
        fromId_toId_blockNumber_logIndex: {
          fromId: event.fromArtifactId,
          toId: event.toArtifactId,
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
        },
      },
      update: {
        blockHash: event.blockHash,
      },
      create: {
        fromId: event.fromArtifactId,
        toId: event.toArtifactId,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        logIndex: event.logIndex,
      },
    });

    await this.recordCursor(event.blockNumber, event.logIndex);
    await this.influence.recompute([event.fromArtifactId, event.toArtifactId]);
  }

  async handleRoundFinalized(event: RoundFinalizedEvent): Promise<void> {
    await this.prisma.roundFinalization.upsert({
      where: {
        roundId_blockNumber_logIndex: {
          roundId: event.roundId,
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
        },
      },
      update: {
        previousDifficulty: event.previousDifficulty,
        difficultyDelta: event.difficultyDelta,
        newDifficulty: event.newDifficulty,
        finalizedAt: event.finalizedAt,
        blockHash: event.blockHash,
      },
      create: {
        roundId: event.roundId,
        previousDifficulty: event.previousDifficulty,
        difficultyDelta: event.difficultyDelta,
        newDifficulty: event.newDifficulty,
        finalizedAt: event.finalizedAt,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        logIndex: event.logIndex,
      },
    });

    await this.recordCursor(event.blockNumber, event.logIndex);
  }

  private async recordCursor(blockNumber: number, logIndex: number): Promise<void> {
    await this.prisma.eventCursor.upsert({
      where: { id: 1 },
      create: {
        blockNumber,
        logIndex,
      },
      update: {
        blockNumber,
        logIndex,
      },
    });
  }

  private async purgeOrphanedRecords(startingBlock: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.citation.deleteMany({
        where: { blockNumber: { gte: startingBlock } },
      }),
      this.prisma.roundFinalization.deleteMany({
        where: { blockNumber: { gte: startingBlock } },
      }),
      this.prisma.artifact.deleteMany({
        where: { blockNumber: { gte: startingBlock } },
      }),
      this.prisma.eventCursor.upsert({
        where: { id: 1 },
        create: {
          blockNumber: startingBlock,
          logIndex: -1,
        },
        update: {
          blockNumber: startingBlock,
          logIndex: -1,
        },
      }),
    ]);

    await this.influence.recompute();
  }

  private async parseArtifactMinted(log: Log): Promise<ArtifactMintedEvent> {
    if (!this.provider) {
      throw new Error('Provider not initialised');
    }
    const parsed = this.cultureInterface.parseLog(log);
    if (!parsed) {
      throw new Error('Unable to parse ArtifactMinted log');
    }
    const block = await this.provider.getBlock(log.blockNumber);
    const timestamp = block ? new Date(Number(block.timestamp) * 1000) : new Date();
    const parentValue = parsed.args.parentId as bigint;

    return {
      artifactId: (parsed.args.artifactId as bigint).toString(),
      author: parsed.args.author as string,
      kind: parsed.args.kind as string,
      cid: parsed.args.cid as string,
      parentId: parentValue === 0n ? null : parentValue.toString(),
      blockNumber: Number(log.blockNumber),
      blockHash: log.blockHash ?? '',
      logIndex: Number(log.index ?? 0),
      timestamp,
    };
  }

  private async parseArtifactCited(log: Log): Promise<ArtifactCitedEvent> {
    const parsed = this.cultureInterface.parseLog(log);
    if (!parsed) {
      throw new Error('Unable to parse ArtifactCited log');
    }
    return {
      fromArtifactId: (parsed.args.artifactId as bigint).toString(),
      toArtifactId: (parsed.args.citedArtifactId as bigint).toString(),
      blockNumber: Number(log.blockNumber),
      blockHash: log.blockHash ?? '',
      logIndex: Number(log.index ?? 0),
    };
  }

  private async parseRoundFinalized(log: Log): Promise<RoundFinalizedEvent> {
    const parsed = this.arenaInterface.parseLog(log);
    if (!parsed) {
      throw new Error('Unable to parse RoundFinalized log');
    }
    const finalizedAtSeconds = parsed.args.finalizedAt as bigint;
    return {
      roundId: (parsed.args.roundId as bigint).toString(),
      previousDifficulty: Number(parsed.args.previousDifficulty),
      difficultyDelta: Number(parsed.args.difficultyDelta),
      newDifficulty: Number(parsed.args.newDifficulty),
      finalizedAt: new Date(Number(finalizedAtSeconds) * 1000),
      blockNumber: Number(log.blockNumber),
      blockHash: log.blockHash ?? '',
      logIndex: Number(log.index ?? 0),
    };
  }

  async backfillHistoricalEvents(options: { force?: boolean } = {}): Promise<void> {
    if (this.backfillInFlight) {
      await this.backfillInFlight;
      return;
    }

    this.backfillInFlight = this.performBackfill(options).finally(() => {
      this.backfillInFlight = null;
    });

    await this.backfillInFlight;
  }

  private async performBackfill(options: { force?: boolean }): Promise<void> {
    if (!this.provider || !this.config.cultureRegistryAddress) {
      return;
    }

    const cursor = await this.prisma.eventCursor.findUnique({ where: { id: 1 } });
    const reorgBuffer = this.config.finalityDepth ?? 0;
    const batchSize = this.config.blockBatchSize ?? 1_000;
    const latestBlock = await this.provider.getBlockNumber();
    const targetBlock = Math.max(latestBlock - reorgBuffer, 0);

    const startingBlock = cursor
      ? Math.max(cursor.blockNumber - reorgBuffer, 0)
      : 0;

    if (startingBlock > targetBlock) {
      return;
    }

    const shouldSkipDuplicates = !options.force && !reorgBuffer && cursor;
    const cultureAddress = this.config.cultureRegistryAddress.toLowerCase();
    const arenaAddress = this.config.selfPlayArenaAddress?.toLowerCase();

    if (cursor && (options.force || reorgBuffer > 0)) {
      await this.purgeOrphanedRecords(startingBlock);
    }

    for (let fromBlock = startingBlock; fromBlock <= targetBlock; fromBlock += batchSize) {
      const toBlock = Math.min(fromBlock + batchSize - 1, targetBlock);

      const mintedLogs = await this.provider.getLogs({
        address: this.config.cultureRegistryAddress,
        topics: [this.artifactMintedTopic],
        fromBlock,
        toBlock,
      });

      const citedLogs = await this.provider.getLogs({
        address: this.config.cultureRegistryAddress,
        topics: [this.artifactCitedTopic],
        fromBlock,
        toBlock,
      });

      const finalizedLogs = arenaAddress
        ? await this.provider.getLogs({
            address: this.config.selfPlayArenaAddress,
            topics: [this.roundFinalizedTopic],
            fromBlock,
            toBlock,
          })
        : [];

      const orderedLogs = [
        ...mintedLogs.map((log) => ({ kind: 'minted' as const, log })),
        ...citedLogs.map((log) => ({ kind: 'cited' as const, log })),
        ...finalizedLogs.map((log) => ({ kind: 'finalized' as const, log })),
      ].sort((a, b) => {
        const blockDelta = Number(a.log.blockNumber ?? 0) - Number(b.log.blockNumber ?? 0);
        if (blockDelta !== 0) {
          return blockDelta;
        }
        return Number(a.log.index ?? 0) - Number(b.log.index ?? 0);
      });

      for (const { kind, log } of orderedLogs) {
        const blockNumber = Number(log.blockNumber ?? 0);
        const logIndex = Number(log.index ?? 0);

        if (shouldSkipDuplicates && blockNumber === cursor?.blockNumber && logIndex <= (cursor?.logIndex ?? -1)) {
          continue;
        }

        try {
          if (kind === 'minted') {
            const event = await this.parseArtifactMinted(log);
            await this.handleArtifactMinted(event);
          } else if (kind === 'cited') {
            const event = await this.parseArtifactCited(log);
            await this.handleArtifactCited(event);
          } else if (kind === 'finalized' && arenaAddress && log.address?.toLowerCase() === arenaAddress) {
            const event = await this.parseRoundFinalized(log);
            await this.handleRoundFinalized(event);
          }
        } catch (error) {
          console.error('Failed to backfill log', error);
        }
      }
    }
  }
}
