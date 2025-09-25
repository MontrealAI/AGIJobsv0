const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const Deployer = artifacts.require('Deployer');
const { loadEnsConfig, loadDeploymentPlan } = require('../scripts/config');

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

function parseBooleanEnv(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return undefined;
}

function resolveGovernanceAddress(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const address = ethers.getAddress(value);
  if (address === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return address;
}

module.exports = async function (_deployer, network, accounts) {
  const deployerInstance = await Deployer.deployed();
  const alreadyDeployed = await deployerInstance.deployed();
  if (alreadyDeployed) {
    console.log('Protocol already deployed; skipping wiring step.');
    return;
  }

  const {
    plan: deploymentPlan,
    path: deploymentPlanPath,
    exists: hasDeploymentPlan,
  } = loadDeploymentPlan({ network, optional: true });

  if (!hasDeploymentPlan) {
    console.warn(
      `Warning: deployment-config for ${network} not found at ${deploymentPlanPath}. Using migration defaults.`
    );
  } else {
    console.log(`Applying deployment overrides from ${deploymentPlanPath}`);
  }

  const envGovernance = resolveGovernanceAddress(
    process.env.GOVERNANCE_ADDRESS,
    'GOVERNANCE_ADDRESS'
  );
  const planGovernance = resolveGovernanceAddress(
    deploymentPlan.governance,
    'deployment-config.governance'
  );
  const fallbackGovernance = resolveGovernanceAddress(
    accounts && accounts.length > 0 ? accounts[0] : undefined,
    'default governance account'
  );
  const governance = envGovernance || planGovernance || fallbackGovernance;
  if (!governance) {
    throw new Error(
      'GOVERNANCE_ADDRESS must be provided (env or deployment-config) when no default account is available'
    );
  }

  const withTaxEnv = parseBooleanEnv(process.env.WITH_TAX);
  const noTaxEnv = parseBooleanEnv(process.env.NO_TAX);
  const withTaxPlan =
    deploymentPlan.withTax === undefined
      ? undefined
      : Boolean(deploymentPlan.withTax);
  let withTax = true;
  if (noTaxEnv !== undefined) {
    withTax = !noTaxEnv;
  } else if (withTaxEnv !== undefined) {
    withTax = withTaxEnv;
  } else if (withTaxPlan !== undefined) {
    withTax = withTaxPlan;
  }

  const feeOverride = parsePercentage(process.env.FEE_PCT, 'FEE_PCT');
  const burnOverride = parsePercentage(process.env.BURN_PCT, 'BURN_PCT');
  const planEcon = deploymentPlan.econ || {};
  const customEcon =
    feeOverride !== undefined ||
    burnOverride !== undefined ||
    Object.keys(planEcon).length > 0;
  const feePct = feeOverride ?? planEcon.feePct ?? 5;
  const burnPct = burnOverride ?? planEcon.burnPct ?? 5;

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
    employerSlashPct: planEcon.employerSlashPct ?? 0,
    treasurySlashPct: planEcon.treasurySlashPct ?? 0,
    commitWindow: planEcon.commitWindow ?? 0,
    revealWindow: planEcon.revealWindow ?? 0,
    minStake:
      planEcon.minStake !== undefined ? planEcon.minStake.toString() : 0,
    jobStake:
      planEcon.jobStake !== undefined ? planEcon.jobStake.toString() : 0,
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
