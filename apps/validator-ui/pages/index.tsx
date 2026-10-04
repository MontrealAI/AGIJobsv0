import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { generateCommit, scheduleReveal } from '../lib/commit';
import { verifyEnsSubdomain } from '../lib/ens';
import agiConfig from '../../../config/agialpha.json';
import { useError } from '../lib/error';

interface Job {
  jobId: string;
  employer: string;
  agent: string;
  reward: string;
  stake: string;
  fee: string;
  specHash: string;
}

const DECIMALS = Number(
  process.env.NEXT_PUBLIC_AGIALPHA_DECIMALS ?? agiConfig.decimals
);

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState('');
  const { setError } = useError();

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

  const formatUnitsValue = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
      return ethers.formatUnits(value, DECIMALS);
    }
    return ethers.formatUnits(0, DECIMALS);
  };

  const toJobId = (value: unknown): string => {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return '';
  };

  useEffect(() => {
    async function loadJobs() {
      try {
        const rpcUrl =
          process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545';
        const agiAddress =
          process.env.NEXT_PUBLIC_AGIALPHA_ADDRESS || agiConfig.address;
        const tokenAbi = ['function decimals() view returns (uint8)'];
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const token = new ethers.Contract(agiAddress, tokenAbi, provider);
        const chainDecimals = Number(await token.decimals());
        if (chainDecimals !== DECIMALS) {
          setError(
            `Configured decimals (${DECIMALS}) do not match on-chain decimals (${chainDecimals}).`
          );
          setMessage('Token decimals mismatch; jobs cannot be displayed');
          return;
        }
        const url =
          process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
        const timeout = Number(
          process.env.NEXT_PUBLIC_FETCH_TIMEOUT_MS || '5000'
        );
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const data: unknown = await fetch(`${url}/jobs`, { signal: controller.signal })
          .then((res) => res.json())
          .finally(() => clearTimeout(timer));
        if (!Array.isArray(data)) {
          setJobs([]);
          setMessage('No jobs available');
          return;
        }
        const parsedJobs = data
          .map((entry) => {
            if (!isRecord(entry)) {
              return null;
            }
            const jobId = toJobId(entry.jobId);
            if (!jobId) {
              return null;
            }
            return {
              jobId,
              employer: String(entry.employer ?? ''),
              agent: String(entry.agent ?? ''),
              reward: formatUnitsValue(entry.rewardRaw ?? entry.reward),
              stake: formatUnitsValue(entry.stakeRaw ?? entry.stake),
              fee: formatUnitsValue(entry.feeRaw ?? entry.fee),
              specHash:
                typeof entry.specHash === 'string' ? entry.specHash : ethers.ZeroHash,
            } satisfies Job;
          })
          .filter((entry): entry is Job => entry !== null);
        setJobs(parsedJobs);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.error('Job fetch timed out');
          setMessage('Job request timed out');
        } else {
          console.error(err);
        }
      }
    }
    loadJobs();
  }, []);

  async function vote(jobId: string, approve: boolean, specHash: string) {
    if (!window.ethereum) {
      setError('wallet not found');
      return;
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const addr = await signer.getAddress();
    const warning = await verifyEnsSubdomain(provider, addr);
    if (warning) setError(warning);
    const validationAddr = process.env.NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS;
    if (!validationAddr) {
      setError('validation module not configured');
      return;
    }
    const abi = [
      'function jobNonce(uint256 jobId) view returns (uint256)',
      'function commitValidation(uint256 jobId, bytes32 commitHash, string subdomain, bytes32[] proof)',
      'function revealValidation(uint256 jobId, bool approve, bytes32 salt, string subdomain, bytes32[] proof)',
    ];
    const contract = new ethers.Contract(validationAddr, abi, signer);
    const nonce: bigint = await contract.jobNonce(jobId);
    const { commitHash, salt } = generateCommit(
      BigInt(jobId),
      nonce,
      approve,
      undefined,
      specHash
    );
    const tx = await contract.commitValidation(jobId, commitHash, '', []);
    await tx.wait();
    setMessage('Commit submitted, scheduling reveal');
    const delay = Number(process.env.NEXT_PUBLIC_REVEAL_DELAY_MS || '5000');
    await scheduleReveal(
      contract,
      BigInt(jobId),
      approve,
      salt,
      delay,
      specHash
    );
    setMessage('Reveal submitted');
  }

  return (
    <main>
      <h1>Pending Jobs</h1>
      <ul>
        {jobs.map((job) => (
          <li key={job.jobId}>
            Job {job.jobId} — reward {job.reward} stake {job.stake} fee{' '}
            {job.fee}{' '}
            <button onClick={() => vote(job.jobId, true, job.specHash)}>
              Approve
            </button>{' '}
            <button onClick={() => vote(job.jobId, false, job.specHash)}>
              Reject
            </button>
          </li>
        ))}
      </ul>
      {message && <p>{message}</p>}
    </main>
  );
}
