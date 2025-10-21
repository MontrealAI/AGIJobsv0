interface Artifact {
  id: string;
  author: string;
  kind: string;
  cid: string;
  createdAt: string;
  parentId?: string;
  cites: string[];
  influence: number;
}

interface ListParams {
  kind?: string;
  limit?: number;
  offset?: number;
}

export class ArtifactStore {
  private artifacts: Map<string, Artifact> = new Map();

  constructor() {
    // Seed with exemplar data to keep demo UI useful pre-integration.
    this.upsert({
      id: "1",
      author: "0xTeacher",
      kind: "book",
      cid: "bafybook1",
      createdAt: new Date().toISOString(),
      cites: [],
      influence: 0.42,
    });
    this.upsert({
      id: "2",
      author: "0xStudent",
      kind: "book",
      cid: "bafybook2",
      createdAt: new Date().toISOString(),
      parentId: "1",
      cites: ["1"],
      influence: 0.66,
    });
  }

  upsert(artifact: Artifact) {
    this.artifacts.set(artifact.id, artifact);
  }

  getArtifact(id: string): Artifact | null {
    return this.artifacts.get(id) ?? null;
  }

  listArtifacts(params: ListParams): Artifact[] {
    const values = Array.from(this.artifacts.values());
    const filtered = params.kind ? values.filter((a) => a.kind === params.kind) : values;
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 25;
    return filtered.slice(offset, offset + limit);
  }

  topInfluential(limit: number): Artifact[] {
    return Array.from(this.artifacts.values())
      .sort((a, b) => b.influence - a.influence)
      .slice(0, limit);
  }
}
