const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('IdentityRegistry reputation version', function () {
  it('rejects incompatible reputation engine versions', async () => {
    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stake = await Stake.deploy();

    const BadRep = await ethers.getContractFactory(
      'contracts/v2/mocks/VersionMock.sol:VersionMock'
    );
    const badRep = await BadRep.deploy(1);

    const Registry = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );

    await expect(
      Registry.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        await badRep.getAddress(),
        ethers.ZeroHash,
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(Registry, 'IncompatibleReputationEngine');

    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const rep = await Rep.deploy(await stake.getAddress());
    const id = await Registry.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await rep.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );

    await expect(
      id.setReputationEngine(await badRep.getAddress())
    ).to.be.revertedWithCustomError(id, 'IncompatibleReputationEngine');
  });
});
