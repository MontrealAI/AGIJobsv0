import type {
  Artifact,
  ArtifactInput,
  ArenaStartOptions,
  ArenaSummary,
  OwnerControlState,
  ScoreboardResponse,
  StreamRequest,
} from './api.js';

export interface SubmissionEvidence {
  participant: string;
  score: number;
  threshold: number;
  passed: boolean;
  explanation: string;
}
export interface PreviewRound extends ArenaSummary {
  artifactId: number;
  target: number;
  nextDifficulty: number;
  submissions: SubmissionEvidence[];
  rubric: string;
  batches: number;
}

const seeds: Artifact[] = [
  {
    id: 1,
    title: 'Community knowledge commons',
    kind: 'book',
    cid: 'preview-seed-1',
    cites: [],
    influence: 0,
  },
  {
    id: 2,
    title: 'Evidence before answers',
    kind: 'prompt',
    cid: 'preview-seed-2',
    parentId: 1,
    cites: [1],
    influence: 0,
  },
  {
    id: 3,
    title: 'Teach, test, improve',
    kind: 'curriculum',
    cid: 'preview-seed-3',
    parentId: 1,
    cites: [1, 2],
    influence: 0,
  },
];
const initialControls = {
  paused: false,
  autoDifficulty: true,
  maxConcurrentJobs: 3,
  targetSuccessRate: 0.6,
};
let artifacts: Artifact[];
let contents: Map<string, string>;
let rounds: PreviewRound[];
let jobs: { jobId: string; title: string; artifactId: number }[];
let controls: OwnerControlState;
let difficulty: number;
let agents: {
  address: string;
  role: string;
  rating: number;
  wins: number;
  losses: number;
}[];
let revision = 0;
const listeners = new Set<() => void>();
export const subscribePreview = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const previewRevision = () => revision;
function changed() {
  revision += 1;
  listeners.forEach((listener) => listener());
}
const copy = <T>(value: T): T => structuredClone(value);

export function resetPreview() {
  artifacts = copy(seeds);
  contents = new Map();
  rounds = [];
  jobs = [];
  controls = { ...initialControls };
  difficulty = 4;
  agents = [];
  rankArtifacts();
  changed();
}
// Citation-only PageRank: edges point from a citing artifact to its source.
// Dangling nodes distribute mass uniformly; damping 0.85, 40 iterations.
function rankArtifacts() {
  const count = artifacts.length;
  let ranks = artifacts.map(() => 1 / count);
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const next = artifacts.map(() => 0.15 / count);
    artifacts.forEach((artifact, index) => {
      const links = artifact.cites.length
        ? artifact.cites
        : artifacts.map((a) => a.id);
      links.forEach((id) => {
        next[artifacts.findIndex((a) => a.id === id)] +=
          (0.85 * ranks[index]) / links.length;
      });
    });
    ranks = next;
  }
  artifacts = artifacts.map((artifact, index) => ({
    ...artifact,
    influence: ranks[index],
  }));
}
export const previewArtifacts = () => copy(artifacts);
export function previewDraft(request: StreamRequest): string[] {
  if (!request.prompt.trim())
    throw new Error('Describe what you want to teach.');
  return [
    `# ${request.prompt.trim().slice(0, 120)}\n\n`,
    `Workshop brief · ${request.persona ?? 'Friendly research partner'}\nThis is a local teaching template, not an LLM response.\n\n`,
    `1. Purpose\nUse this brief to turn the request “${request.prompt.trim()}” into a reusable lesson for your community. Identify the audience and one observable outcome.\n\n`,
    '2. Practice\nChoose a concrete example. Explain the decision, cite a source artifact, and record assumptions. Ask a learner to reproduce the decision on a new example.\n\n',
    '3. Evaluation\nScore evidence, clarity, and transfer separately. Review unsuccessful answers with a human; an automated score is not a safety or quality certification.\n\n',
    '4. Publish and iterate\nReview this draft, store its content fingerprint, register its lineage, and schedule a follow-on evaluation. Compare success against the target before changing difficulty.\n',
  ];
}
export async function previewUpload(content: string) {
  if (!content.trim()) throw new Error('A nonempty draft is required.');
  const bytes = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const cid = `preview-sha256-${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  contents.set(cid, content);
  changed();
  return { cid, bytes: bytes.length };
}
export function previewMint(input: ArtifactInput) {
  if (!input.title.trim()) throw new Error('Give the artifact a title.');
  if (!['book', 'prompt', 'dataset', 'curriculum'].includes(input.kind))
    throw new Error('Choose a supported artifact format.');
  if (!contents.has(input.cid))
    throw new Error('Store this draft in the preview before registering it.');
  if (
    input.parentId !== undefined &&
    !artifacts.some((a) => a.id === input.parentId)
  )
    throw new Error('The source artifact does not exist.');
  const existing = artifacts.find((a) => a.cid === input.cid);
  if (existing)
    throw new Error(
      `This content is already registered as artifact #${existing.id}.`,
    );
  const id = artifacts.length + 1;
  artifacts.push({
    ...input,
    id,
    cites: input.parentId === undefined ? [] : [input.parentId],
    influence: 0,
  });
  rankArtifacts();
  changed();
  return { artifactId: id, transactionHash: `preview-registration-${id}` };
}
export function previewJob(artifactId: number) {
  if (!artifacts.some((a) => a.id === artifactId))
    throw new Error('Choose an existing artifact.');
  const job = {
    jobId: `preview-job-${jobs.length + 1}`,
    title: `Evaluate transfer from artifact #${artifactId}`,
    artifactId,
  };
  jobs.push(job);
  changed();
  return copy(job);
}
export function previewControls(update: Partial<OwnerControlState>) {
  const next = { ...controls, ...update };
  if (
    typeof next.paused !== 'boolean' ||
    typeof next.autoDifficulty !== 'boolean' ||
    !Number.isFinite(next.targetSuccessRate) ||
    next.targetSuccessRate < 0.1 ||
    next.targetSuccessRate > 0.95 ||
    !Number.isInteger(next.maxConcurrentJobs) ||
    next.maxConcurrentJobs < 1 ||
    next.maxConcurrentJobs > 12
  ) {
    throw new Error(
      'Target must be 0.10–0.95 and parallel jobs must be an integer from 1 to 12.',
    );
  }
  controls = next;
  changed();
  return copy(controls);
}
export function previewArena(options: ArenaStartOptions): PreviewRound {
  if (controls.paused)
    throw new Error('Arenas are paused. Resume them in the control panel.');
  const artifact = artifacts.find((a) => a.id === options.artifactId);
  if (!artifact) throw new Error('Choose an existing artifact.');
  if (
    !Number.isInteger(options.studentCount) ||
    options.studentCount < 1 ||
    options.studentCount > 12
  )
    throw new Error('Choose 1–12 students.');
  const target = options.difficultyTarget ?? controls.targetSuccessRate;
  if (!Number.isFinite(target) || target < 0.1 || target > 0.95)
    throw new Error('Target must be 0.10–0.95.');
  const threshold = 35 + difficulty * 5;
  const submissions = Array.from(
    { length: options.studentCount },
    (_, index) => {
      const score = Math.min(
        100,
        35 + ((index * 17 + artifact.id * 7) % 61) + artifact.cites.length * 2,
      );
      return {
        participant: `student-${String(index + 1).padStart(2, '0')}`,
        score,
        threshold,
        passed: score >= threshold,
        explanation: `Fixture skill ${score - artifact.cites.length * 2} + citation support ${artifact.cites.length * 2}; pass at ${threshold}/100.`,
      };
    },
  );
  const winners = submissions.filter((s) => s.passed).map((s) => s.participant);
  const rate = winners.length / submissions.length;
  const next = controls.autoDifficulty
    ? Math.round(
        Math.max(
          1,
          Math.min(
            9,
            difficulty + Math.max(-2, Math.min(2, 4 * (rate - target))),
          ),
        ),
      )
    : difficulty;
  const round: PreviewRound = {
    roundId: rounds.length + 1,
    artifactId: artifact.id,
    difficulty,
    target,
    winners,
    observedSuccessRate: rate,
    difficultyDelta: next - difficulty,
    nextDifficulty: next,
    submissions,
    rubric:
      'Deterministic fixture score (0–100) compared with 35 + 5 × difficulty. This teaches the workflow; it does not measure real agent intelligence.',
    batches: Math.ceil(options.studentCount / controls.maxConcurrentJobs),
  };
  const teacher = player('teacher', 'teacher');
  const teacherBefore = teacher.rating;
  let teacherDelta = 0;
  submissions.forEach((submission) => {
    const student = player(submission.participant, 'student');
    const expected = 1 / (1 + 10 ** ((teacherBefore - student.rating) / 400));
    const delta = Math.round(32 * (Number(submission.passed) - expected));
    student.rating += delta;
    teacherDelta -= delta;
    student.wins += Number(submission.passed);
    student.losses += Number(!submission.passed);
    teacher.wins += Number(!submission.passed);
    teacher.losses += Number(submission.passed);
  });
  teacher.rating += teacherDelta;
  controls = { ...controls, targetSuccessRate: target };
  difficulty = next;
  rounds.push(round);
  changed();
  return copy(round);
}
function player(address: string, role: string) {
  let agent = agents.find((a) => a.address === address);
  if (!agent) {
    agent = { address, role, rating: 1200, wins: 0, losses: 0 };
    agents.push(agent);
  }
  return agent;
}
export function previewScoreboard(): ScoreboardResponse {
  return copy({
    agents,
    rounds: rounds.map((r) => ({
      id: r.roundId,
      difficulty: r.difficulty,
      successRate: r.observedSuccessRate,
      difficultyDelta: r.difficultyDelta,
      status: 'finalized',
    })),
    currentDifficulty: difficulty,
    currentSuccessRate: rounds.at(-1)?.observedSuccessRate ?? 0,
    ownerControls: controls,
  });
}
export function previewEvidence() {
  return copy({
    schemaVersion: 1,
    mode: 'simulation',
    model: 'culture-teaching-v1',
    limitations: [
      'No LLM, IPFS provider, blockchain transaction, paid job, external validator, or real stake is used.',
      'Session state resets on reload. Fixture scores are not agent benchmarks.',
    ],
    artifacts,
    contents: Object.fromEntries(contents),
    jobs,
    rounds,
    scoreboard: previewScoreboard(),
  });
}
resetPreview();
