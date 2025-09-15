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
  'function nextJobId() view returns (uint256)',
  'function createJob(uint256 reward,uint64 deadline,bytes32 specHash,string uri) returns (uint256)',
  'function createJobWithAgentTypes(uint256 reward,uint64 deadline,uint8 agentTypes,bytes32 specHash,string uri) returns (uint256)',
];

export interface PostJobSpec {
  reward: bigint | number | string;
  deadline: number;
  metadata: any;
  wallet: Wallet;
  dependencies?: (string | number)[];
  agentTypes?: number;
}

export async function postJob(spec: PostJobSpec): Promise<{
  jobId: string;
  jsonUri: string;
  markdownUri: string;
}> {
  const { wallet, metadata, dependencies = [], agentTypes } = spec;
  const reward = BigInt(spec.reward);
  const deadline = BigInt(spec.deadline);

  auditLog('job.post_initiated', {
    actor: wallet.address,
    details: {
      reward: reward.toString(),
      deadline: deadline.toString(),
      dependencies: dependencies.map((d) => d.toString()),
      agentTypes: agentTypes ?? null,
    },
  });

  const state = loadState();
  for (const dep of dependencies) {
    const depState = state[dep.toString()];
    if (!depState || !depState.completed) {
      throw new Error(`Dependency ${dep} not completed`);
    }
  }

  const jsonSpec = JSON.stringify(metadata ?? {}, null, 2);
  const jsonCid = await uploadToIPFS(jsonSpec);
  const markdown = metadata?.markdown
    ? metadata.markdown
    : `# Job Specification\n\n\`\`\`json\n${jsonSpec}\n\`\`\`\n`;
  const markdownCid = await uploadToIPFS(markdown);
  const jsonUri = `ipfs://${jsonCid}`;
  const markdownUri = `ipfs://${markdownCid}`;
  const specWithUris = { ...metadata, json: jsonUri, markdown: markdownUri };
  const specHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(specWithUris))
  );

  const provider = wallet.provider || new ethers.JsonRpcProvider(RPC_URL);
  const registry = new ethers.Contract(
    JOB_REGISTRY_ADDRESS,
    REGISTRY_ABI,
    wallet.connect(provider)
  );

  const nextId: bigint = await registry.nextJobId();
  const tx = agentTypes
    ? await registry.createJobWithAgentTypes(
        reward,
        deadline,
        agentTypes,
        specHash,
        jsonUri
      )
    : await registry.createJob(reward, deadline, specHash, jsonUri);
  await tx.wait();
  const jobId = (nextId + 1n).toString();

  const graph = loadJobGraph();
  graph[jobId] = dependencies.map((d) => d.toString());
  saveJobGraph(graph);

  auditLog('job.posted', {
    jobId,
    actor: wallet.address,
    details: {
      reward: reward.toString(),
      deadline: deadline.toString(),
      jsonUri,
      markdownUri,
      agentTypes: agentTypes ?? null,
      specHash,
      transaction: tx.hash,
      dependencies: graph[jobId],
    },
  });

  return { jobId, jsonUri, markdownUri };
}
