import { expect } from "chai";
import { ethers } from "hardhat";

// Tests for ENS ownership verification through IdentityRegistry

describe("IdentityRegistry ENS verification", function () {
  it("verifies ownership via NameWrapper and rejects others", async () => {
    const [owner, alice, bob] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory("MockENS");
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory("MockNameWrapper");
    const wrapper = await Wrapper.deploy();

    const Rep = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const rep = await Rep.deploy(ethers.ZeroAddress);

    const Registry = await ethers.getContractFactory(
      "contracts/v2/IdentityRegistry.sol:IdentityRegistry"
    );
    const id = await Registry.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      await rep.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );

    const subdomain = "alice";
    const subnode = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [ethers.ZeroHash, ethers.id(subdomain)])
    );
    await wrapper.setOwner(BigInt(subnode), alice.address);

    expect(await id.verifyAgent(alice.address, subdomain, [])).to.equal(true);
    expect(await id.verifyAgent(bob.address, subdomain, [])).to.equal(false);
  });
});
