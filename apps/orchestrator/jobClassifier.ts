export interface ChainJobSummary {
  jobId: string;
  agent?: string;
  agentTypes?: number;
  uri?: string;
  employer?: string;
  metadataUri?: string;
  description?: string;
  tags?: string[];
  reward?: string;
  stake?: string;
  fee?: string;
}

export interface JobStageSpec {
  name: string;
  handler?: string;
  endpoint?: string;
  signer?: string;
  description?: string;
}

export interface JobSpec {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  agentType?: number;
  reward?: string | number;
  requiredStake?: string | number;
  requiredSkills?: string[];
  thermodynamics?: {
    maxEnergy?: number;
    minEfficiency?: number;
    minProfitMargin?: number;
  };
  pipeline?: { stages: JobStageSpec[] } | JobStageSpec[];
  subtasks?: Array<{ description: string; reward: string | number }>;
  metadata?: Record<string, unknown>;
}

export interface ClassificationResult {
  category: string;
  confidence: number;
  rationale: string[];
  tags: string[];
  spec?: JobSpec | null;
}

const AGENT_TYPE_MAP: Record<number, string> = {
  1: 'data-entry',
  2: 'image-labeling',
  3: 'smart-contract',
  4: 'research',
  5: 'governance',
  6: 'compliance',
  7: 'policy',
  8: 'finance',
  9: 'engineering',
  10: 'analysis',
};

const KEYWORD_MAP: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /solidity|smart[- ]?contract|evm/i, category: 'smart-contract' },
  {
    pattern: /financial|treasury|tokenomics|pricing|stake/i,
    category: 'finance',
  },
  { pattern: /policy|governance|regulation/i, category: 'policy' },
  {
    pattern: /research|analysis|report|whitepaper|brief/i,
    category: 'research',
  },
  { pattern: /data|dataset|csv|etl|pipeline/i, category: 'data-analysis' },
  { pattern: /image|vision|label|segmentation/i, category: 'image-labeling' },
  {
    pattern: /audit|security|vulnerability|exploit/i,
    category: 'security-audit',
  },
  { pattern: /deploy|infrastructure|operator|uptime/i, category: 'operations' },
];

function confidenceFromMatches(matches: number, totalSignals: number): number {
  if (totalSignals <= 0) return 0.1;
  const raw = matches / totalSignals;
  return Math.min(0.99, Math.max(0.05, raw));
}

export async function fetchJobSpec(
  uri: string | undefined,
  options?: { gatewayUrl?: string }
): Promise<JobSpec | null> {
  if (!uri) return null;
  const normalized = uri.replace(/^ipfs:\/\//i, '');
  let target = uri;
  if (uri.startsWith('ipfs://')) {
    const gateway = options?.gatewayUrl || process.env.IPFS_GATEWAY_URL;
    if (!gateway) {
      return null;
    }
    target = `${gateway.replace(/\/$/, '')}/${normalized}`;
  }
  try {
    const res = await fetch(target, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
    const text = await res.text();
    if (!text.trim()) return null;
    try {
      const parsed = JSON.parse(text) as JobSpec;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  } catch (err) {
    console.warn('Failed to fetch job spec', err);
    return null;
  }
}

function pipelineFromSpec(spec?: JobSpec | null): JobStageSpec[] | undefined {
  if (!spec?.pipeline) return undefined;
  if (Array.isArray(spec.pipeline)) return spec.pipeline;
  return spec.pipeline.stages;
}

function analyzeText(
  value: string | undefined,
  rationale: string[],
  tags: Set<string>
): string | null {
  if (!value) return null;
  let category: string | null = null;
  for (const { pattern, category: mapped } of KEYWORD_MAP) {
    if (pattern.test(value)) {
      category = mapped;
      rationale.push(`Keyword match for ${mapped} from pattern ${pattern}`);
      tags.add(mapped);
      break;
    }
  }
  return category;
}

function categoryFromSpec(spec?: JobSpec | null): string | undefined {
  if (!spec) return undefined;
  if (spec.category) return spec.category;
  if (spec.agentType && AGENT_TYPE_MAP[spec.agentType]) {
    return AGENT_TYPE_MAP[spec.agentType];
  }
  return undefined;
}

export function classifyJob(
  job: ChainJobSummary,
  spec?: JobSpec | null
): ClassificationResult {
  const rationale: string[] = [];
  const tags = new Set<string>(spec?.tags ?? job.tags ?? []);
  const signals: string[] = [];

  let category = categoryFromSpec(spec);
  if (category) {
    rationale.push('Category derived from job specification');
  }

  if (!category && job.agentTypes && AGENT_TYPE_MAP[job.agentTypes]) {
    category = AGENT_TYPE_MAP[job.agentTypes];
    rationale.push(`Mapped agentTypes ${job.agentTypes} to ${category}`);
  }

  const description = spec?.description || job.description;
  const textCategory = analyzeText(description, rationale, tags);
  if (!category && textCategory) {
    category = textCategory;
  } else if (textCategory && textCategory !== category) {
    rationale.push(`Secondary keyword match suggests ${textCategory}`);
  }

  if (!category && spec?.requiredSkills?.length) {
    signals.push('skills');
    for (const skill of spec.requiredSkills) {
      const normalized = skill.toLowerCase();
      if (normalized.includes('solidity') || normalized.includes('evm')) {
        category = category ?? 'smart-contract';
      } else if (
        normalized.includes('python') ||
        normalized.includes('analysis')
      ) {
        category = category ?? 'data-analysis';
      } else if (
        normalized.includes('economics') ||
        normalized.includes('defi')
      ) {
        category = category ?? 'finance';
      }
      tags.add(normalized);
    }
  }

  if (!category) {
    category = 'general';
    rationale.push('Fell back to general pipeline');
  }

  if (spec?.thermodynamics?.maxEnergy) {
    rationale.push(
      `Thermodynamic constraint: maxEnergy ${spec.thermodynamics.maxEnergy}`
    );
  }
  if (spec?.thermodynamics?.minEfficiency) {
    rationale.push(
      `Thermodynamic constraint: minEfficiency ${spec.thermodynamics.minEfficiency}`
    );
  }

  const signalsCount = rationale.length + signals.length;
  const confidence = confidenceFromMatches(rationale.length, signalsCount || 3);

  return {
    category,
    confidence,
    rationale,
    tags: Array.from(tags.values()),
    spec: spec ?? null,
  };
}

export function extractPipeline(
  spec?: JobSpec | null
): JobStageSpec[] | undefined {
  return pipelineFromSpec(spec);
}
