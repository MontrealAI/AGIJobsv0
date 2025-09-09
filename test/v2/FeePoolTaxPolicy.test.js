const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('FeePool tax policy event', function () {
  let owner, policy, pool;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const Policy = await ethers.getContractFactory('contracts/v2/TaxPolicy.sol:TaxPolicy');
    policy = await Policy.deploy('ipfs://policy', 'ack');
    const FeePool = await ethers.getContractFactory('contracts/v2/FeePool.sol:FeePool');
    pool = await FeePool.deploy(
      ethers.ZeroAddress,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
  });

  it('emits version when setting tax policy', async () => {
    await expect(pool.setTaxPolicy(await policy.getAddress()))
      .to.emit(pool, 'TaxPolicyUpdated')
      .withArgs(await policy.getAddress(), 1);
  });
});
