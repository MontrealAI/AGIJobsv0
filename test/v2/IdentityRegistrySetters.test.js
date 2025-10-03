const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('IdentityRegistry setters', function () {
  let owner;
  let agent;
  let validator;
  let extra;
  let identity;
  let ens;
  let wrapper;
  beforeEach(async () => {
    [owner, agent, validator, extra] = await ethers.getSigners();

    const Stake = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockStakeManager'
    );
    const stake = await Stake.deploy();

    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const rep = await Rep.deploy(await stake.getAddress());

    const ENS = await ethers.getContractFactory(
      'contracts/legacy/MockENS.sol:MockENS'
    );
    ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory(
      'contracts/legacy/MockNameWrapper.sol:MockNameWrapper'
    );
    wrapper = await Wrapper.deploy();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    identity = await Identity.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      await rep.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );
  });

  describe('setENS', function () {
    it('reverts for zero address', async () => {
      await expect(
        identity.setENS(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(identity, 'ZeroAddress');
    });

    it('updates and emits event for valid address', async () => {
      const ENS = await ethers.getContractFactory(
        'contracts/legacy/MockENS.sol:MockENS'
      );
      const newEns = await ENS.deploy();
      await expect(identity.setENS(await newEns.getAddress()))
        .to.emit(identity, 'ENSUpdated')
        .withArgs(await newEns.getAddress());
      expect(await identity.ens()).to.equal(await newEns.getAddress());
    });
  });

  describe('setNameWrapper', function () {
    it('reverts for zero address', async () => {
      await expect(
        identity.setNameWrapper(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(identity, 'ZeroAddress');
    });

    it('updates and emits event for valid address', async () => {
      const Wrapper = await ethers.getContractFactory(
        'contracts/legacy/MockNameWrapper.sol:MockNameWrapper'
      );
      const newWrapper = await Wrapper.deploy();
      await expect(identity.setNameWrapper(await newWrapper.getAddress()))
        .to.emit(identity, 'NameWrapperUpdated')
        .withArgs(await newWrapper.getAddress());
      expect(await identity.nameWrapper()).to.equal(
        await newWrapper.getAddress()
      );
    });
  });

  describe('setReputationEngine', function () {
    it('reverts for zero address', async () => {
      await expect(
        identity.setReputationEngine(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(identity, 'ZeroAddress');
    });

    it('updates and emits event for valid address', async () => {
      const Stake = await ethers.getContractFactory(
        'contracts/legacy/MockV2.sol:MockStakeManager'
      );
      const stake = await Stake.deploy();
      const Rep = await ethers.getContractFactory(
        'contracts/v2/ReputationEngine.sol:ReputationEngine'
      );
      const newRep = await Rep.deploy(await stake.getAddress());
      await expect(identity.setReputationEngine(await newRep.getAddress()))
        .to.emit(identity, 'ReputationEngineUpdated')
        .withArgs(await newRep.getAddress());
      expect(await identity.reputationEngine()).to.equal(
        await newRep.getAddress()
      );
    });
  });

  describe('setAttestationRegistry', function () {
    it('reverts for zero address', async () => {
      await expect(
        identity.setAttestationRegistry(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(identity, 'ZeroAddress');
    });

    it('updates and emits event for valid address', async () => {
      const Registry = await ethers.getContractFactory(
        'contracts/v2/AttestationRegistry.sol:AttestationRegistry'
      );
      const newRegistry = await Registry.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      await expect(
        identity.setAttestationRegistry(await newRegistry.getAddress())
      )
        .to.emit(identity, 'AttestationRegistryUpdated')
        .withArgs(await newRegistry.getAddress());
      expect(await identity.attestationRegistry()).to.equal(
        await newRegistry.getAddress()
      );
    });
  });

  describe('setNodeRootNode', function () {
    it('updates and emits event for valid node root', async () => {
      const nodeRoot = ethers.namehash('node.agi.eth');
      await expect(identity.setNodeRootNode(nodeRoot))
        .to.emit(identity, 'NodeRootNodeUpdated')
        .withArgs(nodeRoot);
      expect(await identity.nodeRootNode()).to.equal(nodeRoot);
    });
  });

  describe('configureMainnet', function () {
    it('sets the NameWrapper to the mainnet address', async () => {
      const mainnetWrapper = await identity.MAINNET_NAME_WRAPPER();
      await identity.configureMainnet();
      expect(await identity.nameWrapper()).to.equal(mainnetWrapper);
      const alphaAgent = await identity.MAINNET_ALPHA_AGENT_ROOT_NODE();
      const alphaClub = await identity.MAINNET_ALPHA_CLUB_ROOT_NODE();
      const nodeRoot = await identity.MAINNET_NODE_ROOT_NODE();
      const alphaNode = await identity.MAINNET_ALPHA_NODE_ROOT_NODE();
      expect(await identity.isAgentRootNodeAlias(alphaAgent)).to.equal(true);
      expect(await identity.isClubRootNodeAlias(alphaClub)).to.equal(true);
      expect(await identity.nodeRootNode()).to.equal(nodeRoot);
      expect(await identity.isNodeRootNodeAlias(alphaNode)).to.equal(true);
    });
  });

  describe('root node alias management', function () {
    it('allows the owner to manage aliases explicitly', async () => {
      const agentAlias = ethers.keccak256(ethers.toUtf8Bytes('manualAgent'));
      const clubAlias = ethers.keccak256(ethers.toUtf8Bytes('manualClub'));
      const nodeAlias = ethers.keccak256(ethers.toUtf8Bytes('manualNode'));
      await expect(identity.addAgentRootNodeAlias(agentAlias))
        .to.emit(identity, 'AgentRootNodeAliasUpdated')
        .withArgs(agentAlias, true);
      await expect(identity.addClubRootNodeAlias(clubAlias))
        .to.emit(identity, 'ClubRootNodeAliasUpdated')
        .withArgs(clubAlias, true);
      await expect(identity.addNodeRootNodeAlias(nodeAlias))
        .to.emit(identity, 'NodeRootNodeAliasUpdated')
        .withArgs(nodeAlias, true);
      expect(await identity.isAgentRootNodeAlias(agentAlias)).to.equal(true);
      expect(await identity.isClubRootNodeAlias(clubAlias)).to.equal(true);
      expect(await identity.isNodeRootNodeAlias(nodeAlias)).to.equal(true);
      await expect(identity.removeAgentRootNodeAlias(agentAlias))
        .to.emit(identity, 'AgentRootNodeAliasUpdated')
        .withArgs(agentAlias, false);
      await expect(identity.removeClubRootNodeAlias(clubAlias))
        .to.emit(identity, 'ClubRootNodeAliasUpdated')
        .withArgs(clubAlias, false);
      await expect(identity.removeNodeRootNodeAlias(nodeAlias))
        .to.emit(identity, 'NodeRootNodeAliasUpdated')
        .withArgs(nodeAlias, false);
      expect(await identity.isAgentRootNodeAlias(agentAlias)).to.equal(false);
      expect(await identity.isClubRootNodeAlias(clubAlias)).to.equal(false);
      expect(await identity.isNodeRootNodeAlias(nodeAlias)).to.equal(false);
    });

    it('reverts when attempting to manage zero-value aliases', async () => {
      await expect(
        identity.addAgentRootNodeAlias(ethers.ZeroHash)
      ).to.be.revertedWithCustomError(identity, 'ZeroNode');
      await expect(
        identity.removeClubRootNodeAlias(ethers.ZeroHash)
      ).to.be.revertedWithCustomError(identity, 'ZeroNode');
      await expect(
        identity.addNodeRootNodeAlias(ethers.ZeroHash)
      ).to.be.revertedWithCustomError(identity, 'ZeroNode');
    });
  });

  describe('alias verification', function () {
    it('verifies agents using the alpha root alias', async () => {
      const agentRoot = ethers.namehash('agent.agi.eth');
      const alphaAgentRoot = ethers.namehash('alpha.agent.agi.eth');
      await identity.setAgentRootNode(agentRoot);
      await identity.addAgentRootNodeAlias(alphaAgentRoot);
      const label = 'alice';
      const node = ethers.keccak256(
        ethers.solidityPacked(
          ['bytes32', 'bytes32'],
          [alphaAgentRoot, ethers.id(label)]
        )
      );
      await wrapper.setOwner(BigInt(node), agent.address);
      const result = await identity.verifyAgent.staticCall(
        agent.address,
        label,
        []
      );
      expect(result[0]).to.equal(true);
    });

    it('verifies validators using the alpha root alias', async () => {
      const clubRoot = ethers.namehash('club.agi.eth');
      const alphaClubRoot = ethers.namehash('alpha.club.agi.eth');
      await identity.setClubRootNode(clubRoot);
      await identity.addClubRootNodeAlias(alphaClubRoot);
      const label = 'validator';
      const node = ethers.keccak256(
        ethers.solidityPacked(
          ['bytes32', 'bytes32'],
          [alphaClubRoot, ethers.id(label)]
        )
      );
      await wrapper.setOwner(BigInt(node), validator.address);
      const result = await identity.verifyValidator.staticCall(
        validator.address,
        label,
        []
      );
      expect(result[0]).to.equal(true);
    });

    it('verifies node operators using the alpha node root alias', async () => {
      const nodeRoot = ethers.namehash('node.agi.eth');
      const alphaNodeRoot = ethers.namehash('alpha.node.agi.eth');
      await identity.setNodeRootNode(nodeRoot);
      await identity.addNodeRootNodeAlias(alphaNodeRoot);
      const label = 'operator';
      const nodeHash = ethers.keccak256(
        ethers.solidityPacked(
          ['bytes32', 'bytes32'],
          [alphaNodeRoot, ethers.id(label)]
        )
      );
      await wrapper.setOwner(BigInt(nodeHash), validator.address);
      const result = await identity.verifyNode.staticCall(
        validator.address,
        label,
        []
      );
      expect(result[0]).to.equal(true);
    });
  });

  describe('applyConfiguration', function () {
    it('updates toggled values and allowlists atomically', async () => {
      const ENS = await ethers.getContractFactory(
        'contracts/legacy/MockENS.sol:MockENS'
      );
      const newEns = await ENS.deploy();

      const Wrapper = await ethers.getContractFactory(
        'contracts/legacy/MockNameWrapper.sol:MockNameWrapper'
      );
      const newWrapper = await Wrapper.deploy();

      const Stake = await ethers.getContractFactory(
        'contracts/legacy/MockV2.sol:MockStakeManager'
      );
      const stake = await Stake.deploy();

      const Rep = await ethers.getContractFactory(
        'contracts/v2/ReputationEngine.sol:ReputationEngine'
      );
      const newRep = await Rep.deploy(await stake.getAddress());

      const Registry = await ethers.getContractFactory(
        'contracts/v2/AttestationRegistry.sol:AttestationRegistry'
      );
      const attRegistry = await Registry.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const config = {
        setENS: true,
        ens: await newEns.getAddress(),
        setNameWrapper: true,
        nameWrapper: await newWrapper.getAddress(),
        setReputationEngine: true,
        reputationEngine: await newRep.getAddress(),
        setAttestationRegistry: true,
        attestationRegistry: await attRegistry.getAddress(),
        setAgentRootNode: true,
        agentRootNode: ethers.keccak256(ethers.toUtf8Bytes('agentRoot')),
        setClubRootNode: true,
        clubRootNode: ethers.keccak256(ethers.toUtf8Bytes('clubRoot')),
        setNodeRootNode: true,
        nodeRootNode: ethers.keccak256(ethers.toUtf8Bytes('nodeRoot')),
        setAgentMerkleRoot: true,
        agentMerkleRoot: ethers.keccak256(ethers.toUtf8Bytes('agentMerkle')),
        setValidatorMerkleRoot: true,
        validatorMerkleRoot: ethers.keccak256(
          ethers.toUtf8Bytes('validatorMerkle')
        ),
      };

      const agentUpdates = [
        { agent: agent.address, allowed: true },
        { agent: extra.address, allowed: false },
      ];
      const validatorUpdates = [
        { validator: validator.address, allowed: true },
      ];
      const nodeUpdates = [{ nodeOperator: validator.address, allowed: true }];
      const agentAliasNode = ethers.keccak256(
        ethers.toUtf8Bytes('aliasAgentNode')
      );
      const clubAliasNode = ethers.keccak256(
        ethers.toUtf8Bytes('aliasClubNode')
      );
      const nodeAliasNode = ethers.keccak256(
        ethers.toUtf8Bytes('aliasNodeRoot')
      );
      const agentAliasUpdates = [{ node: agentAliasNode, allowed: true }];
      const clubAliasUpdates = [{ node: clubAliasNode, allowed: true }];
      const nodeAliasUpdates = [{ node: nodeAliasNode, allowed: true }];
      const agentTypeUpdates = [{ agent: agent.address, agentType: 1 }];

      await expect(
        identity.applyConfiguration(
          config,
          agentUpdates,
          validatorUpdates,
          nodeUpdates,
          agentAliasUpdates,
          clubAliasUpdates,
          nodeAliasUpdates,
          agentTypeUpdates
        )
      )
        .to.emit(identity, 'ConfigurationApplied')
        .withArgs(
          owner.address,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          BigInt(agentUpdates.length),
          BigInt(validatorUpdates.length),
          BigInt(nodeUpdates.length),
          BigInt(agentTypeUpdates.length)
        )
        .and.to.emit(identity, 'AgentRootNodeAliasUpdated')
        .withArgs(agentAliasNode, true)
        .and.to.emit(identity, 'ClubRootNodeAliasUpdated')
        .withArgs(clubAliasNode, true)
        .and.to.emit(identity, 'NodeRootNodeAliasUpdated')
        .withArgs(nodeAliasNode, true);

      expect(await identity.ens()).to.equal(await newEns.getAddress());
      expect(await identity.nameWrapper()).to.equal(
        await newWrapper.getAddress()
      );
      expect(await identity.reputationEngine()).to.equal(
        await newRep.getAddress()
      );
      expect(await identity.attestationRegistry()).to.equal(
        await attRegistry.getAddress()
      );
      expect(await identity.agentRootNode()).to.equal(config.agentRootNode);
      expect(await identity.clubRootNode()).to.equal(config.clubRootNode);
      expect(await identity.nodeRootNode()).to.equal(config.nodeRootNode);
      expect(await identity.agentMerkleRoot()).to.equal(config.agentMerkleRoot);
      expect(await identity.validatorMerkleRoot()).to.equal(
        config.validatorMerkleRoot
      );
      expect(await identity.additionalAgents(agent.address)).to.equal(true);
      expect(await identity.additionalAgents(extra.address)).to.equal(false);
      expect(await identity.additionalValidators(validator.address)).to.equal(
        true
      );
      expect(await identity.additionalNodeOperators(validator.address)).to.equal(
        true
      );
      expect(await identity.getAgentType(agent.address)).to.equal(1n);
      expect(await identity.isAgentRootNodeAlias(agentAliasNode)).to.equal(true);
      expect(await identity.isClubRootNodeAlias(clubAliasNode)).to.equal(true);
      expect(await identity.isNodeRootNodeAlias(nodeAliasNode)).to.equal(true);
    });

    it('reverts when provided invalid configuration values', async () => {
      await expect(
        identity.applyConfiguration(
          {
            setENS: true,
            ens: ethers.ZeroAddress,
            setNameWrapper: false,
            nameWrapper: ethers.ZeroAddress,
            setReputationEngine: false,
            reputationEngine: ethers.ZeroAddress,
            setAttestationRegistry: false,
            attestationRegistry: ethers.ZeroAddress,
            setAgentRootNode: false,
            agentRootNode: ethers.ZeroHash,
            setClubRootNode: false,
            clubRootNode: ethers.ZeroHash,
            setNodeRootNode: false,
            nodeRootNode: ethers.ZeroHash,
            setAgentMerkleRoot: false,
            agentMerkleRoot: ethers.ZeroHash,
            setValidatorMerkleRoot: false,
            validatorMerkleRoot: ethers.ZeroHash,
          },
          [],
          [],
          [],
          [],
          [],
          [],
          []
        )
      ).to.be.revertedWithCustomError(identity, 'ZeroAddress');
    });
  });
});
