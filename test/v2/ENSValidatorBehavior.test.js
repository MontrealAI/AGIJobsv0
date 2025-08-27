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
  let owner, validator, other, v2, v3;
  let ens, resolver, wrapper, identity;
  let stakeManager, jobRegistry, reputation, validation, vrf;
  const root = ethers.id("agi");

  beforeEach(async () => {
    [owner, validator, other, v2, v3] = await ethers.getSigners();

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

    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const RepMock = await ethers.getContractFactory("MockReputationEngine");
    reputation = await RepMock.deploy();
    await reputation.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      "contracts/v2/IdentityRegistry.sol:IdentityRegistry"
    );
    identity = await Identity.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      await reputation.getAddress(),
      ethers.ZeroHash,
      root
    );
    await identity.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      60,
      60,
      3,
      3,
      []
    );
    await validation.waitForDeployment();
    await validation.setReputationEngine(await reputation.getAddress());
    await validation.setIdentityRegistry(await identity.getAddress());
    const VRFMock = await ethers.getContractFactory(
      "contracts/v2/mocks/VRFMock.sol:VRFMock"
    );
    vrf = await VRFMock.deploy();
    await vrf.waitForDeployment();
    await validation.setVRF(await vrf.getAddress());

    // add filler validators
    await identity.addAdditionalValidator(v2.address);
    await identity.addAdditionalValidator(v3.address);
    await stakeManager.setStake(validator.address, 1, ethers.parseEther("1"));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther("1"));
    await stakeManager.setStake(v3.address, 1, ethers.parseEther("1"));
    await validation.setValidatorPool([
      validator.address,
      v2.address,
      v3.address,
    ]);
  });

  it("rejects validators without subdomains and emits events on success", async () => {
    const job = {
      employer: owner.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, job);
    await validation.requestVRF(1);
    let req = await validation.vrfRequestIds(1);
    await vrf.fulfill(req, 12345);
    await expect(
      validation.selectValidators(1, 0)
    ).to.be.revertedWith("insufficient validators");

    await validation.setValidatorSubdomains([validator.address], ["v"]);
    await wrapper.setOwner(
      ethers.toBigInt(namehash(root, "v")),
      validator.address
    );
    await resolver.setAddr(namehash(root, "v"), validator.address);

    await jobRegistry.setJob(2, job);
    await validation.requestVRF(2);
    req = await validation.vrfRequestIds(2);
    await vrf.fulfill(req, 99999);
    await validation.selectValidators(2, 0);
    await expect(
      validation
        .connect(validator)
        .commitValidation(2, ethers.id("h"), "v", [])
    )
      .to.emit(identity, "OwnershipVerified")
      .withArgs(validator.address, "v")
      .and.to.emit(validation, "ValidationCommitted");
  });

  it("rejects invalid Merkle proofs", async () => {
      const leaf = ethers.solidityPackedKeccak256(
        ["address"],
        [validator.address]
      );
      await identity.setValidatorMerkleRoot(leaf);
    const badProof = [ethers.id("bad")];
    await expect(
      identity.verifyValidator(validator.address, "v", badProof)
    ).to.not.emit(identity, "OwnershipVerified");
    expect(
      await identity.verifyValidator.staticCall(
        validator.address,
        "v",
        badProof
      )
    ).to.equal(false);
  });

  it("removes validator privileges after subdomain transfer and allows override", async () => {
    const node = namehash(root, "v");
    await wrapper.setOwner(ethers.toBigInt(node), validator.address);
    await resolver.setAddr(node, validator.address);
    await validation.setValidatorPool([
      validator.address,
      v2.address,
      v3.address,
    ]);
    await validation.setValidatorSubdomains([validator.address], ["v"]);

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
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, job);
    await validation.requestVRF(1);
    let req = await validation.vrfRequestIds(1);
    await vrf.fulfill(req, 11111);
    await validation.selectValidators(1, 0);

    // transfer ENS ownership
    await wrapper.setOwner(ethers.toBigInt(node), other.address);
    await expect(
      validation
        .connect(validator)
        .commitValidation(1, ethers.id("h"), "v", [])
    ).to.be.revertedWith("Not authorized validator");

    // non-owner cannot override
    await expect(
      identity.connect(other).addAdditionalValidator(validator.address)
    ).to.be.revertedWithCustomError(
      identity,
      "OwnableUnauthorizedAccount"
    );

    // owner override and commit succeeds
    await identity.addAdditionalValidator(validator.address);
    await expect(
      validation
        .connect(validator)
        .commitValidation(1, ethers.id("h"), "v", [])
    ).to.emit(validation, "ValidationCommitted");
  });

  it("skips blacklisted validators", async () => {
    const node = namehash(root, "v");
    await wrapper.setOwner(ethers.toBigInt(node), validator.address);
    await resolver.setAddr(node, validator.address);
    await validation.setValidatorPool([
      validator.address,
      v2.address,
      v3.address,
    ]);
    await validation.setValidatorSubdomains([validator.address], ["v"]);
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
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(1, job);
    await validation.requestVRF(1);
    req = await validation.vrfRequestIds(1);
    await vrf.fulfill(req, 22222);
    await expect(
      validation.selectValidators(1, 0)
    ).to.be.revertedWith("insufficient validators");
  });
});
