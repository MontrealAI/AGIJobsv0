
import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { AlphaAgiMark, ValidatorRiskOracle } from '../typechain-types';

const toWei = (value: string) => ethers.parseEther(value);

describe('AlphaAgiMark demo', function () {
  let mark: AlphaAgiMark;
  let oracle: ValidatorRiskOracle;
  let deployer: any;
  let owner: any;
  const basePrice = toWei('0.05');
  const slope = toWei('0.01');

  beforeEach(async () => {
    [deployer, owner] = await ethers.getSigners();
    const oracleFactory = await ethers.getContractFactory('ValidatorRiskOracle');
    oracle = (await oracleFactory.deploy(owner.address, 0)) as ValidatorRiskOracle;
    await oracle.waitForDeployment();

    const markFactory = await ethers.getContractFactory('AlphaAgiMark');
    mark = (await markFactory.deploy(owner.address, await oracle.getAddress(), basePrice, slope)) as AlphaAgiMark;
    await mark.waitForDeployment();
  });

  it('computes bonding curve cost and payout consistently', async () => {
    const amount = toWei('5');
    const cost = await mark.calculatePurchaseCost(amount);
    await expect(mark.buyShares(amount, { value: cost }))
      .to.emit(mark, 'TokensPurchased')
      .withArgs(deployer.address, amount, cost);

    const payout = await mark.calculateSaleReturn(amount);
    expect(payout).to.equal(cost);

    await expect(mark.sellShares(amount))
      .to.emit(mark, 'TokensSold')
      .withArgs(deployer.address, amount, payout);
  });

  it('enforces oracle validation before finalising', async () => {
    const [, , validator1, validator2] = await ethers.getSigners();

    await oracle.connect(owner).addValidator(validator1.address);
    await oracle.connect(owner).addValidator(validator2.address);
    await oracle.connect(owner).setApprovalsRequired(2);

    const cost = await mark.calculatePurchaseCost(toWei('3'));
    await mark.buyShares(toWei('3'), { value: cost });

    await oracle.connect(validator1).castVote(true);
    await expect(mark.connect(owner).finaliseLaunch(owner.address)).to.be.revertedWithCustomError(
      mark,
      'ValidationRequired'
    );

    await oracle.connect(validator2).castVote(true);
    await expect(mark.connect(owner).finaliseLaunch(owner.address)).to.emit(mark, 'LaunchFinalised');
  });

  it('allows owner to abort launch', async () => {
    const cost = await mark.calculatePurchaseCost(toWei('2'));
    await mark.buyShares(toWei('2'), { value: cost });

    await expect(mark.connect(owner).abortLaunch()).to.emit(mark, 'LaunchAborted');
    await expect(mark.buyShares(toWei('1'), { value: toWei('1') })).to.be.revertedWithCustomError(mark, 'LaunchAbortedAlready');
  });
});
