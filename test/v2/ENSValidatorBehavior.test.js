const { expect } = require("chai");
const { ethers } = require("hardhat");

function namehash(root, label) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [root, ethers.keccak256(ethers.toUtf8Bytes(label))]
    )
  );
}

describe("Validator ENS integration", function () {
  let owner, validator, other;
  let ens, resolver, wrapper, verifier;
  let stakeManager, jobRegistry, reputation, validation;
  const root = ethers.id("agi");

  beforeEach(async () => {
    [owner, validator, other] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory("MockENS");
    ens = await ENS.deploy();
    await ens.waitForDeployment();

    const Resolver = await ethers.getContractFactory("MockResolver");
    resolver = await Resolver.deploy();
    await resolver.waitForDeployment();

    const Wrapper = await ethers.getContractFactory("MockNameWrapper");
    wrapper = await Wrapper.deploy();
    await wrapper.waitForDeployment();

    await ens.setResolver(root, await resolver.getAddress());

    const Verifier = await ethers.getContractFactory(
      "contracts/v2/modules/ENSOwnershipVerifier.sol:ENSOwnershipVerifier"
    );
    verifier = await Verifier.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      root
    );
    await verifier.waitForDeployment();

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
      60,
      60,
      1,
      1,
      []
    );
    await validation.waitForDeployment();
    await validation.setReputationEngine(await reputation.getAddress());
    await verifier.transferOwnership(await validation.getAddress());
    await validation.setENSOwnershipVerifier(await verifier.getAddress());
    await validation.setClubRootNode(root);
  });

  it("rejects validators without subdomains and emits events on success", async () => {
    await validation.connect(owner).setValidatorPool([validator.address]);

    await stakeManager.setStake(
      validator.address,
      1,
      ethers.parseEther("1")
    );
    const job = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uri: "",
    };
    await jobRegistry.setJob(1, job);
    await validation.selectValidators(1);

    await expect(
      validation
        .connect(validator)
        .commitValidation(1, ethers.id("h"), "v", [])
    ).to.be.revertedWith("Not authorized validator");

    await wrapper.setOwner(
      ethers.toBigInt(namehash(root, "v")),
      validator.address
    );
    await resolver.setAddr(namehash(root, "v"), validator.address);

    await expect(
      validation
        .connect(validator)
        .commitValidation(1, ethers.id("h"), "v", [])
    )
      .to.emit(verifier, "OwnershipVerified")
      .withArgs(validator.address, "v")
      .and.to.emit(validation, "VoteCommitted");
  });

  it("rejects invalid Merkle proofs", async () => {
    const leaf = ethers.solidityPackedKeccak256(
      ["address"],
      [validator.address]
    );
    await validation.setValidatorMerkleRoot(leaf);
    const badProof = [ethers.id("bad")];
    await expect(
      verifier.verifyOwnership(validator.address, "v", badProof, root)
    ).to.not.emit(verifier, "OwnershipVerified");
    expect(
      await verifier.verifyOwnership.staticCall(
        validator.address,
        "v",
        badProof,
        root
      )
    ).to.equal(false);
  });

  it("removes validator privileges after subdomain transfer and allows override", async () => {
    const node = namehash(root, "v");
    await wrapper.setOwner(ethers.toBigInt(node), validator.address);
    await resolver.setAddr(node, validator.address);
    await validation.setValidatorPool([validator.address]);

    await stakeManager.setStake(
      validator.address,
      1,
      ethers.parseEther("1")
    );

    const job = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uri: "",
    };
    await jobRegistry.setJob(1, job);
    await validation.selectValidators(1);

    // transfer ENS ownership
    await wrapper.setOwner(ethers.toBigInt(node), other.address);
    await expect(
      validation
        .connect(validator)
        .commitValidation(1, ethers.id("h"), "v", [])
    ).to.be.revertedWith("Not authorized validator");

    // non-owner cannot override
    await expect(
      validation
        .connect(other)
        .setAdditionalValidators([validator.address], [true])
    ).to.be.revertedWithCustomError(validation, "OwnableUnauthorizedAccount");

    // owner override and commit succeeds
    await validation
      .connect(owner)
      .setAdditionalValidators([validator.address], [true]);
    await expect(
      validation
        .connect(validator)
        .commitValidation(1, ethers.id("h"), "v", [])
    ).to.emit(validation, "VoteCommitted");
  });

  it("skips blacklisted validators", async () => {
    const node = namehash(root, "v");
    await wrapper.setOwner(ethers.toBigInt(node), validator.address);
    await resolver.setAddr(node, validator.address);
    await validation.setValidatorPool([validator.address]);
    await stakeManager.setStake(
      validator.address,
      1,
      ethers.parseEther("1")
    );
    await reputation.setBlacklist(validator.address, true);
    const job = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uri: "",
    };
    await jobRegistry.setJob(1, job);
    await expect(validation.selectValidators(1)).to.be.revertedWith(
      "insufficient validators"
    );
  });
});
