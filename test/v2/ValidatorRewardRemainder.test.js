const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');

describe('Validator reward remainder', function () {
  const { AGIALPHA } = require('../../scripts/constants');

  async function deployFixture(withTreasury) {
    const [owner, val1, val2, val3, employer, treasury] =
      await ethers.getSigners();

    const artifact = await artifacts.readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    const token = await ethers.getContractAt(
      'contracts/test/MockERC20.sol:MockERC20',
      AGIALPHA
    );
    await token.mint(employer.address, 1000);

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    const stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      withTreasury ? treasury.address : ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);

    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    const validation = await Validation.deploy();
    await validation.setValidators([val1.address, val2.address, val3.address]);
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());

    return {
      stakeManager,
      token,
      registrySigner,
      val1,
      val2,
      val3,
      employer,
      treasury,
    };
  }

  it('routes remainder to treasury', async () => {
    const {
      stakeManager,
      token,
      registrySigner,
      val1,
      val2,
      val3,
      employer,
      treasury,
    } = await deployFixture(true);

    const jobId = ethers.encodeBytes32String('remJob1');
    await token.connect(employer).approve(await stakeManager.getAddress(), 10);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 10);
    await stakeManager
      .connect(registrySigner)
      .distributeValidatorRewards(jobId, 10);

    expect(await token.balanceOf(val1.address)).to.equal(3n);
    expect(await token.balanceOf(val2.address)).to.equal(3n);
    expect(await token.balanceOf(val3.address)).to.equal(3n);
    expect(await token.balanceOf(treasury.address)).to.equal(1n);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });

  it('leaves remainder in escrow when no treasury', async () => {
    await network.provider.send('hardhat_reset');
    const { stakeManager, token, registrySigner, val1, val2, val3, employer } =
      await deployFixture(false);

    const jobId = ethers.encodeBytes32String('remJob2');
    await token.connect(employer).approve(await stakeManager.getAddress(), 10);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 10);
    await stakeManager
      .connect(registrySigner)
      .distributeValidatorRewards(jobId, 10);

    expect(await token.balanceOf(val1.address)).to.equal(3n);
    expect(await token.balanceOf(val2.address)).to.equal(3n);
    expect(await token.balanceOf(val3.address)).to.equal(3n);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(1n);
  });
});
