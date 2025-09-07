const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('NoValidationModule ether rejection', function () {
  let owner, module;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const JobMock = await ethers.getContractFactory('MockJobRegistry');
    const registry = await JobMock.deploy();
    await registry.waitForDeployment();
    const Module = await ethers.getContractFactory(
      'contracts/v2/modules/NoValidationModule.sol:NoValidationModule'
    );
    module = await Module.deploy(await registry.getAddress());
    await module.waitForDeployment();
  });

  it('reverts on direct ether transfer', async () => {
    await expect(
      owner.sendTransaction({ to: await module.getAddress(), value: 1 })
    ).to.be.revertedWith('NoValidationModule: no ether');
  });

  it('reverts on unknown calldata with value', async () => {
    await expect(
      owner.sendTransaction({
        to: await module.getAddress(),
        data: '0x12345678',
        value: 1,
      })
    ).to.be.revertedWith('NoValidationModule: no ether');
  });
});
