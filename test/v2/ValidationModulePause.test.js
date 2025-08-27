const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidationModule pause", function () {
  let owner, validator, v2, v3, validation, vrf;

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
    const VRFMock = await ethers.getContractFactory(
      "contracts/v2/mocks/VRFMock.sol:VRFMock"
    );
    vrf = await VRFMock.deploy();
    await vrf.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      0,
      0,
      3,
      3,
      [validator.address, v2.address, v3.address]
    );
    await validation.setIdentityRegistry(await identity.getAddress());
    await validation.setVRF(await vrf.getAddress());
  });

  it("pauses validator selection", async () => {
    await validation.connect(owner).pause();
    await expect(validation.selectValidators(1, 0)).to.be.revertedWithCustomError(
      validation,
      "EnforcedPause"
    );
    await validation.connect(owner).unpause();
    await validation.requestVRF(1);
    const req = await validation.vrfRequestIds(1);
    await vrf.fulfill(req, 1);
    const selected = await validation.selectValidators.staticCall(1, 0);
    expect(selected.length).to.equal(3);
    expect(selected).to.include(validator.address);
  });
});
