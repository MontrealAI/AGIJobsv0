const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('StakeManager validator reward remainder', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let owner, employer, valHigh, valLow1, valLow2;
  let token, stakeManager, jobRegistry, registrySigner;

  beforeEach(async () => {
    [owner, employer, valHigh, valLow1, valLow2] = await ethers.getSigners();

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
    const balanceSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [employer.address, 0]
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
    const ackSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [employer.address, 6]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      ackSlot,
      ethers.toBeHex(1n, 32),
    ]);

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
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
      'contracts/v2/mocks/VersionMock.sol:VersionMock'
    );
    jobRegistry = await JobReg.deploy(2);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    const regAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      regAddr,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(regAddr);

    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    const validation = await Validation.deploy();
    await validation.setValidators([
      valLow1.address,
      valHigh.address,
      valLow2.address,
    ]);
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());

    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 150);
    await nft.mint(valHigh.address);
  });

  it('assigns remainder to the validator with the largest weight', async () => {
    const jobId = ethers.encodeBytes32String('job1');
    const amount = 100n;

    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), amount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, amount);
    await stakeManager
      .connect(registrySigner)
      .distributeValidatorRewards(jobId, amount);

    expect(await token.balanceOf(valLow1.address)).to.equal(28n);
    expect(await token.balanceOf(valHigh.address)).to.equal(44n);
    expect(await token.balanceOf(valLow2.address)).to.equal(28n);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });

  it('weights payouts according to multiple NFT tiers', async () => {
    const NFT175 = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft175 = await NFT175.deploy();
    await stakeManager
      .connect(owner)
      .addAGIType(await nft175.getAddress(), 175);
    await nft175.mint(valLow1.address);

    const jobId = ethers.encodeBytes32String('job2');
    const amount = 100n;

    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), amount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, amount);
    await stakeManager
      .connect(registrySigner)
      .distributeValidatorRewards(jobId, amount);

    expect(await token.balanceOf(valLow1.address)).to.equal(42n);
    expect(await token.balanceOf(valHigh.address)).to.equal(35n);
    expect(await token.balanceOf(valLow2.address)).to.equal(23n);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });
});
