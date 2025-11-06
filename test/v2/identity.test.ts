import { expect } from 'chai';
import hre from 'hardhat';
const { ethers } = hre;

const AGENT_ROOT = ethers.namehash('agent.agi.eth');
const CLUB_ROOT = ethers.namehash('club.agi.eth');
const AGENT_LABEL = 'agent';
const VALIDATOR_LABEL = 'validator';

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

    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
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
      AGENT_ROOT,
      CLUB_ROOT
    );

    const subdomain = 'alice';
    const subnode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [AGENT_ROOT, ethers.id(subdomain)]
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

    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
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
      AGENT_ROOT,
      CLUB_ROOT
    );

    // validator verified by merkle proof
    const vLeaf = leaf(validator.address, VALIDATOR_LABEL);
    await id.setValidatorMerkleRoot(vLeaf);
    const validatorCheck = await id.verifyValidator.staticCall(
      validator.address,
      VALIDATOR_LABEL,
      []
    );
    expect(validatorCheck[0]).to.equal(true);
    expect(
      (
        await id.verifyValidator.staticCall(validator.address, 'bad', [])
      )[0]
    ).to.equal(false);

    // agent verified via resolver fallback
    const label = AGENT_LABEL;
    const node = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [AGENT_ROOT, ethers.id(label)]
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

    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
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
      AGENT_ROOT,
      CLUB_ROOT
    );

    // blacklist blocks verification even if allowlisted
    await rep.blacklist(alice.address, true);
    expect(
      (await id.verifyAgent.staticCall(alice.address, AGENT_LABEL, []))[0]
    ).to.equal(false);
    await rep.blacklist(alice.address, false);

    // additional allowlist bypasses ENS requirements
    await id.addAdditionalAgent(alice.address);
    expect(
      (await id.verifyAgent.staticCall(alice.address, AGENT_LABEL, []))[0]
    ).to.equal(true);
  });

  it('exposes canonical mainnet ENS roots and alpha aliases', async () => {
    const Registry = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );

    const id = await Registry.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroHash,
      ethers.ZeroHash
    );

    const agentRoot = ethers.namehash('agent.agi.eth');
    const alphaAgentRoot = ethers.namehash('alpha.agent.agi.eth');
    const clubRoot = ethers.namehash('club.agi.eth');
    const alphaClubRoot = ethers.namehash('alpha.club.agi.eth');

    expect(await id.MAINNET_ENS()).to.equal(
      '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
    );
    expect(await id.MAINNET_NAME_WRAPPER()).to.equal(
      '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401'
    );
    expect(await id.MAINNET_AGENT_ROOT_NODE()).to.equal(agentRoot);
    expect(await id.MAINNET_ALPHA_AGENT_ROOT_NODE()).to.equal(alphaAgentRoot);
    expect(await id.MAINNET_CLUB_ROOT_NODE()).to.equal(clubRoot);
    expect(await id.MAINNET_ALPHA_CLUB_ROOT_NODE()).to.equal(alphaClubRoot);

    await id.configureMainnet();

    expect(await id.ens()).to.equal(await id.MAINNET_ENS());
    expect(await id.nameWrapper()).to.equal(await id.MAINNET_NAME_WRAPPER());
    expect(await id.agentRootNode()).to.equal(agentRoot);
    expect(await id.clubRootNode()).to.equal(clubRoot);

    const agentAliases = await id.getAgentRootNodeAliases();
    expect(agentAliases.map((value) => value.toLowerCase())).to.deep.equal([
      alphaAgentRoot.toLowerCase(),
    ]);

    const clubAliases = await id.getClubRootNodeAliases();
    expect(clubAliases.map((value) => value.toLowerCase())).to.deep.equal([
      alphaClubRoot.toLowerCase(),
    ]);

    expect(await id.isAgentRootNodeAlias(alphaAgentRoot)).to.equal(true);
    expect(await id.isClubRootNodeAlias(alphaClubRoot)).to.equal(true);
  });

  it('treats alpha ENS aliases as equivalent roots for ownership checks', async () => {
    const [owner, agent] = await ethers.getSigners();

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
      AGENT_ROOT,
      CLUB_ROOT
    );

    const alphaAgentRoot = ethers.namehash('alpha.agent.agi.eth');
    const alphaClubRoot = ethers.namehash('alpha.club.agi.eth');

    await id.connect(owner).addAgentRootNodeAlias(alphaAgentRoot);
    await id.connect(owner).addClubRootNodeAlias(alphaClubRoot);

    const agentLabel = 'builder';
    const agentAliasNode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [alphaAgentRoot, ethers.id(agentLabel)]
      )
    );
    await wrapper.setOwner(BigInt(agentAliasNode), agent.address);

    const [agentOk, agentNode, viaWrapper, viaMerkle] = await id.verifyAgent.staticCall(
      agent.address,
      agentLabel,
      []
    );
    expect(agentOk).to.equal(true);
    expect(agentNode).to.equal(agentAliasNode);
    expect(viaWrapper).to.equal(true);
    expect(viaMerkle).to.equal(false);

    const clubLabel = 'sentinel';
    const clubAliasNode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [alphaClubRoot, ethers.id(clubLabel)]
      )
    );
    await wrapper.setOwner(BigInt(clubAliasNode), agent.address);

    const [validatorOk, validatorNode, validatorViaWrapper, validatorViaMerkle] =
      await id.verifyValidator.staticCall(
        agent.address,
        clubLabel,
        []
      );
    expect(validatorOk).to.equal(true);
    expect(validatorNode).to.equal(clubAliasNode);
    expect(validatorViaWrapper).to.equal(true);
    expect(validatorViaMerkle).to.equal(false);
  });

  it('authorizes ENS ownership through alpha aliases in read-only checks', async () => {
    const [owner, agent] = await ethers.getSigners();

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
      AGENT_ROOT,
      CLUB_ROOT
    );

    const alphaAgentRoot = ethers.namehash('alpha.agent.agi.eth');
    const alphaClubRoot = ethers.namehash('alpha.club.agi.eth');

    await id.connect(owner).addAgentRootNodeAlias(alphaAgentRoot);
    await id.connect(owner).addClubRootNodeAlias(alphaClubRoot);

    const agentLabel = 'alpha-builder';
    const agentAliasNode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [alphaAgentRoot, ethers.id(agentLabel)]
      )
    );
    await wrapper.setOwner(BigInt(agentAliasNode), agent.address);

    expect(
      await id.isAuthorizedAgent(agent.address, agentLabel, [])
    ).to.equal(true);

    const validatorLabel = 'alpha-sentinel';
    const validatorAliasNode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [alphaClubRoot, ethers.id(validatorLabel)]
      )
    );
    await wrapper.setOwner(BigInt(validatorAliasNode), agent.address);

    expect(
      await id.isAuthorizedValidator(agent.address, validatorLabel, [])
    ).to.equal(true);
  });

  it('authorizes via allowlists and attestations when ENS is unset', async () => {
    const [owner, agent, validator] = await ethers.getSigners();

    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
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
      AGENT_ROOT,
      CLUB_ROOT
    );

    // allowlist should succeed without ENS
    await id.addAdditionalAgent(agent.address);
    expect(
      (await id.verifyAgent.staticCall(agent.address, AGENT_LABEL, []))[0]
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

    const label = VALIDATOR_LABEL;
    const node = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [CLUB_ROOT, ethers.id(label)]
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

    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
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
      AGENT_ROOT,
      CLUB_ROOT
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

  it('emits events when allowlisted addresses are used', async () => {
    const [owner, agent, validator] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
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
      AGENT_ROOT,
      CLUB_ROOT
    );

    await id.addAdditionalAgent(agent.address);
    const agentNode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [AGENT_ROOT, ethers.id(AGENT_LABEL)]
      )
    );
    const clubNode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [CLUB_ROOT, ethers.id(VALIDATOR_LABEL)]
      )
    );
    await expect(id.verifyAgent(agent.address, AGENT_LABEL, []))
      .to.emit(id, 'IdentityVerified')
      .withArgs(agent.address, 0, agentNode, AGENT_LABEL)
      .and.to.emit(id, 'AdditionalAgentUsed')
      .withArgs(agent.address, AGENT_LABEL);

    await id.addAdditionalValidator(validator.address);
    await expect(id.verifyValidator(validator.address, VALIDATOR_LABEL, []))
      .to.emit(id, 'IdentityVerified')
      .withArgs(validator.address, 1, clubNode, VALIDATOR_LABEL)
      .and.to.emit(id, 'AdditionalValidatorUsed')
      .withArgs(validator.address, VALIDATOR_LABEL);
  });

  it('authorization helpers handle allowlists', async () => {
    const [owner, agent, validator] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
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
    expect(
      await id.isAuthorizedAgent(agent.address, AGENT_LABEL, [])
    ).to.equal(true);

    await id.addAdditionalValidator(validator.address);
    expect(
      await id.isAuthorizedValidator.staticCall(
        validator.address,
        VALIDATOR_LABEL,
        []
      )
    ).to.equal(true);
    await expect(id.verifyValidator(validator.address, VALIDATOR_LABEL, []))
      .to.emit(id, 'AdditionalValidatorUsed')
      .withArgs(validator.address, VALIDATOR_LABEL);
  });

  it('requires new owner to accept ownership', async () => {
    const [owner, other] = await ethers.getSigners();

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory(
      'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
    );
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
