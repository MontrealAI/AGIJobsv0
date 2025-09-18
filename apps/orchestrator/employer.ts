import { ethers, Wallet } from 'ethers';
import { JOB_REGISTRY_ADDRESS, RPC_URL } from './config';
import {
  uploadToIPFS,
  loadJobGraph,
  saveJobGraph,
  loadState,
} from './execution';
import { auditLog } from './audit';

const REGISTRY_ABI = [
  'function postJob(string description,uint256 reward,bytes params) returns (uint256)',
  'function nextJobId() view returns (uint256)',
  'event JobCreated(uint256 indexed jobId,address indexed employer,address agent,uint256 reward,uint256 stake,uint256 fee,bytes32 specHash,string uri)',
];

const PARAM_TUPLE = [
  'tuple(uint64 deadline,uint8 agentTypes,bytes32 specHash,string uri)',
];

const REGISTRY_INTERFACE = new ethers.Interface(REGISTRY_ABI);

type RawMetadata = {
  pipeline?: unknown;
  subtasks?: unknown;
  agentType?: number;
  category?: string;
  tags?: string[];
  [key: string]: unknown;
};

interface NormalisedMetadata {
  metadata: Record<string, unknown>;
  pipeline?: unknown;
  subtasks?: unknown;
  agentType?: number;
  category?: string;
  tags?: string[];
}

export interface PostJobParams {
  wallet: Wallet;
  deadline: number;
  dependencies?: (string | number)[];
  agentTypes?: number;
  metadata?: Record<string, unknown>;
}

function canonicalise(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalise(item));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = canonicalise(val);
    }
    return result;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function normaliseMetadata(
  metadata?: Record<string, unknown>
): NormalisedMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return { metadata: {} };
  }
  const { pipeline, subtasks, agentType, category, tags, ...rest } =
    metadata as RawMetadata;
  return {
    metadata: canonicalise(rest) as Record<string, unknown>,
    pipeline,
    subtasks,
    agentType,
    category,
    tags,
  };
}

function buildMarkdownSpec(options: {
  description: string;
  rewardFormatted: string;
  rewardRaw: string;
  deadlineIso: string;
  dependencies: string[];
  agentTypes: number | null;
  metadata: Record<string, unknown>;
  tags?: string[];
}): string {
  const lines: string[] = [
    '# Job Specification',
    '',
    '## Overview',
    '',
    `- **Description:** ${options.description}`,
    `- **Reward:** ${options.rewardFormatted} AGIALPHA (${options.rewardRaw} wei)`,
    `- **Deadline:** ${options.deadlineIso}`,
  ];
  if (options.dependencies.length > 0) {
    lines.push(
      `- **Dependencies:** ${options.dependencies
        .map((dep) => `#${dep}`)
        .join(', ')}`
    );
  }
  if (options.agentTypes && options.agentTypes > 0) {
    lines.push(`- **Agent Types:** ${options.agentTypes}`);
  }
  if (options.tags && options.tags.length > 0) {
    lines.push(`- **Tags:** ${options.tags.join(', ')}`);
  }
  lines.push('');
  lines.push('## Metadata');
  lines.push('');
  const metadataJson = JSON.stringify(options.metadata ?? {}, null, 2);
  lines.push('```json');
  lines.push(metadataJson);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function ensureWallet(wallet: Wallet | undefined): Wallet {
  if (!wallet) {
    throw new Error('A signer wallet is required to post jobs');
  }
  return wallet;
}

export async function postJob(
  description: string,
  rewardInput: bigint | number | string,
  params: PostJobParams
): Promise<{
  jobId: string;
  jsonUri: string;
  markdownUri: string;
  specHash: string;
}> {
  const wallet = ensureWallet(params.wallet);
  if (!JOB_REGISTRY_ADDRESS) {
    throw new Error('JOB_REGISTRY_ADDRESS is not configured');
  }
  const dependencies = Array.from(
    new Set((params.dependencies ?? []).map((d) => d.toString()))
  );
  const reward = ethers.toBigInt(rewardInput);
  const deadline = BigInt(params.deadline);

  auditLog('job.post_initiated', {
    actor: wallet.address,
    details: {
      description,
      reward: reward.toString(),
      deadline: deadline.toString(),
      dependencies,
      agentTypes: params.agentTypes ?? null,
    },
  });

  const state = loadState();
  for (const dep of dependencies) {
    const depState = state[dep];
    if (!depState || !depState.completed) {
      throw new Error(`Dependency ${dep} not completed`);
    }
  }

  const {
    metadata: customMetadata,
    pipeline,
    subtasks,
    agentType,
    category,
    tags,
  } = normaliseMetadata(params.metadata);
  const selectedAgentType = params.agentTypes ?? agentType ?? null;

  const rewardFormatted = ethers.formatUnits(reward, 18);
  const deadlineIso = new Date(Number(deadline) * 1000).toISOString();
  const createdAt = new Date().toISOString();

  const specCore = canonicalise({
    version: 1,
    description,
    createdAt,
    deadline: {
      timestamp: Number(deadline),
      iso: deadlineIso,
    },
    reward: {
      amount: reward.toString(),
      formatted: rewardFormatted,
      token: 'AGIALPHA',
    },
    dependencies,
    agentType: selectedAgentType,
    category,
    tags,
    pipeline,
    subtasks,
    metadata: customMetadata,
  });

  const markdown = buildMarkdownSpec({
    description,
    rewardFormatted,
    rewardRaw: reward.toString(),
    deadlineIso,
    dependencies,
    agentTypes: selectedAgentType,
    metadata: customMetadata,
    tags,
  });
  const markdownCid = await uploadToIPFS(markdown);
  const markdownUri = `ipfs://${markdownCid}`;

  const specRecord = canonicalise({
    ...specCore,
    attachments: {
      markdown: markdownUri,
    },
  });
  const specJson = JSON.stringify(specRecord, null, 2);
  const jsonCid = await uploadToIPFS(specJson);
  const jsonUri = `ipfs://${jsonCid}`;
  const specHash = ethers.keccak256(ethers.toUtf8Bytes(specJson));

  const provider = wallet.provider || new ethers.JsonRpcProvider(RPC_URL);
  const signer = wallet.connect(provider);
  const registry = new ethers.Contract(
    JOB_REGISTRY_ADDRESS,
    REGISTRY_ABI,
    signer
  );
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encodedParams = coder.encode(PARAM_TUPLE, [
    [deadline, selectedAgentType ?? 0, specHash, jsonUri],
  ]);

  let predictedJobId: bigint | null = null;
  try {
    predictedJobId = await registry.postJob.staticCall(
      description,
      reward,
      encodedParams
    );
  } catch (err) {
    console.warn(
      'staticCall(postJob) failed, continuing with transaction',
      err
    );
  }

  const tx = await registry.postJob(description, reward, encodedParams);
  const receipt = await tx.wait();

  let jobId: string | null = null;
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsed = REGISTRY_INTERFACE.parseLog(log);
        if (parsed && parsed.name === 'JobCreated') {
          jobId = parsed.args.jobId.toString();
          break;
        }
      } catch {
        // ignore logs that do not belong to the JobRegistry interface
      }
    }
  }
  if (!jobId && predictedJobId !== null) {
    jobId = predictedJobId.toString();
  }
  if (!jobId) {
    const latest = await registry.nextJobId();
    jobId = latest.toString();
  }

  const graph = loadJobGraph();
  graph[jobId] = dependencies;
  saveJobGraph(graph);

  auditLog('job.posted', {
    jobId,
    actor: wallet.address,
    details: {
      description,
      reward: reward.toString(),
      deadline: deadline.toString(),
      jsonUri,
      markdownUri,
      agentType: selectedAgentType,
      specHash,
      transaction: tx.hash,
      dependencies,
    },
  });

  return { jobId, jsonUri, markdownUri, specHash };
}
