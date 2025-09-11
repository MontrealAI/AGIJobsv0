const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('FeePool NFT boost', function () {
  let owner, user1, user2, employer;
  let token, stakeManager, feePool, jobRegistry;

  const { AGIALPHA } = require('../../scripts/constants');

  beforeEach(async () => {
    [owner, user1, user2, employer] = await ethers.getSigners();
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

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);

    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    jobRegistry = await JobRegistry.deploy(
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

    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 150);
    await nft.mint(user1.address);

    await token.mint(user1.address, 1000);
    await token.mint(user2.address, 1000);
    await token.mint(employer.address, 1000);

    await token.connect(user1).approve(await stakeManager.getAddress(), 1000);
    await token.connect(user2).approve(await stakeManager.getAddress(), 1000);
    await stakeManager.connect(user1).depositStake(2, 100);
    await stakeManager.connect(user2).depositStake(2, 100);

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await feePool.setBurnPct(0);
  });

  it('rewards stakers proportionally to NFT multiplier', async () => {
    const feeAmount = 200n;
    await token.connect(employer).approve(await feePool.getAddress(), feeAmount);
    await feePool.connect(employer).contribute(feeAmount);
    await feePool.distributeFees();

    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    const after1 = await token.balanceOf(user1.address);
    const after2 = await token.balanceOf(user2.address);
    expect(after1 - before1).to.equal(120n);
    expect(after2 - before2).to.equal(80n);
  });
});

