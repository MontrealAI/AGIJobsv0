const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('KlerosDisputeModule ether rejection', function () {
  let owner, module;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const JobMock = await ethers.getContractFactory('MockJobRegistry');
    const registry = await JobMock.deploy();
    await registry.waitForDeployment();
    const Module = await ethers.getContractFactory(
      'contracts/v2/modules/KlerosDisputeModule.sol:KlerosDisputeModule'
    );
    module = await Module.deploy(
      await registry.getAddress(),
      owner.address,
      owner.address
    );
    await module.waitForDeployment();
  });

  it('reverts on direct ether transfer', async () => {
    await expect(
      owner.sendTransaction({ to: await module.getAddress(), value: 1 })
    ).to.be.revertedWith('KlerosDisputeModule: no ether');
  });

  it('reverts on unknown calldata with value', async () => {
    await expect(
      owner.sendTransaction({
        to: await module.getAddress(),
        data: '0x12345678',
        value: 1,
      })
    ).to.be.revertedWith('KlerosDisputeModule: no ether');
  });

  it('allows governance to set tax policy when exempt', async () => {
    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy = await Policy.deploy('ipfs://policy', 'ack');
    await policy.waitForDeployment();
    await expect(module.connect(owner).setTaxPolicy(await policy.getAddress()))
      .to.emit(module, 'TaxPolicyUpdated')
      .withArgs(await policy.getAddress());
    expect(await module.taxPolicy()).to.equal(await policy.getAddress());
  });

  it('rejects invalid tax policies', async () => {
    await expect(
      module.connect(owner).setTaxPolicy(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(module, 'InvalidTaxPolicy');

    const NonExempt = await ethers.getContractFactory(
      'contracts/v2/mocks/TaxPolicyNonExempt.sol:TaxPolicyNonExempt'
    );
    const mockPolicy = await NonExempt.deploy();
    await mockPolicy.waitForDeployment();
    await expect(
      module.connect(owner).setTaxPolicy(await mockPolicy.getAddress())
    ).to.be.revertedWithCustomError(module, 'PolicyNotTaxExempt');
  });
});
