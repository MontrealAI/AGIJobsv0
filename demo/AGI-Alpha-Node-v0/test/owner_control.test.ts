import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Wallet } from 'ethers';
import { loadAlphaNodeConfig } from '../src/config';
import {
  planOwnerControls,
  applyOwnerControls,
} from '../src/blockchain/ownerControl';

const fixturePath = path.resolve('demo/AGI-Alpha-Node-v0/config/mainnet.guide.json');

class FakeTx {
  constructor(readonly hash: string) {}
  async wait(): Promise<{ blockNumber: number }> {
    return { blockNumber: 1200 };
  }
}

class FakeStakeManager {
  constructor(public minStakeValue: bigint) {}

  async minStake(): Promise<bigint> {
    return this.minStakeValue;
  }

  async setMinStake(value: bigint): Promise<FakeTx> {
    this.minStakeValue = value;
    return new FakeTx('0xstake');
  }
}

class FakeIdentityRegistry {
  constructor(public nodeRoot: string) {}

  async nodeRootNode(): Promise<string> {
    return this.nodeRoot;
  }

  async setNodeRootNode(value: string): Promise<FakeTx> {
    this.nodeRoot = value;
    return new FakeTx('0xroot');
  }
}

function makeWallet(): Wallet {
  const provider = {
    async getBlockNumber(): Promise<number> {
      return 4096;
    },
  } as any;
  return new Wallet(
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    provider
  );
}

async function withDependencies(
  plan: (deps: {
    stakeManager: FakeStakeManager;
    identityRegistry: FakeIdentityRegistry;
  }) => Promise<void>
): Promise<void> {
  const stakeManager = new FakeStakeManager(0n);
  const identityRegistry = new FakeIdentityRegistry('0x' + '0'.repeat(64));
  await plan({ stakeManager, identityRegistry });
}

test('planOwnerControls reports aligned configuration when no drift', async () => {
  await withDependencies(async ({ stakeManager, identityRegistry }) => {
    const config = await loadAlphaNodeConfig(fixturePath);
    stakeManager.minStakeValue = config.ownerControls?.stakeManager?.minStakeWei ?? 0n;
    identityRegistry.nodeRoot =
      config.ownerControls?.identityRegistry?.nodeRootHash ??
      '0x' + '0'.repeat(64);

    const wallet = makeWallet();
    const plan = await planOwnerControls(wallet, config, {
      connectStakeManager: () => stakeManager as any,
      connectIdentityRegistry: () => identityRegistry as any,
    });

    assert.equal(plan.actions.length, 0);
    assert(plan.notes.some((note) => note.includes('aligned with configuration')));
  });
});

test('planOwnerControls identifies drift and produces deterministic call data', async () => {
  await withDependencies(async ({ stakeManager, identityRegistry }) => {
    const config = await loadAlphaNodeConfig(fixturePath);
    stakeManager.minStakeValue = 1n;
    identityRegistry.nodeRoot = '0x' + 'f'.repeat(64);

    const wallet = makeWallet();
    const plan = await planOwnerControls(wallet, config, {
      connectStakeManager: () => stakeManager as any,
      connectIdentityRegistry: () => identityRegistry as any,
    });

    assert.equal(plan.actions.length, 2);
    const stakeAction = plan.actions.find(
      (action) => action.target === 'stakeManager'
    );
    const identityAction = plan.actions.find(
      (action) => action.target === 'identityRegistry'
    );
    assert(stakeAction, 'expected stake action');
    assert(identityAction, 'expected identity action');
    assert(stakeAction!.data.startsWith('0x'));
    assert(identityAction!.critical);
  });
});

test('applyOwnerControls dry run retains planned actions', async () => {
  await withDependencies(async ({ stakeManager, identityRegistry }) => {
    const config = await loadAlphaNodeConfig(fixturePath);
    stakeManager.minStakeValue = 0n;
    identityRegistry.nodeRoot = '0x' + '1'.repeat(64);

    const wallet = makeWallet();
    const report = await applyOwnerControls(
      wallet,
      config,
      { dryRun: true },
      {
        connectStakeManager: () => stakeManager as any,
        connectIdentityRegistry: () => identityRegistry as any,
      }
    );

    assert.equal(report.dryRun, true);
    assert.equal(report.executed.length, 0);
    assert.equal(report.actions.length, report.remainingActions.length);
  });
});

test('applyOwnerControls executes and clears remaining actions', async () => {
  await withDependencies(async ({ stakeManager, identityRegistry }) => {
    const config = await loadAlphaNodeConfig(fixturePath);
    stakeManager.minStakeValue = 0n;
    identityRegistry.nodeRoot = '0x' + '2'.repeat(64);

    const wallet = makeWallet();
    const report = await applyOwnerControls(
      wallet,
      config,
      { dryRun: false },
      {
        connectStakeManager: () => stakeManager as any,
        connectIdentityRegistry: () => identityRegistry as any,
      }
    );

    assert.equal(report.dryRun, false);
    assert(report.executed.length >= 1);
    assert.equal(report.remainingActions.length, 0);
  });
});
