const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('BoltzmannRewardDistributor', function () {
  const WAD = 10n ** 18n;
  let owner, r1, r2, token, distributor;

  beforeEach(async () => {
    [owner, r1, r2] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('contracts/test/AGIALPHAToken.sol:AGIALPHAToken');
    token = await Token.deploy();
    const Distributor = await ethers.getContractFactory('contracts/v2/modules/BoltzmannRewardDistributor.sol:BoltzmannRewardDistributor');
    distributor = await Distributor.deploy(token.getAddress());
    // allow distributor to mint
    await token.transferOwnership(await distributor.getAddress());
  });

  it('distributes according to Maxwell-Boltzmann weights', async () => {
    const amount = 100n * WAD;
    const energies = [1n * WAD, 3n * WAD];
    const degeneracies = [1, 1];
    const weights = await distributor.weights(energies, degeneracies);
    await distributor.distribute([r1.address, r2.address], energies, degeneracies, amount);

    const b1 = await token.balanceOf(r1.address);
    const b2 = await token.balanceOf(r2.address);
    const ownerBal = await token.balanceOf(owner.address);

    const expected1 = (amount * weights[0]) / WAD;
    const expected2 = (amount * weights[1]) / WAD;
    const dust = amount - expected1 - expected2;

    expect(b1).to.equal(expected1);
    expect(b2).to.equal(expected2);
    expect(ownerBal).to.equal(dust);
  });
});

