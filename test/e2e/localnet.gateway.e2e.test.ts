import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

import { ethers } from 'hardhat';
import type { Wallet } from 'ethers';
import type { IPFSHTTPClient } from 'ipfs-http-client';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/localnet-artifacts.json');
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as {
  token: { initialMint: string; decimals: number };
  job: {
    subdomain: string;
    specHash: string;
    uri: string;
    reward: string;
    deadlineOffsetSeconds: number;
    analysisDescription: string;
  };
  agent: {
    ensRoot: string;
    summary: string;
    resultCid: string;
    deterministicSalt: string;
  };
  timestamps: { base: number };
  expected: { resultURI: string; submissionMethod: string };
};

// The agent gateway utilities validate their environment eagerly when the
// module loads. Seed the required variables with deterministic placeholders
// before importing the helper so the tests can overwrite the deployed
// contracts once the local stack is ready.
process.env.RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
process.env.JOB_REGISTRY_ADDRESS =
  process.env.JOB_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000001';
process.env.VALIDATION_MODULE_ADDRESS =
  process.env.VALIDATION_MODULE_ADDRESS ||
  '0x0000000000000000000000000000000000000002';
process.env.STAKE_MANAGER_ADDRESS =
  process.env.STAKE_MANAGER_ADDRESS || '0x0000000000000000000000000000000000000003';
process.env.DISPUTE_MODULE_ADDRESS =
  process.env.DISPUTE_MODULE_ADDRESS || '0x0000000000000000000000000000000000000004';
process.env.KEYSTORE_URL = process.env.KEYSTORE_URL ||
  'http://127.0.0.1:65535/keystore.json';

// Import agent gateway helpers *after* seeding the environment.
const gatewayUtils = require('../../agent-gateway/utils');

import type { TaskExecutionContext } from '../../agent-gateway/taskExecution';

const taskExecution: typeof import('../../agent-gateway/taskExecution') = require(
  '../../agent-gateway/taskExecution'
);
const { executeJob, clearAgentMemory, setAgentEndpointInvoker, setIpfsClientFactory } =
  taskExecution;
import type { AgentProfile } from '../../agent-gateway/agentRegistry';
import type { AgentIdentity } from '../../agent-gateway/identity';
import type { Job } from '../../agent-gateway/types';
import * as energyMonitor from '../../shared/energyMonitor';
import * as telemetry from '../../agent-gateway/telemetry';
import * as learning from '../../agent-gateway/learning';
import * as auditLogger from '../../shared/auditLogger';

const { token: tokenFixture, job, agent: agentFixture, timestamps, expected } = fixture;

const RESULT_DIRS = [
  path.resolve(__dirname, '../../storage/results'),
  path.resolve(__dirname, '../../agent-gateway/storage/results'),
];

const originalEnergyStart = energyMonitor.startEnergySpan;
const originalEnergyEnd = energyMonitor.endEnergySpan;
const originalTelemetryPublish = telemetry.publishEnergySample;
const originalLearningNotify = learning.notifyTrainingOutcome;
const originalAuditRecord = auditLogger.recordAuditEvent;

function createAgentProfile(agent: Wallet): AgentProfile {
  return {
    address: agent.address,
    ensName: `${job.subdomain}.${agentFixture.ensRoot}`,
    label: job.subdomain,
    role: 'agent',
    categories: ['analysis'],
    skills: ['nlp'],
    reputationScore: 0,
    successRate: 0,
    totalJobs: 0,
    averageEnergy: 0,
    averageDurationMs: 0,
    metadata: {},
  } as AgentProfile;
}

async function deployLocalSystem() {
  const [owner, employer, agent] = (await ethers.getSigners()) as unknown as Wallet[];

  const Token = await ethers.getContractFactory('contracts/test/MockERC20.sol:MockERC20');
  const token = await Token.deploy();
  await token.waitForDeployment();

  const registryFactory = await ethers.getContractFactory(
    'contracts/test/SimpleJobRegistry.sol:SimpleJobRegistry'
  );
  const registry = await registryFactory.deploy(await token.getAddress());
  await registry.waitForDeployment();

  const initialBalance = ethers.parseUnits(tokenFixture.initialMint, tokenFixture.decimals);
  await token.connect(owner).transfer(employer.address, initialBalance);
  await token.connect(owner).transfer(agent.address, initialBalance);

  return {
    owner,
    employer,
    agent,
    token,
    registry,
  };
}

describe('Agent gateway localnet E2E', function () {
  this.timeout(120_000);

  before(() => {
    const isoBase = new Date(timestamps.base * 1000).toISOString();
    (energyMonitor as any).startEnergySpan = () => ({
      id: 'span',
      startedAt: isoBase,
      cpuStart: { user: 0, system: 0 } as NodeJS.CpuUsage,
      hrtimeStart: BigInt(0),
      context: {},
    });
    (energyMonitor as any).endEnergySpan = async () => ({
      spanId: 'span',
      startedAt: isoBase,
      finishedAt: isoBase,
      durationMs: 1,
      runtimeMs: 1,
      cpuTimeMs: 1,
      gpuTimeMs: 0,
      cpuUserUs: 1,
      cpuSystemUs: 0,
      cpuTotalUs: 1,
      cpuCycles: 1,
      gpuCycles: 0,
      memoryRssBytes: 0,
      energyEstimate: 1,
    });
    (telemetry as any).publishEnergySample = async () => {};
    (learning as any).notifyTrainingOutcome = async () => {};
    (auditLogger as any).recordAuditEvent = async () => ({}) as any;
  });

  after(() => {
    (energyMonitor as any).startEnergySpan = originalEnergyStart;
    (energyMonitor as any).endEnergySpan = originalEnergyEnd;
    (telemetry as any).publishEnergySample = originalTelemetryPublish;
    (learning as any).notifyTrainingOutcome = originalLearningNotify;
    (auditLogger as any).recordAuditEvent = originalAuditRecord;
  });

  afterEach(() => {
    clearAgentMemory();
    setAgentEndpointInvoker(null);
    setIpfsClientFactory(null);
    for (const dir of RESULT_DIRS) {
      if (!fs.existsSync(dir)) {
        continue;
      }
      for (const file of fs.readdirSync(dir)) {
        const target = path.join(dir, file);
        try {
          fs.unlinkSync(target);
        } catch {
          /* ignore clean-up issues */
        }
      }
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore directory removal issues */
      }
    }
    const energyLog = path.resolve(__dirname, '../../data/energy-metrics.jsonl');
    if (fs.existsSync(energyLog)) {
      try {
        fs.rmSync(energyLog);
      } catch {
        /* ignore clean-up issues */
      }
    }
  });

  it('runs job post → apply → validate → finalize on a deterministic localnet', async () => {
    const env = await deployLocalSystem();
    const { employer, agent, token, registry } = env;

    const validationFactory = await ethers.getContractFactory(
      'contracts/test/DeterministicValidationModule.sol:DeterministicValidationModule'
    );
    const validation = await validationFactory.deploy();
    await validation.waitForDeployment();
    await validation.setValidators([agent.address]);
    await validation.setResult(true);
    gatewayUtils.validation = validation;

    const registryProxy = gatewayUtils.registry as any;
    registryProxy.connect = (wallet: Wallet) => {
      const connected = registry.connect(wallet);
      return new Proxy(connected, {
        get(target, prop, receiver) {
          if (prop === 'submit') {
            return async (...args: unknown[]) => {
              const normalised = [...args];
              if (normalised.length >= 5) {
                const proof = normalised[4];
                if (Array.isArray(proof)) {
                  normalised[4] = proof.length === 0 ? '0x' : proof;
                }
              }
              return (target as any).submit(...normalised);
            };
          }
          return Reflect.get(target as any, prop, receiver);
        },
      });
    };
    registryProxy.taxPolicy = async () => ethers.ZeroAddress;

    gatewayUtils.stakeManager = null;

    const subdomain = job.subdomain;

    const reward = ethers.parseUnits(job.reward, tokenFixture.decimals);
    await token
      .connect(employer)
      .approve(await registry.getAddress(), reward);

    const latestBlock = await ethers.provider.getBlock('latest');
    const currentTimestamp = Number(latestBlock?.timestamp ?? timestamps.base);
    const scheduledTimestamp = Math.max(timestamps.base, currentTimestamp + 1);
    await ethers.provider.send('evm_setNextBlockTimestamp', [scheduledTimestamp]);
    const deadline = BigInt(scheduledTimestamp + job.deadlineOffsetSeconds);
    const specHash = job.specHash as `0x${string}`;
    const jobUri = job.uri;

    const createTx = await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, jobUri);
    await createTx.wait();

    const nextJobId = await registry.nextJobId();
    const jobId = nextJobId - 1n;

    await registry.connect(agent).applyForJob(jobId, subdomain, '0x');

    const profile = createAgentProfile(agent);
    const identity: AgentIdentity = {
      address: agent.address,
      ensName: `${subdomain}.${agentFixture.ensRoot}`,
      label: subdomain,
      role: 'agent',
    };

    const chainJob = await registry.jobs(jobId);
    const jobPayload: Job = {
      jobId: jobId.toString(),
      employer: chainJob.employer,
      agent: chainJob.agent,
      rewardRaw: chainJob.reward.toString(),
      reward: ethers.formatUnits(chainJob.reward, tokenFixture.decimals),
      stakeRaw: chainJob.stake.toString(),
      stake: ethers.formatUnits(chainJob.stake, tokenFixture.decimals),
      feeRaw: '0',
      fee: '0',
      specHash,
      uri: jobUri,
    };

    setAgentEndpointInvoker(async () => ({
      summary: agentFixture.summary,
      version: 1,
    }));

    setIpfsClientFactory(
      () =>
        ({
          add: async () => ({
            cid: { toString: () => agentFixture.resultCid },
          }),
        } as unknown as IPFSHTTPClient)
    );

    const context: TaskExecutionContext = {
      job: jobPayload,
      wallet: agent,
      profile,
      identity,
      analysis: {
        jobId: jobId.toString(),
        reward: Number(ethers.formatUnits(reward, tokenFixture.decimals)),
        stake: 0,
        fee: 0,
        employer: chainJob.employer,
        category: 'analysis',
        description: job.analysisDescription,
      },
    };

    const execution = await executeJob(context);

    expect(execution.resultURI).to.equal(expected.resultURI);
    expect(execution.submissionMethod).to.equal(expected.submissionMethod);

    const submittedJob = await registry.job(jobId);
    expect(submittedJob.submitted).to.equal(true);
    expect(submittedJob.resultURI).to.equal(expected.resultURI);

    const initialAgentBalance = await token.balanceOf(agent.address);

    const nonceBeforeCommit = await validation.jobNonce(jobId);
    const deterministicSalt = agentFixture.deterministicSalt as `0x${string}`;
    const commitHash = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32'],
      [jobId, nonceBeforeCommit, true, deterministicSalt]
    );

    const commitTx = await validation
      .connect(agent)
      .commitValidation(jobId, commitHash, subdomain, []);
    await commitTx.wait();

    const commitRecord = await validation.getCommitRecord(jobId, agent.address);
    expect(commitRecord.commitHash).to.equal(commitHash);
    expect(commitRecord.subdomain).to.equal(subdomain);
    expect(commitRecord.nonce).to.equal(nonceBeforeCommit);
    expect(commitRecord.exists).to.equal(true);

    const revealTx = await validation
      .connect(agent)
      .revealValidation(jobId, true, deterministicSalt, subdomain, []);
    await revealTx.wait();

    const revealRecord = await validation.getRevealRecord(jobId, agent.address);
    expect(revealRecord.approve).to.equal(true);
    expect(revealRecord.salt).to.equal(deterministicSalt);
    expect(revealRecord.subdomain).to.equal(subdomain);
    expect(revealRecord.exists).to.equal(true);

    expect(await validation.finalized(jobId)).to.equal(false);

    const finalizeValidationTx = await validation.finalize(jobId);
    await finalizeValidationTx.wait();

    expect(await validation.finalized(jobId)).to.equal(true);
    const [validators, participants, commitDeadline, revealDeadline, approvals, rejections, tallied, committeeSize] =
      await validation.rounds(jobId);
    expect(validators).to.deep.equal([agent.address]);
    expect(participants).to.deep.equal([agent.address]);
    expect(commitDeadline).to.equal(0n);
    expect(revealDeadline).to.equal(0n);
    expect(approvals).to.equal(1n);
    expect(rejections).to.equal(0n);
    expect(tallied).to.equal(true);
    expect(committeeSize).to.equal(1n);
    expect(await validation.jobNonce(jobId)).to.equal(nonceBeforeCommit + 1n);

    await registry
      .connect(agent)
      .finalizeJob(jobId, execution.resultURI ?? expected.resultURI);

    const finalizedJob = await registry.job(jobId);
    expect(finalizedJob.finalized).to.equal(true);

    const agentBalance = await token.balanceOf(agent.address);
    expect(agentBalance).to.equal(initialAgentBalance + reward);
  });
});

