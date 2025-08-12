const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry ether rejection", function () {
  let owner, registry;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await Factory.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0
    );
    await registry.waitForDeployment();
  });

  it("reverts on direct ether transfer", async () => {
    await expect(
      owner.sendTransaction({ to: await registry.getAddress(), value: 1 })
    ).to.be.revertedWith("JobRegistry: no ether");
  });

  it("reverts on unknown calldata with value", async () => {
    await expect(
      owner.sendTransaction({
        to: await registry.getAddress(),
        data: "0x12345678",
        value: 1,
      })
    ).to.be.revertedWith("JobRegistry: no ether");
  });

  it("reports tax exemption", async () => {
    expect(await registry.isTaxExempt()).to.equal(true);
  });
});
