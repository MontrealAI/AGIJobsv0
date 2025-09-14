const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AGIALPHA } = require('../../scripts/constants');

const Role = { Agent: 0, Validator: 1 };
const ONE = 10n ** 18n;

describe('DisputeModule rewards and bonds', function () {
  let owner, employer, agent, validator, treasury;
  let token, stakeManager, jobRegistry, dispute, validation, registrySigner;

  beforeEach(async () => {
    [owner, employer, agent, validator, treasury] = await ethers.getSigners();

    const artifact = await artifacts.readArtifact(
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

    const addresses = [
      employer.address,
      agent.address,
      validator.address,
      treasury.address,
    ];
    const supplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      supplySlot,
      ethers.toBeHex(5000n * ONE, 32),
    ]);
    for (const addr of addresses) {
      const balSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [addr, 0])
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balSlot,
        ethers.toBeHex(1000n * ONE, 32),
      ]);
      const ackSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [addr, 6])
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        ackSlot,
        ethers.toBeHex(1n, 32),
      ]);
    }

    const JobReg = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    jobRegistry = await JobReg.deploy();
    await jobRegistry.waitForDeployment();
    const regAddr = await jobRegistry.getAddress();
    await jobRegistry.setJob(1, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: 0,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    });

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      0,
      100,
      treasury.address,
      regAddr,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager
      .connect(owner)
      .setTreasuryAllowlist(treasury.address, true);

    const ValStub = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    validation = await ValStub.deploy();
    await validation.waitForDeployment();
    await validation.setValidators([validator.address]);
    await validation.setResult(false);
    await validation.setJobRegistry(regAddr);
    await jobRegistry.setValidationModule(await validation.getAddress());
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());

    const Dispute = await ethers.getContractFactory(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule'
    );
    dispute = await Dispute.deploy(regAddr, ONE, 0, owner.address);
    await dispute.waitForDeployment();
    await dispute.connect(owner).setStakeManager(await stakeManager.getAddress());
    await stakeManager
      .connect(owner)
      .setDisputeModule(await dispute.getAddress());
    await jobRegistry.setDisputeModule(await dispute.getAddress());

    await ethers.provider.send('hardhat_setBalance', [
      regAddr,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(regAddr);

    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), ONE);
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), ONE);
    await token
      .connect(validator)
      .approve(await stakeManager.getAddress(), 100n * ONE);
    await stakeManager
      .connect(validator)
      .depositStake(Role.Validator, 100n * ONE);
  });

  it('refunds bond on successful challenge', async () => {
    const before = await token.balanceOf(agent.address);
    await dispute
      .connect(registrySigner)
      .raiseDispute(1, agent.address, ethers.ZeroHash);
    await dispute.connect(owner).resolve(1, false);
    expect(await token.balanceOf(agent.address)).to.equal(before);
  });

  it('burns bond on failed challenge', async () => {
    const supplyBefore = await token.totalSupply();
    await dispute
      .connect(registrySigner)
      .raiseDispute(1, employer.address, ethers.ZeroHash);
    await dispute.connect(owner).resolve(1, false);
    expect(await token.totalSupply()).to.equal(supplyBefore - ONE);
  });

  it('slashes validator and rewards challenger', async () => {
    const agentBefore = await token.balanceOf(agent.address);
    const treasuryBefore = await token.balanceOf(treasury.address);
    const supplyBefore = await token.totalSupply();
    await dispute
      .connect(registrySigner)
      .raiseDispute(1, agent.address, ethers.ZeroHash);
    const jobIdBytes = ethers.toBeHex(1, 32);
    await expect(dispute.connect(owner).resolve(1, false))
      .to.emit(stakeManager, 'RewardValidator')
      .withArgs(agent.address, ONE / 4n, jobIdBytes)
      .and.to.emit(stakeManager, 'Slash')
      .withArgs(validator.address, ONE, agent.address);
    expect(await token.balanceOf(agent.address)).to.equal(
      agentBefore + ONE / 4n
    );
    expect(await token.balanceOf(treasury.address)).to.equal(
      treasuryBefore + ONE / 4n
    );
    expect(await token.totalSupply()).to.equal(supplyBefore - ONE / 2n);
  });
});
