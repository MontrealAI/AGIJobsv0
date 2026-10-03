const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Local demonstration token settlement', function () {
  it('burns the caller balance and total supply and emits the ERC20 receipt', async function () {
    const [owner, other] = await ethers.getSigners();
    const token = await (
      await ethers.getContractFactory('LocalAgialpha')
    ).deploy();
    await token.mint(owner.address, 100n);
    await token.mint(other.address, 50n);
    await expect(token.burn(30n))
      .to.emit(token, 'Transfer')
      .withArgs(owner.address, ethers.ZeroAddress, 30n);
    expect(await token.balanceOf(owner.address)).to.equal(70n);
    expect(await token.balanceOf(other.address)).to.equal(50n);
    expect(await token.totalSupply()).to.equal(120n);
    await expect(token.burn(71n)).to.be.revertedWith('balance');
    expect(await token.totalSupply()).to.equal(120n);
  });
});
