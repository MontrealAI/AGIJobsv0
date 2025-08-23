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

  it("supports merkle proofs and resolver fallback", async () => {
    const [owner, validator, agent] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory("MockENS");
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory("MockNameWrapper");
    const wrapper = await Wrapper.deploy();

    const Resolver = await ethers.getContractFactory("MockResolver");
    const resolver = await Resolver.deploy();

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

    // validator verified by merkle proof
    const leaf = ethers.solidityPackedKeccak256([
      "address",
    ], [validator.address]);
    await id.setValidatorMerkleRoot(leaf);
    expect(await id.verifyValidator(validator.address, "", [])).to.equal(true);

    // agent verified via resolver fallback
    const label = "agent";
    const node = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "bytes32"],
        [ethers.ZeroHash, ethers.id(label)]
      )
    );
    await ens.setResolver(node, await resolver.getAddress());
    await resolver.setAddr(node, agent.address);
    expect(await id.verifyAgent(agent.address, label, [])).to.equal(true);
  });

  it("respects allowlists and blacklists", async () => {
    const [owner, alice] = await ethers.getSigners();

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

    // blacklist blocks verification even if allowlisted
    await rep.blacklist(alice.address, true);
    expect(await id.verifyAgent(alice.address, "", [])).to.equal(false);
    await rep.blacklist(alice.address, false);

    // additional allowlist bypasses ENS requirements
    await id.addAdditionalAgent(alice.address);
    expect(await id.verifyAgent(alice.address, "", [])).to.equal(true);
  });
});
