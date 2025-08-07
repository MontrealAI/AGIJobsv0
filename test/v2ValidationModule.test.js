const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidationModule V2", function () {
  let owner, employer, v1, v2, v3;
  let validation, stakeManager, jobRegistry, reputation;
  const coder = ethers.AbiCoder.defaultAbiCoder();

  beforeEach(async () => {
    [owner, employer, v1, v2, v3] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const RepMock = await ethers.getContractFactory("MockReputationEngine");
    reputation = await RepMock.deploy();
    await reputation.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      owner.address
    );
    await validation.waitForDeployment();
    await validation
      .connect(owner)
      .setReputationEngine(await reputation.getAddress());

    // set parameters: commit 60s, reveal 60s, validators per job 2
    await validation
      .connect(owner)
      .setParameters(0, 0, 0, 50, 60, 60, 0, 0, 2);

    // validator stakes and pool
    await stakeManager.setValidatorStake(v1.address, ethers.parseEther("100"));
    await stakeManager.setValidatorStake(v2.address, ethers.parseEther("50"));
    await stakeManager.setValidatorStake(v3.address, ethers.parseEther("10"));

    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);

    // setup job
    const jobStruct = {
      employer: employer.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 0,
    };
    await jobRegistry.setJob(1, jobStruct);
  });

  async function advance(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  it("selects validators by highest stake", async () => {
    const selected = await validation.selectValidators.staticCall(1);
    await validation.selectValidators(1);
    expect(selected).to.deep.equal([v1.address, v2.address]);
  });

  it("does not slash honest validators", async () => {
    await validation.selectValidators(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const commit1 = ethers.keccak256(
      coder.encode(["bool", "bytes32"], [true, salt1])
    );
    const commit2 = ethers.keccak256(
      coder.encode(["bool", "bytes32"], [true, salt2])
    );
    await (await validation.connect(v1).commitValidation(1, commit1)).wait();
    await (await validation.connect(v2).commitValidation(1, commit2)).wait();
    await advance(61);
    await validation.connect(v1).revealValidation(1, true, salt1);
    await validation.connect(v2).revealValidation(1, true, salt2);
    await advance(61);
    expect(await validation.finalize.staticCall(1)).to.equal(true);
    await validation.finalize(1);
    expect(await stakeManager.validatorStake(v1.address)).to.equal(
      ethers.parseEther("100")
    );
    expect(await stakeManager.validatorStake(v2.address)).to.equal(
      ethers.parseEther("50")
    );
    expect(await reputation.reputationOf(v1.address)).to.equal(1n);
    expect(await reputation.reputationOf(v2.address)).to.equal(1n);
  });

  it("slashes validator voting against majority", async () => {
    await validation.selectValidators(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));
    const commit1 = ethers.keccak256(
      coder.encode(["bool", "bytes32"], [true, salt1])
    );
    const commit2 = ethers.keccak256(
      coder.encode(["bool", "bytes32"], [false, salt2])
    );
    await (await validation.connect(v1).commitValidation(1, commit1)).wait();
    await (await validation.connect(v2).commitValidation(1, commit2)).wait();
    await advance(61);
    await validation.connect(v1).revealValidation(1, true, salt1);
    await validation.connect(v2).revealValidation(1, false, salt2);
    await advance(61);
    await validation.finalize(1);
    expect(await stakeManager.validatorStake(v2.address)).to.equal(
      ethers.parseEther("25")
    );
    expect(await reputation.reputationOf(v1.address)).to.equal(1n);
    expect(await reputation.reputationOf(v2.address)).to.equal(0n);
  });
});
