const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { ethers } = require('hardhat');

const { bootstrapHardhatDemoConfig } = require('../../scripts/v2/lib/hardhatDemoBootstrap');

describe('Demo owner matrix bootstrap', function () {
  this.timeout(60000);

  const jobRegistryPath = path.join(process.cwd(), 'config', 'job-registry.hardhat.json');
  const thermodynamicsPath = path.join(process.cwd(), 'config', 'thermodynamics.hardhat.json');
  const addressBookPath = path.join(
    process.cwd(),
    'deployment-config',
    'generated',
    'demo-hardhat-addresses.json'
  );

  let backup = {};

  before(() => {
    const readIfExists = (filePath) => {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return fs.readFileSync(filePath, 'utf8');
    };
    backup = {
      jobRegistry: readIfExists(jobRegistryPath),
      thermodynamics: readIfExists(thermodynamicsPath),
      addressBook: readIfExists(addressBookPath),
    };
  });

  after(() => {
    const restore = (filePath, contents) => {
      if (contents === null || contents === undefined) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return;
      }
      fs.writeFileSync(filePath, contents);
    };
    restore(jobRegistryPath, backup.jobRegistry);
    restore(thermodynamicsPath, backup.thermodynamics);
    restore(addressBookPath, backup.addressBook);
  });

  it('writes non-zero demo addresses for hardhat configs', async () => {
    await bootstrapHardhatDemoConfig('hardhat', [], { force: true });

    const jobConfig = JSON.parse(fs.readFileSync(jobRegistryPath, 'utf8'));
    const thermoConfig = JSON.parse(fs.readFileSync(thermodynamicsPath, 'utf8'));
    const addressBook = JSON.parse(fs.readFileSync(addressBookPath, 'utf8'));

    expect(jobConfig.taxPolicy).to.be.a('string');
    expect(jobConfig.taxPolicy).to.not.equal(ethers.ZeroAddress);

    expect(thermoConfig.rewardEngine).to.exist;
    expect(thermoConfig.rewardEngine.address).to.not.equal(ethers.ZeroAddress);

    expect(addressBook.taxPolicy).to.not.equal(ethers.ZeroAddress);
    expect(addressBook.rewardEngine).to.not.equal(ethers.ZeroAddress);
  });
});
