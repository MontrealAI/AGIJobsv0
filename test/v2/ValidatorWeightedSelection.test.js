const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection weighted by stake", function () {
  let validation, stake, identity, jobRegistry;
  let validators;

  beforeEach(async () => {
    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stake = await StakeMock.deploy();
    await stake.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setClubRootNode(ethers.ZeroHash);
    await identity.setAgentRootNode(ethers.ZeroHash);

    const Job = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await Job.deploy();
    await jobRegistry.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stake.getAddress(),
      1,
      1,
      3,
      10,
      []
    );
    await validation.waitForDeployment();
    await validation.setIdentityRegistry(await identity.getAddress());

    const stakeAmts = [
      ethers.parseEther("1"),
      ethers.parseEther("2"),
      ethers.parseEther("8"),
      ethers.parseEther("1"),
      ethers.parseEther("1"),
    ];
    validators = [];
    for (const amt of stakeAmts) {
      const addr = ethers.Wallet.createRandom().address;
      validators.push(addr);
      await stake.setStake(addr, 1, amt);
      await identity.addAdditionalValidator(addr);
    }
    await validation.setValidatorPool(validators);
    await validation.setValidatorsPerJob(3);
    await validation.setValidatorPoolSampleSize(10);
  });

  async function select(jobId, entropy) {
    const jobStruct = {
      employer: ethers.ZeroAddress,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(jobId, jobStruct);
    await validation.selectValidators(jobId, entropy);
    await ethers.provider.send("evm_mine", []);
    await validation.selectValidators(jobId, 0);
    return await validation.validators(jobId);
  }

  it("prefers higher staked validators", async () => {
    const counts = {};
    for (const v of validators) counts[v] = 0;
    const iterations = 150;
    for (let i = 0; i < iterations; i++) {
      const selected = await select(i + 1, i + 12345);
      for (const v of selected) counts[v]++;
    }
    expect(counts[validators[2]]).to.be.gt(counts[validators[1]]);
    expect(counts[validators[1]]).to.be.gt(counts[validators[0]]);
  });
});
