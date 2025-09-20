import { expect } from 'chai';
import hre from 'hardhat';
const { ethers } = hre;

// Tests for ENS ownership verification through IdentityRegistry

function leaf(addr: string, label: string) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32'],
      [addr, ethers.id(label)]
    )
  );
}

describe('IdentityRegistry ENS verification', function () {
  it('verifies ownership via NameWrapper and rejects others', async () => {
    const [owner, alice, bob] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('contracts/mocks/MockNameWrapper.sol:MockNameWrapper');
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
      (await id.verifyAgent.staticCall(alice.address, subdomain, []))[0]
    ).to.equal(true);
    expect(
      (await id.verifyAgent.staticCall(bob.address, subdomain, []))[0]
    ).to.equal(false);
    await expect(id.verifyAgent(bob.address, subdomain, []))
      .to.emit(id, 'IdentityVerificationFailed')
      .withArgs(bob.address, 0, subdomain);
  });

  it('supports merkle proofs and resolver fallback', async () => {
    const [owner, validator, agent] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('contracts/mocks/MockNameWrapper.sol:MockNameWrapper');
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
    const vLeaf = leaf(validator.address, '');
    await id.setValidatorMerkleRoot(vLeaf);
    expect(
      (await id.verifyValidator.staticCall(validator.address, '', []))[0]
    ).to.equal(true);
    expect(
      (await id.verifyValidator.staticCall(validator.address, 'bad', []))[0]
    ).to.equal(false);

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
    expect(
      (await id.verifyAgent.staticCall(agent.address, label, []))[0]
    ).to.equal(true);
  });

  it('respects allowlists and blacklists', async () => {
    const [owner, alice] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('contracts/mocks/MockNameWrapper.sol:MockNameWrapper');
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
    expect(
      (await id.verifyAgent.staticCall(alice.address, '', []))[0]
    ).to.equal(false);
    await rep.blacklist(alice.address, false);

    // additional allowlist bypasses ENS requirements
    await id.addAdditionalAgent(alice.address);
    expect(
      (await id.verifyAgent.staticCall(alice.address, '', []))[0]
    ).to.equal(true);
  });

  it('authorizes via allowlists and attestations when ENS is unset', async () => {
    const [owner, agent, validator] = await ethers.getSigners();

    const Wrapper = await ethers.getContractFactory('contracts/mocks/MockNameWrapper.sol:MockNameWrapper');
    const wrapper = await Wrapper.deploy();

    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();
    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const rep = await Rep.deploy(await stake.getAddress());

    const Identity = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    const id = await Identity.deploy(
      ethers.ZeroAddress,
      await wrapper.getAddress(),
      await rep.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );

    // allowlist should succeed without ENS
    await id.addAdditionalAgent(agent.address);
    expect(
      (await id.verifyAgent.staticCall(agent.address, '', []))[0]
    ).to.equal(true);

    // attestation should also succeed
    const Attest = await ethers.getContractFactory(
      'contracts/v2/AttestationRegistry.sol:AttestationRegistry'
    );
    const attest = await Attest.deploy(
      ethers.ZeroAddress,
      await wrapper.getAddress()
    );
    await id.setAttestationRegistry(await attest.getAddress());

    const label = 'val';
    const node = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [ethers.ZeroHash, ethers.id(label)]
      )
    );
    await wrapper.setOwner(BigInt(node), owner.address);
    await attest.connect(owner).attest(node, 1, validator.address);

    expect(
      (await id.verifyValidator.staticCall(validator.address, label, []))[0]
    ).to.equal(true);
  });

  it('allows governance and agents to set capability profiles', async () => {
    const [owner, alice] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('contracts/mocks/MockNameWrapper.sol:MockNameWrapper');
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
      .to.emit(id, 'OwnershipVerified')
      .withArgs(alice.address, 'sub')
      .and.to.emit(id, 'AgentProfileUpdated')
      .withArgs(alice.address, 'ipfs://cap2');
    expect(await id.agentProfileURI(alice.address)).to.equal('ipfs://cap2');
  });

  it('emits events when allowlisted addresses are used', async () => {
    const [owner, agent, validator] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('contracts/mocks/MockNameWrapper.sol:MockNameWrapper');
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

    await id.addAdditionalAgent(agent.address);
    const emptyNode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [ethers.ZeroHash, ethers.id('')]
      )
    );
    await expect(id.verifyAgent(agent.address, '', []))
      .to.emit(id, 'IdentityVerified')
      .withArgs(agent.address, 0, emptyNode, '')
      .and.to.emit(id, 'AdditionalAgentUsed')
      .withArgs(agent.address, '');

    await id.addAdditionalValidator(validator.address);
    await expect(id.verifyValidator(validator.address, '', []))
      .to.emit(id, 'IdentityVerified')
      .withArgs(validator.address, 1, emptyNode, '')
      .and.to.emit(id, 'AdditionalValidatorUsed')
      .withArgs(validator.address, '');
  });

  it('authorization helpers handle allowlists', async () => {
    const [owner, agent, validator] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('contracts/mocks/MockNameWrapper.sol:MockNameWrapper');
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

    await id.addAdditionalAgent(agent.address);
    expect(await id.isAuthorizedAgent(agent.address, '', [])).to.equal(true);

    await id.addAdditionalValidator(validator.address);
    expect(
      await id.isAuthorizedValidator.staticCall(validator.address, '', [])
    ).to.equal(true);
    await expect(id.verifyValidator(validator.address, '', []))
      .to.emit(id, 'AdditionalValidatorUsed')
      .withArgs(validator.address, '');
  });

  it('requires new owner to accept ownership', async () => {
    const [owner, other] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory('contracts/mocks/MockNameWrapper.sol:MockNameWrapper');
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
