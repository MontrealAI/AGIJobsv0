#!/usr/bin/env node
/**
 * Agent gateway helper for AGI Jobs v2.
 *
 * The script drives the on-chain lifecycle for an agent wallet:
 *  - checks the job record via `jobs(uint256)`
 *  - optionally tops up stake using the StakeManager
 *  - applies for the job using `applyForJob(uint256,string,bytes32[])`
 *  - submits results with `submit(uint256,bytes32,string,string,bytes32[])`
 *  - finalizes the job through `finalize(uint256)`
 *
 * Usage examples:
 *   RPC_URL=https://sepolia.infura.io/v3/KEY \
 *   JOB_REGISTRY_ADDRESS=0xRegistry \
 *   STAKE_MANAGER_ADDRESS=0xStake \
 *   PRIVATE_KEY=0xabc... \
 *   ENS_LABEL=my-agent \
 *   MERKLE_PROOF='["0xproof1","0xproof2"]' \
 *   node examples/agentic/v2-agent-gateway.js status 42
 *
 *   RESULT_HASH=0xdeadbeef... \
 *   RESULT_URI=https://ipfs.io/ipfs/... \
 *   node examples/agentic/v2-agent-gateway.js submit 42
 *
 *   node examples/agentic/v2-agent-gateway.js finalize 42
 *
 * Provide `STAKE_RECIPIENT` to deposit stake for another address. When omitted
 * the script assumes the signing wallet is also the agent.
 */

const { ethers } = require('ethers');

const ACTION = (process.argv[2] || '').toLowerCase();
const SUPPORTED_ACTIONS = new Set(['status', 'apply', 'submit', 'finalize']);

function usage() {
  console.error(`Usage: node v2-agent-gateway.js <action> <jobId>

Actions:
  status    Show on-chain job details and staking state
  apply     Ensure stake then call applyForJob
  submit    Submit results for the job
  finalize  Finalize the job (employer only)
`);
}

if (!SUPPORTED_ACTIONS.has(ACTION)) {
  usage();
  process.exit(1);
}

const jobIdInput = process.argv[3];
if (!jobIdInput) {
  console.error('Missing job identifier argument.');
  usage();
  process.exit(1);
}

let jobId;
try {
  jobId = ethers.getBigInt(jobIdInput);
} catch (err) {
  console.error('Invalid job identifier:', err.message);
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const JOB_REGISTRY_ADDRESS =
  process.env.JOB_REGISTRY_ADDRESS || process.env.JOB_REGISTRY || '';
const STAKE_MANAGER_ADDRESS = process.env.STAKE_MANAGER_ADDRESS || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const ENS_LABEL = process.env.ENS_LABEL || process.env.AGENT_ENS_LABEL || '';
const APPLY_PROOF = parseProof(
  process.env.MERKLE_PROOF || process.env.APPLY_PROOF || process.env.AGENT_PROOF
);
const SUBMIT_LABEL = process.env.SUBMIT_LABEL || ENS_LABEL;
const SUBMIT_PROOF = (function () {
  const override =
    process.env.SUBMIT_PROOF ||
    process.env.SUBMIT_MERKLE_PROOF ||
    process.env.RESULT_PROOF ||
    '';
  return override ? parseProof(override) : APPLY_PROOF;
})();
const RESULT_HASH = process.env.RESULT_HASH || process.env.SUBMIT_HASH || '';
const RESULT_URI = process.env.RESULT_URI || process.env.SUBMIT_URI || '';
const STAKE_RECIPIENT = (process.env.STAKE_RECIPIENT || '').trim();

const needsSigner = ACTION !== 'status';
if (!JOB_REGISTRY_ADDRESS) {
  console.error('Set JOB_REGISTRY_ADDRESS (or JOB_REGISTRY).');
  process.exit(1);
}
if (!ethers.isAddress(JOB_REGISTRY_ADDRESS)) {
  console.error('JOB_REGISTRY_ADDRESS must be a valid Ethereum address.');
  process.exit(1);
}
if (needsSigner && !PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY for signing transactions.');
  process.exit(1);
}
if (needsSigner && ACTION !== 'finalize' && !STAKE_MANAGER_ADDRESS) {
  console.error(
    'Set STAKE_MANAGER_ADDRESS to manage staking for apply/submit actions.'
  );
  process.exit(1);
}
if (STAKE_RECIPIENT && !ethers.isAddress(STAKE_RECIPIENT)) {
  console.error('STAKE_RECIPIENT must be a valid address when provided.');
  process.exit(1);
}
if (STAKE_MANAGER_ADDRESS && !ethers.isAddress(STAKE_MANAGER_ADDRESS)) {
  console.error('STAKE_MANAGER_ADDRESS must be a valid address.');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;
const agentAddress =
  STAKE_RECIPIENT || (wallet ? wallet.address : ethers.ZeroAddress);

const JOB_REGISTRY_ABI = [
  'function jobs(uint256 jobId) view returns (tuple(address employer,address agent,uint128 reward,uint96 stake,uint128 burnReceiptAmount,bytes32 uriHash,bytes32 resultHash,bytes32 specHash,uint256 packedMetadata))',
  'function minAgentStake() view returns (uint96)',
  'function applyForJob(uint256 jobId,string subdomain,bytes32[] proof)',
  'function submit(uint256 jobId,bytes32 resultHash,string resultURI,string subdomain,bytes32[] proof)',
  'function finalize(uint256 jobId)',
];
const STAKE_MANAGER_ABI = [
  'function stakeOf(address user,uint8 role) view returns (uint256)',
  'function depositStake(uint8 role,uint256 amount)',
  'function depositStakeFor(address user,uint8 role,uint256 amount)',
  'function minStake() view returns (uint256)',
  'function token() view returns (address)',
];
const ERC20_ABI = [
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const registry = new ethers.Contract(
  JOB_REGISTRY_ADDRESS,
  JOB_REGISTRY_ABI,
  provider
);
const registryWithSigner = wallet ? registry.connect(wallet) : null;
const stakeManager =
  STAKE_MANAGER_ADDRESS !== ''
    ? new ethers.Contract(STAKE_MANAGER_ADDRESS, STAKE_MANAGER_ABI, provider)
    : null;
const stakeManagerWithSigner =
  stakeManager && wallet ? stakeManager.connect(wallet) : null;

const AGENT_ROLE = 0;
const STATE_NAMES = [
  'None',
  'Created',
  'Applied',
  'Submitted',
  'Completed',
  'Disputed',
  'Finalized',
  'Cancelled',
];
const STATE_MASK = 0x7n;
const SUCCESS_MASK = 0x8n;
const BURN_CONFIRMED_MASK = 0x10n;
const AGENT_TYPES_MASK = 0xffn << 5n;
const FEE_MASK = ((1n << 32n) - 1n) << 13n;
const AGENT_PCT_MASK = ((1n << 32n) - 1n) << 45n;
const DEADLINE_MASK = ((1n << 64n) - 1n) << 77n;
const ASSIGNED_AT_MASK = ((1n << 64n) - 1n) << 141n;

let tokenInfoPromise = null;
async function loadTokenInfo() {
  if (!stakeManager) return null;
  if (!tokenInfoPromise) {
    tokenInfoPromise = (async () => {
      const tokenAddress = await stakeManager.token();
      const reader = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const [symbol, decimals] = await Promise.all([
        reader.symbol().catch(() => 'TOKEN'),
        reader.decimals().catch(() => 18),
      ]);
      return {
        address: tokenAddress,
        symbol,
        decimals: Number(decimals) || 18,
        reader,
      };
    })();
  }
  return tokenInfoPromise;
}

function parseProof(raw) {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '0x' || trimmed === '0X') {
    return [];
  }
  let entries;
  if (trimmed.startsWith('[')) {
    try {
      entries = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`Failed to parse proof JSON: ${err.message}`);
    }
    if (!Array.isArray(entries)) {
      throw new Error('Merkle proof JSON must decode to an array.');
    }
  } else {
    entries = trimmed.split(',');
  }
  return entries
    .map((value) => {
      const v = String(value).trim();
      if (!ethers.isHexString(v)) {
        throw new Error(`Merkle proof entries must be hex strings: ${v}`);
      }
      const normalized = ethers.hexlify(v);
      if (ethers.dataLength(normalized) !== 32) {
        throw new Error(
          `Merkle proof entries must be 32 bytes; received length ${
            ethers.dataLength(normalized) || 0
          }`
        );
      }
      return normalized;
    })
    .filter((v) => v.length > 2);
}

function decodeJob(raw) {
  const metadata = raw.packedMetadata;
  const stateIndex = Number(metadata & STATE_MASK);
  const success = (metadata & SUCCESS_MASK) !== 0n;
  const burnConfirmed = (metadata & BURN_CONFIRMED_MASK) !== 0n;
  const agentTypes = Number((metadata & AGENT_TYPES_MASK) >> 5n);
  const feePct = Number((metadata & FEE_MASK) >> 13n);
  const agentPct = Number((metadata & AGENT_PCT_MASK) >> 45n);
  const deadline = Number((metadata & DEADLINE_MASK) >> 77n);
  const assignedAt = Number((metadata & ASSIGNED_AT_MASK) >> 141n);
  return {
    employer: raw.employer,
    agent: raw.agent,
    reward: raw.reward,
    stake: raw.stake,
    burnReceiptAmount: raw.burnReceiptAmount,
    uriHash: raw.uriHash,
    resultHash: raw.resultHash,
    specHash: raw.specHash,
    metadata: {
      state: STATE_NAMES[stateIndex] || `Unknown(${stateIndex})`,
      stateIndex,
      success,
      burnConfirmed,
      agentTypes,
      feePct,
      agentPct,
      deadline,
      assignedAt,
    },
  };
}

async function fetchJob(jobIdValue) {
  const job = await registry.jobs(jobIdValue);
  return decodeJob(job);
}

async function formatTokenAmount(value) {
  const info = await loadTokenInfo();
  if (!info) {
    return `${ethers.formatUnits(value, 18)} tokens`;
  }
  return `${ethers.formatUnits(value, info.decimals)} ${info.symbol}`;
}

async function ensureStake(target, recipient) {
  if (!stakeManager || !stakeManagerWithSigner || !wallet) {
    throw new Error('Stake manager signer is not configured.');
  }
  if (target === 0n) {
    console.log('No stake required for this job.');
    return;
  }
  const current = await stakeManager.stakeOf(recipient, AGENT_ROLE);
  if (current >= target) {
    console.log(
      `Stake requirement satisfied (${await formatTokenAmount(
        current
      )} available).`
    );
    return;
  }
  const shortfall = target - current;
  const info = await loadTokenInfo();
  const tokenWithSigner = new ethers.Contract(info.address, ERC20_ABI, wallet);
  const allowance = await tokenWithSigner.allowance(
    wallet.address,
    STAKE_MANAGER_ADDRESS
  );
  if (allowance < shortfall) {
    console.log(
      `Approving ${await formatTokenAmount(shortfall)} for StakeManager...`
    );
    const approveTx = await tokenWithSigner.approve(
      STAKE_MANAGER_ADDRESS,
      shortfall
    );
    console.log('approve tx hash:', approveTx.hash);
    await approveTx.wait();
  }
  const depositMethod =
    recipient.toLowerCase() === wallet.address.toLowerCase()
      ? stakeManagerWithSigner.depositStake(AGENT_ROLE, shortfall)
      : stakeManagerWithSigner.depositStakeFor(
          recipient,
          AGENT_ROLE,
          shortfall
        );
  console.log(
    `Depositing ${await formatTokenAmount(shortfall)} for ${recipient}...`
  );
  const depositTx = await depositMethod;
  console.log('deposit tx hash:', depositTx.hash);
  await depositTx.wait();
}

function describeTimestamp(seconds) {
  if (!seconds) return 'not set';
  if (!Number.isFinite(seconds)) return `${seconds} (raw)`;
  const millis = seconds * 1000;
  if (!Number.isFinite(millis)) return `${seconds} (raw)`;
  return new Date(millis).toISOString();
}

async function showStatus(job) {
  console.log('Job ID:', jobId.toString());
  console.log('Employer:', job.employer);
  console.log('Agent:', job.agent);
  console.log('Reward:', await formatTokenAmount(job.reward));
  console.log('Stake requirement (job):', await formatTokenAmount(job.stake));
  console.log('Spec hash:', job.specHash);
  console.log('Result hash:', job.resultHash);
  console.log('Metadata state:', job.metadata.state);
  console.log('State index:', job.metadata.stateIndex);
  console.log('Success flag:', job.metadata.success);
  console.log('Burn confirmed:', job.metadata.burnConfirmed);
  console.log('Agent types bitmask:', job.metadata.agentTypes);
  console.log('Fee pct:', job.metadata.feePct);
  console.log('Agent pct:', job.metadata.agentPct);
  console.log('Deadline:', describeTimestamp(job.metadata.deadline));
  console.log('Assigned at:', describeTimestamp(job.metadata.assignedAt));
  if (stakeManager) {
    const [minStake, currentStake] = await Promise.all([
      stakeManager.minStake(),
      stakeManager.stakeOf(agentAddress, AGENT_ROLE),
    ]);
    console.log('StakeManager.minStake:', await formatTokenAmount(minStake));
    console.log(
      `Stake available for ${agentAddress}:`,
      await formatTokenAmount(currentStake)
    );
  }
}

async function computeStakeTarget(job) {
  let minAgentStake = 0n;
  try {
    const value = await registry.minAgentStake();
    minAgentStake = ethers.getBigInt(value);
  } catch (err) {
    console.warn('Unable to read minAgentStake:', err.message);
  }
  let minStake = 0n;
  if (stakeManager) {
    try {
      minStake = ethers.getBigInt(await stakeManager.minStake());
    } catch (err) {
      console.warn('Unable to read StakeManager.minStake:', err.message);
    }
  }
  const requirements = [job.stake, minAgentStake, minStake];
  return requirements.reduce((max, value) => (value > max ? value : max), 0n);
}

async function handleApply(job) {
  if (!registryWithSigner || !wallet) {
    throw new Error('Signer is required to apply.');
  }
  if (job.agent !== ethers.ZeroAddress) {
    throw new Error(`Job already has an agent assigned: ${job.agent}`);
  }
  const stakeTarget = await computeStakeTarget(job);
  console.log('Stake target:', await formatTokenAmount(stakeTarget));
  await ensureStake(stakeTarget, agentAddress);
  console.log('Submitting applyForJob transaction...');
  const tx = await registryWithSigner.applyForJob(
    jobId,
    ENS_LABEL,
    APPLY_PROOF
  );
  console.log('apply tx hash:', tx.hash);
  await tx.wait();
  console.log('Application confirmed.');
}

async function handleSubmit(job) {
  if (!registryWithSigner || !wallet) {
    throw new Error('Signer is required to submit results.');
  }
  if (job.agent.toLowerCase() !== wallet.address.toLowerCase()) {
    console.warn(
      `Warning: connected wallet ${wallet.address} is not the assigned agent ${job.agent}`
    );
  }
  if (
    !ethers.isHexString(RESULT_HASH) ||
    ethers.dataLength(RESULT_HASH) !== 32
  ) {
    throw new Error('Set RESULT_HASH to a 32-byte hex string.');
  }
  if (!RESULT_URI) {
    console.warn('RESULT_URI is empty; submitting an empty URI string.');
  }
  console.log('Submitting job result...');
  const tx = await registryWithSigner.submit(
    jobId,
    ethers.hexlify(RESULT_HASH),
    RESULT_URI,
    SUBMIT_LABEL,
    SUBMIT_PROOF
  );
  console.log('submit tx hash:', tx.hash);
  await tx.wait();
  console.log('Submission confirmed.');
}

async function handleFinalize(job) {
  if (!registryWithSigner || !wallet) {
    throw new Error('Signer is required to finalize jobs.');
  }
  if (job.employer.toLowerCase() !== wallet.address.toLowerCase()) {
    console.warn(
      `Warning: wallet ${wallet.address} is not the recorded employer ${job.employer}`
    );
  }
  console.log('Finalizing job...');
  const tx = await registryWithSigner.finalize(jobId);
  console.log('finalize tx hash:', tx.hash);
  await tx.wait();
  console.log('Finalize transaction confirmed.');
}

async function main() {
  console.log('RPC URL:', RPC_URL);
  console.log('JobRegistry:', JOB_REGISTRY_ADDRESS);
  if (stakeManager) {
    console.log('StakeManager:', STAKE_MANAGER_ADDRESS);
  }
  if (wallet) {
    console.log('Signer address:', wallet.address);
  }
  const job = await fetchJob(jobId);
  if (ACTION === 'status') {
    await showStatus(job);
    return;
  }
  switch (ACTION) {
    case 'apply':
      await handleApply(job);
      break;
    case 'submit':
      await handleSubmit(job);
      break;
    case 'finalize':
      await handleFinalize(job);
      break;
    default:
      throw new Error(`Unsupported action: ${ACTION}`);
  }
  const updated = await fetchJob(jobId);
  console.log('--- Updated Job State ---');
  await showStatus(updated);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  if (err?.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
