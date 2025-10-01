const { expect } = require('chai');
const { Wallet } = require('ethers');

process.env.TS_NODE_PROJECT = 'agent-gateway/tsconfig.json';
const envBackup = {
  JOB_REGISTRY_ADDRESS: process.env.JOB_REGISTRY_ADDRESS,
  VALIDATION_MODULE_ADDRESS: process.env.VALIDATION_MODULE_ADDRESS,
  STAKE_MANAGER_ADDRESS: process.env.STAKE_MANAGER_ADDRESS,
  KEYSTORE_URL: process.env.KEYSTORE_URL,
};

process.env.JOB_REGISTRY_ADDRESS =
  process.env.JOB_REGISTRY_ADDRESS ||
  '0x00000000000000000000000000000000000000a1';
process.env.VALIDATION_MODULE_ADDRESS =
  process.env.VALIDATION_MODULE_ADDRESS ||
  '0x00000000000000000000000000000000000000b2';
process.env.STAKE_MANAGER_ADDRESS =
  process.env.STAKE_MANAGER_ADDRESS ||
  '0x00000000000000000000000000000000000000c3';
process.env.KEYSTORE_URL = process.env.KEYSTORE_URL ||
  'https://keystore.local/keys';

require('ts-node/register/transpile-only');

const {
  autoClaimRewards,
  __setStakeCoordinatorTestOverrides,
  __resetStakeCoordinatorTestOverrides,
} = require('../../agent-gateway/stakeCoordinator');

describe('autoClaimRewards', function () {
  let wallet;

  beforeEach(function () {
    wallet = Wallet.createRandom();
  });

  afterEach(function () {
    __resetStakeCoordinatorTestOverrides();
  });

  after(function () {
    process.env.JOB_REGISTRY_ADDRESS = envBackup.JOB_REGISTRY_ADDRESS;
    process.env.VALIDATION_MODULE_ADDRESS = envBackup.VALIDATION_MODULE_ADDRESS;
    process.env.STAKE_MANAGER_ADDRESS = envBackup.STAKE_MANAGER_ADDRESS;
    process.env.KEYSTORE_URL = envBackup.KEYSTORE_URL;
  });

  it('withdraws the full stake balance when withdrawStake is set without amount', async function () {
    let withdrawnAmount;
    __setStakeCoordinatorTestOverrides({
      getTokenBalance: async () => 0n,
      getStakeBalance: async () => 500n,
      withdrawStakeAmount: async (_, amount) => {
        withdrawnAmount = amount;
        return { method: 'withdrawStake', txHash: '0xabc' };
      },
    });

    const result = await autoClaimRewards(wallet, { withdrawStake: true });

    expect(withdrawnAmount).to.equal(500n);
    expect(result.actions).to.have.length(1);
    expect(result.actions[0].type).to.equal('withdraw');
    expect(result.actions[0].amountRaw).to.equal('500');
  });

  it('uses the explicit withdrawal amount when provided', async function () {
    let stakeBalanceCalls = 0;
    let withdrawnAmount;
    __setStakeCoordinatorTestOverrides({
      getTokenBalance: async () => 0n,
      getStakeBalance: async () => {
        stakeBalanceCalls += 1;
        return 999n;
      },
      withdrawStakeAmount: async (_, amount) => {
        withdrawnAmount = amount;
        return { method: 'withdrawStake', txHash: '0xdef' };
      },
    });

    const result = await autoClaimRewards(wallet, {
      withdrawStake: true,
      amount: 42n,
    });

    expect(withdrawnAmount).to.equal(42n);
    expect(stakeBalanceCalls).to.equal(0);
    expect(result.actions).to.have.length(1);
    expect(result.actions[0].amountRaw).to.equal('42');
  });

  it('skips withdrawal when no stake is available', async function () {
    __setStakeCoordinatorTestOverrides({
      getTokenBalance: async () => 0n,
      getStakeBalance: async () => 0n,
      withdrawStakeAmount: async () => {
        throw new Error('should not withdraw when stake is zero');
      },
    });

    const result = await autoClaimRewards(wallet, { withdrawStake: true });

    expect(result.actions).to.have.length(0);
  });

  it('restakes a percentage before transferring rewards to a destination', async function () {
    let balance = 100n;
    let restakedAmount = 0n;
    const transfers = [];

    __setStakeCoordinatorTestOverrides({
      getTokenBalance: async () => balance,
      increaseStake: async (_, amount) => {
        restakedAmount = amount;
        balance -= amount;
      },
      transferTokens: async (_, to, amount) => {
        transfers.push({ to, amount });
        balance -= amount;
        return { method: 'transfer', txHash: '0xtransfer' };
      },
    });

    const destination = Wallet.createRandom().address;

    const result = await autoClaimRewards(wallet, {
      restakePercent: '40%',
      amount: 50n,
      destination,
    });

    expect(restakedAmount).to.equal(40n);
    expect(transfers).to.have.length(1);
    expect(transfers[0].amount).to.equal(50n);
    expect(transfers[0].to.toLowerCase()).to.equal(destination.toLowerCase());
    expect(result.actions.map((action) => action.type)).to.deep.equal([
      'restake',
      'transfer',
    ]);
    expect(result.actions[0].amountRaw).to.equal('40');
    expect(result.actions[1].amountRaw).to.equal('50');
    expect(result.endingBalanceRaw).to.equal('10');
  });

  it('limits transfer amount when restaking a large explicit amount', async function () {
    let balance = 100n;
    let restakeCalls = [];
    const transfers = [];

    __setStakeCoordinatorTestOverrides({
      getTokenBalance: async () => balance,
      increaseStake: async (_, amount) => {
        restakeCalls.push(amount);
        balance -= amount;
      },
      transferTokens: async (_, to, amount) => {
        transfers.push({ to, amount });
        balance -= amount;
        return { method: 'transfer', txHash: '0xtransfer-reduced' };
      },
    });

    const destination = Wallet.createRandom().address;

    const result = await autoClaimRewards(wallet, {
      restakeAmount: 80n,
      amount: 50n,
      destination,
    });

    expect(restakeCalls).to.deep.equal([80n]);
    expect(transfers).to.have.length(1);
    expect(transfers[0].amount).to.equal(20n);
    expect(result.actions.map((action) => action.amountRaw)).to.deep.equal([
      '80',
      '20',
    ]);
    expect(result.endingBalanceRaw).to.equal('0');
  });
});
