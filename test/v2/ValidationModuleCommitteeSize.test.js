const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("ValidationModule committee size", function () {
  let owner, employer, v1, v2, v3;
  let validation, stakeManager, jobRegistry, identity;

  beforeEach(async () => {
    [owner, employer, v1, v2, v3] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      60,
      60,
      1,
      3,
      []
    );
    await validation.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await validation
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await identity.setClubRootNode(ethers.ZeroHash);
    await identity.setAgentRootNode(ethers.ZeroHash);
    await identity.addAdditionalValidator(v1.address);
    await identity.addAdditionalValidator(v2.address);
    await identity.addAdditionalValidator(v3.address);

    await stakeManager.setStake(v1.address, 1, ethers.parseEther("100"));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther("50"));
    await stakeManager.setStake(v3.address, 1, ethers.parseEther("10"));

    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);

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
    await jobRegistry.setJob(2, jobStruct);
    await jobRegistry.setJob(3, jobStruct);
    await jobRegistry.setJob(4, jobStruct);
  });

  async function advance(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  it("allows per-job committee size within bounds", async () => {
    await validation.start(1, "", 1);
    expect((await validation.validators(1)).length).to.equal(1);
    const r1 = await validation.rounds(1);
    expect(r1.committeeSize).to.equal(1n);

    await validation.start(2, "", 0);
    expect((await validation.validators(2)).length).to.equal(1);
    const r2 = await validation.rounds(2);
    expect(r2.committeeSize).to.equal(1n);

    await validation.start(3, "", 10);
    expect((await validation.validators(3)).length).to.equal(3);
    const r3 = await validation.rounds(3);
    expect(r3.committeeSize).to.equal(3n);
  });

  it("uses stored committee size for quorum", async () => {
    await validation.start(4, "", 3);
    const selected = await validation.validators(4);
    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };

    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));
    const nonce = await validation.jobNonce(4);
    const commit1 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [4n, nonce, true, salt1]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [4n, nonce, true, salt2]
    );

    await validation
      .connect(signerMap[selected[0].toLowerCase()])
      .commitValidation(4, commit1, "", []);
    await validation
      .connect(signerMap[selected[1].toLowerCase()])
      .commitValidation(4, commit2, "", []);

    await advance(61);
    await validation
      .connect(signerMap[selected[0].toLowerCase()])
      .revealValidation(4, true, salt1, "", []);
    await validation
      .connect(signerMap[selected[1].toLowerCase()])
      .revealValidation(4, true, salt2, "", []);
    await advance(61);

    expect(await validation.finalize.staticCall(4)).to.equal(false);
  });
});

