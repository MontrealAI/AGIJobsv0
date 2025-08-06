const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployManager() {
  const [owner, employer, agent] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy();
  await token.waitForDeployment();
  await token.mint(employer.address, ethers.parseEther("1000"));
  const ENSMock = await ethers.getContractFactory("MockENS");
  const ens = await ENSMock.deploy();
  await ens.waitForDeployment();
  const WrapperMock = await ethers.getContractFactory("MockNameWrapper");
  const wrapper = await WrapperMock.deploy();
  await wrapper.waitForDeployment();
  const Manager = await ethers.getContractFactory("AGIJobManagerV1");
  const manager = await Manager.deploy(
    await token.getAddress(),
    "ipfs://",
    await ens.getAddress(),
    await wrapper.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash,
    ethers.ZeroHash,
    ethers.ZeroHash
  );
  await manager.waitForDeployment();
  await manager.addAdditionalAgent(agent.address);
  const stakeAmount = ethers.parseEther("100");
  await token.mint(agent.address, stakeAmount);
  await token.connect(agent).approve(await manager.getAddress(), stakeAmount);
  await manager.connect(agent).stakeAgent(stakeAmount);
  return { token, manager, employer, agent, owner };
}

describe("validator selection", function () {
  it("handles small pools", async function () {
    const { token, manager, employer, agent } = await deployManager();
    const signers = await ethers.getSigners();
    const v1 = signers[3];
    const v2 = signers[4];
    const v3 = signers[5];
    await manager.addAdditionalValidator(v1.address);
    await manager.addAdditionalValidator(v2.address);
    await manager.addAdditionalValidator(v3.address);
    await manager.setValidatorsPerJob(3);
    const payout = ethers.parseEther("1");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    const tx = await manager
      .connect(agent)
      .requestJobCompletion(jobId, "result");
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    );
    const selected = event.args[1];
    expect(selected.length).to.equal(3);
    const set = new Set(selected.map((a) => a.toLowerCase()));
    expect(set.size).to.equal(3);
    expect(set.has(v1.address.toLowerCase())).to.be.true;
    expect(set.has(v2.address.toLowerCase())).to.be.true;
    expect(set.has(v3.address.toLowerCase())).to.be.true;
  });

  it("handles large pools", async function () {
    const { token, manager, employer, agent } = await deployManager();
    const validatorAddrs = [];
    for (let i = 0; i < 100; i++) {
      const wallet = ethers.Wallet.createRandom();
      validatorAddrs.push(wallet.address);
      await manager.addAdditionalValidator(wallet.address);
    }
    await manager.setValidatorsPerJob(10);
    const payout = ethers.parseEther("1");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    const tx = await manager
      .connect(agent)
      .requestJobCompletion(jobId, "result");
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    );
    const selected = event.args[1];
    expect(selected.length).to.equal(10);
    const unique = new Set();
    for (const addr of selected) {
      expect(validatorAddrs).to.include(addr);
      expect(unique.has(addr)).to.be.false;
      unique.add(addr);
    }
    expect(unique.size).to.equal(10);
  });

  it("allows owner to update selection seed", async function () {
    const { manager, owner } = await deployManager();
    const newSeed = ethers.keccak256(ethers.toUtf8Bytes("seed"));
    const tx = await manager.connect(owner).setValidatorSelectionSeed(newSeed);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorSelectionSeedUpdated"
    );
    expect(event.args[0]).to.equal(newSeed);
  });
});

