const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Validation reveal auth cache", function () {
  let employer, validator;
  let validation, stakeManager, jobRegistry, identity;

  beforeEach(async () => {
    [, employer, validator] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle"
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setResult(true);
    await identity.setClubRootNode(ethers.ZeroHash);
    await identity.setAgentRootNode(ethers.ZeroHash);

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      2,
      2,
      1,
      1,
      [validator.address]
    );
    await validation.waitForDeployment();
    await validation.setIdentityRegistry(await identity.getAddress());
    await stakeManager.setStake(
      validator.address,
      1,
      ethers.parseEther("1")
    );
    await validation.setValidatorAuthCacheDuration(10);
  });

  async function runJob(jobId, { afterCommit } = {}) {
    const job = {
      employer: employer.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(jobId, job);
    await validation.selectValidators(jobId);
    const nonce = await validation.jobNonce(jobId);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("s" + jobId));
    const commitHash = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [BigInt(jobId), nonce, true, salt]
    );
    await validation
      .connect(validator)
      .commitValidation(jobId, commitHash, "", []);
    if (afterCommit) {
      await afterCommit();
    }
    const round = await validation.rounds(jobId);
    await time.setNextBlockTimestamp(Number(round.commitDeadline) + 1);
    const revealTx = validation
      .connect(validator)
      .revealValidation(jobId, true, salt, "", []);
    await revealTx;
  }

  it("skips repeat ENS checks", async () => {
    await runJob(1);
    await runJob(2, {
      afterCommit: async () => {
        const tx = await identity.setResult(false);
        await tx.wait();
      },
    });
  });
});
