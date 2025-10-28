import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Wallet } from 'ethers';
import { loadAlphaNodeConfig } from '../src/config';
import { reinvestRewards } from '../src/blockchain/reinvest';
import type { RewardSnapshot } from '../src/blockchain/rewards';
import type { StakeSnapshot } from '../src/blockchain/staking';

const fixturePath = path.resolve('demo/AGI-Alpha-Node-v0/config/mainnet.guide.json');

class FakeTx {
  constructor(readonly hash: string) {}
  async wait(): Promise<{ blockNumber: number }> {
    return { blockNumber: 999 };
  }
}

class FakeFeePool {
  public claimCount = 0;
  async claimRewards(): Promise<FakeTx> {
    this.claimCount += 1;
    return new FakeTx('0xclaim');
  }
}

class FakeStakeManager {
  public deposits: Array<{ role: number; amount: bigint }> = [];
  async depositStake(role: number, amount: bigint): Promise<FakeTx> {
    this.deposits.push({ role, amount });
    return new FakeTx('0xstake');
  }
}

class FakeToken {
  public allowanceValue = 0n;
  public balance = 0n;
  public approvals: Array<{ spender: string; amount: bigint }> = [];

  async allowance(_owner?: string, _spender?: string): Promise<bigint> {
    return this.allowanceValue;
  }

  async approve(spender: string, amount: bigint): Promise<FakeTx> {
    this.allowanceValue = amount;
    this.approvals.push({ spender, amount });
    return new FakeTx('0xapprove');
  }

  async balanceOf(_account?: string): Promise<bigint> {
    return this.balance;
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

function makeStakeSnapshot(): StakeSnapshot {
  return {
    currentStake: 0n,
    requiredStake: 0n,
    allowance: 0n,
    tokenBalance: 0n,
    registered: false,
    paused: false,
    minimums: {
      global: 0n,
      platformRole: 0n,
      registry: 0n,
      config: 0n
    }
  };
}

test('reinvestRewards skips when pending is below threshold', async () => {
  const config = await loadAlphaNodeConfig(fixturePath);
  const wallet = makeWallet();
  const pending = config.ai.reinvestThresholdWei - 1n;
  const report = await reinvestRewards(
    wallet,
    config,
    undefined,
    {
      fetchRewards: async (): Promise<RewardSnapshot> => ({
        boostedStake: 0n,
        cumulativePerToken: 0n,
        checkpoint: 0n,
        pending,
        projectedDaily: '0'
      }),
      fetchStake: async (): Promise<StakeSnapshot> => makeStakeSnapshot()
    }
  );
  assert.equal(report.claimedWei, 0n);
  assert(report.notes.some((note) => note.includes('below reinvest threshold')));
});

test('reinvestRewards dry run reports intended actions', async () => {
  const config = await loadAlphaNodeConfig(fixturePath);
  const wallet = makeWallet();
  const pending = config.ai.reinvestThresholdWei + 10n;
  const report = await reinvestRewards(
    wallet,
    config,
    { dryRun: true },
    {
      fetchRewards: async (): Promise<RewardSnapshot> => ({
        boostedStake: 0n,
        cumulativePerToken: 0n,
        checkpoint: 0n,
        pending,
        projectedDaily: '0'
      }),
      fetchStake: async (): Promise<StakeSnapshot> => makeStakeSnapshot()
    }
  );
  assert.equal(report.dryRun, true);
  assert.equal(report.claimedWei, pending);
  assert(report.notes.some((note) => note.includes('Dry run: would claim')));
});

test('reinvestRewards claims and deposits with injected contracts', async () => {
  const config = await loadAlphaNodeConfig(fixturePath);
  const wallet = makeWallet();
  const feePool = new FakeFeePool();
  const stakeManager = new FakeStakeManager();
  const token = new FakeToken();
  token.balance = config.ai.reinvestThresholdWei + 1n;

  const report = await reinvestRewards(
    wallet,
    config,
    {},
    {
      fetchRewards: async (): Promise<RewardSnapshot> => ({
        boostedStake: 0n,
        cumulativePerToken: 0n,
        checkpoint: 0n,
        pending: config.ai.reinvestThresholdWei + 1n,
        projectedDaily: '42'
      }),
      fetchStake: async (): Promise<StakeSnapshot> => makeStakeSnapshot(),
      connectFeePool: () => feePool as any,
      connectStakeManager: () => stakeManager as any,
      connectToken: () => token as any
    }
  );

  assert.equal(feePool.claimCount, 1);
  assert.equal(stakeManager.deposits.length, 1);
  assert.equal(token.approvals.length, 1);
  assert.equal(report.claimedWei, config.ai.reinvestThresholdWei + 1n);
  assert.equal(report.stakedWei, config.ai.reinvestThresholdWei + 1n);
  assert.equal(report.dryRun, false);
});
