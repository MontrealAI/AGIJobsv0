import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { loadAlphaNodeConfig } from '../src/config';
import { JobLifecycle, JobLifecycleContext } from '../src/blockchain/jobs';
import { fixturePath } from './test-utils';

class FakeTx {
  constructor(readonly hash: string) {}
  async wait(): Promise<{ blockNumber: number }> {
    return { blockNumber: 123 };
  }
}

class FakeJobRegistry {
  public readonly jobsCalls: bigint[] = [];
  public readonly submits: Array<{ jobId: bigint; resultHash: string; uri: string }> = [];
  private readonly jobStructs: Map<bigint, unknown[]> = new Map();
  private readonly logs: any[];
  private shouldFinalizeFail = false;

  constructor(logs: any[]) {
    this.logs = logs;
  }

  setJob(jobId: bigint, struct: unknown[]): void {
    this.jobStructs.set(jobId, struct);
  }

  failFinalize(): void {
    this.shouldFinalizeFail = true;
  }

  async queryFilter(): Promise<any[]> {
    return this.logs;
  }

  async jobs(jobId: bigint): Promise<unknown[]> {
    this.jobsCalls.push(jobId);
    return this.jobStructs.get(jobId) ?? [];
  }

  async applyForJob(): Promise<FakeTx> {
    return new FakeTx('0xapply');
  }

  async submit(jobId: bigint, resultHash: string, uri: string): Promise<FakeTx> {
    this.submits.push({ jobId, resultHash, uri });
    return new FakeTx('0xsubmit');
  }

  async finalize(): Promise<FakeTx> {
    if (this.shouldFinalizeFail) {
      throw new Error('not ready');
    }
    return new FakeTx('0xfinalize');
  }
}

function makeWallet(): Wallet {
  const provider = {
    async getBlockNumber(): Promise<number> {
      return 2048;
    }
  } as any;
  return new Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', provider);
}

async function makeLifecycle(registry: FakeJobRegistry): Promise<JobLifecycle> {
  const config = await loadAlphaNodeConfig(fixturePath('mainnet.guide.json'));
  const context: JobLifecycleContext = { signer: makeWallet(), config, registry: registry as any };
  return new JobLifecycle(context);
}

test('job lifecycle discovery filters closed jobs', async () => {
  const logs = [
    {
      args: {
        jobId: 1n,
        employer: '0x1111111111111111111111111111111111111111',
        agent: '0x0000000000000000000000000000000000000000',
        reward: 1000n,
        stake: 200n,
        fee: 10n,
        specHash: '0x' + '1'.repeat(64),
        uri: 'ipfs://alpha'
      },
      blockNumber: 2000,
      transactionHash: '0xjob1'
    },
    {
      args: {
        jobId: 2n,
        employer: '0x2222222222222222222222222222222222222222',
        agent: '0x3333333333333333333333333333333333333333',
        reward: 500n,
        stake: 50n,
        fee: 5n,
        specHash: '0x' + '2'.repeat(64),
        uri: 'ipfs://closed'
      },
      blockNumber: 1990,
      transactionHash: '0xjob2'
    }
  ];
  const registry = new FakeJobRegistry(logs);
  const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
  registry.setJob(1n, [logs[0].args.employer, logs[0].args.agent, 1000n, 200n, 0n, zeroHash, zeroHash, logs[0].args.specHash]);
  registry.setJob(2n, [logs[1].args.employer, logs[1].args.agent, 500n, 50n, 0n, zeroHash, '0x1234', logs[1].args.specHash]);
  const lifecycle = await makeLifecycle(registry);
  const jobs = await lifecycle.discover();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].jobId, 1n);
  const opportunities = lifecycle.toOpportunities(jobs);
  assert.equal(opportunities.length, 1);
  assert(opportunities[0].reward > 0);
});

test('job lifecycle apply + submit dry run behaviour', async () => {
  const registry = new FakeJobRegistry([]);
  const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
  registry.setJob(1n, ['0x0', '0x0', 1000n, 100n, 0n, zeroHash, zeroHash, '0xabc']);
  const lifecycle = await makeLifecycle(registry);
  const applyReceipt = await lifecycle.apply(1n, { dryRun: true });
  assert.equal(applyReceipt.dryRun, true);
  const submitReceipt = await lifecycle.submit(1n, { dryRun: true, resultUri: 'ipfs://alpha' });
  assert.equal(submitReceipt.dryRun, true);
  assert.equal(registry.submits.length, 0);
});

test('job lifecycle submit computes hashes and finalize handles failures', async () => {
  const registry = new FakeJobRegistry([]);
  const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
  registry.setJob(1n, ['0x0', '0x0', 1000n, 100n, 0n, zeroHash, zeroHash, '0xabc']);
  registry.failFinalize();
  const lifecycle = await makeLifecycle(registry);
  const submitReceipt = await lifecycle.submit(1n, {
    resultUri: 'ipfs://QmArtifact'
  });
  assert.equal(submitReceipt.dryRun, false);
  assert.equal(registry.submits.length, 1);
  assert(registry.submits[0].resultHash.startsWith('0x'));
  const finalizeReceipt = await lifecycle.finalize(1n);
  assert.equal(finalizeReceipt.transactionHash, undefined);
  assert.equal(finalizeReceipt.notes[0], 'Finalize reverted: not ready');
});
