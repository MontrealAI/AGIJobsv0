const { expect } = require('chai');
const { ethers } = require('hardhat');

const ZERO_ADDRESS = ethers.ZeroAddress;

describe('AuditModule', function () {
  let owner;
  let jobRegistry;
  let audit;

  beforeEach(async function () {
    [owner, jobRegistry] = await ethers.getSigners();

    const Audit = await ethers.getContractFactory(
      'contracts/v2/AuditModule.sol:AuditModule'
    );
    audit = await Audit.deploy(jobRegistry.address, ZERO_ADDRESS);
  });

  it('allows the owner to pause and unpause audit processing', async function () {
    await expect(audit.connect(owner).pause()).to.emit(audit, 'Paused');
    await expect(audit.connect(owner).unpause()).to.emit(audit, 'Unpaused');
  });

  it('blocks job finalization callbacks while paused', async function () {
    await audit.connect(owner).setAuditProbabilityBps(10_000);
    await expect(audit.connect(owner).pause()).to.emit(audit, 'Paused');

    await expect(
      audit
        .connect(jobRegistry)
        .onJobFinalized(1, owner.address, true, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(audit, 'EnforcedPause');
  });

  it('blocks audit recording while paused', async function () {
    await audit.connect(owner).setAuditProbabilityBps(10_000);
    await audit.connect(owner).setAuditor(owner.address, true);

    await audit
      .connect(jobRegistry)
      .onJobFinalized(1, owner.address, true, ethers.ZeroHash);

    await expect(audit.connect(owner).pause()).to.emit(audit, 'Paused');

    await expect(
      audit.connect(owner).recordAudit(1, true, 'ok')
    ).to.be.revertedWithCustomError(audit, 'EnforcedPause');
  });
});
