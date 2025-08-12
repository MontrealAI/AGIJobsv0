const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine ether rejection", function () {
  let owner, engine;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    engine = await Engine.deploy();
    await engine.waitForDeployment();
  });

  it("reverts on direct ether transfer", async () => {
    await expect(
      owner.sendTransaction({ to: await engine.getAddress(), value: 1 })
    ).to.be.revertedWith("ReputationEngine: no ether");
  });

  it("reverts on unknown calldata with value", async () => {
    await expect(
      owner.sendTransaction({
        to: await engine.getAddress(),
        data: "0x12345678",
        value: 1,
      })
    ).to.be.revertedWith("ReputationEngine: no ether");
  });

  it("reports tax exemption", async () => {
    expect(await engine.isTaxExempt()).to.equal(true);
  });
});
