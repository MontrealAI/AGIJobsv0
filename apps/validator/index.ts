import { JsonRpcProvider, Wallet, Contract, ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const VALIDATION_MODULE_ADDRESS = process.env.VALIDATION_MODULE_ADDRESS || '';
const JOB_REGISTRY_ADDRESS = process.env.JOB_REGISTRY_ADDRESS || '';
const DISPUTE_MODULE_ADDRESS = process.env.DISPUTE_MODULE_ADDRESS || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

const provider = new JsonRpcProvider(RPC_URL);
const wallet = PRIVATE_KEY ? new Wallet(PRIVATE_KEY, provider) : null;

const VALIDATION_ABI = [
  'event ValidatorsSelected(uint256 indexed jobId, address[] validators)',
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function commitValidation(uint256 jobId, bytes32 commitHash, string subdomain, bytes32[] proof)',
  'function revealValidation(uint256 jobId, bool approve, bytes32 burnTxHash, bytes32 salt, string subdomain, bytes32[] proof)',
];

const REGISTRY_ABI = [
  'event JobDisputed(uint256 indexed jobId, address indexed caller)',
  'event BurnReceiptSubmitted(uint256 indexed jobId, bytes32 burnTxHash, uint256 amount, uint256 blockNumber)',
  'function getSpecHash(uint256 jobId) view returns (bytes32)',
];

const DISPUTE_ABI = [
  'event DisputeRaised(uint256 indexed jobId, address indexed claimant, bytes32 evidenceHash)',
];

const validation = new Contract(
  VALIDATION_MODULE_ADDRESS,
  VALIDATION_ABI,
  provider
);
const registry = new Contract(JOB_REGISTRY_ADDRESS, REGISTRY_ABI, provider);
const dispute = DISPUTE_MODULE_ADDRESS
  ? new Contract(DISPUTE_MODULE_ADDRESS, DISPUTE_ABI, provider)
  : null;

function storagePath(jobId: bigint | number): string {
  return path.resolve(__dirname, '../../storage/validation', `${jobId}.json`);
}

async function evaluateJob(jobId: bigint): Promise<boolean> {
  console.log(`Evaluating job ${jobId}`);
  return true; // placeholder for real evaluation
}

async function getBurnTxHash(jobId: bigint): Promise<string> {
  const filter = registry.filters.BurnReceiptSubmitted(jobId);
  const events = await registry.queryFilter(filter, 0, 'latest');
  if (events.length === 0) return ethers.ZeroHash;
  const evt = events[events.length - 1];
  return evt.args?.burnTxHash ?? ethers.ZeroHash;
}

async function handleValidatorsSelected(jobId: bigint, validators: string[]) {
  if (!wallet) return;
  if (
    !validators
      .map((v) => v.toLowerCase())
      .includes(wallet.address.toLowerCase())
  )
    return;
  console.log(`Selected as validator for job ${jobId}`);

  const approve = await evaluateJob(jobId);
  const nonce: bigint = await validation.jobNonce(jobId);
  const specHash: string = await registry.getSpecHash(jobId);
  const burnTxHash: string = await getBurnTxHash(jobId);

  const salt = ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
    [jobId, nonce, approve, burnTxHash, salt, specHash]
  );

  const tx = await validation
    .connect(wallet)
    .commitValidation(jobId, commitHash, '', []);
  await tx.wait();

  fs.mkdirSync(path.dirname(storagePath(jobId)), { recursive: true });
  fs.writeFileSync(
    storagePath(jobId),
    JSON.stringify({ salt, approve, burnTxHash }, null, 2)
  );
  console.log(`Commit submitted for job ${jobId}`);

  scheduleReveal(jobId);
}

function scheduleReveal(jobId: bigint) {
  const delay = Number(process.env.REVEAL_DELAY_MS || 60000);
  setTimeout(() => {
    reveal(jobId).catch((err) => console.error('Reveal failed', err));
  }, delay);
}

async function reveal(jobId: bigint) {
  if (!wallet) return;
  const file = storagePath(jobId);
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    salt: string;
    approve: boolean;
    burnTxHash: string;
  };
  const tx = await validation
    .connect(wallet)
    .revealValidation(jobId, data.approve, data.burnTxHash, data.salt, '', []);
  await tx.wait();
  fs.unlinkSync(file);
  console.log(`Reveal submitted for job ${jobId}`);
}

validation.on('ValidatorsSelected', handleValidatorsSelected);
registry.on('JobDisputed', (jobId: bigint, caller: string) => {
  console.log(`Job ${jobId} disputed by ${caller}`);
});

if (dispute) {
  dispute.on(
    'DisputeRaised',
    async (jobId: bigint, claimant: string, evidenceHash: string) => {
      console.log(`Dispute raised on job ${jobId} by ${claimant}`);
      const evidence = await fetchEvidence(evidenceHash);
      await respondToDispute(jobId, evidence);
    }
  );
}

async function fetchEvidence(hash: string): Promise<string> {
  const gateway = process.env.EVIDENCE_GATEWAY || 'https://ipfs.io/ipfs/';
  try {
    const res = await fetch(gateway + hash.replace(/^0x/, ''));
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.text();
  } catch (err) {
    console.error('Failed to fetch evidence', err);
    return '';
  }
}

async function respondToDispute(jobId: bigint, evidence: string) {
  console.log(`Handling dispute for job ${jobId}`);
  console.log(evidence);
  // placeholder: respond or escalate
}

console.log('Validator service running...');
