import { ethers } from 'hardhat';
import type { DemoEnvironment } from './environment';

const encodeEntropy = (secret: bigint) => ethers.solidityPackedKeccak256(['uint256'], [secret]);
const encodeVote = (jobId: bigint, validator: string, approval: boolean, salt: bigint) =>
  ethers.solidityPackedKeccak256(['uint256', 'address', 'bool', 'uint256'], [jobId, validator, approval, salt]);

export interface JobConfig {
  domain: string;
  spec: string;
  budget: bigint;
  expectedResult: boolean;
}

export interface JobExecutionTelemetry {
  jobId: bigint;
  committee: string[];
  approvals: bigint;
  rejections: bigint;
  leaf: string;
}

export async function executeJobRound(env: DemoEnvironment, config: JobConfig, seedOffset = 0): Promise<JobExecutionTelemetry> {
  const domainHash = ethers.keccak256(ethers.toUtf8Bytes(config.domain));
  const specHash = ethers.keccak256(ethers.toUtf8Bytes(config.spec));

  const createTx = await env.demo
    .connect(env.agent.signer)
    .createJob(domainHash, specHash, config.budget, config.expectedResult);
  await createTx.wait();
  const jobId = (await env.demo.nextJobId()) - 1n;

  const entropySecrets: [bigint, bigint] = [BigInt(1000 + seedOffset), BigInt(2000 + seedOffset)];
  await env.demo.connect(env.agent.signer).commitEntropy(jobId, encodeEntropy(entropySecrets[0]));
  await env.demo.connect(env.validators[0].signer).commitEntropy(jobId, encodeEntropy(entropySecrets[1]));

  const entropyCommitWindow = (await env.demo.entropyCommitWindow()).toBigInt();
  await ethers.provider.send('evm_increaseTime', [Number(entropyCommitWindow + 1n)]);
  await ethers.provider.send('evm_mine', []);

  await env.demo.connect(env.agent.signer).revealEntropy(jobId, entropySecrets[0]);
  await env.demo.connect(env.validators[0].signer).revealEntropy(jobId, entropySecrets[1]);

  const entropyRevealWindow = (await env.demo.entropyRevealWindow()).toBigInt();
  await ethers.provider.send('evm_increaseTime', [Number(entropyRevealWindow + 1n)]);
  await ethers.provider.send('evm_mine', []);

  await env.demo.connect(env.agent.signer).launchValidation(jobId);
  const committee = await env.demo.getCommittee(jobId);

  const voteSalts = new Map<string, bigint>();
  for (let i = 0; i < committee.length; i += 1) {
    const validator = committee[i];
    const salt = BigInt(3000 + seedOffset * 10 + i);
    voteSalts.set(validator.toLowerCase(), salt);
    const signer = env.validators.find((entry) => entry.signer.address.toLowerCase() === validator.toLowerCase());
    if (!signer) throw new Error('missing validator signer');
    await env.demo.connect(signer.signer).commitVote(jobId, encodeVote(jobId, validator, config.expectedResult, salt));
  }

  const commitWindow = (await env.demo.commitWindow()).toBigInt();
  await ethers.provider.send('evm_increaseTime', [Number(commitWindow + 1n)]);
  await ethers.provider.send('evm_mine', []);

  for (const validator of committee) {
    const signer = env.validators.find((entry) => entry.signer.address.toLowerCase() === validator.toLowerCase());
    if (!signer) throw new Error('missing validator signer');
    const salt = voteSalts.get(validator.toLowerCase());
    await env.demo.connect(signer.signer).revealVote(jobId, config.expectedResult, salt!);
  }

  const revealWindow = (await env.demo.revealWindow()).toBigInt();
  await ethers.provider.send('evm_increaseTime', [Number(revealWindow + 1n)]);
  await ethers.provider.send('evm_mine', []);

  const job = await env.demo.jobs(jobId);
  const leaf = ethers.solidityPackedKeccak256(
    ['uint256', 'bool', 'bool', 'uint32', 'uint32', 'uint32', 'uint32', 'bool'],
    [jobId, config.expectedResult, true, job.approvals, job.rejections, job.reveals, job.committeeSize, job.expectedResult],
  );

  return {
    jobId,
    committee,
    approvals: job.approvals,
    rejections: job.rejections,
    leaf,
  };
}
