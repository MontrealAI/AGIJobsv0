import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { ethers, Wallet } from 'ethers';
import type { IPFSHTTPClient } from 'ipfs-http-client';

import {
  runAgentTask,
  executeJob,
  registerContextProvider,
  setAgentEndpointInvoker,
  setIpfsClientFactory,
  clearAgentMemory,
  getAgentMemory,
  type TaskExecutionContext,
} from '../agent-gateway/taskExecution';
import { AgentProfile, JobAnalysis } from '../agent-gateway/agentRegistry';
import { AgentIdentity } from '../agent-gateway/identity';
import { Job } from '../agent-gateway/types';
import { registry } from '../agent-gateway/utils';
import * as energyMonitor from '../shared/energyMonitor';
import * as telemetry from '../agent-gateway/telemetry';
import * as learning from '../agent-gateway/learning';
import * as auditLogger from '../shared/auditLogger';

interface InvocationRecord {
  endpoint: string;
  payload: unknown;
}

function createExecutionContext(
  jobId: string,
  endpoint?: string
): TaskExecutionContext {
  const wallet = Wallet.createRandom();
  const profile: AgentProfile = {
    address: wallet.address,
    ensName: 'test.agent.agi.eth',
    label: 'test-agent',
    role: 'agent',
    categories: ['analysis'],
    skills: ['nlp'],
    reputationScore: 0,
    successRate: 0,
    totalJobs: 0,
    averageEnergy: 0,
    averageDurationMs: 0,
    endpoint,
    metadata: {},
  };

  const job: Job = {
    jobId,
    employer: ethers.ZeroAddress,
    agent: wallet.address,
    rewardRaw: '1',
    reward: '1',
    stakeRaw: '0',
    stake: '0',
    feeRaw: '0',
    fee: '0',
    specHash: ethers.ZeroHash,
    uri: '',
  };

  const analysis: JobAnalysis = {
    jobId,
    reward: 1n,
    stake: 0n,
    fee: 0n,
    employer: job.employer,
    category: 'analysis',
    description: 'Unit test job',
  };

  const identity: AgentIdentity = {
    address: wallet.address,
    label: 'test-agent',
    role: 'agent',
  };

  return { job, wallet, profile, identity, analysis };
}

const resultsDir = path.resolve(__dirname, '../agent-gateway/storage/results');

const originalStartSpan = energyMonitor.startEnergySpan;
const originalEndSpan = energyMonitor.endEnergySpan;
const originalPublish = telemetry.publishEnergySample;
const originalNotify = learning.notifyTrainingOutcome;
const originalAudit = auditLogger.recordAuditEvent;
const registryAny = registry as any;
const originalRegistryConnect = registryAny.connect;
const originalRegistryTaxPolicy = registryAny.taxPolicy;

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
  (energyMonitor as any).startEnergySpan = originalStartSpan;
  (energyMonitor as any).endEnergySpan = originalEndSpan;
  (telemetry as any).publishEnergySample = originalPublish;
  (learning as any).notifyTrainingOutcome = originalNotify;
  (auditLogger as any).recordAuditEvent = originalAudit;
  registryAny.connect = originalRegistryConnect;
  registryAny.taxPolicy = originalRegistryTaxPolicy;
});

afterEach(() => {
  setAgentEndpointInvoker(null);
  setIpfsClientFactory(null);
  clearAgentMemory();
  registryAny.connect = originalRegistryConnect;
  registryAny.taxPolicy = originalRegistryTaxPolicy;
  if (fs.existsSync(resultsDir)) {
    for (const file of fs.readdirSync(resultsDir)) {
      const target = path.join(resultsDir, file);
      try {
        fs.unlinkSync(target);
      } catch {
        // ignore clean-up failures
      }
    }
  }
});

describe('runAgentTask', () => {
  it('provides orchestration context to agent invocations', async () => {
    const context = createExecutionContext('101', 'https://agent.test/run');
    const invocations: InvocationRecord[] = [];
    const dispose = registerContextProvider(async () => ({
      context: { hint: 'remember' },
      memory: [
        {
          jobId: '42',
          timestamp: new Date().toISOString(),
          success: true,
          resultURI: 'ipfs://prev',
        },
      ],
    }));

    setAgentEndpointInvoker(async (endpoint, payload) => {
      invocations.push({ endpoint, payload });
      return { ok: true };
    });

    const result = await runAgentTask(context.profile, context);
    expect(result.output).to.deep.equal({ ok: true });
    expect(result.orchestration.context).to.have.property('hint', 'remember');
    expect(invocations).to.have.lengthOf(1);
    const sent = invocations[0].payload as any;
    expect(sent.context).to.have.property('hint', 'remember');
    expect(sent.memory).to.be.an('array').with.lengthOf(1);
    expect(sent.memory[0].jobId).to.equal('42');

    dispose();
  });

  it('falls back to generated output when the endpoint fails', async () => {
    const context = createExecutionContext('102', 'https://agent.example/run');
    setAgentEndpointInvoker(async () => {
      throw new Error('network error');
    });

    const result = await runAgentTask(context.profile, context);
    expect(result.output).to.have.property('summary', 'Autogenerated fallback solution');
    expect(result.error).to.be.instanceOf(Error);
  });
});

describe('executeJob', () => {
  it('uploads results to IPFS and finalizes when supported', async () => {
    const context = createExecutionContext('201', 'https://agent.finalize');
    setAgentEndpointInvoker(async () => ({ response: 'ok' }));
    setIpfsClientFactory(() => ({
      add: async () => ({ cid: { toString: () => 'bafytestcid' } }),
    } as unknown as IPFSHTTPClient));

    registryAny.taxPolicy = async () => ethers.ZeroAddress;
    let finalizeArgs: { jobId: string; resultRef: string } | null = null;
    registryAny.connect = () => ({
      finalizeJob: async (jobId: string, resultRef: string) => {
        finalizeArgs = { jobId, resultRef };
        return { hash: '0xfinalize', wait: async () => ({}) };
      },
      submit: async () => {
        throw new Error('submit should not be called');
      },
    });

    const result = await executeJob(context);
    expect(result.resultURI).to.equal('ipfs://bafytestcid');
    expect(result.resultCid).to.equal('bafytestcid');
    expect(result.txHash).to.equal('0xfinalize');
    expect(result.submissionMethod).to.equal('finalizeJob');
    expect(finalizeArgs).to.deep.equal({
      jobId: context.job.jobId,
      resultRef: 'ipfs://bafytestcid',
    });

    const history = getAgentMemory(context.profile.address);
    expect(history).to.have.lengthOf(1);
    expect(history[0].method).to.equal('finalizeJob');
    expect(history[0].resultURI).to.equal('ipfs://bafytestcid');
  });

  it('falls back to submit when finalizeJob reverts', async () => {
    const context = createExecutionContext('202', 'https://agent.submit');
    setAgentEndpointInvoker(async () => ({ job: 'done' }));
    setIpfsClientFactory(() => ({
      add: async () => ({ cid: { toString: () => 'bafysubmitcid' } }),
    } as unknown as IPFSHTTPClient));

    registryAny.taxPolicy = async () => ethers.ZeroAddress;
    let submitCalled = 0;
    registryAny.connect = () => ({
      finalizeJob: async () => {
        throw new Error('unsupported');
      },
      submit: async () => {
        submitCalled += 1;
        return { hash: '0xsubmit', wait: async () => ({}) };
      },
    });

    const result = await executeJob(context);
    expect(submitCalled).to.equal(1);
    expect(result.txHash).to.equal('0xsubmit');
    expect(result.submissionMethod).to.equal('submit');
    expect(result.resultURI).to.equal('ipfs://bafysubmitcid');

    const history = getAgentMemory(context.profile.address);
    expect(history[0].method).to.equal('submit');
    expect(history[0].resultURI).to.equal('ipfs://bafysubmitcid');
  });
});
