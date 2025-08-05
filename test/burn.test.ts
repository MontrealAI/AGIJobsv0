const { expect } = require("chai");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture() {
  const [owner, employer, agent, validator] = await ethers.getSigners();

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

  const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2Mock");
  const vrf = await VRFMock.deploy();
  await vrf.waitForDeployment();
  const subTx = await vrf.createSubscription();
  const subRc = await subTx.wait();
  const subId = subRc.logs[0].args.subId;
  await vrf.fundSubscription(subId, ethers.parseEther("1"));

  const Manager = await ethers.getContractFactory("AGIJobManagerV1");
  const manager = await Manager.deploy(
    await token.getAddress(),
    "ipfs://",
    await ens.getAddress(),
    await wrapper.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash,
    ethers.ZeroHash,
    ethers.ZeroHash,
    await vrf.getAddress()
  );
  await manager.waitForDeployment();
  const keyHash = ethers.keccak256(ethers.toUtf8Bytes("keyHash"));
  await manager.setVrfKeyHash(keyHash);
  await manager.setVrfSubscriptionId(subId);
  await vrf.addConsumer(subId, await manager.getAddress());

  await manager.setRequiredValidatorApprovals(1);
  await manager.setRequiredValidatorDisapprovals(1);
  await manager.setCommitRevealWindows(1000, 1000);
  await manager.addAdditionalAgent(agent.address);
  await manager.addAdditionalValidator(validator.address);
  await manager.setValidatorsPerJob(1);

  return { owner, employer, agent, validator, token, manager, vrf };
}

async function requestAndFulfill(manager, vrf, agent, jobId, ipfsHash = "result") {
  const tx = await manager.connect(agent).requestJobCompletion(jobId, ipfsHash);
  const rc = await tx.wait();
  const event = rc.logs
    .map((log) => {
      try {
        return manager.interface.parseLog(log);
      } catch {
        return undefined;
      }
    })
    .find((e) => e && e.name === "ValidatorSelectionRequested");
  const requestId = event.args.requestId;
  await vrf.fulfillRandomWords(requestId, await manager.getAddress());
}

describe("burn mechanics", function () {
  it("burns the expected portion of funds on job finalization", async function () {
    const { token, manager, employer, agent, validator, vrf } = await deployFixture();
    const payout = ethers.parseEther("100");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await requestAndFulfill(manager, vrf, agent, jobId, "result");

    const burnPct = await manager.burnPercentage();
    const expectedBurn = (payout * burnPct) / 10_000n;

    const salt = ethers.id("burnts1");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
    await manager.connect(validator).validateJob(jobId, "", []);

    const burnAddr = await manager.burnAddress();
    expect(await token.balanceOf(burnAddr)).to.equal(expectedBurn);
  });

  it("updates burn percentage and emits event", async function () {
    const { manager } = await deployFixture();
    const newPct = 750;
    await expect(manager.setBurnPercentage(newPct))
      .to.emit(manager, "BurnPercentageUpdated")
      .withArgs(newPct);
    expect(await manager.burnPercentage()).to.equal(newPct);
  });

  it("updates burn address and emits event", async function () {
    const { manager } = await deployFixture();
    const newAddr = ethers.getAddress(
      "0x000000000000000000000000000000000000BEEF"
    );
    await expect(manager.setBurnAddress(newAddr))
      .to.emit(manager, "BurnAddressUpdated")
      .withArgs(newAddr);
    expect(await manager.burnAddress()).to.equal(newAddr);
  });

  it("updates burn config atomically and emits events", async function () {
    const { manager } = await deployFixture();
    const newAddr = ethers.getAddress(
      "0x000000000000000000000000000000000000BEEF"
    );
    const newPct = 250;
    await expect(manager.setBurnConfig(newAddr, newPct))
      .to.emit(manager, "BurnAddressUpdated")
      .withArgs(newAddr)
      .and.to.emit(manager, "BurnPercentageUpdated")
      .withArgs(newPct);
    expect(await manager.burnAddress()).to.equal(newAddr);
    expect(await manager.burnPercentage()).to.equal(newPct);
  });
});

