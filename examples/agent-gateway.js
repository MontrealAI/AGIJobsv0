/**
 * Minimal agent gateway example.
 *
 * Usage:
 *   RPC_URL=https://your-rpc \
 *   JOB_REGISTRY_ADDRESS=0xRegistry \
 *   PRIVATE_KEY=0xyourkey \
 *   ENS_LABEL=my-agent \
 *   MERKLE_PROOF=0x \
 *   node examples/agent-gateway.js
 *
 * The script subscribes to JobRegistry JobCreated events, filters for
 * unassigned jobs (agent == address(0)), and demonstrates forwarding the
 * payload into an auto-apply callback. The callback connects the provided
 * wallet to the JobRegistry contract and submits applyForJob.
 */

const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const JOB_REGISTRY_ADDRESS =
  process.env.JOB_REGISTRY_ADDRESS || process.env.JOB_REGISTRY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ENS_LABEL = process.env.ENS_LABEL || process.env.AGENT_ENS_LABEL || '';
const MERKLE_PROOF =
  process.env.MERKLE_PROOF || process.env.AGENT_PROOF || '0x';

if (!JOB_REGISTRY_ADDRESS) {
  console.error(
    'Set JOB_REGISTRY_ADDRESS (or JOB_REGISTRY) environment variable'
  );
  process.exit(1);
}

if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY environment variable');
  process.exit(1);
}

if (!ethers.isAddress(JOB_REGISTRY_ADDRESS)) {
  console.error('JOB_REGISTRY_ADDRESS must be a valid Ethereum address');
  process.exit(1);
}

const proofValue = ethers.isHexString(MERKLE_PROOF) ? MERKLE_PROOF : '0x';

const JOB_REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee, bytes32 specHash, string uri)',
  'function applyForJob(uint256 jobId, string subdomain, bytes proof) external',
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const registry = new ethers.Contract(
  JOB_REGISTRY_ADDRESS,
  JOB_REGISTRY_ABI,
  provider
);
const registryWithSigner = registry.connect(wallet);

async function onUnassignedJob(event) {
  const { jobId, employer, reward, stake } = event;
  console.log('Unassigned job created', {
    jobId: jobId.toString(),
    employer,
    reward: reward.toString(),
    stake: stake.toString(),
  });

  try {
    const tx = await registryWithSigner.applyForJob(
      jobId,
      ENS_LABEL,
      proofValue
    );
    console.log('applyForJob submitted', tx.hash);
    await tx.wait();
    console.log('Application confirmed');
  } catch (err) {
    console.error('applyForJob failed', err);
  }
}

registry.on(
  'JobCreated',
  (jobId, employer, agent, reward, stake, fee, specHash, uri) => {
    if (agent !== ethers.ZeroAddress) {
      return;
    }
    const payload = {
      jobId: ethers.getBigInt(jobId),
      employer,
      agent,
      reward,
      stake,
      fee,
      specHash,
      uri,
    };
    Promise.resolve(onUnassignedJob(payload)).catch((err) => {
      console.error('Auto-apply callback error', err);
    });
  }
);

console.log('Listening for unassigned jobs...');
console.log('RPC_URL:', RPC_URL);
console.log('JOB_REGISTRY_ADDRESS:', JOB_REGISTRY_ADDRESS);
console.log('ENS_LABEL:', ENS_LABEL || '(empty)');
console.log('MERKLE_PROOF:', proofValue);
