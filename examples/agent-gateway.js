// Minimal agent gateway that listens for job events and auto-applies
// Usage: node examples/agent-gateway.js
// Requires RPC_URL, PRIVATE_KEY and JOB_REGISTRY env vars.

const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const JOB_REGISTRY = process.env.JOB_REGISTRY;

if (!JOB_REGISTRY) {
  console.error('Set JOB_REGISTRY env variable');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee)',
  'function applyForJob(uint256 jobId, string subdomain, bytes proof) external'
];

const registry = new ethers.Contract(JOB_REGISTRY, REGISTRY_ABI, wallet);

console.log('Listening for jobs...');
registry.on('JobCreated', async (jobId, employer, agent) => {
  // Only apply if job is unassigned
  if (agent === ethers.ZeroAddress) {
    try {
      console.log(`Applying for job ${jobId}`);
      const tx = await registry.applyForJob(jobId, '', '0x');
      await tx.wait();
      console.log(`Applied in tx ${tx.hash}`);
    } catch (err) {
      console.error('applyForJob failed', err);
    }
  }
});
