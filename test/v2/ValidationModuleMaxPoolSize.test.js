const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ValidationModule max pool size', function () {
  let validation;

  beforeEach(async () => {
    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await Validation.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      1,
      1,
      3,
      10,
      []
    );
    await validation.waitForDeployment();
  });

  it('reverts when size is zero', async () => {
    await expect(
      validation.setMaxValidatorPoolSize(0)
    ).to.be.revertedWithCustomError(validation, 'InvalidSampleSize');
  });

  it('reverts when size below validatorPoolSampleSize', async () => {
    await validation.setValidatorPoolSampleSize(10);
    await expect(
      validation.setMaxValidatorPoolSize(9)
    ).to.be.revertedWithCustomError(validation, 'InvalidSampleSize');
  });

  it('reverts when size below validatorsPerJob', async () => {
    await validation.setValidatorPoolSampleSize(3);
    await expect(
      validation.setMaxValidatorPoolSize(2)
    ).to.be.revertedWithCustomError(validation, 'InvalidValidatorBounds');
  });
});
