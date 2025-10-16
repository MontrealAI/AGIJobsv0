import { ethers } from 'ethers';

const jobRegistryAbi = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, uint256 reward, uint64 deadline, bytes32 specHash, string uri)',
  'function acknowledgeAndCreateJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)',
  'function jobs(uint256 jobId) view returns (tuple(address employer,address agent,uint128 reward,uint96 stake,uint128 burnReceiptAmount,bytes32 uriHash,bytes32 resultHash,bytes32 specHash,uint256 packedMetadata))'
];

const validationModuleAbi = [
  'function commitValidation(uint256 jobId, bytes32 commitHash, string subdomain, bytes32[] proof)',
  'function revealValidation(uint256 jobId, bool approve, bytes32 burnTxHash, bytes32 salt, string subdomain, bytes32[] proof)',
  'function finalize(uint256 jobId)',
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)'
];

const stakeManagerAbi = [
  'function depositStake(uint8 role, uint256 amount)'
];

const AGENT_ROLE = 0;

function requireAddress(key: string): string {
  const value = import.meta.env[`VITE_${key}`];
  if (!value) {
    throw new Error(`Missing VITE_${key} in webapp environment.`);
  }
  return value;
}

function getProvider() {
  const anyWindow = window as any;
  if (!anyWindow.ethereum) {
    throw new Error('No injected wallet detected.');
  }
  return new ethers.BrowserProvider(anyWindow.ethereum);
}

export async function postJob(specURI: string) {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const jobRegistryAddress = requireAddress('JOB_REGISTRY');
  const contract = new ethers.Contract(jobRegistryAddress, jobRegistryAbi, signer);
  const reward = ethers.parseUnits(import.meta.env.VITE_DEFAULT_REWARD ?? '1', 18);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const specHash = ethers.keccak256(ethers.toUtf8Bytes(specURI));
  const tx = await contract.acknowledgeAndCreateJob(reward, deadline, specHash, specURI);
  const receipt = await tx.wait();
  let jobId: bigint | null = null;
  if (receipt?.logs) {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed.name === 'JobCreated') {
          jobId = parsed.args.jobId as bigint;
          break;
        }
      } catch {
        continue;
      }
    }
  }
  return {
    txHash: tx.hash,
    jobId: jobId ? Number(jobId) : undefined,
  };
}

export async function listOpenJobs() {
  const provider = getProvider();
  const jobRegistryAddress = requireAddress('JOB_REGISTRY');
  const contract = new ethers.Contract(jobRegistryAddress, jobRegistryAbi, provider);
  const latest = await provider.getBlockNumber();
  const start = Math.max(0, Number(latest) - 5000);
  const events = await contract.queryFilter('JobCreated', start, latest);
  return events.map((ev) => ({
    id: Number(ev.args?.jobId ?? 0n),
    specURI: ev.args?.uri as string,
    employer: ev.args?.employer as string,
  }));
}

export async function validateJob(jobId: number, approve: boolean) {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const validationAddress = requireAddress('VALIDATION_MODULE');
  const contract = new ethers.Contract(validationAddress, validationModuleAbi, signer);
  const nonce = await contract.jobNonce(jobId);
  const specHash = await requireJobSpecHash(jobId);
  const domainSeparator = await contract.DOMAIN_SEPARATOR();
  const validator = await signer.getAddress();
  const burnTxHash = ethers.ZeroHash;
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const encodedOutcome = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'bytes32', 'bool', 'bytes32'],
    [nonce, specHash, approve, burnTxHash]
  );
  const outcomeHash = ethers.keccak256(encodedOutcome);
  const encodedCommit = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
    [jobId, outcomeHash, salt, validator, BigInt((await provider.getNetwork()).chainId), domainSeparator]
  );
  const commitHash = ethers.keccak256(encodedCommit);
  const subdomain = import.meta.env.VITE_VALIDATOR_SUBDOMAIN ?? '';
  const commitTx = await contract.commitValidation(jobId, commitHash, subdomain, []);
  await commitTx.wait();
  const revealTx = await contract.revealValidation(jobId, approve, burnTxHash, salt, subdomain, []);
  await revealTx.wait();
  const finalizeTx = await contract.finalize(jobId);
  await finalizeTx.wait();
  return { commitHash, salt, burnTxHash, txHash: finalizeTx.hash };
}

async function requireJobSpecHash(jobId: number) {
  const provider = getProvider();
  const jobRegistryAddress = requireAddress('JOB_REGISTRY');
  const contract = new ethers.Contract(jobRegistryAddress, jobRegistryAbi, provider);
  const job = await contract.jobs(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  return job.specHash;
}

export async function ensureAgentStake(amount: string) {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const stakeManagerAddress = requireAddress('STAKE_MANAGER');
  const stakeManager = new ethers.Contract(stakeManagerAddress, stakeManagerAbi, signer);
  const parsed = ethers.parseUnits(amount, 18);
  const tx = await stakeManager.depositStake(AGENT_ROLE, parsed);
  await tx.wait();
  return tx.hash;
}
