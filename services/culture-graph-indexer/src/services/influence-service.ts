import { Artifact, Citation, Prisma, PrismaClient } from '@prisma/client';
import type {
  InfluenceValidationGraph,
  InfluenceValidationReport,
  InfluenceValidator,
} from './networkx-validator.js';

export interface InfluenceComputationConfig {
  readonly dampingFactor?: number;
  readonly maxIterations?: number;
  readonly tolerance?: number;
}

export interface InfluenceComputationResult {
  readonly scores: Map<string, number>;
  readonly citationCounts: Map<string, number>;
  readonly lineageDepths: Map<string, number>;
}

export class InfluenceService {
  private readonly dampingFactor: number;
  private readonly maxIterations: number;
  private readonly tolerance: number;
  private readonly validator: InfluenceValidator | null;
  private lastValidationReport: InfluenceValidationReport | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    config: InfluenceComputationConfig = {},
    validator?: InfluenceValidator | null
  ) {
    this.dampingFactor = config.dampingFactor ?? 0.85;
    this.maxIterations = config.maxIterations ?? 25;
    this.tolerance = config.tolerance ?? 1e-6;
    this.validator = validator ?? null;
  }

  async recompute(_affectedArtifacts?: readonly string[]): Promise<InfluenceComputationResult | null> {
    const artifacts = await this.prisma.artifact.findMany({
      include: {
        citationsFrom: { select: { toId: true } },
        citationsTo: { select: { fromId: true } },
        influence: true,
      },
      orderBy: { id: 'asc' },
    });

    if (artifacts.length === 0) {
      return null;
    }

    const scores = this.computePageRank(artifacts);
    const citationCounts = this.computeCitationCounts(artifacts);
    const lineageDepths = this.computeLineageDepths(artifacts);

    await this.persistMetrics(artifacts, scores, citationCounts, lineageDepths);

    await this.runValidation(artifacts, scores);

    return { scores, citationCounts, lineageDepths };
  }

  getLastValidation(): InfluenceValidationReport | null {
    return this.lastValidationReport;
  }

  private computePageRank(artifacts: ArtifactWithGraph[]): Map<string, number> {
    const damping = this.dampingFactor;
    const totalNodes = artifacts.length;
    const teleport = (1 - damping) / totalNodes;

    const previousScores = new Map<string, number>();
    const outgoingCounts = new Map<string, number>();
    const inboundEdges = new Map<string, string[]>();

    for (const artifact of artifacts) {
      previousScores.set(artifact.id, artifact.influence?.score ?? 1 / totalNodes);
      outgoingCounts.set(artifact.id, artifact.citationsFrom.length);
      inboundEdges.set(
        artifact.id,
        artifact.citationsTo.map((citation) => citation.fromId)
      );
    }

    let currentScores = new Map(previousScores);

    for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
      const nextScores = new Map<string, number>();
      let difference = 0;

      const danglingSum = this.computeDanglingSum(currentScores, outgoingCounts);
      for (const artifact of artifacts) {
        const inbound = inboundEdges.get(artifact.id) ?? [];
        let influence = 0;
        for (const sourceId of inbound) {
          const sourceScore = currentScores.get(sourceId) ?? 0;
          const outbound = outgoingCounts.get(sourceId) ?? 0;
          if (outbound === 0) {
            continue;
          }
          influence += sourceScore / outbound;
        }

        const distributedDangling = danglingSum / totalNodes;
        const newScore = teleport + damping * (influence + distributedDangling);
        difference += Math.abs(newScore - (currentScores.get(artifact.id) ?? 0));
        nextScores.set(artifact.id, newScore);
      }

      currentScores = nextScores;
      if (difference < this.tolerance) {
        break;
      }
    }

    return currentScores;
  }

  private computeDanglingSum(scores: Map<string, number>, outgoingCounts: Map<string, number>): number {
    let sum = 0;
    for (const [artifactId, score] of scores.entries()) {
      const outgoing = outgoingCounts.get(artifactId) ?? 0;
      if (outgoing === 0) {
        sum += score;
      }
    }
    return sum;
  }

  private computeCitationCounts(artifacts: ArtifactWithGraph[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const artifact of artifacts) {
      counts.set(artifact.id, artifact.citationsTo.length);
    }
    return counts;
  }

  private computeLineageDepths(artifacts: ArtifactWithGraph[]): Map<string, number> {
    const parents = new Map<string, string | null>();
    for (const artifact of artifacts) {
      parents.set(artifact.id, artifact.parentId ?? null);
    }

    const cache = new Map<string, number>();
    const visiting = new Set<string>();

    const depthFor = (artifactId: string): number => {
      if (cache.has(artifactId)) {
        return cache.get(artifactId)!;
      }
      if (visiting.has(artifactId)) {
        return 0;
      }
      visiting.add(artifactId);
      const parentId = parents.get(artifactId);
      const depth = parentId ? depthFor(parentId) + 1 : 0;
      visiting.delete(artifactId);
      cache.set(artifactId, depth);
      return depth;
    };

    for (const artifact of artifacts) {
      depthFor(artifact.id);
    }

    return cache;
  }

  private async persistMetrics(
    artifacts: ArtifactWithGraph[],
    scores: Map<string, number>,
    citationCounts: Map<string, number>,
    lineageDepths: Map<string, number>
  ): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    for (const artifact of artifacts) {
      const score = scores.get(artifact.id) ?? 0;
      const citationCount = citationCounts.get(artifact.id) ?? 0;
      const lineageDepth = lineageDepths.get(artifact.id) ?? 0;

      operations.push(
        this.prisma.influenceMetric.upsert({
          where: { artifactId: artifact.id },
          create: {
            artifactId: artifact.id,
            score,
            citationCount,
            lineageDepth,
          },
          update: {
            score,
            citationCount,
            lineageDepth,
          },
        })
      );
    }

    await this.prisma.$transaction(operations);
  }

  private async runValidation(
    artifacts: ArtifactWithGraph[],
    scores: Map<string, number>
  ): Promise<void> {
    if (!this.validator) {
      this.lastValidationReport = null;
      return;
    }

    const graph: InfluenceValidationGraph = {
      nodes: artifacts.map((artifact) => artifact.id),
      edges: artifacts.flatMap((artifact) =>
        artifact.citationsFrom.map((citation) => [artifact.id, citation.toId] as [string, string])
      ),
    };

    let report: InfluenceValidationReport;
    try {
      report = await this.validator.validate(graph, scores, {
        dampingFactor: this.dampingFactor,
        maxIterations: this.maxIterations,
        tolerance: this.tolerance,
      });
    } catch (error) {
      this.lastValidationReport = {
        ok: false,
        skipped: true,
        engine: null,
        maxDelta: 0,
        externalScores: null,
        error: error instanceof Error ? error.message : 'Unknown influence validation error',
      };
      if (error instanceof Error) {
        console.warn('Influence validation skipped:', error.message);
      } else {
        console.warn('Influence validation skipped due to unknown error');
      }
      return;
    }

    this.lastValidationReport = report;

    if (!report.skipped && !report.ok) {
      throw new Error(report.error ?? 'Influence validation failed');
    }
  }
}

interface ArtifactWithGraph extends Artifact {
  readonly citationsFrom: readonly Pick<Citation, 'toId'>[];
  readonly citationsTo: readonly Pick<Citation, 'fromId'>[];
  readonly influence: { score: number } | null;
  readonly parentId: string | null;
}
