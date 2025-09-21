const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const Deployer = artifacts.require('Deployer');
const { loadEnsConfig } = require('../scripts/config');

const ADDRESSES_PATH = path.join(
  __dirname,
  '..',
  'docs',
  'deployment-addresses.json'
);

function parsePercentage(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`${label} must be an integer value`);
  }
  if (parsed < 0 || parsed > 100) {
    throw new Error(`${label} must be between 0 and 100`);
  }
  return parsed;
}

function readAddressBook() {
  try {
    const data = fs.readFileSync(ADDRESSES_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

function writeAddressBook(data) {
  fs.writeFileSync(ADDRESSES_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

module.exports = async function (_deployer, network, accounts) {
  const deployerInstance = await Deployer.deployed();
  const alreadyDeployed = await deployerInstance.deployed();
  if (alreadyDeployed) {
    console.log('Protocol already deployed; skipping wiring step.');
    return;
  }

  const governance = process.env.GOVERNANCE_ADDRESS || accounts[0];
  if (!governance) {
    throw new Error(
      'GOVERNANCE_ADDRESS must be provided or defaults available'
    );
  }

  const withTax = !process.env.NO_TAX;
  const feeOverride = parsePercentage(process.env.FEE_PCT, 'FEE_PCT');
  const burnOverride = parsePercentage(process.env.BURN_PCT, 'BURN_PCT');
  const customEcon = feeOverride !== undefined || burnOverride !== undefined;
  const feePct = feeOverride ?? 5;
  const burnPct = burnOverride ?? 5;

  const { config: ensConfig } = loadEnsConfig({ network });
  if (!ensConfig.registry) {
    throw new Error('ENS registry address missing from configuration');
  }
  const roots = ensConfig.roots || {};
  const agentRoot = roots.agent || {};
  const clubRoot = roots.club || {};
  if (!agentRoot.node || !clubRoot.node) {
    throw new Error('ENS root nodes missing from configuration');
  }

  const ids = {
    ens: ensConfig.registry,
    nameWrapper: ensConfig.nameWrapper || ethers.ZeroAddress,
    clubRootNode: clubRoot.node,
    agentRootNode: agentRoot.node,
    validatorMerkleRoot: clubRoot.merkleRoot || ethers.ZeroHash,
    agentMerkleRoot: agentRoot.merkleRoot || ethers.ZeroHash,
  };

  const econ = {
    feePct,
    burnPct,
    employerSlashPct: 0,
    treasurySlashPct: 0,
    commitWindow: 0,
    revealWindow: 0,
    minStake: 0,
    jobStake: 0,
  };

  console.log('Executing deterministic module deployment via Deployer...');
  let receipt;
  if (withTax) {
    if (customEcon) {
      receipt = await deployerInstance.deploy(econ, ids, governance);
    } else {
      receipt = await deployerInstance.deployDefaults(ids, governance);
    }
  } else if (customEcon) {
    receipt = await deployerInstance.deployWithoutTaxPolicy(
      econ,
      ids,
      governance
    );
  } else {
    receipt = await deployerInstance.deployDefaultsWithoutTaxPolicy(
      ids,
      governance
    );
  }

  const log = receipt.logs.find((entry) => entry.event === 'Deployed');
  if (!log) {
    throw new Error('Deployer transaction missing Deployed event');
  }

  const {
    stakeManager,
    jobRegistry,
    validationModule,
    reputationEngine,
    disputeModule,
    certificateNFT,
    platformRegistry,
    jobRouter,
    platformIncentives,
    feePool,
    taxPolicy,
    identityRegistryAddr,
    systemPause,
  } = log.args;

  const addressBook = readAddressBook();
  const updatedBook = {
    ...addressBook,
    deployer: deployerInstance.address,
    stakeManager,
    jobRegistry,
    validationModule,
    reputationEngine,
    disputeModule,
    certificateNFT,
    platformRegistry,
    jobRouter,
    platformIncentives,
    feePool,
    taxPolicy,
    identityRegistry: identityRegistryAddr,
    systemPause,
  };
  writeAddressBook(updatedBook);

  console.log('Deployment complete. Module addresses:');
  console.log(`  StakeManager        : ${stakeManager}`);
  console.log(`  JobRegistry         : ${jobRegistry}`);
  console.log(`  ValidationModule    : ${validationModule}`);
  console.log(`  ReputationEngine    : ${reputationEngine}`);
  console.log(`  DisputeModule       : ${disputeModule}`);
  console.log(`  CertificateNFT      : ${certificateNFT}`);
  console.log(`  PlatformRegistry    : ${platformRegistry}`);
  console.log(`  JobRouter           : ${jobRouter}`);
  console.log(`  PlatformIncentives  : ${platformIncentives}`);
  console.log(`  FeePool             : ${feePool}`);
  console.log(`  TaxPolicy           : ${taxPolicy}`);
  console.log(`  IdentityRegistry    : ${identityRegistryAddr}`);
  console.log(`  SystemPause         : ${systemPause}`);
};
