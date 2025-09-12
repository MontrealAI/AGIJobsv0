const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('RewardEngineMB thermodynamic metrics', function () {
  it('emits dH, dS, temperature and leftover', async function () {
    const [owner, treasury] = await ethers.getSigners();

    const Thermostat = await ethers.getContractFactory(
      'contracts/v2/Thermostat.sol:Thermostat'
    );
    const thermostat = await Thermostat.deploy(
      ethers.parseUnits('1', 18),
      1,
      ethers.parseUnits('2', 18)
    );

    const MockFeePool = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockFeePool'
    );
    const feePool = await MockFeePool.deploy();

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
    const engine = await RewardEngine.deploy(thermostat, feePool, rep, oracle);

    await engine.setSettler(owner.address, true);
    await engine.setTreasury(treasury.address);

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

    const dH = -ethers.parseUnits('1', 18);
    const dS = ethers.parseUnits('1', 18);
    const Tsys = ethers.parseUnits('1', 18);
    const budget = ethers.parseUnits('2', 18);
    const leftover = ethers.parseUnits('0.7', 18);

    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'EpochSettled'
    );
    expect(event.args.epoch).to.equal(1n);
    expect(event.args.budget).to.equal(budget);
    expect(event.args.dH).to.equal(dH);
    expect(event.args.dS).to.equal(dS);
    expect(event.args.systemTemperature).to.equal(Tsys);
    expect(event.args.leftover).to.equal(leftover);

    expect(await feePool.rewards(treasury.address)).to.equal(leftover);
  });
});

