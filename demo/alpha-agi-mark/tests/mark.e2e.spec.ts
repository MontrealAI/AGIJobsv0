import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('α-AGI MARK demo harness', () => {
  it('has accessible deployer accounts for mission actors', async () => {
    const signers = await ethers.getSigners();
    expect(signers).to.have.length.greaterThan(5);
  });
});
