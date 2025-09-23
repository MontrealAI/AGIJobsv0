const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('IdentityRegistry setters', function () {
  let owner;
  let agent;
  let validator;
  let extra;
  let identity;
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
    const ens = await ENS.deploy();

    const Wrapper = await ethers.getContractFactory(
      'contracts/legacy/MockNameWrapper.sol:MockNameWrapper'
    );
    const wrapper = await Wrapper.deploy();

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

  describe('configureMainnet', function () {
    it('sets the NameWrapper to the mainnet address', async () => {
      const mainnetWrapper = await identity.MAINNET_NAME_WRAPPER();
      await identity.configureMainnet();
      expect(await identity.nameWrapper()).to.equal(mainnetWrapper);
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
      const agentTypeUpdates = [{ agent: agent.address, agentType: 1 }];

      await expect(
        identity.applyConfiguration(
          config,
          agentUpdates,
          validatorUpdates,
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
          BigInt(agentUpdates.length),
          BigInt(validatorUpdates.length),
          BigInt(agentTypeUpdates.length)
        );

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
      expect(await identity.agentMerkleRoot()).to.equal(config.agentMerkleRoot);
      expect(await identity.validatorMerkleRoot()).to.equal(
        config.validatorMerkleRoot
      );
      expect(await identity.additionalAgents(agent.address)).to.equal(true);
      expect(await identity.additionalAgents(extra.address)).to.equal(false);
      expect(await identity.additionalValidators(validator.address)).to.equal(
        true
      );
      expect(await identity.getAgentType(agent.address)).to.equal(1n);
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
            setAgentMerkleRoot: false,
            agentMerkleRoot: ethers.ZeroHash,
            setValidatorMerkleRoot: false,
            validatorMerkleRoot: ethers.ZeroHash,
          },
          [],
          [],
          []
        )
      ).to.be.revertedWithCustomError(identity, 'ZeroAddress');
    });
  });
});
