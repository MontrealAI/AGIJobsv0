const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ENSOwnershipVerifier setters", function () {
  let owner, other, verifier;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Verifier = await ethers.getContractFactory(
      "contracts/v2/modules/ENSOwnershipVerifier.sol:ENSOwnershipVerifier"
    );
    verifier = await Verifier.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroHash
    );
    await verifier.waitForDeployment();
  });

  it("allows only owner to update ENS address", async function () {
    const addr = ethers.getAddress(
      "0x000000000000000000000000000000000000dEaD"
    );
    await expect(verifier.connect(other).setENS(addr))
      .to.be.revertedWithCustomError(verifier, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(verifier.setENS(addr))
      .to.emit(verifier, "ENSUpdated")
      .withArgs(addr);
  });

  it("allows only owner to update NameWrapper", async function () {
    const wrapper = ethers.getAddress(
      "0x000000000000000000000000000000000000bEEF"
    );
    await expect(verifier.connect(other).setNameWrapper(wrapper))
      .to.be.revertedWithCustomError(verifier, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(verifier.setNameWrapper(wrapper))
      .to.emit(verifier, "NameWrapperUpdated")
      .withArgs(wrapper);
  });

  it("allows only owner to update club root node", async function () {
    const root = ethers.id("club");
    await expect(verifier.connect(other).setClubRootNode(root))
      .to.be.revertedWithCustomError(verifier, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(verifier.setClubRootNode(root))
      .to.emit(verifier, "ClubRootNodeUpdated")
      .withArgs(root);
  });

  it("allows only owner to update validator Merkle root", async function () {
    const root = ethers.id("validator");
    await expect(verifier.connect(other).setValidatorMerkleRoot(root))
      .to.be.revertedWithCustomError(verifier, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(verifier.setValidatorMerkleRoot(root))
      .to.emit(verifier, "ValidatorMerkleRootUpdated")
      .withArgs(root);
  });
});

describe("ENSOwnershipVerifier verification", function () {
  let owner, agent, ens, resolver, wrapper, verifier;
  const root = ethers.id("agi");

  beforeEach(async () => {
    [owner, agent] = await ethers.getSigners();
    const ENS = await ethers.getContractFactory("MockENS");
    ens = await ENS.deploy();
    const Resolver = await ethers.getContractFactory("MockResolver");
    resolver = await Resolver.deploy();
    const Wrapper = await ethers.getContractFactory("MockNameWrapper");
    wrapper = await Wrapper.deploy();
    await ens.setResolver(root, await resolver.getAddress());
    const Verifier = await ethers.getContractFactory(
      "contracts/v2/modules/ENSOwnershipVerifier.sol:ENSOwnershipVerifier"
    );
    verifier = await Verifier.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      ethers.ZeroHash
    );
    await verifier.waitForDeployment();
    await verifier.setAgentRootNode(root);
  });

  function namehash(root, label) {
    return ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "bytes32"],
        [root, ethers.keccak256(ethers.toUtf8Bytes(label))]
      )
    );
  }

  it("verifies merkle proof", async () => {
    const leaf = ethers.solidityPackedKeccak256(["address"], [agent.address]);
    await verifier.setAgentMerkleRoot(leaf);
    expect(
      await verifier.verifyOwnership.staticCall(agent.address, "a", [], root)
    ).to.equal(true);
  });

  it("verifies via NameWrapper", async () => {
    const node = namehash(root, "a");
    await wrapper.setOwner(ethers.toBigInt(node), agent.address);
    expect(
      await verifier.verifyOwnership.staticCall(agent.address, "a", [], root)
    ).to.equal(true);
  });

  it("verifies via resolver", async () => {
    const node = namehash(root, "a");
    await ens.setResolver(node, await resolver.getAddress());
    await resolver.setAddr(node, agent.address);
    expect(
      await verifier.verifyOwnership.staticCall(agent.address, "a", [], root)
    ).to.equal(true);
  });
});

