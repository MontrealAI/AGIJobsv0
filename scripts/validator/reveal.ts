import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import fs from 'fs';
import path from 'path';

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const VALIDATION_MODULE_ADDRESS = process.env.VALIDATION_MODULE_ADDRESS || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);

const VALIDATION_ABI = [
  'function revealValidation(uint256 jobId, bool approve, bytes32 burnTxHash, bytes32 salt, string subdomain, bytes32[] proof)',
];

const validation = new Contract(
  VALIDATION_MODULE_ADDRESS,
  VALIDATION_ABI,
  provider
);

function storagePath(jobId: bigint | number): string {
  return path.resolve(__dirname, '../../storage/validation', `${jobId}.json`);
}

async function main() {
  const jobIdArg = process.argv[2];
  if (!jobIdArg) {
    console.error('Usage: ts-node scripts/validator/reveal.ts <jobId>');
    process.exit(1);
  }
  const jobId = BigInt(jobIdArg);
  const file = storagePath(jobId);
  if (!fs.existsSync(file)) {
    console.error('No commit data found for job', jobId.toString());
    process.exit(1);
  }
  const { salt, approve, burnTxHash } = JSON.parse(
    fs.readFileSync(file, 'utf8')
  ) as { salt: string; approve: boolean; burnTxHash: string };
  const tx = await validation
    .connect(wallet)
    .revealValidation(jobId, approve, burnTxHash, salt, '', []);
  await tx.wait();
  fs.unlinkSync(file);
  console.log(`Revealed validation for job ${jobId}, tx: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
