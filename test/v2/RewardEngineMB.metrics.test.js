const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { AGIALPHA } = require('../../scripts/constants');
const { readArtifact } = require('../utils/artifacts');

describe('RewardEngineMB thermodynamic metrics', function () {
  let owner, treasury, token, engine, feePool;

  beforeEach(async () => {
    await network.provider.send('hardhat_reset');
    [owner, treasury] = await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    const Thermostat = await ethers.getContractFactory(
      'contracts/v2/Thermostat.sol:Thermostat'
    );
    const thermostat = await Thermostat.deploy(
      ethers.parseUnits('1', 18),
      1,
      ethers.parseUnits('2', 18),
      owner.address
    );

    const MockFeePool = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockFeePool'
    );
    feePool = await MockFeePool.deploy();

    const MockReputation = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockReputation'
    );
    const rep = await MockReputation.deploy();

    const MockEnergyOracle = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockEnergyOracle'
    );
    const oracle = await MockEnergyOracle.deploy();

    const RewardEngine = await ethers.getContractFactory(
      'contracts/v2/RewardEngineMB.sol:RewardEngineMB'
    );
    engine = await RewardEngine.deploy(
      thermostat,
      feePool,
      rep,
      oracle,
      owner.address
    );

    await engine.setSettler(owner.address, true);
    await engine.setTreasury(treasury.address);

    const ownerSlot = '0x' + (5).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      ownerSlot,
      ethers.zeroPadValue(await engine.getAddress(), 32),
    ]);
  });

  it('emits metrics and mints/burns correctly', async function () {
    const att = {
      jobId: 1,
      user: owner.address,
      energy: ethers.parseUnits('1', 18),
      degeneracy: 1,
      epochId: 1,
      role: 0,
      nonce: 1,
      deadline: 0,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0,
      value: 0,
    };

    const data = {
      agents: [{ att, sig: '0x' }],
      validators: [],
      operators: [],
      employers: [],
      paidCosts: ethers.parseUnits('1', 18),
    };

    const tx = await engine.settleEpoch(1, data);
    const receipt = await tx.wait();

    const feePoolAddress = await feePool.getAddress();

    const dH = -ethers.parseUnits('1', 18);
    const dS = ethers.parseUnits('1', 18);
    const Tsys = ethers.parseUnits('1', 18);
    const budget = ethers.parseUnits('2', 18);
    const agentShare = (budget * 65n) / 100n;
    const dust = budget - agentShare;

    const esEvent = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'EpochSettled'
    );
    expect(esEvent.args.epoch).to.equal(1n);
    expect(esEvent.args.budget).to.equal(budget);
    expect(esEvent.args.dH).to.equal(dH);
    expect(esEvent.args.dS).to.equal(dS);
    expect(esEvent.args.systemTemperature).to.equal(Tsys);
    expect(esEvent.args.dust).to.equal(dust);

    const rbEvent = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'RewardBudget'
    );
    expect(rbEvent.args.minted).to.equal(budget);
    expect(rbEvent.args.dust).to.equal(dust);
    expect(rbEvent.args.redistributed).to.equal(agentShare);

    expect(await token.totalSupply()).to.equal(budget);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(0n);
    expect(await token.balanceOf(owner.address)).to.equal(agentShare);
    expect(await token.balanceOf(treasury.address)).to.equal(dust);
    expect(await feePool.rewards(owner.address)).to.equal(agentShare);
    expect(await feePool.rewards(treasury.address)).to.equal(dust);
  });

  it('reverts when settling an epoch twice', async function () {
    const att = {
      jobId: 1,
      user: owner.address,
      energy: 0n,
      degeneracy: 1,
      epochId: 1,
      role: 0,
      nonce: 1,
      deadline: 0,
      uPre: 0n,
      uPost: 0,
      value: 0,
    };

    const data = {
      agents: [{ att, sig: '0x' }],
      validators: [],
      operators: [],
      employers: [],
      paidCosts: 0n,
    };

    await engine.settleEpoch(1, data);
    await expect(engine.settleEpoch(1, data)).to.be.revertedWith('settled');
  });
});
