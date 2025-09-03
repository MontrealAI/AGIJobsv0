const { expect } = require("chai");
const { ethers } = require("hardhat");

async function advance(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

async function setup() {
  const [owner, employer, validator, v2, v3] = await ethers.getSigners();

  const Stake = await ethers.getContractFactory(
    "contracts/v2/mocks/ReentrantStakeManager.sol:ReentrantStakeManager"
  );
  const stakeManager = await Stake.deploy();
  await stakeManager.waitForDeployment();

  const Job = await ethers.getContractFactory("MockJobRegistry");
  const jobRegistry = await Job.deploy();
  await jobRegistry.waitForDeployment();

  const Rep = await ethers.getContractFactory("MockReputationEngine");
  const reputation = await Rep.deploy();
  await reputation.waitForDeployment();

  const Validation = await ethers.getContractFactory(
    "contracts/v2/ValidationModule.sol:ValidationModule"
  );
  const validation = await Validation.deploy(
    await jobRegistry.getAddress(),
    await stakeManager.getAddress(),
    60,
    60,
    3,
    3,
    []
  );
  await validation.waitForDeployment();
  await validation.connect(owner).setReputationEngine(await reputation.getAddress());

  const Identity = await ethers.getContractFactory(
    "contracts/v2/mocks/ReentrantIdentityRegistry.sol:ReentrantIdentityRegistry"
  );
  const identity = await Identity.deploy();
  await identity.setValidationModule(await validation.getAddress());
  await validation.connect(owner).setIdentityRegistry(await identity.getAddress());
  await identity.addAdditionalValidator(validator.address);
  await identity.addAdditionalValidator(v2.address);
  await identity.addAdditionalValidator(v3.address);

  await stakeManager.setValidationModule(await validation.getAddress());
  await stakeManager.setStake(validator.address, 1, ethers.parseEther("100"));
  await stakeManager.setStake(v2.address, 1, ethers.parseEther("100"));
  await stakeManager.setStake(v3.address, 1, ethers.parseEther("100"));
  await validation
    .connect(owner)
    .setValidatorPool([validator.address, v2.address, v3.address]);

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

  async function prepare(jobId, entropy = 0) {
    const addr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
    await ethers.provider.send("hardhat_impersonateAccount", [addr]);
    const registry = await ethers.getSigner(addr);
    await validation.connect(registry).start(jobId, entropy);
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [addr]);
    await ethers.provider.send("evm_mine", []);
    return validation.connect(validator).selectValidators(jobId, 0);
  }

  return {
    owner,
    employer,
    validator,
    validation,
    stakeManager,
    identity,
    prepare,
  };
}

describe("ValidationModule reentrancy", function () {
  it("guards commit against reentrancy", async () => {
    const { validator, validation, identity, prepare } = await setup();
    await prepare(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("s"));
    const nonce = await validation.jobNonce(1);
    const commitHash = ethers.solidityPackedKeccak256(["uint256", "uint256", "bool", "bytes32", "bytes32"],[1n, nonce, true, salt, ethers.ZeroHash]);
    await identity.attackCommit(1, commitHash);
    await expect(
      validation.connect(validator).commitValidation(1, commitHash, "", [])
    ).to.be.revertedWithCustomError(validation, "ReentrancyGuardReentrantCall");
  });

  it("guards reveal against reentrancy", async () => {
    const { validator, validation, identity, prepare } = await setup();
    await prepare(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("s"));
    const nonce = await validation.jobNonce(1);
    const commitHash = ethers.solidityPackedKeccak256(["uint256", "uint256", "bool", "bytes32", "bytes32"],[1n, nonce, true, salt, ethers.ZeroHash]);
    await validation
      .connect(validator)
      .commitValidation(1, commitHash, "", []);
    await advance(61);
    await identity.attackReveal(1, true, salt);
    await expect(
      validation.connect(validator).revealValidation(1, true, salt, "", [])
    ).to.be.revertedWithCustomError(validation, "ReentrancyGuardReentrantCall");
  });

  it("guards finalize against reentrancy", async () => {
    const { validation, stakeManager, prepare } = await setup();
    await prepare(1);
    await advance(121);
    await stakeManager.attackFinalize(1);
    await expect(validation.finalize(1)).to.be.revertedWithCustomError(
      validation,
      "ReentrancyGuardReentrantCall"
    );
  });
});
