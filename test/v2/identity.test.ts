import { expect } from 'chai';
import hre from 'hardhat';
const { ethers } = hre;

// Tests for ENS ownership verification through IdentityRegistry

describe('IdentityRegistry ENS verification', function () {
  it('verifies ownership via NameWrapper and rejects others', async () => {
    const [_owner, alice, bob] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('MockNameWrapper');
    const wrapper = await Wrapper.deploy();

    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();
    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const rep = await Rep.deploy(await stake.getAddress());

    const Registry = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    const id = await Registry.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      await rep.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );

    const subdomain = 'alice';
    const subnode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [ethers.ZeroHash, ethers.id(subdomain)]
      )
    );
    await wrapper.setOwner(BigInt(subnode), alice.address);

    expect(
      await id.verifyAgent.staticCall(alice.address, subdomain, [])
    ).to.equal(true);
    expect(
      await id.verifyAgent.staticCall(bob.address, subdomain, [])
    ).to.equal(false);
  });

  it('supports merkle proofs and resolver fallback', async () => {
    const [_owner, validator, agent] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('MockNameWrapper');
    const wrapper = await Wrapper.deploy();

    const Resolver = await ethers.getContractFactory('MockResolver');
    const resolver = await Resolver.deploy();

    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();
    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const rep = await Rep.deploy(await stake.getAddress());

    const Registry = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    const id = await Registry.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      await rep.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );

    // validator verified by merkle proof
    const leaf = ethers.solidityPackedKeccak256(
      ['address'],
      [validator.address]
    );
    await id.setValidatorMerkleRoot(leaf);
    expect(
      await id.verifyValidator.staticCall(validator.address, '', [])
    ).to.equal(true);

    // agent verified via resolver fallback
    const label = 'agent';
    const node = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [ethers.ZeroHash, ethers.id(label)]
      )
    );
    await ens.setResolver(node, await resolver.getAddress());
    await resolver.setAddr(node, agent.address);
    expect(await id.verifyAgent.staticCall(agent.address, label, [])).to.equal(
      true
    );
  });

  it('respects allowlists and blacklists', async () => {
    const [_owner, alice] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('MockNameWrapper');
    const wrapper = await Wrapper.deploy();

    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();
    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const rep = await Rep.deploy(await stake.getAddress());

    const Registry = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
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
    expect(await id.verifyAgent.staticCall(alice.address, '', [])).to.equal(
      false
    );
    await rep.blacklist(alice.address, false);

    // additional allowlist bypasses ENS requirements
    await id.addAdditionalAgent(alice.address);
    expect(await id.verifyAgent.staticCall(alice.address, '', [])).to.equal(
      true
    );
  });

  it('allows governance and agents to set capability profiles', async () => {
    const [_owner, alice] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('MockNameWrapper');
    const wrapper = await Wrapper.deploy();

    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();
    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const rep = await Rep.deploy(await stake.getAddress());

    const Registry = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    const id = await Registry.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      await rep.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );

    // owner sets profile for alice
    await expect(
      id.connect(owner).setAgentProfileURI(alice.address, 'ipfs://cap1')
    )
      .to.emit(id, 'AgentProfileUpdated')
      .withArgs(alice.address, 'ipfs://cap1');
    expect(await id.agentProfileURI(alice.address)).to.equal('ipfs://cap1');

    // alice cannot update profile until authorized
    await expect(
      id.connect(alice).updateAgentProfile('sub', [], 'ipfs://cap2')
    ).to.be.revertedWithCustomError(id, 'UnauthorizedAgent');

    // allow alice as additional agent then self-update profile
    await id.addAdditionalAgent(alice.address);
    await expect(id.connect(alice).updateAgentProfile('sub', [], 'ipfs://cap2'))
      .to.emit(id, 'AgentProfileUpdated')
      .withArgs(alice.address, 'ipfs://cap2');
    expect(await id.agentProfileURI(alice.address)).to.equal('ipfs://cap2');
  });

  it('requires new owner to accept ownership', async () => {
    const [owner, other] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('MockNameWrapper');
    const wrapper = await Wrapper.deploy();

    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();
    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const rep = await Rep.deploy(await stake.getAddress());

    const Registry = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    const id = await Registry.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      await rep.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );

    await id.transferOwnership(other.address);
    expect(await id.owner()).to.equal(owner.address);
    await id.connect(other).acceptOwnership();
    expect(await id.owner()).to.equal(other.address);
  });
});
