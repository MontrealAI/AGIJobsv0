const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ArtifactRegistry', function () {
  const AUTHOR_ROLE = ethers.id('AUTHOR_ROLE');

  let registry;
  let identity;
  let owner;
  let author;
  let other;

  beforeEach(async () => {
    [owner, author, other] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory(
      'contracts/v2/ArtifactRegistry.sol:ArtifactRegistry'
    );
    registry = await Registry.deploy('Artifacts', 'ART', 8);
    await registry.waitForDeployment();

    const IdentityMock = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await IdentityMock.deploy();
    await identity.waitForDeployment();
  });

  it('mints artifacts with citation fan-out and updates influence', async () => {
    await registry.setIdentityRegistry(await identity.getAddress());

    const baseA = await registry.nextTokenId();
    await registry.mintArtifact('ipfs://baseA', 'dataset', ethers.id('baseA'), [], 'owner', []);

    const baseB = await registry.nextTokenId();
    await registry.mintArtifact('ipfs://baseB', 'dataset', ethers.id('baseB'), [], 'owner', []);

    await identity.addAdditionalAgent(author.address);

    const fanOutId = await registry.nextTokenId();

    await expect(
      registry
        .connect(author)
        .mintArtifact(
          'ipfs://fan-out',
          'model',
          ethers.id('fan'),
          [baseA, baseB],
          'author',
          []
        )
    )
      .to.emit(registry, 'ArtifactMinted')
      .withArgs(fanOutId, author.address, 'ipfs://fan-out', 'model', ethers.id('fan'));

    const baseAInfo = await registry.getArtifact(baseA);
    const baseBInfo = await registry.getArtifact(baseB);
    expect(baseAInfo.influence).to.equal(1n);
    expect(baseBInfo.influence).to.equal(1n);

    const minted = await registry.getArtifact(fanOutId);
    expect(minted.citations).to.deep.equal([baseA, baseB]);
  });

  it('updates metadata for token owners', async () => {
    await registry.setIdentityRegistry(await identity.getAddress());
    await identity.addAdditionalAgent(author.address);

    const tokenId = await registry.nextTokenId();
    await registry
      .connect(author)
      .mintArtifact('ipfs://orig', 'prompt', ethers.id('orig'), [], 'author', []);

    await expect(
      registry
        .connect(author)
        .updateArtifactMetadata(tokenId, 'ipfs://new', 'prompt-v2', ethers.id('new'))
    )
      .to.emit(registry, 'ArtifactMetadataUpdated')
      .withArgs(tokenId, 'ipfs://new', 'prompt-v2', ethers.id('new'));

    const updated = await registry.getArtifact(tokenId);
    expect(updated.cid).to.equal('ipfs://new');
    expect(updated.lineageHash).to.equal(ethers.id('new'));
  });

  it('reverts unauthorized minting when identity registry missing', async () => {
    await expect(
      registry
        .connect(other)
        .mintArtifact('ipfs://unauth', 'model', ethers.id('unauth'), [], 'other', [])
    ).to.be.revertedWithCustomError(registry, 'IdentityRegistryNotSet');
  });

  it('enforces citation limits', async () => {
    await registry.setMaxCitations(2);
    await registry.setIdentityRegistry(await identity.getAddress());

    await registry.mintArtifact('ipfs://a', 'kind', ethers.id('a'), [], 'owner', []);
    await registry.mintArtifact('ipfs://b', 'kind', ethers.id('b'), [], 'owner', []);
    await registry.mintArtifact('ipfs://c', 'kind', ethers.id('c'), [], 'owner', []);

    await identity.addAdditionalAgent(author.address);

    await expect(
      registry
        .connect(author)
        .mintArtifact(
          'ipfs://overflow',
          'model',
          ethers.id('overflow'),
          [1, 2, 3],
          'author',
          []
        )
    ).to.be.revertedWithCustomError(registry, 'MaxCitationsExceeded');
  });

  it('pauses and resumes minting', async () => {
    await registry.pause();

    await expect(
      registry.mintArtifact('ipfs://paused', 'kind', ethers.id('paused'), [], 'owner', [])
    ).to.be.revertedWithCustomError(registry, 'EnforcedPause');

    await registry.unpause();
    await registry.mintArtifact('ipfs://live', 'kind', ethers.id('live'), [], 'owner', []);
  });

  it('allows admin to grant author role directly', async () => {
    await registry.grantRole(AUTHOR_ROLE, author.address);

    await registry
      .connect(author)
      .mintArtifact('ipfs://role', 'prompt', ethers.id('role'), [], '', []);
    expect(await registry.ownerOf(1)).to.equal(author.address);
  });
});
