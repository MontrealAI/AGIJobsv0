const { expect } = require('chai');
const { ethers } = require('hardhat');

function leaf(addr, label) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32'],
      [addr, ethers.id(label)]
    )
  );
}

describe('ENSOwnershipVerifier setters', function () {
  let owner, other, verifier;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Verifier = await ethers.getContractFactory(
      'contracts/v2/modules/ENSOwnershipVerifier.sol:ENSOwnershipVerifier'
    );
    verifier = await Verifier.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroHash
    );
    await verifier.waitForDeployment();
  });

  it('allows only owner to update ENS address', async function () {
    const addr = ethers.getAddress(
      '0x000000000000000000000000000000000000dEaD'
    );
    await expect(verifier.connect(other).setENS(addr))
      .to.be.revertedWithCustomError(verifier, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(verifier.setENS(addr))
      .to.emit(verifier, 'ENSUpdated')
      .withArgs(addr);
  });

  it('allows only owner to update NameWrapper', async function () {
    const wrapper = ethers.getAddress(
      '0x000000000000000000000000000000000000bEEF'
    );
    await expect(verifier.connect(other).setNameWrapper(wrapper))
      .to.be.revertedWithCustomError(verifier, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(verifier.setNameWrapper(wrapper))
      .to.emit(verifier, 'NameWrapperUpdated')
      .withArgs(wrapper);
  });

  it('allows only owner to update club root node', async function () {
    const root = ethers.id('club');
    await expect(verifier.connect(other).setClubRootNode(root))
      .to.be.revertedWithCustomError(verifier, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(verifier.setClubRootNode(root))
      .to.emit(verifier, 'ClubRootNodeUpdated')
      .withArgs(root);
  });

  it('allows only owner to update validator Merkle root', async function () {
    const root = ethers.id('validator');
    await expect(verifier.connect(other).setValidatorMerkleRoot(root))
      .to.be.revertedWithCustomError(verifier, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(verifier.setValidatorMerkleRoot(root))
      .to.emit(verifier, 'ValidatorMerkleRootUpdated')
      .withArgs(root);
  });

  it('allows only owner to update agent Merkle root', async function () {
    const root = ethers.id('agent');
    await expect(verifier.connect(other).setAgentMerkleRoot(root))
      .to.be.revertedWithCustomError(verifier, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(verifier.setAgentMerkleRoot(root))
      .to.emit(verifier, 'AgentMerkleRootUpdated')
      .withArgs(root);
  });

  it('allows bulk root node updates', async function () {
    const agentRoot = ethers.id('agent');
    const clubRoot = ethers.id('club');
    await expect(verifier.connect(other).setRootNodes(agentRoot, clubRoot))
      .to.be.revertedWithCustomError(verifier, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(verifier.setRootNodes(agentRoot, clubRoot))
      .to.emit(verifier, 'RootNodeUpdated')
      .withArgs('agent', agentRoot)
      .and.to.emit(verifier, 'RootNodeUpdated')
      .withArgs('club', clubRoot);
  });

  it('allows bulk Merkle root updates', async function () {
    const agentRoot = ethers.id('agentRoot');
    const validatorRoot = ethers.id('validatorRoot');
    await expect(
      verifier.connect(other).setMerkleRoots(agentRoot, validatorRoot)
    )
      .to.be.revertedWithCustomError(verifier, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
    await expect(verifier.setMerkleRoots(agentRoot, validatorRoot))
      .to.emit(verifier, 'MerkleRootUpdated')
      .withArgs('agent', agentRoot)
      .and.to.emit(verifier, 'MerkleRootUpdated')
      .withArgs('validator', validatorRoot);
  });
});

describe('ENSOwnershipVerifier verification', function () {
  let owner, agent, validator, ens, resolver, wrapper, verifier;
  const root = ethers.id('agi');
  const club = ethers.id('club');

  beforeEach(async () => {
    [owner, agent, validator] = await ethers.getSigners();
    const ENS = await ethers.getContractFactory('MockENS');
    ens = await ENS.deploy();
    const Resolver = await ethers.getContractFactory('MockResolver');
    resolver = await Resolver.deploy();
    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
    wrapper = await Wrapper.deploy();
    await ens.setResolver(root, await resolver.getAddress());
    const Verifier = await ethers.getContractFactory(
      'contracts/v2/modules/ENSOwnershipVerifier.sol:ENSOwnershipVerifier'
    );
    verifier = await Verifier.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      ethers.ZeroHash
    );
    await verifier.waitForDeployment();
    await verifier.setAgentRootNode(root);
    await verifier.setClubRootNode(club);
  });

  function namehash(root, label) {
    return ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [root, ethers.keccak256(ethers.toUtf8Bytes(label))]
      )
    );
  }

  it('requires merkle proof without subdomain and invalidates on root update', async () => {
    expect(
      await verifier.verifyAgent.staticCall(agent.address, 'agent', [])
    ).to.equal(false);
    expect(
      await verifier.verifyValidator.staticCall(validator.address, 'validator', [])
    ).to.equal(false);

    const agentLeaf = leaf(agent.address, 'agent');
    const validatorLeaf = leaf(validator.address, 'validator');
    await verifier.setAgentMerkleRoot(agentLeaf);
    await verifier.setValidatorMerkleRoot(validatorLeaf);

    const txA = await verifier.verifyAgent(agent.address, 'agent', []);
    await txA.wait();
    const txV = await verifier.verifyValidator(validator.address, 'validator', []);
    await txV.wait();

    expect(
      await verifier.verifyAgent.staticCall(agent.address, 'agent', [])
    ).to.equal(true);
    expect(
      await verifier.verifyValidator.staticCall(validator.address, 'validator', [])
    ).to.equal(true);

    const newRoot = ethers.id('newRoot');
    await verifier.setAgentMerkleRoot(newRoot);
    await verifier.setValidatorMerkleRoot(newRoot);

    expect(
      await verifier.verifyAgent.staticCall(agent.address, 'agent', [])
    ).to.equal(false);
    expect(
      await verifier.verifyValidator.staticCall(validator.address, 'validator', [])
    ).to.equal(false);
  });

  it('verifies via NameWrapper', async () => {
    const node = namehash(root, 'a');
    await wrapper.setOwner(ethers.toBigInt(node), agent.address);
    expect(
      await verifier.verifyAgent.staticCall(agent.address, 'a', [])
    ).to.equal(true);
  });

  it('verifies via resolver', async () => {
    const node = namehash(root, 'a');
    await ens.setResolver(node, await resolver.getAddress());
    await resolver.setAddr(node, agent.address);
    expect(
      await verifier.verifyAgent.staticCall(agent.address, 'a', [])
    ).to.equal(true);
  });

  it('rejects invalid merkle proof', async () => {
    const agentRoot = leaf(agent.address, 'a');
    await verifier.setAgentMerkleRoot(agentRoot);
    const badProof = [ethers.id('bad')];
    expect(
      await verifier.verifyAgent.staticCall(agent.address, 'a', badProof)
    ).to.equal(false);
  });

  it('rejects mismatched subdomain proof', async () => {
    const agentRoot = leaf(agent.address, 'a');
    await verifier.setAgentMerkleRoot(agentRoot);
    expect(
      await verifier.verifyAgent.staticCall(agent.address, 'b', [])
    ).to.equal(false);
  });

  it('returns false without resolver', async () => {
    expect(
      await verifier.verifyAgent.staticCall(agent.address, 'missing', [])
    ).to.equal(false);
  });

  it('rejects when NameWrapper owner differs from agent', async () => {
    const node = namehash(root, 'a');
    await wrapper.setOwner(ethers.toBigInt(node), owner.address);
    expect(
      await verifier.verifyAgent.staticCall(agent.address, 'a', [])
    ).to.equal(false);
  });

  it('emits recovery when NameWrapper reverts', async () => {
    const BadWrapper = await ethers.getContractFactory(
      'contracts/legacy/RevertingNameWrapper.sol:RevertingNameWrapper'
    );
    const bad = await BadWrapper.deploy();
    await verifier.setNameWrapper(await bad.getAddress());
    await expect(verifier.verifyAgent(agent.address, 'a', [])).to.emit(
      verifier,
      'RecoveryInitiated'
    );
  });
});
