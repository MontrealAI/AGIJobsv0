const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('IdentityRegistry setters', function () {
  let owner;
  let identity;
  beforeEach(async () => {
    [owner] = await ethers.getSigners();

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
});
