const { expect } = require('chai');
const { ethers } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

describe('StakeManager validator slash rewards', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  const Role = { Agent: 0, Validator: 1 };
  const ONE = 10n ** 18n;
  let owner, treasury, agent, val1, val2, employer;
  let token, stakeManager, registrySigner;

  beforeEach(async () => {
    [owner, treasury, agent, val1, val2, employer] = await ethers.getSigners();

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

    const addresses = [agent.address, val1.address, val2.address];
    const supplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      supplySlot,
      ethers.toBeHex(3000n * ONE, 32),
    ]);
    for (const addr of addresses) {
      const balSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256'],
          [addr, 0]
        )
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balSlot,
        ethers.toBeHex(1000n * ONE, 32),
      ]);
      const ackSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256'],
          [addr, 6]
        )
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        ackSlot,
        ethers.toBeHex(1n, 32),
      ]);
    }
    const tBalSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [treasury.address, 0]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      tBalSlot,
      ethers.toBeHex(0, 32),
    ]);
    const tAckSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [treasury.address, 6]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      tAckSlot,
      ethers.toBeHex(1n, 32),
    ]);

    const JobReg = await ethers.getContractFactory(
      'contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub'
    );
    const jobRegistry = await JobReg.deploy(ethers.ZeroAddress);
    const regAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      regAddr,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(regAddr);

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      0,
      0,
      treasury.address,
      regAddr,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setValidatorRewardPct(20);
    await stakeManager
      .connect(owner)
      .setTreasuryAllowlist(treasury.address, true);

    const stakeAddr = await stakeManager.getAddress();
    const stakeAck = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [stakeAddr, 6]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      stakeAck,
      ethers.toBeHex(1n, 32),
    ]);

    await token.connect(agent).approve(stakeAddr, 1000n * ONE);
    await token.connect(val1).approve(stakeAddr, 1000n * ONE);
    await token.connect(val2).approve(stakeAddr, 1000n * ONE);

    await stakeManager.connect(agent).depositStake(Role.Agent, 100n * ONE);
  });

  it('distributes validator rewards on slashing', async () => {
    await stakeManager.connect(val1).depositStake(Role.Validator, 100n * ONE);
    await stakeManager.connect(val2).depositStake(Role.Validator, 300n * ONE);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address,address[])'](
          agent.address,
          Role.Agent,
          40n * ONE,
          employer.address,
          [val1.address, val2.address]
        )
    )
      .to.emit(stakeManager, 'RewardValidator')
      .withArgs(val1.address, 2n * ONE, ethers.ZeroHash)
      .and.to.emit(stakeManager, 'RewardValidator')
      .withArgs(val2.address, 6n * ONE, ethers.ZeroHash)
      .and.to.emit(stakeManager, 'Slash')
      .withArgs(agent.address, 40n * ONE, val1.address);

    expect(await token.balanceOf(val1.address)).to.equal(902n * ONE);
    expect(await token.balanceOf(val2.address)).to.equal(706n * ONE);
    expect(await token.balanceOf(treasury.address)).to.equal(32n * ONE);
  });

  it('handles empty validator arrays', async () => {
    await stakeManager
      .connect(registrySigner)
      ['slash(address,uint8,uint256,address,address[])'](
        agent.address,
        Role.Agent,
        40n * ONE,
        employer.address,
        []
      );

    expect(await token.balanceOf(treasury.address)).to.equal(40n * ONE);
    expect(await token.balanceOf(val1.address)).to.equal(1000n * ONE);
  });

  it('skips rewards when validator stake is zero', async () => {
    await stakeManager
      .connect(registrySigner)
      ['slash(address,uint8,uint256,address,address[])'](
        agent.address,
        Role.Agent,
        40n * ONE,
        employer.address,
        [val1.address, val2.address]
      );

    expect(await token.balanceOf(treasury.address)).to.equal(40n * ONE);
    expect(await token.balanceOf(val1.address)).to.equal(1000n * ONE);
    expect(await token.balanceOf(val2.address)).to.equal(1000n * ONE);
  });
});
