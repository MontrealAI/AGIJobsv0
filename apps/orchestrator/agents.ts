import { createHash } from 'crypto';

export interface AgentHandlerContext {
  jobId: string;
  stageName: string;
  category: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentHandlerInput {
  context: AgentHandlerContext;
  payload: unknown;
}

export type AgentHandler = (input: AgentHandlerInput) => Promise<unknown>;

const handlers = new Map<string, AgentHandler>();

function ensureText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function defaultSummarizer(
  input: AgentHandlerInput
): Promise<Record<string, unknown>> {
  const text = ensureText(input.payload);
  const hash = createHash('sha256').update(text).digest('hex');
  return {
    type: 'summary',
    jobId: input.context.jobId,
    stage: input.context.stageName,
    digest: `sha256:${hash}`,
    length: text.length,
    excerpt: text.slice(0, 280),
    tags: input.context.tags,
  };
}

async function analyticalAgent(
  input: AgentHandlerInput
): Promise<Record<string, unknown>> {
  const text = ensureText(input.payload);
  const tokens = text.split(/\s+/).filter(Boolean);
  const keywordSet = new Set<string>();
  for (const token of tokens) {
    const lower = token.toLowerCase().replace(/[^a-z0-9]/gi, '');
    if (!lower) continue;
    if (lower.length > 6) keywordSet.add(lower);
  }
  const analysis = {
    type: 'analysis',
    jobId: input.context.jobId,
    stage: input.context.stageName,
    tokenCount: tokens.length,
    uniqueKeywords: Array.from(keywordSet).slice(0, 20),
    sentiment: text.includes('risk') ? 'caution' : 'neutral',
    metadata: input.context.metadata ?? {},
  };
  return analysis;
}

async function financialEstimator(
  input: AgentHandlerInput
): Promise<Record<string, unknown>> {
  const payload = input.payload as Record<string, unknown> | null;
  const reward = Number((payload && (payload as any).reward) ?? 0);
  const stake = Number((payload && (payload as any).stake) ?? 0);
  const efficiency = reward > 0 ? reward / (stake + 1) : 0;
  return {
    type: 'financial-model',
    jobId: input.context.jobId,
    stage: input.context.stageName,
    reward,
    stake,
    projectedEfficiency: efficiency,
    thermodynamicSignal: reward > stake ? 'favorable' : 'neutral',
  };
}

async function governanceReviewer(
  input: AgentHandlerInput
): Promise<Record<string, unknown>> {
  const summary = await defaultSummarizer(input);
  return {
    ...summary,
    type: 'governance-review',
    recommendations: [
      'Ensure quorum requirements are met.',
      'Log validator votes for auditability.',
    ],
  };
}

async function engineeringPlanner(
  input: AgentHandlerInput
): Promise<Record<string, unknown>> {
  const text = ensureText(input.payload);
  const steps = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((line, idx) => ({ step: idx + 1, description: line }));
  return {
    type: 'implementation-plan',
    jobId: input.context.jobId,
    stage: input.context.stageName,
    steps,
  };
}

function installDefaultHandlers(): void {
  handlers.set('policy.analyze', analyticalAgent);
  handlers.set('research.summarize', defaultSummarizer);
  handlers.set('finance.evaluate', financialEstimator);
  handlers.set('governance.review', governanceReviewer);
  handlers.set('engineering.plan', engineeringPlanner);
  handlers.set('report.generate', async (input) => ({
    type: 'report',
    jobId: input.context.jobId,
    stage: input.context.stageName,
    headline: `Deliverable for ${input.context.category}`,
    payload: input.payload,
  }));
}

installDefaultHandlers();

export function registerHandler(name: string, handler: AgentHandler): void {
  handlers.set(name, handler);
}

export function getHandler(name: string): AgentHandler {
  const handler = handlers.get(name);
  if (!handler) {
    throw new Error(`Unknown agent handler: ${name}`);
  }
  return handler;
}
