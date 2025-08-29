import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { generateCommit, scheduleReveal } from '../lib/commit';

interface Job {
  jobId: string;
  employer: string;
  agent: string;
  reward: string;
  stake: string;
  fee: string;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
    fetch(`${url}/jobs`)
      .then((res) => res.json())
      .then((data) =>
        setJobs(
          data.map((job: any) => ({
            ...job,
            reward: ethers.formatUnits(job.rewardRaw ?? job.reward, 18),
            stake: ethers.formatUnits(job.stakeRaw ?? job.stake, 18),
            fee: ethers.formatUnits(job.feeRaw ?? job.fee, 18)
          }))
        )
      )
      .catch(console.error);
  }, []);

  async function vote(jobId: string, approve: boolean) {
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
      'function commitValidation(uint256 jobId, bytes32 commitHash)',
      'function revealValidation(uint256 jobId, bool approve, bytes32 salt)'
    ];
    const contract = new ethers.Contract(validationAddr, abi, signer);
    const nonce: bigint = await contract.jobNonce(jobId);
    const { commitHash, salt } = generateCommit(BigInt(jobId), nonce, approve);
    const tx = await contract.commitValidation(jobId, commitHash);
    await tx.wait();
    setMessage('Commit submitted, scheduling reveal');
    const delay = Number(process.env.NEXT_PUBLIC_REVEAL_DELAY_MS || '5000');
    await scheduleReveal(contract, BigInt(jobId), approve, salt, delay);
    setMessage('Reveal submitted');
  }

  return (
    <main>
      <h1>Pending Jobs</h1>
      <ul>
        {jobs.map((job) => (
          <li key={job.jobId}>
            Job {job.jobId} — reward {job.reward} stake {job.stake} fee {job.fee}{' '}
            <button onClick={() => vote(job.jobId, true)}>Approve</button>{' '}
            <button onClick={() => vote(job.jobId, false)}>Reject</button>
          </li>
        ))}
      </ul>
      {message && <p>{message}</p>}
    </main>
  );
}
