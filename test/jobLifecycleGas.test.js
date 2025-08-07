const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture() {
  const [owner, employer, agent, validator] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy();
  await token.waitForDeployment();
  await token.mint(employer.address, ethers.parseEther("1000"));
  await token.mint(agent.address, ethers.parseEther("1000"));
  await token.mint(validator.address, ethers.parseEther("1000"));

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
  await manager.addAdditionalValidator(validator.address);
  await manager.addModerator(owner.address);

  await manager.setAgentStakeRequirement(0);
  await manager.setStakeRequirement(0);
  await manager.setValidatorSlashingPercentage(1000);
  await manager.setValidationRewardPercentage(0);
  await manager.setBurnPercentage(0);
  await manager.setAgentStakePercentage(500);
  await manager.setValidatorStakePercentage(1000);
  await manager.setRequiredValidatorApprovals(1);
  await manager.setRequiredValidatorDisapprovals(1);
  await manager.setValidatorsPerJob(1);
  await manager.setValidatorBlacklistThreshold(2);
  await manager.setTimingConfig(2, 5, 15, 1);

  await manager.connect(agent).acceptTerms("ipfs://terms");
  await manager.connect(validator).acceptTerms("ipfs://terms");

  const stakeAmount = ethers.parseEther("100");
  await token.connect(validator).approve(await manager.getAddress(), stakeAmount);
  await manager.connect(validator).stake(stakeAmount);
  await token.connect(agent).approve(await manager.getAddress(), stakeAmount);
  await manager.connect(agent).stakeAgent(stakeAmount);

  return { token, manager, employer, agent, validator };
}

describe("Job lifecycle and gas constraints", function () {
  const maxGas = 1000000n;

  after(async () => {
    await network.provider.send("hardhat_reset");
  });

  describe("happy path job completion", function () {
    it("handles varied payouts and stakes within gas limits", async function () {
      const { token, manager, employer, agent, validator } = await loadFixture(deployFixture);
      const payouts = [ethers.parseEther("10"), ethers.parseEther("50")];

      for (let i = 0; i < payouts.length; i++) {
        const payout = payouts[i];
        const jobId = BigInt(i);

        await token.connect(employer).approve(await manager.getAddress(), payout);
        const txCreate = await manager.connect(employer).createJob(`hash${i}`, payout, 1, "details");
        expect((await txCreate.wait()).gasUsed).to.be.lte(maxGas);

        await manager.connect(agent).applyForJob(jobId, "", []);
        const txRequest = await manager
          .connect(agent)
          .requestJobCompletion(jobId, "result");
        expect((await txRequest.wait()).gasUsed).to.be.lte(maxGas);

        const salt = ethers.encodeBytes32String(`salt${i}`);
        const commit = ethers.solidityPackedKeccak256(
          ["address", "uint256", "bool", "bytes32"],
          [validator.address, jobId, true, salt]
        );
        const txCommit = await manager
          .connect(validator)
          .commitValidation(jobId, commit, "", []);
        expect((await txCommit.wait()).gasUsed).to.be.lte(maxGas);

        await time.increase(3);

        const txReveal = await manager
          .connect(validator)
          .revealValidation(jobId, true, salt);
        expect((await txReveal.wait()).gasUsed).to.be.lte(maxGas);

        await time.increase(13);

        const before = await token.balanceOf(agent.address);
        const txValidate = await manager
          .connect(validator)
          .validateJob(jobId, "", []);
        const receiptValidate = await txValidate.wait();
        expect(receiptValidate.gasUsed).to.be.lte(maxGas);
        const after = await token.balanceOf(agent.address);
        expect(after - before).to.equal(payout);
      }
    });
  });

  describe("validator misbehavior and blacklisting", function () {
    it("penalizes and blacklists validator after disputes", async function () {
      const { token, manager, employer, agent, validator } = await loadFixture(deployFixture);
      const payout = ethers.parseEther("10");

      for (let i = 0; i < 2; i++) {
        const jobId = BigInt(i);
        await token
          .connect(employer)
          .approve(await manager.getAddress(), payout);
        await manager
          .connect(employer)
          .createJob(`bad${i}`, payout, 1, "details");
        await manager.connect(agent).applyForJob(jobId, "", []);
        await manager
          .connect(agent)
          .requestJobCompletion(jobId, "result");

        const salt = ethers.encodeBytes32String(`bad${i}`);
        const commit = ethers.solidityPackedKeccak256(
          ["address", "uint256", "bool", "bytes32"],
          [validator.address, jobId, false, salt]
        );
        await manager
          .connect(validator)
          .commitValidation(jobId, commit, "", []);
        await time.increase(3);
        await manager
          .connect(validator)
          .revealValidation(jobId, false, salt);
        await time.increase(13);

        const txDisapprove = await manager
          .connect(validator)
          .disapproveJob(jobId, "", []);
        expect((await txDisapprove.wait()).gasUsed).to.be.lte(maxGas);

        const txResolve = await manager.resolveDispute(jobId, 0);
        expect((await txResolve.wait()).gasUsed).to.be.lte(maxGas);
      }

      expect(await manager.validatorPenaltyCount(validator.address)).to.equal(2n);
      expect(await manager.blacklistedValidators(validator.address)).to.equal(true);
    });
  });
});

