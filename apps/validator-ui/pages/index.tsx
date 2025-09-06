import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { generateCommit, scheduleReveal } from '../lib/commit';
import agiConfig from '../../../config/agialpha.json';

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
          alert(
            `Configured decimals (${DECIMALS}) do not match on-chain decimals (${chainDecimals}).`
          );
          setMessage('Token decimals mismatch; jobs cannot be displayed');
          return;
        }
        const url =
          process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
        const data = await fetch(`${url}/jobs`).then((res) => res.json());
        setJobs(
          data.map((job: any) => ({
            ...job,
            reward: ethers.formatUnits(job.rewardRaw ?? job.reward, DECIMALS),
            stake: ethers.formatUnits(job.stakeRaw ?? job.stake, DECIMALS),
            fee: ethers.formatUnits(job.feeRaw ?? job.fee, DECIMALS),
            specHash: job.specHash ?? ethers.ZeroHash
          }))
        );
      } catch (err) {
        console.error(err);
      }
    }
    loadJobs();
  }, []);

  async function vote(jobId: string, approve: boolean, specHash: string) {
    if (!(window as any).ethereum) {
      alert('wallet not found');
      return;
    }
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const validationAddr = process.env.NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS;
    if (!validationAddr) {
      alert('validation module not configured');
      return;
    }
    const abi = [
      'function jobNonce(uint256 jobId) view returns (uint256)',
      'function commitValidation(uint256 jobId, bytes32 commitHash, string subdomain, bytes32[] proof)',
      'function revealValidation(uint256 jobId, bool approve, bytes32 salt, string subdomain, bytes32[] proof)'
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
            Job {job.jobId} — reward {job.reward} stake {job.stake} fee {job.fee}{' '}
            <button onClick={() => vote(job.jobId, true, job.specHash)}>Approve</button>{' '}
            <button onClick={() => vote(job.jobId, false, job.specHash)}>Reject</button>
          </li>
        ))}
      </ul>
      {message && <p>{message}</p>}
    </main>
  );
}
