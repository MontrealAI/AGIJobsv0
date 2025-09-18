const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { address: AGIALPHA } = require('../../config/agialpha.json');

describe('JobRegistry Maxwell-Boltzmann rewards', function () {
  let token, stakeManager, validation, registry, identity;
  let owner, employer, agent, validator;
  const reward = 100n;
  const WAD = 10n ** 18n;

  beforeEach(async function () {
    [owner, employer, agent, validator] = await ethers.getSigners();
    const artifact = await artifacts.readArtifact('contracts/test/MockERC20.sol:MockERC20');
    await network.provider.send('hardhat_setCode', [AGIALPHA, artifact.deployedBytecode]);
    token = await ethers.getContractAt('contracts/test/MockERC20.sol:MockERC20', AGIALPHA);

    const StakeManager = await ethers.getContractFactory('contracts/v2/StakeManager.sol:StakeManager');
    stakeManager = await StakeManager.deploy(0, 100, 0, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, owner.address);
    await stakeManager.connect(owner).setMinStake(0);

    const Validation = await ethers.getContractFactory('contracts/v2/mocks/ValidationStub.sol:ValidationStub');
    validation = await Validation.deploy();

    const Identity = await ethers.getContractFactory('contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock');
    identity = await Identity.deploy();

    const Registry = await ethers.getContractFactory('contracts/v2/JobRegistry.sol:JobRegistry');
    registry = await Registry.deploy(
      await validation.getAddress(),
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

    await validation.setJobRegistry(await registry.getAddress());
    await validation.setValidators([validator.address]);
    await stakeManager.connect(owner).setJobRegistry(await registry.getAddress());
    await stakeManager.connect(owner).setValidationModule(await validation.getAddress());
    await registry.connect(owner).setIdentityRegistry(await identity.getAddress());
    await registry.connect(owner).setJobParameters(Number(reward), 0);
    await registry.connect(owner).setValidatorRewardPct(0);
    await registry.connect(owner).setMBRewardEnabled(true);
    await registry.connect(owner).setMBTemperature(WAD);

    for (const signer of [employer, agent, validator]) {
      await token.mint(signer.address, 1000);
      await token.connect(signer).approve(await stakeManager.getAddress(), 1000);
    }
  });

  it('splits reward using Maxwell-Boltzmann weights', async function () {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      ['createJob(uint256,uint64,bytes32,string)'](reward, deadline, specHash, 'uri');
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, '', []);
    const resultHash = ethers.id('result');
    await registry.connect(agent).submit(jobId, resultHash, 'result', '', []);
    await validation.setResult(true);
    await validation.finalize(jobId);

    const ln2 = BigInt(Math.round(Math.log(2) * 1e18));
    await registry.connect(owner).setJobEnergies(jobId, 0n, ln2);

    await registry.connect(employer).finalize(jobId);

    expect(await token.balanceOf(agent.address)).to.equal(1000n + 67n);
    expect(await token.balanceOf(validator.address)).to.equal(1000n + 33n);
  });
});
