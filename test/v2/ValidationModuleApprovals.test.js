const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidationModule required approvals", function () {
  let owner;
  let validation;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      60,
      60,
      3,
      4,
      []
    );
    await validation.waitForDeployment();
  });

  it("reverts for invalid counts", async () => {
    await expect(
      validation.connect(owner).setRequiredValidatorApprovals(0)
    ).to.be.revertedWithCustomError(validation, "InvalidApprovals");
    await expect(
      validation.connect(owner).setRequiredValidatorApprovals(5)
    ).to.be.revertedWithCustomError(validation, "InvalidApprovals");
  });

  it("updates and clamps to committee size", async () => {
    await validation.connect(owner).setRequiredValidatorApprovals(2);
    expect(await validation.requiredValidatorApprovals()).to.equal(2n);

    await validation.connect(owner).setRequiredValidatorApprovals(4);
    expect(await validation.requiredValidatorApprovals()).to.equal(3n);

    await validation.connect(owner).setValidatorsPerJob(4);
    await validation.connect(owner).setRequiredValidatorApprovals(4);
    expect(await validation.requiredValidatorApprovals()).to.equal(4n);

    await validation.connect(owner).setValidatorsPerJob(3);
    expect(await validation.requiredValidatorApprovals()).to.equal(3n);
  });
});

