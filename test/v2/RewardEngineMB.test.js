const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { AGIALPHA } = require('../../scripts/constants');

describe('RewardEngineMB', function () {
  let owner, agent, validator, operator, employer, treasury;
  let token, engine, feePool;

  beforeEach(async () => {
    [owner, agent, validator, operator, employer, treasury] =
      await ethers.getSigners();

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
    const balanceSlot = (address) =>
      ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [ethers.zeroPadValue(address, 32), ethers.ZeroHash]
      );
    for (const addr of [
      owner.address,
      agent.address,
      validator.address,
      operator.address,
      employer.address,
      treasury.address,
    ]) {
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balanceSlot(addr),
        ethers.ZeroHash,
      ]);
    }
    const totalSupplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      totalSupplySlot,
      ethers.ZeroHash,
    ]);

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
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      balanceSlot(await feePool.getAddress()),
      ethers.ZeroHash,
    ]);

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

  it('distributes rewards according to role shares', async function () {
    const attA = {
      jobId: 1,
      user: agent.address,
      energy: 0n,
      degeneracy: 1n,
      epochId: 1n,
      role: 0,
      nonce: 1n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };
    const attV = {
      jobId: 1,
      user: validator.address,
      energy: 0n,
      degeneracy: 1n,
      epochId: 1n,
      role: 1,
      nonce: 1n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };
    const attO = {
      jobId: 1,
      user: operator.address,
      energy: 0n,
      degeneracy: 1n,
      epochId: 1n,
      role: 2,
      nonce: 1n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };
    const attE = {
      jobId: 1,
      user: employer.address,
      energy: 0n,
      degeneracy: 1n,
      epochId: 1n,
      role: 3,
      nonce: 1n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };

    const data = {
      agents: [{ att: attA, sig: '0x' }],
      validators: [{ att: attV, sig: '0x' }],
      operators: [{ att: attO, sig: '0x' }],
      employers: [{ att: attE, sig: '0x' }],
      paidCosts: 0n,
    };

    const tx = await engine.settleEpoch(1, data);
    const receipt = await tx.wait();
    const budget = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'EpochSettled'
    ).args.budget;

    expect(await feePool.rewards(agent.address)).to.equal(
      (budget * 65n) / 100n
    );
    expect(await feePool.rewards(validator.address)).to.equal(
      (budget * 15n) / 100n
    );
    expect(await feePool.rewards(operator.address)).to.equal(
      (budget * 15n) / 100n
    );
    expect(await feePool.rewards(employer.address)).to.equal(
      (budget * 5n) / 100n
    );
    expect(await feePool.rewards(treasury.address)).to.equal(0n);
    expect(await feePool.total()).to.equal(budget);
  });

  it('conserves value and sends dust to treasury', async function () {
    await engine.setKappa(5n);

    const att1 = {
      jobId: 1,
      user: agent.address,
      energy: ethers.parseUnits('1', 18),
      degeneracy: 1n,
      epochId: 1n,
      role: 0,
      nonce: 1n,
      deadline: 0n,
      uPre: ethers.parseUnits('0.5', 18),
      uPost: 0n,
      value: 0n,
    };
    const att2 = {
      jobId: 1,
      user: validator.address,
      energy: ethers.parseUnits('2', 18),
      degeneracy: 1n,
      epochId: 1n,
      role: 0,
      nonce: 2n,
      deadline: 0n,
      uPre: ethers.parseUnits('0.5', 18),
      uPost: 0n,
      value: 0n,
    };

    const data = {
      agents: [
        { att: att1, sig: '0x' },
        { att: att2, sig: '0x' },
      ],
      validators: [],
      operators: [],
      employers: [],
      paidCosts: 0n,
    };

    const supplyBefore = await token.totalSupply();
    const feePoolBalBefore = await token.balanceOf(await feePool.getAddress());
    const treasuryBalBefore = await token.balanceOf(treasury.address);
    const tx = await engine.settleEpoch(1, data);
    const receipt = await tx.wait();
    const budget = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'EpochSettled'
    ).args.budget;

    expect(budget).to.equal(5n);
    const r1 = await feePool.rewards(agent.address);
    const r2 = await feePool.rewards(validator.address);
    const rT = await feePool.rewards(treasury.address);

    expect(r1).to.equal(2n);
    expect(r2).to.equal(0n);
    expect(rT).to.equal(3n);
    expect(r1 + r2 + rT).to.equal(budget);
    expect(await feePool.total()).to.equal(budget);
    const agentBal = await token.balanceOf(agent.address);
    const treasuryBal = await token.balanceOf(treasury.address);
    expect(await token.totalSupply()).to.equal(supplyBefore + budget);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(
      feePoolBalBefore
    );
    expect(agentBal).to.equal(r1);
    expect(treasuryBal).to.equal(treasuryBalBefore + rT);
  });

  it('respects role share caps and energy-weighted rewards', async function () {
    const signers = await ethers.getSigners();
    const extraAgent = signers[6];
    const extraValidator = signers[7];

    const attAgentLow = {
      jobId: 1,
      user: agent.address,
      energy: 0n,
      degeneracy: 1n,
      epochId: 2n,
      role: 0,
      nonce: 1n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };
    const attAgentHigh = {
      jobId: 1,
      user: extraAgent.address,
      energy: ethers.parseUnits('4', 18),
      degeneracy: 1n,
      epochId: 2n,
      role: 0,
      nonce: 2n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };
    const attValidatorLow = {
      jobId: 1,
      user: validator.address,
      energy: 0n,
      degeneracy: 1n,
      epochId: 2n,
      role: 1,
      nonce: 3n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };
    const attValidatorHigh = {
      jobId: 1,
      user: extraValidator.address,
      energy: ethers.parseUnits('3', 18),
      degeneracy: 1n,
      epochId: 2n,
      role: 1,
      nonce: 4n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };
    const attOperator = {
      jobId: 1,
      user: operator.address,
      energy: 0n,
      degeneracy: 1n,
      epochId: 2n,
      role: 2,
      nonce: 5n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };
    const attEmployer = {
      jobId: 1,
      user: employer.address,
      energy: 0n,
      degeneracy: 1n,
      epochId: 2n,
      role: 3,
      nonce: 6n,
      deadline: 0n,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0n,
      value: 0n,
    };

    const data = {
      agents: [
        { att: attAgentLow, sig: '0x' },
        { att: attAgentHigh, sig: '0x' },
      ],
      validators: [
        { att: attValidatorLow, sig: '0x' },
        { att: attValidatorHigh, sig: '0x' },
      ],
      operators: [{ att: attOperator, sig: '0x' }],
      employers: [{ att: attEmployer, sig: '0x' }],
      paidCosts: 0n,
    };

    const tx = await engine.settleEpoch(2, data);
    const receipt = await tx.wait();
    const budget = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'EpochSettled'
    ).args.budget;

    const agentRewardLow = await feePool.rewards(agent.address);
    const agentRewardHigh = await feePool.rewards(extraAgent.address);
    const validatorRewardLow = await feePool.rewards(validator.address);
    const validatorRewardHigh = await feePool.rewards(extraValidator.address);
    const operatorReward = await feePool.rewards(operator.address);
    const employerReward = await feePool.rewards(employer.address);
    const treasuryReward = await feePool.rewards(treasury.address);

    const agentTotal = agentRewardLow + agentRewardHigh;
    const validatorTotal = validatorRewardLow + validatorRewardHigh;
    const totalRewards =
      agentTotal +
      validatorTotal +
      operatorReward +
      employerReward +
      treasuryReward;

    expect(await feePool.total()).to.equal(budget);
    expect(totalRewards).to.equal(budget);

    const agentBucket = (budget * 65n) / 100n;
    const validatorBucket = (budget * 15n) / 100n;
    const operatorBucket = (budget * 15n) / 100n;
    const employerBucket = (budget * 5n) / 100n;

    expect(agentTotal).to.be.lte(agentBucket);
    expect(validatorTotal).to.be.lte(validatorBucket);
    expect(operatorReward).to.be.lte(operatorBucket);
    expect(employerReward).to.be.lte(employerBucket);

    expect(agentRewardLow).to.be.gt(agentRewardHigh);
    expect(validatorRewardLow).to.be.gt(validatorRewardHigh);
  });
});
