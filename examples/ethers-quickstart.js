const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const registryAbi = [
  "function createJob(uint256 reward, string uri)",
  "function applyForJob(uint256 jobId, bytes32 label, bytes32[] proof)",
  "function submit(uint256 jobId, bytes32 resultHash, string resultURI)",
  "function raiseDispute(uint256 jobId, bytes32 evidenceHash)"
];
const stakeAbi = [
  "function depositStake(uint8 role, uint256 amount)"
];
const validationAbi = [
  "function commitValidation(uint256 jobId, bytes32 hash, bytes32 label, bytes32[] proof)",
  "function revealValidation(uint256 jobId, bool approve, bytes32 salt)",
  "function finalize(uint256 jobId)"
];

const registry = new ethers.Contract(process.env.JOB_REGISTRY, registryAbi, signer);
const stakeManager = new ethers.Contract(process.env.STAKE_MANAGER, stakeAbi, signer);
const validation = new ethers.Contract(process.env.VALIDATION_MODULE, validationAbi, signer);

async function postJob() {
  const reward = ethers.parseEther("1");
  await registry.createJob(reward, "ipfs://job");
}

async function stake(amount) {
  const parsed = ethers.parseUnits(amount.toString(), 18);
  await stakeManager.depositStake(0, parsed);
}

async function apply(jobId, label, proof) {
  await registry.applyForJob(jobId, label, proof);
}

async function submit(jobId, uri) {
  const hash = ethers.id(uri);
  await registry.submit(jobId, hash, uri);
}

async function validate(jobId, hash, label, proof, approve, salt) {
  await validation.commitValidation(jobId, hash, label, proof);
  await validation.revealValidation(jobId, approve, salt);
  await validation.finalize(jobId);
}

async function dispute(jobId, evidence) {
  const evidenceHash = ethers.id(evidence);
  await registry.raiseDispute(jobId, evidenceHash);
}

module.exports = { postJob, stake, apply, submit, validate, dispute };
