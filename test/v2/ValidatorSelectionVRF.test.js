const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Validator selection VRF integration", function () {
  let owner, v1, v2, v3, v4, v5;
  let validation, stakeManager, jobRegistry, reputation, identity, vrf;

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

    const VRFMock = await ethers.getContractFactory("contracts/v2/mocks/VRFMock.sol:VRFMock");
    vrf = await VRFMock.deploy();
    await vrf.waitForDeployment();

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
    await validation.setVRF(await vrf.getAddress());

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
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, jobStruct);
  });

  it("requires VRF fulfillment before selecting", async () => {
    await validation.requestVRF(1);
    const reqId = await validation.vrfRequestIds(1);
    expect(reqId).to.not.equal(0n);

    await expect(validation.selectValidators(1)).to.be.revertedWith(
      "VRF pending"
    );

    await vrf.fulfill(reqId, 12345);

    await expect(validation.selectValidators(1)).to.emit(
      validation,
      "ValidatorsSelected"
    );
    const selected = await validation.validators(1);
    expect(selected.length).to.equal(3);
  });

  it("reverts when VRF request fails", async () => {
    await vrf.setFail(true);
    await expect(validation.requestVRF(1)).to.be.revertedWith("fail");
    await expect(validation.selectValidators(1)).to.be.revertedWith(
      "VRF pending"
    );
  });
});
