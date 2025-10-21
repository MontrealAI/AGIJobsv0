export interface ArtifactInput {
  readonly id: number;
  readonly author: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId?: number;
  readonly timestamp: number;
}

export interface ArtifactView {
  readonly id: number;
  readonly author: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId?: number;
  readonly cites: readonly number[];
  readonly citedBy: readonly number[];
  readonly createdAt: number;
  readonly influence: number;
}

interface ArtifactNode {
  id: number;
  author: string;
  kind: string;
  cid: string;
  parentId?: number;
  cites: Set<number>;
  citedBy: Set<number>;
  createdAt: number;
}

const DAMPING_FACTOR = 0.85;
const MAX_ITERATIONS = 25;
const TOLERANCE = 1e-6;

export class GraphStore {
  private readonly artifacts = new Map<number, ArtifactNode>();
  private readonly influenceScores = new Map<number, number>();

  upsertArtifact(input: ArtifactInput): void {
    let node = this.artifacts.get(input.id);
    if (!node) {
      node = {
        id: input.id,
        author: input.author.toLowerCase(),
        kind: input.kind,
        cid: input.cid,
        parentId: input.parentId,
        cites: new Set(),
        citedBy: new Set(),
        createdAt: input.timestamp
      };
      this.artifacts.set(input.id, node);
    } else {
      node.author = input.author.toLowerCase();
      node.kind = input.kind;
      node.cid = input.cid;
      node.parentId = input.parentId;
      node.createdAt = input.timestamp;
    }
  }

  addCitation(artifactId: number, citedId: number): void {
    const source = this.artifacts.get(artifactId);
    const target = this.artifacts.get(citedId);
    if (!source || !target) {
      return;
    }
    source.cites.add(citedId);
    target.citedBy.add(artifactId);
  }

  listArtifacts(): ArtifactView[] {
    return Array.from(this.artifacts.values()).map((node) => this.toView(node));
  }

  getArtifact(id: number): ArtifactView | undefined {
    const node = this.artifacts.get(id);
    if (!node) return undefined;
    return this.toView(node);
  }

  getTopInfluential(limit = 10): ArtifactView[] {
    return this.listArtifacts()
      .sort((a, b) => b.influence - a.influence)
      .slice(0, limit);
  }

  getLineage(id: number): ArtifactView[] {
    const lineage: ArtifactView[] = [];
    let current = this.artifacts.get(id);
    const visited = new Set<number>();
    while (current && current.parentId && !visited.has(current.parentId)) {
      const parent = this.artifacts.get(current.parentId);
      if (!parent) break;
      lineage.push(this.toView(parent));
      visited.add(parent.id);
      current = parent;
    }
    return lineage;
  }

  recomputeInfluence(): void {
    const nodes = Array.from(this.artifacts.values());
    const N = nodes.length;
    if (N === 0) {
      return;
    }
    const baseScore = 1 / N;
    const scores = new Map<number, number>();
    for (const node of nodes) {
      scores.set(node.id, baseScore);
    }

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let delta = 0;
      for (const node of nodes) {
        let sum = 0;
        for (const incoming of node.citedBy) {
          const incomingNode = this.artifacts.get(incoming);
          if (!incomingNode) continue;
          const outDegree = incomingNode.cites.size;
          if (outDegree === 0) continue;
          sum += (scores.get(incoming) ?? baseScore) / outDegree;
        }
        const newScore = (1 - DAMPING_FACTOR) / N + DAMPING_FACTOR * sum;
        delta += Math.abs(newScore - (scores.get(node.id) ?? 0));
        scores.set(node.id, newScore);
      }
      if (delta < TOLERANCE) {
        break;
      }
    }

    let total = 0;
    for (const value of scores.values()) {
      total += value;
    }
    for (const [id, value] of scores.entries()) {
      this.influenceScores.set(id, value / total);
    }
  }

  private toView(node: ArtifactNode): ArtifactView {
    return {
      id: node.id,
      author: node.author,
      kind: node.kind,
      cid: node.cid,
      parentId: node.parentId,
      cites: Array.from(node.cites.values()),
      citedBy: Array.from(node.citedBy.values()),
      createdAt: node.createdAt,
      influence: this.influenceScores.get(node.id) ?? 0
    };
  }
}
