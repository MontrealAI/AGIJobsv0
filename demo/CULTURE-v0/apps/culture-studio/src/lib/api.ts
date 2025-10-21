const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:4005';
const indexerUrl = import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:4100/graphql';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson<T>(url: string, body: unknown, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    const raw = await response.text();
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Falling back for ${url}:`, error);
    return fallback;
  }
}

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`Falling back for ${url}:`, error);
    return fallback;
  }
}

export interface ArtifactInput {
  readonly title: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId?: number;
}

export interface Artifact {
  readonly id: number;
  readonly title: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId?: number;
  readonly cites: number[];
  readonly influence: number;
  readonly mintedAt?: string;
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
        mintedAt
      }
    }
  `;
  const fallback: Artifact[] = [
    {
      id: 1,
      kind: 'book',
      cid: 'bafybookdemo',
      title: 'Artifact bafybo…',
      cites: [],
      influence: 0.92
    }
  ];
  const response = await postJson<{ data?: { artifacts?: any[] } }>(
    indexerUrl,
    { query },
    { data: { artifacts: fallback } }
  );

  return (response.data?.artifacts ?? fallback).map((artifact: any) => ({
    id: Number(artifact.id),
    title: deriveTitle(artifact.cid),
    kind: artifact.kind ?? 'book',
    cid: artifact.cid ?? '',
    parentId: artifact.parentId ?? undefined,
    cites: artifact.cites ?? [],
    influence: Number(artifact.influence ?? 0),
    mintedAt: artifact.mintedAt ?? undefined
  }));
}

function deriveTitle(cid: string): string {
  if (!cid) return 'Untitled Artifact';
  return `Artifact ${cid.slice(0, 6)}…`;
}

export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface StreamRequest {
  readonly prompt: string;
  readonly context?: string[];
  readonly persona?: string;
}

export async function* streamLLMCompletion(request: StreamRequest): AsyncGenerator<string> {
  const fallback = {
    segments: [
      'Let\'s sketch an inviting outline that explains the cultural playbook in clear language. ',
      'We will cover goals, personas, workflows, and checkpoints readers can copy immediately. '
    ]
  };

  const response = await postJson<{ segments: string[] }>(
    `${orchestratorUrl}/llm/generate`,
    request,
    fallback
  );

  for (const segment of response.segments) {
    await delay(120);
    yield segment;
  }
}

export interface IpfsUploadResult {
  readonly cid: string;
  readonly bytes: number;
}

export async function uploadToIpfs(content: string): Promise<IpfsUploadResult> {
  const fallbackCid = `bafy${Math.random().toString(36).slice(2, 10)}`;
  const fallback: IpfsUploadResult = { cid: fallbackCid, bytes: new TextEncoder().encode(content).length };

  return postJson<IpfsUploadResult>(
    `${orchestratorUrl}/ipfs/upload`,
    { content },
    fallback
  );
}

export interface MintResult {
  readonly artifactId: number;
  readonly transactionHash: string;
}

export async function mintCultureArtifact(input: ArtifactInput): Promise<MintResult> {
  const fallback: MintResult = {
    artifactId: Math.floor(Math.random() * 10_000),
    transactionHash: generateTxHash()
  };

  return postJson<MintResult>(
    `${orchestratorUrl}/culture/mint`,
    input,
    fallback
  );
}

export interface DerivativeJobResult {
  readonly jobId: string;
  readonly title: string;
}

export async function createDerivativeJob(artifactId: number): Promise<DerivativeJobResult> {
  const fallback: DerivativeJobResult = {
    jobId: `job-${artifactId}-${Date.now()}`,
    title: `Follow-on evaluation for artifact ${artifactId}`
  };

  return postJson<DerivativeJobResult>(
    `${orchestratorUrl}/jobs/derive`,
    { artifactId },
    fallback
  );
}

export interface ArenaStartOptions {
  readonly artifactId: number;
  readonly studentCount: number;
  readonly difficultyTarget?: number;
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
  const { round } = await postJson<{ round: { id: number } }>(
    `${orchestratorUrl}/arena/start`,
    {
      artifactId: options.artifactId,
      targetDifficulty: options.difficultyTarget ?? null,
      teacher: '0xteacher',
      students,
      validators
    },
    { round: { id: Date.now() } }
  );

  await postJson(`${orchestratorUrl}/arena/close/${round.id}`, {}, { ok: true });

  const winners = students.filter((_, idx) => idx % 2 === 0);
  const summary = await postJson<ArenaSummary>(
    `${orchestratorUrl}/arena/finalize/${round.id}`,
    { winners },
    {
      roundId: round.id,
      winners,
      difficulty: options.difficultyTarget ?? 0.65,
      observedSuccessRate: 0.58,
      difficultyDelta: 0.05
    }
  );

  return summary;
}

export interface ScoreboardAgent {
  readonly address: string;
  readonly rating: number;
  readonly wins: number;
  readonly losses: number;
  readonly role: string;
}

export interface ScoreboardRound {
  readonly id: number;
  readonly difficulty: number;
  readonly successRate: number;
  readonly difficultyDelta: number;
  readonly status: string;
  readonly startedAt?: string;
}

export interface OwnerControlState {
  readonly paused: boolean;
  readonly autoDifficulty: boolean;
  readonly maxConcurrentJobs: number;
  readonly targetSuccessRate: number;
}

export interface ScoreboardResponse {
  readonly agents: ScoreboardAgent[];
  readonly rounds: ScoreboardRound[];
  readonly currentDifficulty: number;
  readonly currentSuccessRate: number;
  readonly ownerControls: OwnerControlState;
}

export async function fetchScoreboard(): Promise<ScoreboardResponse> {
  const fallbackRounds: ScoreboardRound[] = [
    { id: 101, difficulty: 0.62, successRate: 0.54, difficultyDelta: 0.04, status: 'completed' },
    { id: 102, difficulty: 0.66, successRate: 0.59, difficultyDelta: 0.03, status: 'completed' }
  ];
  const fallback: ScoreboardResponse = {
    agents: [
      { address: '0xteacher', rating: 1620, wins: 24, losses: 6, role: 'teacher' },
      { address: '0xstudent00', rating: 1488, wins: 12, losses: 14, role: 'student' }
    ],
    rounds: fallbackRounds,
    currentDifficulty: fallbackRounds.at(-1)?.difficulty ?? 0.6,
    currentSuccessRate: fallbackRounds.at(-1)?.successRate ?? 0.6,
    ownerControls: {
      paused: false,
      autoDifficulty: true,
      maxConcurrentJobs: 3,
      targetSuccessRate: 0.6
    }
  };

  return getJson<ScoreboardResponse>(`${orchestratorUrl}/arena/scoreboard`, fallback);
}

export interface TelemetrySeriesPoint {
  readonly label: string;
  readonly value: number;
}

export interface ArenaTelemetry {
  readonly scoreboard: ScoreboardResponse;
  readonly difficultyTrend: TelemetrySeriesPoint[];
  readonly successTrend: TelemetrySeriesPoint[];
}

export function buildTelemetry(scoreboard: ScoreboardResponse): ArenaTelemetry {
  const rounds = scoreboard.rounds.slice(-8);
  const difficultyTrend = rounds.map((round) => ({ label: `#${round.id}`, value: round.difficulty }));
  const successTrend = rounds.map((round) => ({ label: `#${round.id}`, value: round.successRate }));
  return {
    scoreboard,
    difficultyTrend,
    successTrend
  };
}

export async function updateOwnerControls(update: Partial<OwnerControlState>): Promise<OwnerControlState> {
  const fallback = {
    paused: update.paused ?? false,
    autoDifficulty: update.autoDifficulty ?? true,
    maxConcurrentJobs: update.maxConcurrentJobs ?? 3,
    targetSuccessRate: update.targetSuccessRate ?? 0.6
  } satisfies OwnerControlState;

  return postJson<OwnerControlState>(`${orchestratorUrl}/arena/controls`, update, fallback);
}

function generateTxHash(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `0x${crypto.randomUUID().replace(/-/g, '').slice(0, 64)}`;
  }
  return `0x${Math.random().toString(16).slice(2).padEnd(64, '0')}`;
}
