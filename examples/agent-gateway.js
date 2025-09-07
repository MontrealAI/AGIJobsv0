// Minimal agent gateway that listens for job events and auto-applies
// Usage: node examples/agent-gateway.js
// Requires RPC_URL, PRIVATE_KEY and JOB_REGISTRY env vars.

const { ethers } = require('ethers');

// Canonical $AGIALPHA token uses fixed decimal configuration
const { decimals: AGIALPHA_DECIMALS } = require('../config/agialpha.json');
const TOKEN_DECIMALS = AGIALPHA_DECIMALS;

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const JOB_REGISTRY = process.env.JOB_REGISTRY;

if (!JOB_REGISTRY) {
  console.error('Set JOB_REGISTRY env variable');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

async function ensureEnsSubdomain(address) {
  try {
    const name = await provider.lookupAddress(address);
    if (
      name &&
      (name.endsWith('.agent.agi.eth') || name.endsWith('.club.agi.eth')) &&
      name.split('.').length > 3
    ) {
      return true;
    }
  } catch {
    // ignore lookup errors
  }
  console.warn(
    'No valid *.agent.agi.eth or *.club.agi.eth subdomain detected for this address. See docs/ens-identity-setup.md'
  );
  return false;
}

const REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee)',
  'function applyForJob(uint256 jobId, string subdomain, bytes proof) external',
];

const registry = new ethers.Contract(JOB_REGISTRY, REGISTRY_ABI, wallet);

ensureEnsSubdomain(wallet.address);
console.log('Listening for jobs...');
registry.on('JobCreated', async (jobId, employer, agent, reward) => {
  // Only apply if job is unassigned
  if (agent === ethers.ZeroAddress) {
    try {
      const display = ethers.formatUnits(reward, TOKEN_DECIMALS);
      console.log(`Applying for job ${jobId} with reward ${display}`);
      // Replace 'alice' with your label under agent.agi.eth and supply a proof if required.
      if (!(await ensureEnsSubdomain(wallet.address))) return;
      const tx = await registry.applyForJob(jobId, 'alice', '0x');
      await tx.wait();
      console.log(`Applied in tx ${tx.hash}`);
    } catch (err) {
      console.error('applyForJob failed', err);
    }
  }
});
