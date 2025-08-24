const { expect } = require("chai");
const { ethers } = require("hardhat");

async function setup() {
  const [owner, employer, v1, v2] = await ethers.getSigners();

  const StakeMock = await ethers.getContractFactory("MockStakeManager");
  const stakeManager = await StakeMock.deploy();
  await stakeManager.waitForDeployment();

  const JobMock = await ethers.getContractFactory("MockJobRegistry");
  const jobRegistry = await JobMock.deploy();
  await jobRegistry.waitForDeployment();

  const RepMock = await ethers.getContractFactory("MockReputationEngine");
  const reputation = await RepMock.deploy();
  await reputation.waitForDeployment();

  const Validation = await ethers.getContractFactory(
    "contracts/v2/ValidationModule.sol:ValidationModule"
  );
  const validation = await Validation.deploy(
    await jobRegistry.getAddress(),
    await stakeManager.getAddress(),
    60,
    60,
    2,
    2,
    []
  );
  await validation.waitForDeployment();
  await validation.connect(owner).setReputationEngine(await reputation.getAddress());

  const Identity = await ethers.getContractFactory(
    "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
  );
  const identity = await Identity.deploy();
  await identity.waitForDeployment();
  await validation
    .connect(owner)
    .setIdentityRegistry(await identity.getAddress());
  await identity.setClubRootNode(ethers.ZeroHash);
  await identity.setAgentRootNode(ethers.ZeroHash);
  await identity.addAdditionalValidator(v1.address);
  await identity.addAdditionalValidator(v2.address);

  await stakeManager.setStake(v1.address, 1, ethers.parseEther("100"));
  await stakeManager.setStake(v2.address, 1, ethers.parseEther("50"));
  await validation
    .connect(owner)
    .setValidatorPool([v1.address, v2.address]);

  const jobStruct = {
    employer: employer.address,
    agent: ethers.ZeroAddress,
    reward: 0,
    stake: 0,
    success: false,
    status: 3,
    uriHash: ethers.ZeroHash,
    resultHash: ethers.ZeroHash,
  };
  await jobRegistry.setJob(1, jobStruct);
  return {
    owner,
    employer,
    v1,
    v2,
    validation,
    stakeManager,
    jobRegistry,
    identity,
    reputation,
  };
}

async function advance(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

describe("ValidationModule finalize flows", function () {
  it("records majority approval as success", async () => {
    const { v1, v2, validation, jobRegistry } = await setup();
    await validation.selectValidators(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("s1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("s2"));
    const nonce = await validation.jobNonce(1);
    const commit1 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, true, salt1]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, false, salt2]
    );
    await validation.connect(v1).commitValidation(1, commit1, "", []);
    await validation.connect(v2).commitValidation(1, commit2, "", []);
    await advance(61);
    await validation.connect(v1).revealValidation(1, true, salt1, "", []);
    await validation.connect(v2).revealValidation(1, false, salt2, "", []);
    await advance(61);
    await validation.finalize(1);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(6); // Finalized
    expect(job.success).to.equal(true);
  });

  it("records majority rejection as dispute", async () => {
    const { v1, v2, validation, jobRegistry } = await setup();
    await validation.selectValidators(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("s1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("s2"));
    const nonce = await validation.jobNonce(1);
    const commit1 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, false, salt1]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, false, salt2]
    );
    await validation.connect(v1).commitValidation(1, commit1, "", []);
    await validation.connect(v2).commitValidation(1, commit2, "", []);
    await advance(61);
    await validation.connect(v1).revealValidation(1, false, salt1, "", []);
    await validation.connect(v2).revealValidation(1, false, salt2, "", []);
    await advance(61);
    await validation.finalize(1);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(5); // Disputed
  });

  it("disputes when validators fail to reveal", async () => {
    const { validation, jobRegistry } = await setup();
    await validation.selectValidators(1);
    await advance(61); // end commit
    await advance(61); // end reveal
    await validation.finalize(1);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(5); // Disputed
  });

  it("slashes validators that do not all reveal", async () => {
    const { v1, v2, validation, stakeManager, jobRegistry } = await setup();
    await validation.selectValidators(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("s1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("s2"));
    const nonce = await validation.jobNonce(1);
    const commit1 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, true, salt1]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, true, salt2]
    );
    await validation.connect(v1).commitValidation(1, commit1, "", []);
    await validation.connect(v2).commitValidation(1, commit2, "", []);
    await advance(61);
    await validation.connect(v1).revealValidation(1, true, salt1, "", []);
    await advance(61);
    await validation.finalize(1);
    expect(await stakeManager.stakeOf(v1.address, 1)).to.equal(
      ethers.parseEther("50")
    );
    expect(await stakeManager.stakeOf(v2.address, 1)).to.equal(
      ethers.parseEther("25")
    );
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(5); // Disputed
  });

  it("disputes when approvals fall below threshold", async () => {
    const { v1, v2, validation, jobRegistry, stakeManager } = await setup();
    await stakeManager.setStake(v1.address, 1, ethers.parseEther("50"));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther("100"));
    await validation.selectValidators(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("s1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("s2"));
    const nonce = await validation.jobNonce(1);
    const commit1 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, true, salt1]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, false, salt2]
    );
    await validation.connect(v1).commitValidation(1, commit1, "", []);
    await validation.connect(v2).commitValidation(1, commit2, "", []);
    await advance(61);
    await validation
      .connect(v1)
      .revealValidation(1, true, salt1, "", []);
    await validation
      .connect(v2)
      .revealValidation(1, false, salt2, "", []);
    await advance(61);
    await validation.finalize(1);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(5); // Disputed
  });
});

