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
  private backfillRequested = false;
  private forceRequested = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly influence: InfluenceService,
    private readonly config: EventIngestionConfig,
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

    try {
      // Use one ordered, finality-aware stream for historical and live events.
      // Independent log callbacks can race and advance past a failed earlier event.
      await this.provider.on('block', async () => {
        try {
          await this.backfillHistoricalEvents();
        } catch (error) {
          console.error(
            'Failed to ingest confirmed block; replay will retry',
            error,
          );
        }
      });
      await this.backfillHistoricalEvents();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const provider = this.provider;
    if (!provider) return;
    await provider.removeAllListeners();
    try {
      await this.backfillInFlight;
    } catch {
      // Preserve the failed-event cursor; shutdown still releases the RPC connection.
    } finally {
      provider.destroy();
      this.provider = null;
    }
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

    const affected = [event.artifactId, event.parentId ?? undefined].filter(
      (value): value is string => typeof value === 'string',
    );
    await this.influence.recompute(affected);
    await this.recordCursor(event.blockNumber, event.logIndex);
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

    await this.influence.recompute([event.fromArtifactId, event.toArtifactId]);
    await this.recordCursor(event.blockNumber, event.logIndex);
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

  private async recordCursor(
    blockNumber: number,
    logIndex: number,
  ): Promise<void> {
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

  private async parseArtifactMinted(log: Log): Promise<ArtifactMintedEvent> {
    if (!this.provider) {
      throw new Error('Provider not initialised');
    }
    const parsed = this.cultureInterface.parseLog(log);
    if (!parsed) {
      throw new Error('Unable to parse ArtifactMinted log');
    }
    const block = await this.provider.getBlock(log.blockNumber);
    if (!block) throw new Error('Event block unavailable; replay must retry');
    if (block.hash && log.blockHash && block.hash !== log.blockHash) {
      throw new Error('Event block changed; replay must retry');
    }
    const timestamp = new Date(Number(block.timestamp) * 1000);
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

  async backfillHistoricalEvents(
    options: { force?: boolean } = {},
  ): Promise<void> {
    this.backfillRequested = true;
    this.forceRequested ||= options.force === true;
    if (!this.backfillInFlight) {
      this.backfillInFlight = (async () => {
        do {
          const force = this.forceRequested;
          this.backfillRequested = false;
          this.forceRequested = false;
          await this.performBackfill({ force });
        } while (this.backfillRequested);
      })().finally(() => {
        this.backfillInFlight = null;
      });
    }
    await this.backfillInFlight;
  }

  private async performBackfill(options: { force?: boolean }): Promise<void> {
    if (!this.provider || !this.config.cultureRegistryAddress) {
      return;
    }

    const cursor = await this.prisma.eventCursor.findUnique({
      where: { id: 1 },
    });
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

    for (
      let fromBlock = startingBlock;
      fromBlock <= targetBlock;
      fromBlock += batchSize
    ) {
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
        const blockDelta =
          Number(a.log.blockNumber ?? 0) - Number(b.log.blockNumber ?? 0);
        if (blockDelta !== 0) {
          return blockDelta;
        }
        return Number(a.log.index ?? 0) - Number(b.log.index ?? 0);
      });

      for (const { kind, log } of orderedLogs) {
        const blockNumber = Number(log.blockNumber ?? 0);
        const logIndex = Number(log.index ?? 0);

        if (
          shouldSkipDuplicates &&
          blockNumber === cursor?.blockNumber &&
          logIndex <= (cursor?.logIndex ?? -1)
        ) {
          continue;
        }

        try {
          if (kind === 'minted') {
            const event = await this.parseArtifactMinted(log);
            await this.handleArtifactMinted(event);
          } else if (kind === 'cited') {
            const event = await this.parseArtifactCited(log);
            await this.handleArtifactCited(event);
          } else if (
            kind === 'finalized' &&
            arenaAddress &&
            log.address?.toLowerCase() === arenaAddress
          ) {
            const event = await this.parseRoundFinalized(log);
            await this.handleRoundFinalized(event);
          }
        } catch (error) {
          console.error('Failed to backfill log', error);
          // Do not advance beyond a failed event: the next attempt must replay it.
          throw error;
        }
      }
    }
  }
}
