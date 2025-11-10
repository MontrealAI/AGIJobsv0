const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { AGIALPHA } = require('../../scripts/constants');

describe('StakeManager acknowledgeAndDeposit', function () {
  let token, stakeManager, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);

    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    await token.mint(owner.address, 1000);
    await token.mint(user.address, 1000);

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      50,
      50,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);
  });

  it('reverts without acknowledgement then succeeds', async () => {
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');

    const JobRegistryAckStub = await ethers.getContractFactory(
      'contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub'
    );
    const jobRegistry = await JobRegistryAckStub.deploy(
      await policy.getAddress()
    );

    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());

    await token.connect(user).approve(await stakeManager.getAddress(), 100);

    await expect(
      stakeManager.connect(user).acknowledgeAndDeposit(0, 100)
    ).to.be.revertedWithCustomError(stakeManager, 'TaxPolicyNotAcknowledged');

    await policy.connect(user).acknowledge();

    await expect(stakeManager.connect(user).acknowledgeAndDeposit(0, 100))
      .to.emit(stakeManager, 'StakeDeposited')
      .withArgs(user.address, 0, 100);
  });

  it('enforces acknowledgement when depositing for another user', async () => {
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');

    const JobRegistryAckStub = await ethers.getContractFactory(
      'contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub'
    );
    const jobRegistry = await JobRegistryAckStub.deploy(
      await policy.getAddress()
    );

    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());

    await token.connect(user).approve(await stakeManager.getAddress(), 100);

    await expect(
      stakeManager.connect(owner).acknowledgeAndDepositFor(user.address, 0, 100)
    ).to.be.revertedWithCustomError(stakeManager, 'TaxPolicyNotAcknowledged');
  });

  it('acknowledges through the registry before depositing for another user', async () => {
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');

    const JobRegistryAckRecorder = await ethers.getContractFactory(
      'contracts/v2/mocks/JobRegistryAckRecorder.sol:JobRegistryAckRecorder'
    );
    const jobRegistry = await JobRegistryAckRecorder.deploy(
      await policy.getAddress()
    );

    await policy.setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry.setAcknowledger(await stakeManager.getAddress(), true);

    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());

    await token.connect(user).approve(await stakeManager.getAddress(), 100);

    await expect(
      stakeManager.connect(owner).acknowledgeAndDepositFor(user.address, 0, 100)
    )
      .to.emit(stakeManager, 'StakeDeposited')
      .withArgs(user.address, 0, 100);

    expect(await policy.hasAcknowledged(user.address)).to.equal(true);
  });
});
