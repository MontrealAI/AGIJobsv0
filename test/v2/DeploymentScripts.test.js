const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deployOneClickModules } = require('../../scripts/v2/deploy.ts');

describe('One-click deployment script', function () {
  this.timeout(180000);

  let directory;
  let originalEnvironment;
  beforeEach(function () {
    originalEnvironment = { ...process.env };
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-deployment-test-'));
    process.env.ONECLICK_ADDRESSES_OUTPUT = path.join(
      directory,
      'addresses.json'
    );
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ONECLICK_') && key !== 'ONECLICK_ADDRESSES_OUTPUT')
        delete process.env[key];
    }
  });
  afterEach(function () {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('rejects unsupported governance before broadcasting or changing the chain', async function () {
    const [, other] = await ethers.getSigners();
    process.env.ONECLICK_GOVERNANCE = other.address;
    const before = await ethers.provider.getBlockNumber();
    await expect(deployOneClickModules()).to.be.rejectedWith(
      'governance to match the connected deployer'
    );
    expect(await ethers.provider.getBlockNumber()).to.equal(before);
    expect(fs.existsSync(process.env.ONECLICK_ADDRESSES_OUTPUT)).to.equal(
      false
    );
  });

  it('wires real contracts and returns two-step ownership without impersonation', async function () {
    const [owner, participant] = await ethers.getSigners();
    process.env.ONECLICK_MIN_STAKE = '3';
    process.env.ONECLICK_TAX_URI = 'ipfs://reviewed-tax-policy';
    process.env.ONECLICK_TAX_DESCRIPTION = 'Reviewed policy';
    const request = network.provider.request.bind(network.provider);
    network.provider.request = async function (args) {
      if (/impersonateAccount|stopImpersonatingAccount/.test(args.method))
        throw new Error('Deployment must not impersonate an account');
      return request(args);
    };
    let addresses;
    try {
      addresses = await deployOneClickModules();
    } finally {
      network.provider.request = request;
    }
    const at = (name, address) =>
      ethers.getContractAt(`contracts/v2/${name}.sol:${name}`, address);
    const stake = await at('StakeManager', addresses.stakeManager);
    const registry = await at('JobRegistry', addresses.jobRegistry);
    const validation = await at('ValidationModule', addresses.validationModule);
    const reputation = await at('ReputationEngine', addresses.reputationEngine);
    const nft = await at('CertificateNFT', addresses.certificateNFT);
    const tax = await at('TaxPolicy', addresses.taxPolicy);
    const identity = await at('IdentityRegistry', addresses.identityRegistry);
    const dispute = await ethers.getContractAt(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule',
      addresses.disputeModule
    );
    expect(await stake.validationModule()).to.equal(addresses.validationModule);
    expect(await stake.minStakeFloor()).to.equal(ethers.parseEther('3'));
    expect(await stake.minStake()).to.equal(ethers.parseEther('3'));
    expect(await tax.policyURI()).to.equal('ipfs://reviewed-tax-policy');
    expect(await tax.acknowledgement()).to.equal('Reviewed policy');
    expect(await stake.feePool()).to.equal(addresses.feePool);
    expect(await validation.reputationEngine()).to.equal(
      addresses.reputationEngine
    );
    expect(await dispute.stakeManager()).to.equal(addresses.stakeManager);
    expect(await nft.jobRegistry()).to.equal(addresses.jobRegistry);
    expect(await nft.stakeManager()).to.equal(addresses.stakeManager);
    expect(await reputation.callers(addresses.jobRegistry)).to.equal(true);
    expect(await reputation.callers(addresses.validationModule)).to.equal(true);
    for (const contract of [identity, tax]) {
      expect(await contract.owner()).to.equal(owner.address);
      expect(await contract.pendingOwner()).to.equal(ethers.ZeroAddress);
    }
    await registry.connect(participant).acknowledgeTaxPolicy();
    expect(await tax.hasAcknowledged(participant.address)).to.equal(true);
    expect(
      JSON.parse(fs.readFileSync(process.env.ONECLICK_ADDRESSES_OUTPUT, 'utf8'))
    ).to.deep.equal(addresses);
  });

  for (const [key, value, error] of [
    ['ONECLICK_MIN_STAKE', '0', 'Minimum stake must be a positive'],
    [
      'ONECLICK_ARBITRATOR',
      '0x0000000000000000000000000000000000001234',
      'Kleros replacement is unsupported',
    ],
  ]) {
    it(`rejects invalid ${key} before a transaction`, async function () {
      process.env[key] = value;
      const before = await ethers.provider.getBlockNumber();
      await expect(deployOneClickModules()).to.be.rejectedWith(error);
      expect(await ethers.provider.getBlockNumber()).to.equal(before);
    });
  }
});
