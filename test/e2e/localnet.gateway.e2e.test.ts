import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

import { ethers } from 'hardhat';
import type { Wallet } from 'ethers';
import type { IPFSHTTPClient } from 'ipfs-http-client';

import { AGIALPHA_DECIMALS } from '../../scripts/constants';

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
// eslint-disable-next-line @typescript-eslint/no-var-requires
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

const RESULTS_DIR = path.resolve(
  __dirname,
  '../../agent-gateway/storage/results'
);

const originalEnergyStart = energyMonitor.startEnergySpan;
const originalEnergyEnd = energyMonitor.endEnergySpan;
const originalTelemetryPublish = telemetry.publishEnergySample;
const originalLearningNotify = learning.notifyTrainingOutcome;
const originalAuditRecord = auditLogger.recordAuditEvent;

function createAgentProfile(agent: Wallet): AgentProfile {
  return {
    address: agent.address,
    ensName: 'agent.local.agent.agi.eth',
    label: 'local-agent',
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

  const initialBalance = ethers.parseUnits('1000', AGIALPHA_DECIMALS);
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
    (energyMonitor as any).startEnergySpan = () => ({
      id: 'span',
      startedAt: new Date().toISOString(),
      cpuStart: { user: 0, system: 0 } as NodeJS.CpuUsage,
      hrtimeStart: BigInt(0),
      context: {},
    });
    (energyMonitor as any).endEnergySpan = async () => ({
      spanId: 'span',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
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
    if (fs.existsSync(RESULTS_DIR)) {
      for (const file of fs.readdirSync(RESULTS_DIR)) {
        const target = path.join(RESULTS_DIR, file);
        try {
          fs.unlinkSync(target);
        } catch {
          /* ignore clean-up issues */
        }
      }
    }
  });

  it('runs job post → apply → validate → finalize on a deterministic localnet', async () => {
    const env = await deployLocalSystem();
    const { employer, agent, token, registry } = env;

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

    gatewayUtils.validation = null;
    gatewayUtils.stakeManager = null;

    const subdomain = 'local-agent';

    const reward = ethers.parseUnits('25', AGIALPHA_DECIMALS);
    await token
      .connect(employer)
      .approve(await registry.getAddress(), reward);

    const latestBlock = await ethers.provider.getBlock('latest');
    const baseTimestamp = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
    const deadline = BigInt(baseTimestamp + 7200);
    const specHash = ethers.id('spec://local');
    const jobUri = 'ipfs://local-job';

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
      ensName: `${subdomain}.agent.agi.eth`,
      label: subdomain,
      role: 'agent',
    };

    const chainJob = await registry.jobs(jobId);
    const job: Job = {
      jobId: jobId.toString(),
      employer: chainJob.employer,
      agent: chainJob.agent,
      rewardRaw: chainJob.reward.toString(),
      reward: ethers.formatUnits(chainJob.reward, AGIALPHA_DECIMALS),
      stakeRaw: chainJob.stake.toString(),
      stake: ethers.formatUnits(chainJob.stake, AGIALPHA_DECIMALS),
      feeRaw: '0',
      fee: '0',
      specHash,
      uri: jobUri,
    };

    setAgentEndpointInvoker(async () => ({
      summary: 'deterministic-output',
      version: 1,
    }));

    setIpfsClientFactory(
      () =>
        ({
          add: async () => ({
            cid: { toString: () => 'bafy-local-cid-1' },
          }),
        } as unknown as IPFSHTTPClient)
    );

    const context: TaskExecutionContext = {
      job,
      wallet: agent,
      profile,
      identity,
      analysis: {
        jobId: jobId.toString(),
        reward: Number(ethers.formatUnits(reward, AGIALPHA_DECIMALS)),
        stake: 0,
        fee: 0,
        employer: chainJob.employer,
        category: 'analysis',
        description: 'Localnet pipeline',
      },
    };

    const execution = await executeJob(context);

    expect(execution.resultURI).to.equal('ipfs://bafy-local-cid-1');
    expect(execution.submissionMethod).to.equal('submit');

    const submittedJob = await registry.job(jobId);
    expect(submittedJob.submitted).to.equal(true);
    expect(submittedJob.resultURI).to.equal('ipfs://bafy-local-cid-1');

    const initialAgentBalance = await token.balanceOf(agent.address);

    await registry
      .connect(agent)
      .finalizeJob(jobId, execution.resultURI ?? 'ipfs://bafy-local-cid-1');

    const finalizedJob = await registry.job(jobId);
    expect(finalizedJob.finalized).to.equal(true);

    const agentBalance = await token.balanceOf(agent.address);
    expect(agentBalance).to.equal(initialAgentBalance + reward);
  });
});

