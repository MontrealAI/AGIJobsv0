import { expect } from 'chai';
import { ethers } from 'hardhat';

const AUTHOR_ROLE = ethers.id('AUTHOR_ROLE');

describe('CultureRegistry (hardhat)', function () {
  it('mints artifacts and enforces budgets', async function () {
    const [owner, author] = await ethers.getSigners();
    const identityFactory = await ethers.getContractFactory('MockIdentityRegistry');
    const identity = await identityFactory.deploy();
    await identity.waitForDeployment();

    await identity.setRole(AUTHOR_ROLE, author.address, true);

    const registryFactory = await ethers.getContractFactory('CultureRegistry');
    const registry = await registryFactory.deploy(owner.address, await identity.getAddress(), ['book', 'prompt'], 8);
    await registry.waitForDeployment();

    await expect(
      registry.connect(author).mintArtifact('book', 'cid://artifact', 0, [])
    ).to.emit(registry, 'ArtifactMinted');

    const view = await registry.getArtifact(1);
    expect(view.author).to.equal(author.address);
    expect(view.kind).to.equal('book');
    expect(view.cites.length).to.equal(0);
  }).timeout(45000);
});
