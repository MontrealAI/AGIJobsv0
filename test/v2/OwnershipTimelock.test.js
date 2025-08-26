const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Timelock ownership", function () {
  it("only timelock can call privileged setters after transfer", async function () {
    const [owner, proposer] = await ethers.getSigners();
    const Deployer = await ethers.getContractFactory("contracts/v2/Deployer.sol:Deployer");
    const deployer = await Deployer.deploy();
    const econ = {
      token: ethers.ZeroAddress,
      feePct: 0,
      burnPct: 0,
      employerSlashPct: 0,
      treasurySlashPct: 0,
      commitWindow: 0,
      revealWindow: 0,
      minStake: 0,
      jobStake: 0,
    };
    const ids = {
      ens: ethers.ZeroAddress,
      nameWrapper: ethers.ZeroAddress,
      clubRootNode: ethers.ZeroHash,
      agentRootNode: ethers.ZeroHash,
      validatorMerkleRoot: ethers.ZeroHash,
      agentMerkleRoot: ethers.ZeroHash,
    };
    const addresses = await deployer.deploy.staticCall(econ, ids);
    await deployer.deploy(econ, ids);
    const [stakeAddr, registryAddr] = addresses;

    const StakeManager = await ethers.getContractFactory("contracts/v2/StakeManager.sol:StakeManager");
    const JobRegistry = await ethers.getContractFactory("contracts/v2/JobRegistry.sol:JobRegistry");
    const stake = StakeManager.attach(stakeAddr);
    const registry = JobRegistry.attach(registryAddr);

    const Timelock = await ethers.getContractFactory("contracts/legacy/TimelockMock.sol:TimelockMock");
    const timelock = await Timelock.deploy(proposer.address);

    await stake.setGovernance(await timelock.getAddress());
    await registry.setGovernance(await timelock.getAddress());

    await expect(stake.setFeePct(1)).to.be.revertedWith("governance only");
    await expect(registry.setFeePct(1)).to.be.revertedWith("governance only");

    const stakeData = stake.interface.encodeFunctionData("setFeePct", [1]);
    const registryData = registry.interface.encodeFunctionData("setFeePct", [1]);

    await timelock.connect(proposer).execute(stake.target, stakeData);
    expect(await stake.feePct()).to.equal(1);

    await timelock.connect(proposer).execute(registry.target, registryData);
    expect(await registry.feePct()).to.equal(1);
  });
});
