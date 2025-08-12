const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidationModule ether rejection", function () {
  let owner, jobRegistry, stakeManager, validation;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();
    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();
    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress()
    );
    await validation.waitForDeployment();
  });

  it("reverts on direct ether transfer", async () => {
    await expect(
      owner.sendTransaction({ to: await validation.getAddress(), value: 1 })
    ).to.be.revertedWith("ValidationModule: no ether");
  });

  it("reverts on unknown calldata with value", async () => {
    await expect(
      owner.sendTransaction({
        to: await validation.getAddress(),
        data: "0x12345678",
        value: 1,
      })
    ).to.be.revertedWith("ValidationModule: no ether");
  });

  it("reports tax exemption", async () => {
    expect(await validation.isTaxExempt()).to.equal(true);
  });
});

