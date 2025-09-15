import { JsonRpcProvider, Wallet, Contract, ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const VALIDATION_MODULE_ADDRESS = process.env.VALIDATION_MODULE_ADDRESS || '';
const JOB_REGISTRY_ADDRESS = process.env.JOB_REGISTRY_ADDRESS || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);

const VALIDATION_ABI = [
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function commitValidation(uint256 jobId, bytes32 commitHash, string subdomain, bytes32[] proof)',
];

const REGISTRY_ABI = [
  'event BurnReceiptSubmitted(uint256 indexed jobId, bytes32 burnTxHash, uint256 amount, uint256 blockNumber)',
  'function getSpecHash(uint256 jobId) view returns (bytes32)',
];

const validation = new Contract(
  VALIDATION_MODULE_ADDRESS,
  VALIDATION_ABI,
  provider
);
const registry = new Contract(JOB_REGISTRY_ADDRESS, REGISTRY_ABI, provider);

function storagePath(jobId: bigint | number): string {
  return path.resolve(__dirname, '../../storage/validation', `${jobId}.json`);
}

async function getBurnTxHash(jobId: bigint): Promise<string> {
  const filter = registry.filters.BurnReceiptSubmitted(jobId);
  const events = await registry.queryFilter(filter, 0, 'latest');
  if (events.length === 0) return ethers.ZeroHash;
  return events[events.length - 1].args?.burnTxHash ?? ethers.ZeroHash;
}

async function main() {
  const [jobIdArg, approveArg] = process.argv.slice(2);
  if (!jobIdArg) {
    console.error(
      'Usage: ts-node scripts/validator/commit.ts <jobId> [approve]'
    );
    process.exit(1);
  }
  const jobId = BigInt(jobIdArg);
  const approve = approveArg !== 'false';

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
  console.log(`Committed to job ${jobId}, tx: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
