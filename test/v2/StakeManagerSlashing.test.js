const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AGIALPHA } = require('../../scripts/constants');

describe('StakeManager slashing configuration', function () {
  let owner, stakeManager;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const artifact = await artifacts.readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
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
  });

  it('rejects percentages that exceed 100 total', async () => {
    await expect(
      stakeManager.setSlashingPercentages(60, 50)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });

  it('rejects validator slash reward percentage above 100', async () => {
    await expect(
      stakeManager.setValidatorSlashRewardPct(101)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });

  it('rejects distributions whose sum exceeds 100', async () => {
    await expect(
      stakeManager.setSlashingDistribution(40, 30, 40)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });
});

describe('StakeManager multi-validator slashing', function () {
  const Role = { Agent: 0, Validator: 1 };
  const ONE = 10n ** 18n;
  let owner, treasury, agent, val1, val2, employer;
  let token, stakeManager, registrySigner, engine;

  beforeEach(async () => {
    [owner, treasury, agent, val1, val2, employer] = await ethers.getSigners();

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
    await stakeManager.connect(owner).setValidatorSlashRewardPct(20);
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
    await stakeManager.connect(val1).depositStake(Role.Validator, 100n * ONE);
    await stakeManager.connect(val2).depositStake(Role.Validator, 300n * ONE);

    const Engine = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    engine = await Engine.deploy(await stakeManager.getAddress());
    await engine.connect(owner).setCaller(regAddr, true);
  });

  it('slashes and rewards validators based on stake and reputation', async () => {
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

    const agentGain = 100n;
    await engine
      .connect(registrySigner)
      .rewardValidator(val1.address, agentGain);
    await engine
      .connect(registrySigner)
      .rewardValidator(val2.address, agentGain);

    expect(await engine.reputationOf(val1.address)).to.be.gt(0n);
    expect(await engine.reputationOf(val2.address)).to.be.gt(0n);
  });

  it('refunds employer share when an agent is slashed', async () => {
    await stakeManager.connect(owner).setValidatorRewardPct(0);
    await stakeManager.connect(owner).setSlashingPercentages(60, 40);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address,address[])'](
          agent.address,
          Role.Agent,
          40n * ONE,
          employer.address,
          []
        )
    )
      .to.emit(stakeManager, 'StakeSlashed')
      .withArgs(
        agent.address,
        Role.Agent,
        employer.address,
        treasury.address,
        24n * ONE,
        16n * ONE,
        0
      );

    expect(await token.balanceOf(employer.address)).to.equal(24n * ONE);
    expect(await token.balanceOf(treasury.address)).to.equal(16n * ONE);
  });
});

describe('StakeManager deployer integration', function () {
  const Role = { Agent: 0, Validator: 1 };
  const ONE = 10n ** 18n;
  let owner, governance, agent, employer;
  let token, stakeManager, registrySigner, taxPolicy;

  beforeEach(async () => {
    [owner, governance, agent, employer] = await ethers.getSigners();

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

    const supplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      supplySlot,
      ethers.toBeHex(3000n * ONE, 32),
    ]);

    for (const addr of [agent.address, governance.address]) {
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

    const Deployer = await ethers.getContractFactory(
      'contracts/v2/Deployer.sol:Deployer'
    );
    const deployer = await Deployer.connect(owner).deploy();
    await deployer.waitForDeployment();

    const ids = {
      ens: ethers.ZeroAddress,
      nameWrapper: ethers.ZeroAddress,
      clubRootNode: ethers.ZeroHash,
      agentRootNode: ethers.ZeroHash,
      validatorMerkleRoot: ethers.ZeroHash,
      agentMerkleRoot: ethers.ZeroHash,
    };

    const deployment = await deployer.deployDefaults.staticCall(
      ids,
      governance.address
    );
    await deployer.deployDefaults(ids, governance.address);

    const stakeAddr = deployment[0];
    const jobRegistryAddr = deployment[1];
    const taxPolicyAddr = deployment[10];

    stakeManager = await ethers.getContractAt(
      'contracts/v2/StakeManager.sol:StakeManager',
      stakeAddr
    );
    registrySigner = await ethers.getImpersonatedSigner(jobRegistryAddr);
    taxPolicy = await ethers.getContractAt(
      'contracts/v2/TaxPolicy.sol:TaxPolicy',
      taxPolicyAddr
    );

    await ethers.provider.send('hardhat_setBalance', [
      jobRegistryAddr,
      '0x56BC75E2D63100000',
    ]);

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

    if (taxPolicyAddr !== ethers.ZeroAddress) {
      await taxPolicy.connect(agent).acknowledge();
    }

    await token.connect(agent).approve(stakeAddr, 1000n * ONE);
    await stakeManager.connect(agent).depositStake(Role.Agent, 100n * ONE);
  });

  it('allowlists the treasury during deployment', async () => {
    expect(await stakeManager.treasury()).to.equal(governance.address);
    expect(
      await stakeManager.treasuryAllowlist(governance.address)
    ).to.equal(true);

    const slashAmount = 40n * ONE;
    const beforeBalance = await token.balanceOf(governance.address);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address,address[])'](
          agent.address,
          Role.Agent,
          slashAmount,
          employer.address,
          []
        )
    ).not.to.be.reverted;

    const afterBalance = await token.balanceOf(governance.address);
    expect(afterBalance - beforeBalance).to.equal(slashAmount);
  });
});
