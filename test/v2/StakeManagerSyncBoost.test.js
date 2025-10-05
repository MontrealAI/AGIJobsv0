const { expect } = require('chai');
const { ethers } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

describe('StakeManager syncBoostedStake', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let owner, user, token, stakeManager;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

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

    const balanceSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [user.address, 0]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      balanceSlot,
      ethers.toBeHex(1000n, 32),
    ]);
    const supplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      supplySlot,
      ethers.toBeHex(1000n, 32),
    ]);
    const userAckSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [user.address, 6]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      userAckSlot,
      ethers.toBeHex(1n, 32),
    ]);

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
    const stakeAddr = await stakeManager.getAddress();
    const stakeAckSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [stakeAddr, 6]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      stakeAckSlot,
      ethers.toBeHex(1n, 32),
    ]);

    const JobReg = await ethers.getContractFactory(
      'contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub'
    );
    const jobRegistry = await JobReg.deploy(ethers.ZeroAddress);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
  });

  it('refreshes boosted stake when called', async () => {
    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(user).depositStake(2, 100); // Role.Platform
    expect(await stakeManager.totalBoostedStake(2)).to.equal(100);

    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 150);
    await nft.mint(user.address);

    // multiplier not applied until sync
    expect(await stakeManager.totalBoostedStake(2)).to.equal(100);

    await stakeManager.connect(user).syncBoostedStake(user.address, 2);
    expect(await stakeManager.totalBoostedStake(2)).to.equal(150);
  });
});
