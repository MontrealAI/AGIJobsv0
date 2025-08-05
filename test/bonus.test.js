const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Agent bonus distribution", function () {
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

    await manager.setRequiredValidatorApprovals(1);
    await manager.setBurnPercentage(1000);
    await manager.setValidationRewardPercentage(800);
    await manager.setReviewWindow(7200);
    await manager.setCommitRevealWindows(1000, 1000);
    await manager.addAdditionalAgent(agent.address);
    await manager.addAdditionalValidator(validator.address);

    const NFT = await ethers.getContractFactory("MockERC721");
    const nft = await NFT.deploy();
    await nft.waitForDeployment();

    return { token, manager, nft, owner, employer, agent, validator };
  }

  it("redistributes burn to pay bonus when agent holds NFT", async function () {
    const { token, manager, nft, employer, agent, validator } = await deployFixture();

    await manager.addAGIType(await nft.getAddress(), 500);
    await nft.mint(agent.address);

    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("bonus");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
    await time.increase(1000);
    await manager.connect(validator).validateJob(jobId, "", []);

    const burnOrig = (payout * 1000n) / 10000n;
    const validatorPayout = (payout * 800n) / 10000n;
    const baseAgent = payout - burnOrig - validatorPayout;
    const bonusAmount = (baseAgent * 500n) / 10000n;
    const burnExpected = burnOrig - bonusAmount;
    const agentExpected = baseAgent + bonusAmount;

    expect(await token.balanceOf(await manager.burnAddress())).to.equal(burnExpected);
    expect(await token.balanceOf(validator.address)).to.equal(validatorPayout);
    expect(await token.balanceOf(agent.address)).to.equal(agentExpected);
    expect(agentExpected + validatorPayout + burnExpected).to.equal(payout);
  });

  it("keeps burn and validator shares when agent lacks bonus NFT", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();

    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("nobonus");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
    await time.increase(1000);
    await manager.connect(validator).validateJob(jobId, "", []);

    const burnAmount = (payout * 1000n) / 10000n;
    const validatorPayoutTotal = (payout * 800n) / 10000n;
    const agentExpected = payout - burnAmount - validatorPayoutTotal;

    expect(await token.balanceOf(await manager.burnAddress())).to.equal(burnAmount);
    expect(await token.balanceOf(validator.address)).to.equal(validatorPayoutTotal);
    expect(await token.balanceOf(agent.address)).to.equal(agentExpected);
    expect(agentExpected + validatorPayoutTotal + burnAmount).to.equal(payout);
  });
});

