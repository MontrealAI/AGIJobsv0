const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('DisputeModule module ether rejection', function () {
  let owner, registry, dispute;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const JobMock = await ethers.getContractFactory('MockJobRegistry');
    registry = await JobMock.deploy();
    await registry.waitForDeployment();
    const Dispute = await ethers.getContractFactory(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule'
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress,
      owner.address
    );
    await dispute.waitForDeployment();
  });

  it('reverts on direct ether transfer', async () => {
    await expect(
      owner.sendTransaction({ to: await dispute.getAddress(), value: 1 })
    ).to.be.revertedWith('DisputeModule: no ether');
  });

  it('reverts on unknown calldata with value', async () => {
    await expect(
      owner.sendTransaction({
        to: await dispute.getAddress(),
        data: '0x12345678',
        value: 1,
      })
    ).to.be.revertedWith('DisputeModule: no ether');
  });

  it('reports tax exemption', async () => {
    expect(await dispute.isTaxExempt()).to.equal(true);
  });

  it('allows owner to set tax policy when exempt', async () => {
    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy = await Policy.deploy('ipfs://policy', 'ack');
    await policy.waitForDeployment();
    await expect(
      dispute.connect(owner).setTaxPolicy(await policy.getAddress())
    )
      .to.emit(dispute, 'TaxPolicyUpdated')
      .withArgs(await policy.getAddress());
    expect(await dispute.taxPolicy()).to.equal(await policy.getAddress());
  });

  it('reverts when setting invalid tax policy', async () => {
    await expect(
      dispute.connect(owner).setTaxPolicy(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(dispute, 'InvalidTaxPolicy');

    const NonExempt = await ethers.getContractFactory(
      'contracts/v2/mocks/TaxPolicyNonExempt.sol:TaxPolicyNonExempt'
    );
    const mockPolicy = await NonExempt.deploy();
    await mockPolicy.waitForDeployment();
    await expect(
      dispute.connect(owner).setTaxPolicy(await mockPolicy.getAddress())
    ).to.be.revertedWithCustomError(dispute, 'PolicyNotTaxExempt');
  });
});
