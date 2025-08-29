const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidationModule pause", function () {
  let owner, validator, v2, v3, validation, jobRegistry;

  beforeEach(async () => {
    [owner, validator, v2, v3] = await ethers.getSigners();
    const MockStakeManager = await ethers.getContractFactory(
      "contracts/legacy/MockV2.sol:MockStakeManager"
    );
    const stakeManager = await MockStakeManager.deploy();
    await stakeManager.setStake(validator.address, 1, 100);
    await stakeManager.setStake(v2.address, 1, 100);
    await stakeManager.setStake(v3.address, 1, 100);
    const Identity = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
    );
    const identity = await Identity.deploy();
    await identity.addAdditionalValidator(validator.address);
    await identity.addAdditionalValidator(v2.address);
    await identity.addAdditionalValidator(v3.address);
    const Job = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await Job.deploy();
    await jobRegistry.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      0,
      0,
      3,
      3,
      [validator.address, v2.address, v3.address]
    );
    await validation.setIdentityRegistry(await identity.getAddress());

    const jobStruct = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, jobStruct);
  });

  it("pauses validator selection", async () => {
    await validation.connect(owner).pause();
    await expect(
      validation.selectValidators(1, 0)
    ).to.be.revertedWithCustomError(validation, "EnforcedPause");
    await validation.connect(owner).unpause();
    await validation.selectValidators(1, 0);
    await ethers.provider.send("evm_mine", []);
    await validation.selectValidators(1, 0);
    const selected = await validation.validators(1);
    expect(selected.length).to.equal(3);
    expect(selected).to.include(validator.address);
  });
});
