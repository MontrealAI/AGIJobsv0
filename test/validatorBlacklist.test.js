const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture() {
  const [owner, employer, agent, validator] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy();
  await token.waitForDeployment();

  await token.mint(employer.address, ethers.parseEther("1000"));
  await token.mint(validator.address, ethers.parseEther("100"));

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
  await manager.setValidatorSlashingPercentage(1000); // 10%
  await manager.setRequiredValidatorApprovals(1);
  await manager.setRequiredValidatorDisapprovals(1);
  await manager.setValidatorsPerJob(1);
  await manager.setValidatorBlacklistThreshold(1);
  await manager.setTimingConfig(1, 10, 12, 1);

  await manager.connect(agent).acceptTerms("ipfs://terms");
  await manager.connect(validator).acceptTerms("ipfs://terms");

  const stake = ethers.parseEther("10");
  await token.connect(validator).approve(await manager.getAddress(), stake);
  await manager.connect(validator).stake(stake);

  return { token, manager, employer, agent, validator };
}

describe("Validator blacklist threshold", function () {
  it("blacklists a validator after one penalty", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("10");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1, "details");
    await manager.connect(agent).applyForJob(0, "", []);
    await manager.connect(agent).requestJobCompletion(0, "resultHash");

    const salt = ethers.encodeBytes32String("salt");
    const commit = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, 0, false, salt]
    );
      await manager
        .connect(validator)
        .commitValidation(0, commit, "", []);
      await time.increase(2);
      await manager.connect(validator).revealValidation(0, false, salt);
      await time.increase(11);
      await manager.connect(validator).disapproveJob(0, "", []);

      await expect(manager.resolveDispute(0, 0))
        .to.emit(manager, "ValidatorBlacklisted")
        .withArgs(validator.address, true);

    expect(await manager.validatorPenaltyCount(validator.address)).to.equal(1n);
    expect(await manager.blacklistedValidators(validator.address)).to.equal(true);
  });

  it("rejects commits from blacklisted validators", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("10");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1, "details");
    await manager.connect(agent).applyForJob(0, "", []);
    await manager.connect(agent).requestJobCompletion(0, "resultHash");

    const salt = ethers.encodeBytes32String("salt");
    const commit = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, 0, false, salt]
    );
    await manager.connect(validator).commitValidation(0, commit, "", []);
    await time.increase(2);
    await manager.connect(validator).revealValidation(0, false, salt);
    await time.increase(11);
    await manager.connect(validator).disapproveJob(0, "", []);
    await manager.resolveDispute(0, 0);

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash2", payout, 1, "details");
    await manager.connect(agent).applyForJob(1, "", []);
    await manager.connect(agent).requestJobCompletion(1, "resultHash");
    const commit2 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, 1, false, salt]
    );
    await expect(
      manager.connect(validator).commitValidation(1, commit2, "", [])
    ).to.be.revertedWithCustomError(manager, "Unauthorized");
  });
});
