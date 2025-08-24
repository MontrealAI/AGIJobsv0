const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection determinism", function () {
  let owner, v1, v2, v3, v4, v5;
  let validation, stakeManager, jobRegistry, reputation, identity;

  beforeEach(async () => {
    [owner, v1, v2, v3, v4, v5] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const RepMock = await ethers.getContractFactory("MockReputationEngine");
    reputation = await RepMock.deploy();
    await reputation.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      60,
      60,
      2,
      5,
      []
    );
    await validation.waitForDeployment();
    await validation.setReputationEngine(await reputation.getAddress());

    const Identity = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await validation.setIdentityRegistry(await identity.getAddress());
    await identity.setClubRootNode(ethers.ZeroHash);
    await identity.setAgentRootNode(ethers.ZeroHash);

    const validators = [v1, v2, v3, v4, v5];
    for (const v of validators) {
      await identity.addAdditionalValidator(v.address);
      await stakeManager.setStake(v.address, 1, ethers.parseEther("1"));
    }

    await validation.setValidatorPool(validators.map((v) => v.address));
    await validation.setValidatorsPerJob(3);

    const jobStruct = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uri: "",
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, jobStruct);
  });

  it("returns deterministic validator set", async () => {
    const tx1 = await validation.selectValidators(1);
    const receipt1 = await tx1.wait();
    const selected1 = receipt1.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    ).args[1];

    await validation.resetJobNonce(1);

    const tx2 = await validation.selectValidators(1);
    const receipt2 = await tx2.wait();
    const selected2 = receipt2.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    ).args[1];

    expect(selected2).to.deep.equal(selected1);
  });
});
