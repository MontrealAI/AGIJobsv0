const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager ether rejection", function () {
  let owner, token, stakeManager;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      owner.address
    );
    await stakeManager.waitForDeployment();
  });

  it("reverts on direct ether transfer", async () => {
    await expect(
      owner.sendTransaction({ to: await stakeManager.getAddress(), value: 1 })
    ).to.be.revertedWith("StakeManager: no ether");
  });

  it("reverts on unknown calldata with value", async () => {
    await expect(
      owner.sendTransaction({
        to: await stakeManager.getAddress(),
        data: "0x12345678",
        value: 1,
      })
    ).to.be.revertedWith("StakeManager: no ether");
  });

  it("reports tax exemption", async () => {
    expect(await stakeManager.isTaxExempt()).to.equal(true);
  });
});

