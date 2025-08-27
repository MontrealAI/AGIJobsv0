const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidationModule V2", function () {
  let owner, employer, v1, v2, v3;
  let validation, stakeManager, jobRegistry, reputation, identity, vrf;

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

    const VRFMock = await ethers.getContractFactory(
      "contracts/v2/mocks/VRFMock.sol:VRFMock"
    );
    vrf = await VRFMock.deploy();
    await vrf.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      60,
      60,
      2,
      2,
      []
    );
    await validation.waitForDeployment();
    await validation
      .connect(owner)
      .setReputationEngine(await reputation.getAddress());
    await validation.setVRF(await vrf.getAddress());

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

    // validator stakes and pool
    await stakeManager.setStake(v1.address, 1, ethers.parseEther("100"));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther("50"));
    await stakeManager.setStake(v3.address, 1, ethers.parseEther("10"));

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
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, jobStruct);
  });

  async function advance(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  async function select(jobId, randomness = 12345) {
    await validation.requestVRF(jobId);
    const req = await validation.vrfRequestIds(jobId);
    await vrf.fulfill(req, randomness);
    return validation.selectValidators(jobId);
  }

  it("reverts when stake manager is unset", async () => {
    await validation.connect(owner).setStakeManager(ethers.ZeroAddress);
    await expect(select(1)).to.be.revertedWith(
      "stake manager"
    );
  });

  it("selects stake-weighted validators", async () => {
    const tx = await select(1);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    );
    const selected = event.args[1];

    expect(selected.length).to.equal(2);
    const set = new Set(selected.map((a) => a.toLowerCase()));
    expect(set.size).to.equal(2);
    for (const addr of selected) {
      expect([v1.address, v2.address, v3.address]).to.include(addr);
    }
  });

  it("does not slash honest validators", async () => {
    const tx = await select(1);
    const receipt = await tx.wait();
    const selected = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    ).args[1];
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));
    const nonce = await validation.jobNonce(1);
    const commit1 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, true, salt1]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, true, salt2]
    );
    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };
    await (
      await validation
        .connect(signerMap[selected[0].toLowerCase()])
        .commitValidation(1, commit1, "", [])
    ).wait();
    await (
      await validation
        .connect(signerMap[selected[1].toLowerCase()])
        .commitValidation(1, commit2, "", [])
    ).wait();
    await advance(61);
      await validation
        .connect(signerMap[selected[0].toLowerCase()])
        .revealValidation(1, true, salt1, "", []);
      await validation
        .connect(signerMap[selected[1].toLowerCase()])
        .revealValidation(1, true, salt2, "", []);
    await advance(61);
    expect(await validation.finalize.staticCall(1)).to.equal(true);
    await validation.finalize(1);
    for (const addr of selected) {
      const stake = await stakeManager.stakeOf(addr, 1);
      const expectedStake =
        addr.toLowerCase() === v1.address.toLowerCase()
          ? ethers.parseEther("100")
          : addr.toLowerCase() === v2.address.toLowerCase()
          ? ethers.parseEther("50")
          : ethers.parseEther("10");
      expect(stake).to.equal(expectedStake);
      expect(await reputation.reputation(addr)).to.equal(1n);
    }
  });

  it("slashes validator voting against majority", async () => {
    const tx = await select(1);
    const receipt = await tx.wait();
    const selected = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    ).args[1];
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));
    const nonce = await validation.jobNonce(1);
    const commit1 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, true, salt1]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, false, salt2]
    );
    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };
    await (
      await validation
        .connect(signerMap[selected[0].toLowerCase()])
        .commitValidation(1, commit1, "", [])
    ).wait();
    await (
      await validation
        .connect(signerMap[selected[1].toLowerCase()])
        .commitValidation(1, commit2, "", [])
    ).wait();
    await advance(61);
    const stake0 = await stakeManager.stakeOf(selected[0], 1);
    const stake1 = await stakeManager.stakeOf(selected[1], 1);
      await validation
        .connect(signerMap[selected[0].toLowerCase()])
        .revealValidation(1, true, salt1, "", []);
      await validation
        .connect(signerMap[selected[1].toLowerCase()])
        .revealValidation(1, false, salt2, "", []);
    await advance(61);
    await validation.finalize(1);
    const slashed = stake0 >= stake1 ? selected[1] : selected[0];
    const winner = slashed === selected[0] ? selected[1] : selected[0];
    const slashedStakeBefore = stake0 >= stake1 ? stake1 : stake0;
    expect(await stakeManager.stakeOf(slashed, 1)).to.equal(
      slashedStakeBefore / 2n
    );
    expect(await reputation.reputation(winner)).to.equal(1n);
    expect(await reputation.reputation(slashed)).to.equal(0n);
  });

  it("rejects reveal with incorrect nonce", async () => {
    const tx = await select(1);
    const receipt = await tx.wait();
    const selected = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    ).args[1];
    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };
    const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
    const wrongNonce = (await validation.jobNonce(1)) + 1n;
    const commit = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, wrongNonce, true, salt]
    );
    await (
      await validation
        .connect(signerMap[selected[0].toLowerCase()])
        .commitValidation(1, commit, "", [])
    ).wait();
    await advance(61);
    await expect(
      validation
        .connect(signerMap[selected[0].toLowerCase()])
        .revealValidation(1, true, salt, "", [])
    ).to.be.revertedWith("invalid reveal");
  });

  it("clears commitments when job nonce is reset", async () => {
    await validation.connect(owner).setValidatorBounds(1, 1);
    await validation
      .connect(owner)
      .setValidatorPool([v1.address]);

    await select(1);
    const nonce1 = await validation.jobNonce(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
    const commit1 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce1, true, salt]
    );
    await (await validation.connect(v1).commitValidation(1, commit1, "", [])).wait();

    await expect(
      validation.connect(v1).commitValidation(1, commit1, "", [])
    ).to.be.revertedWith("already committed");

    await validation.connect(owner).resetJobNonce(1);
    expect(await validation.jobNonce(1)).to.equal(0n);

    const tx = await select(1);
    await tx.wait();
    const nonce2 = await validation.jobNonce(1);
    expect(nonce2).to.equal(1n);
    const commit2 = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce2, true, salt]
    );
    await expect(
      validation.connect(v1).commitValidation(1, commit2, "", [])
    ).to.not.be.reverted;
  });

  it("removes validators from lookup on nonce reset", async () => {
    await validation.connect(owner).setValidatorBounds(1, 1);
    await validation
      .connect(owner)
      .setValidatorPool([v1.address]);
    await select(1);
    await validation.connect(owner).resetJobNonce(1);
    await validation
      .connect(owner)
      .setValidatorPool([v2.address]);
    await select(1);
    const nonce = await validation.jobNonce(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
    const commit = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, true, salt]
    );
    await expect(
      validation.connect(v1).commitValidation(1, commit, "", [])
    ).to.be.revertedWith("not validator");
  });

  it("allows owner to reassign registry and stake manager", async () => {
    // select validators to create state for job 1
    await select(1);

    const StakeMock2 = await ethers.getContractFactory("MockStakeManager");
    const newStake = await StakeMock2.deploy();
    await newStake.waitForDeployment();
    await newStake.setStake(v1.address, 1, ethers.parseEther("100"));
    await newStake.setStake(v2.address, 1, ethers.parseEther("50"));
    await newStake.setStake(v3.address, 1, ethers.parseEther("10"));

    const JobMock2 = await ethers.getContractFactory("MockJobRegistry");
    const newJob = await JobMock2.deploy();
    await newJob.waitForDeployment();

    await expect(
      validation.connect(employer).setStakeManager(await newStake.getAddress())
    ).to.be.revertedWithCustomError(validation, "OwnableUnauthorizedAccount");

    await expect(
      validation.connect(owner).setStakeManager(await newStake.getAddress())
    )
      .to.emit(validation, "StakeManagerUpdated")
      .withArgs(await newStake.getAddress());

    await expect(
      validation.connect(owner).setJobRegistry(await newJob.getAddress())
    )
      .to.emit(validation, "JobRegistryUpdated")
      .withArgs(await newJob.getAddress());

    await expect(
      validation.selectValidators(1)
    ).to.be.revertedWith("already selected");

    await validation.connect(owner).resetJobNonce(1);
    await expect(select(1)).to.not.be.reverted;
  });

  it("enforces tax acknowledgement for commit and reveal", async () => {
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const policy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry.setTaxPolicy(await policy.getAddress());
    const tx = await select(1);
    const receipt = await tx.wait();
    const selected = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    ).args[1];

    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };
    const val = signerMap[selected[0].toLowerCase()];
    const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
    const nonce = await validation.jobNonce(1);
    const commit = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "bool", "bytes32"],
      [1n, nonce, true, salt]
    );

    await expect(
      validation.connect(val).commitValidation(1, commit, "", [])
    ).to.be.revertedWith("acknowledge tax policy");

    await jobRegistry.connect(val).acknowledgeTaxPolicy();
    await expect(
      validation.connect(val).commitValidation(1, commit, "", [])
    ).to.emit(validation, "ValidationCommitted");

    await advance(61);
    await policy.bumpPolicyVersion();
    await expect(
      validation.connect(val).revealValidation(1, true, salt, "", [])
    ).to.be.revertedWith("acknowledge tax policy");

    await jobRegistry.connect(val).acknowledgeTaxPolicy();
    await expect(
      validation.connect(val).revealValidation(1, true, salt, "", [])
    ).to.emit(validation, "ValidationRevealed");
  });

    it("updates additional validators individually", async () => {
      const [, , , , , extra] = await ethers.getSigners();
      await expect(identity.addAdditionalValidator(extra.address))
        .to.emit(identity, "AdditionalValidatorUpdated")
        .withArgs(extra.address, true);
      expect(await identity.additionalValidators(extra.address)).to.equal(true);

      await expect(identity.removeAdditionalValidator(extra.address))
        .to.emit(identity, "AdditionalValidatorUpdated")
        .withArgs(extra.address, false);
      expect(await identity.additionalValidators(extra.address)).to.equal(false);
    });
});
