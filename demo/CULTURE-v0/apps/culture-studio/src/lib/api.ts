const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:4005';
const indexerUrl = import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:4100/graphql';

export interface ArtifactInput {
  readonly title: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId?: number;
}

export async function createArtifact(input: ArtifactInput): Promise<void> {
  const id = Date.now();
  await fetch(indexerAdmin('/event'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'artifactMinted',
      payload: {
        id,
        author: '0xowner',
        kind: input.kind,
        cid: input.cid,
        parentId: input.parentId,
        timestamp: Date.now()
      }
    })
  });
  await fetch(indexerAdmin('/recompute'), { method: 'POST' });
}

export async function citeArtifact(id: number, citedId: number): Promise<void> {
  await fetch(indexerAdmin('/event'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'artifactCited', payload: { id, citedId } })
  });
}

function indexerAdmin(path: string): string {
  return indexerUrl.replace('/graphql', `/admin${path}`);
}

export interface Artifact {
  readonly id: number;
  readonly title: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId?: number;
  readonly cites: number[];
  readonly influence: number;
}

export async function fetchArtifacts(): Promise<Artifact[]> {
  const query = `
    query FetchArtifacts {
      artifacts {
        id
        kind
        cid
        parentId
        cites
        influence
      }
    }
  `;
  const response = await fetch(indexerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const { data } = await response.json();
  return (data?.artifacts ?? []).map((artifact: any) => ({
    id: artifact.id,
    title: deriveTitle(artifact.cid),
    kind: artifact.kind,
    cid: artifact.cid,
    parentId: artifact.parentId ?? undefined,
    cites: artifact.cites ?? [],
    influence: Number(artifact.influence ?? 0)
  }));
}

function deriveTitle(cid: string): string {
  if (!cid) return 'Untitled Artifact';
  return `Artifact ${cid.slice(0, 6)}…`;
}

export interface ArenaStartOptions {
  readonly artifactId: number;
  readonly studentCount: number;
}

export interface ArenaSummary {
  readonly roundId: number;
  readonly winners: string[];
  readonly difficulty: number;
  readonly observedSuccessRate: number;
  readonly difficultyDelta: number;
}

export async function launchArena(options: ArenaStartOptions): Promise<ArenaSummary> {
  const students = Array.from({ length: options.studentCount }, (_, idx) => `0xstudent${idx.toString().padStart(2, '0')}`);
  const validators = ['0xvalidator01', '0xvalidator02', '0xvalidator03'];
  const response = await fetch(`${orchestratorUrl}/arena/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artifactId: options.artifactId,
      teacher: '0xteacher',
      students,
      validators
    })
  });
  const { round } = await response.json();

  await fetch(`${orchestratorUrl}/arena/close/${round.id}`, { method: 'POST' });

  const winners = students.filter((_, idx) => idx % 2 === 0);
  const finalizeResponse = await fetch(`${orchestratorUrl}/arena/finalize/${round.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winners })
  });
  const summary = await finalizeResponse.json();
  return summary;
}

export interface ScoreboardResponse {
  readonly agents: Array<{ address: string; rating: number; wins: number; losses: number; role: string }>;
  readonly rounds: Array<{ id: number; difficulty: number; successRate: number; difficultyDelta: number; status: string }>;
  readonly currentDifficulty: number;
}

export async function fetchScoreboard(): Promise<ScoreboardResponse> {
  const response = await fetch(`${orchestratorUrl}/arena/scoreboard`);
  return response.json();
}
