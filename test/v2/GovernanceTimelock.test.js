const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Governance via Timelock", function () {
  it("allows privileged calls only through the timelock", async function () {
    const [admin] = await ethers.getSigners();

    const Timelock = await ethers.getContractFactory(
      "contracts/legacy/TimelockControllerHarness.sol:TimelockControllerHarness"
    );
    const timelock = await Timelock.deploy(admin.address);
    await timelock.waitForDeployment();
    const proposerRole = await timelock.PROPOSER_ROLE();
    const executorRole = await timelock.EXECUTOR_ROLE();
    await timelock.grantRole(proposerRole, admin.address);
    await timelock.grantRole(executorRole, admin.address);

    const { AGIALPHA } = require("../../scripts/constants");
    const token = await ethers.getContractAt("contracts/test/AGIALPHAToken.sol:AGIALPHAToken", AGIALPHA);
    await token.mint(admin.address, 1000);

    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const stake = await Stake.deploy(
      0,
      0,
      0,
      admin.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await timelock.getAddress()
    );
    await stake.waitForDeployment();

    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      await timelock.getAddress()
    );
    await registry.waitForDeployment();

    await expect(stake.setMinStake(1)).to.be.revertedWith("governance only");
    await expect(registry.setFeePct(1)).to.be.revertedWith("governance only");

    const stakeCall = stake.interface.encodeFunctionData("setMinStake", [1]);
    await timelock
      .connect(admin)
      .schedule(
        await stake.getAddress(),
        0,
        stakeCall,
        ethers.ZeroHash,
        ethers.ZeroHash,
        0
      );
    await timelock
      .connect(admin)
      .execute(
        await stake.getAddress(),
        0,
        stakeCall,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
    expect(await stake.minStake()).to.equal(1);

    const regCall = registry.interface.encodeFunctionData("setFeePct", [1]);
    await timelock
      .connect(admin)
      .schedule(
        await registry.getAddress(),
        0,
        regCall,
        ethers.ZeroHash,
        ethers.ZeroHash,
        0
      );
    await timelock
      .connect(admin)
      .execute(
        await registry.getAddress(),
        0,
        regCall,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
    expect(await registry.feePct()).to.equal(1);
  });
});

