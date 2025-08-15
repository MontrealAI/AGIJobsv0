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

