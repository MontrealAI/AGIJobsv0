const { ethers } = require('ethers');

// Canonical $AGIALPHA token uses 18 decimals
const { decimals: AGIALPHA_DECIMALS } = require('../config/agialpha.json');
const TOKEN_DECIMALS = AGIALPHA_DECIMALS;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const provider = new ethers.JsonRpcProvider(requireEnv('RPC_URL'));
const signer = new ethers.Wallet(requireEnv('PRIVATE_KEY'), provider);

const registryAbi = [
  'function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri)',
  'function applyForJob(uint256 jobId, string subdomain, bytes32[] proof)',
  'function submit(uint256 jobId, bytes32 resultHash, string resultURI)',
  'function raiseDispute(uint256 jobId, bytes32 evidenceHash)',
  'function raiseDispute(uint256 jobId, string reason)',
];
const stakeAbi = ['function depositStake(uint8 role, uint256 amount)'];
const validationAbi = [
  'function commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)',
  'function revealValidation(uint256 jobId, bool approve, bytes32 salt, string subdomain, bytes32[] proof)',
  'function finalize(uint256 jobId)',
];

const attestAbi = [
  'function attest(bytes32 node, uint8 role, address who)',
  'function revoke(bytes32 node, uint8 role, address who)',
];

const registry = new ethers.Contract(
  requireEnv('JOB_REGISTRY'),
  registryAbi,
  signer
);
const stakeManager = new ethers.Contract(
  requireEnv('STAKE_MANAGER'),
  stakeAbi,
  signer
);
const validation = new ethers.Contract(
  requireEnv('VALIDATION_MODULE'),
  validationAbi,
  signer
);

const attestation = new ethers.Contract(
  requireEnv('ATTESTATION_REGISTRY'),
  attestAbi,
  signer
);

// Post a job with a reward denominated in AGIALPHA.
// The optional `amount` parameter represents whole tokens and defaults to `1`.
// Amounts are converted using the fixed 18‑decimal configuration.
async function postJob(amount = '1') {
  const reward = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const specHash = ethers.id('spec');
  await registry.createJob(reward, deadline, specHash, 'ipfs://job');
}

async function stake(amount) {
  const parsed = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  await stakeManager.depositStake(0, parsed);
}

// Apply for a job using a `subdomain` label such as "alice" for
// `alice.agent.agi.eth`. Supply a Merkle `proof` if allowlists are enabled.
async function apply(jobId, subdomain, proof) {
  await registry.applyForJob(jobId, subdomain, proof);
}

async function submit(jobId, uri) {
  const hash = ethers.id(uri);
  await registry.submit(jobId, hash, uri);
}

// Validators pass their `subdomain` label under `club.agi.eth` when voting.
async function validate(jobId, hash, subdomain, proof, approve, salt) {
  await validation.commitValidation(jobId, hash, subdomain, proof);
  await validation.revealValidation(jobId, approve, salt, subdomain, proof);
  await validation.finalize(jobId);
}

async function dispute(jobId, evidence) {
  if (evidence.startsWith('0x') && evidence.length === 66) {
    await registry.raiseDispute(jobId, evidence);
    return;
  }
  await registry.raiseDispute(jobId, evidence);
}

async function attest(name, role, delegate) {
  const node = ethers.namehash(name);
  await attestation.attest(node, role, delegate);
}

async function revoke(name, role, delegate) {
  const node = ethers.namehash(name);
  await attestation.revoke(node, role, delegate);
}

module.exports = {
  postJob,
  stake,
  apply,
  submit,
  validate,
  dispute,
  attest,
  revoke,
};
