import {
  previewArtifacts,
  previewDraft,
  previewUpload,
  previewMint,
  previewJob,
  previewArena,
  previewScoreboard,
  previewControls,
} from './preview.js';
const orchestratorUrl = (
  import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:4005'
).replace(/\/+$/, '');
const indexerUrl =
  import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:4100/graphql';
export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true';
}
let serviceToken = '';
export function setServiceToken(token: string): void {
  serviceToken = token.trim();
}

async function requestJson<T>(url: string, body?: unknown): Promise<T> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      signal: abort.signal,
      redirect: 'error',
      credentials: 'omit',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(serviceToken &&
        new URL(url).origin === new URL(orchestratorUrl).origin &&
        url.startsWith(`${orchestratorUrl}/`)
          ? { Authorization: `Bearer ${serviceToken}` }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new Error(
        `Request failed (HTTP ${response.status}). Check service configuration and operator access.`,
      );
    const raw = await response.text();
    if (!raw) throw new Error('Service returned an empty response.');
    return JSON.parse(raw) as T;
  } finally {
    clearTimeout(timeout);
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

export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface StreamRequest {
  readonly prompt: string;
  readonly context?: string[];
  readonly persona?: string;
}

export interface IpfsUploadResult {
  readonly cid: string;
  readonly bytes: number;
}

export interface MintResult {
  readonly artifactId: number;
  readonly transactionHash: string;
}

export interface DerivativeJobResult {
  readonly jobId: string;
  readonly title: string;
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

export interface TelemetrySeriesPoint {
  readonly label: string;
  readonly value: number;
}

export interface ArenaTelemetry {
  readonly scoreboard: ScoreboardResponse;
  readonly difficultyTrend: TelemetrySeriesPoint[];
  readonly successTrend: TelemetrySeriesPoint[];
}

export interface ServiceCapabilities {
  mode: 'local-adapters' | 'hybrid-on-chain';
  generation: boolean;
  upload: boolean;
  mint: boolean;
  derivativeJobs: boolean;
  ownerControls: boolean;
}
export async function fetchCapabilities(): Promise<ServiceCapabilities> {
  return requestJson<ServiceCapabilities>(`${orchestratorUrl}/capabilities`);
}
function safeId(value: unknown): number {
  const id = Number(value);
  if (value === null || value === '' || !Number.isSafeInteger(id) || id < 1)
    throw new Error('Service returned an invalid artifact ID.');
  return id;
}
export async function fetchArtifacts(): Promise<Artifact[]> {
  if (isDemoMode()) return previewArtifacts();
  const response = await requestJson<{
    errors?: unknown[];
    data?: {
      artifacts?: {
        id: unknown;
        kind?: string;
        cid?: string;
        parentId?: unknown;
        citations?: { to: { id: unknown } }[];
        influence?: number;
        mintedAt?: string;
      }[];
    };
  }>(indexerUrl, {
    query:
      'query FetchArtifacts { artifacts { id kind cid parentId citations { to { id } } influence: influenceScore mintedAt: timestamp } }',
  });
  if (response.errors?.length || !Array.isArray(response.data?.artifacts))
    throw new Error(
      'Indexer returned no artifact data or GraphQL errors. Check its configuration.',
    );
  return response.data.artifacts.map((artifact) => {
    const influence = Number(artifact.influence ?? 0);
    if (!Number.isFinite(influence) || influence < 0)
      throw new Error('Indexer returned invalid influence.');
    return {
      id: safeId(artifact.id),
      title: artifact.cid
        ? `Artifact ${artifact.cid.slice(0, 12)}…`
        : 'Untitled Artifact',
      kind: artifact.kind ?? 'book',
      cid: artifact.cid ?? '',
      parentId:
        artifact.parentId == null ? undefined : safeId(artifact.parentId),
      cites:
        artifact.citations?.map((citation) => safeId(citation.to.id)) ?? [],
      influence,
      mintedAt: artifact.mintedAt,
    };
  });
}
export async function* streamLLMCompletion(
  request: StreamRequest,
): AsyncGenerator<string> {
  const response = isDemoMode()
    ? { segments: previewDraft(request) }
    : await requestJson<{ segments: string[] }>(
        `${orchestratorUrl}/llm/generate`,
        request,
      );
  for (const segment of response.segments) {
    yield segment;
  }
}
export async function uploadToIpfs(content: string): Promise<IpfsUploadResult> {
  return isDemoMode()
    ? previewUpload(content)
    : requestJson(`${orchestratorUrl}/ipfs/upload`, { content });
}
export async function mintCultureArtifact(
  input: ArtifactInput,
): Promise<MintResult> {
  return isDemoMode()
    ? previewMint(input)
    : requestJson(`${orchestratorUrl}/culture/mint`, input);
}
export async function createDerivativeJob(
  artifactId: number,
): Promise<DerivativeJobResult> {
  return isDemoMode()
    ? previewJob(artifactId)
    : requestJson(`${orchestratorUrl}/jobs/derive`, { artifactId });
}
export async function launchArena(
  options: ArenaStartOptions,
): Promise<ArenaSummary> {
  if (!isDemoMode())
    throw new Error(
      'Automatic fixture rounds are preview-only. Use the explicit service lifecycle controls.',
    );
  return previewArena(options);
}
export interface ServiceRound {
  id: number;
  status: string;
  difficulty: number;
  teacher: { address: string; status: string };
  students: { address: string; status: string }[];
  validators: { address: string; status: string }[];
}
export async function startServiceRound(input: {
  artifactId: number;
  teacher: string;
  students: string[];
  validators: string[];
  difficultyOverride: number;
}): Promise<ServiceRound> {
  const result = await requestJson<{ round: ServiceRound }>(
    `${orchestratorUrl}/arena/start`,
    input,
  );
  return result.round;
}
export const loadServiceRound = (id: number) =>
  requestJson<ServiceRound>(`${orchestratorUrl}/arena/status/${id}`);
export const submitServiceWork = (
  id: number,
  participant: string,
  cid: string,
) => requestJson(`${orchestratorUrl}/arena/submit/${id}`, { participant, cid });
export const closeServiceRound = (id: number) =>
  requestJson(`${orchestratorUrl}/arena/close/${id}`, {});
export const finalizeServiceRound = (id: number, winners: string[]) =>
  requestJson<ArenaSummary>(`${orchestratorUrl}/arena/finalize/${id}`, {
    winners,
  });
export async function fetchScoreboard(): Promise<ScoreboardResponse> {
  if (isDemoMode()) return previewScoreboard();
  const raw = await requestJson<
    Omit<ScoreboardResponse, 'agents'> & {
      difficultyWindow?: { targetSuccessRate: number };
      agents: (ScoreboardAgent & {
        stats?: { wins: number; losses: number };
      })[];
    }
  >(`${orchestratorUrl}/arena/scoreboard`);
  if (
    !Array.isArray(raw.agents) ||
    !Array.isArray(raw.rounds) ||
    !Number.isFinite(raw.currentDifficulty)
  )
    throw new Error('Orchestrator returned invalid telemetry.');
  return {
    ...raw,
    agents: raw.agents.map((agent) => ({
      ...agent,
      wins: agent.stats?.wins ?? agent.wins,
      losses: agent.stats?.losses ?? agent.losses,
      role: agent.role ?? 'participant',
    })),
    currentSuccessRate:
      raw.currentSuccessRate ?? raw.rounds.at(-1)?.successRate ?? 0,
    ownerControls: raw.ownerControls ?? {
      paused: false,
      autoDifficulty: true,
      maxConcurrentJobs: 1,
      targetSuccessRate: raw.difficultyWindow?.targetSuccessRate ?? 0.6,
    },
  };
}
export async function updateOwnerControls(
  update: Partial<OwnerControlState>,
): Promise<OwnerControlState> {
  return isDemoMode()
    ? previewControls(update)
    : requestJson(`${orchestratorUrl}/arena/controls`, update);
}
export function buildTelemetry(scoreboard: ScoreboardResponse): ArenaTelemetry {
  const rounds = scoreboard.rounds.slice(-8);
  const difficultyTrend = rounds.map((round) => ({
    label: `#${round.id}`,
    value: round.difficulty,
  }));
  const successTrend = rounds.map((round) => ({
    label: `#${round.id}`,
    value: round.successRate,
  }));
  return {
    scoreboard,
    difficultyTrend,
    successTrend,
  };
}
