const Deployer = artifacts.require('Deployer');
const { loadEnsConfig } = require('../scripts/config');

/**
 * Truffle migration for deploying the full AGIJobs v2 stack on Ethereum
 * mainnet. It assumes the canonical $AGIALPHA token and mainnet ENS root
 * nodes defined in `contracts/v2/Constants.sol` and below.
 *
 * Environment variables:
 *  - GOVERNANCE_ADDRESS : multisig/timelock that will own the system
 *  - NO_TAX             : set to any value to skip TaxPolicy deployment
 *  - FEE_PCT            : protocol fee percentage (default 5)
 *  - BURN_PCT           : fee burn percentage (default 5)
 *
 * If `ETHERSCAN_API_KEY` is set the migration will attempt to verify the
 * contracts automatically. To rerun manually use:
 * `npx truffle run verify Deployer StakeManager JobRegistry ValidationModule ReputationEngine DisputeModule CertificateNFT PlatformRegistry JobRouter PlatformIncentives FeePool IdentityRegistry SystemPause --network <network>`
 * (include TaxPolicy if deployed)
 * See docs/deploying-agijobs-v2-truffle-cli.md for full instructions.
 *
 * Run on a testnet first to confirm configuration before mainnet:
 * `npx truffle migrate --network sepolia`
 */
module.exports = async function (deployer, network, accounts) {
  const governance = process.env.GOVERNANCE_ADDRESS || accounts[0];
  const withTax = !process.env.NO_TAX;
  const feePct = process.env.FEE_PCT ? parseInt(process.env.FEE_PCT) : 5;
  const burnPct = process.env.BURN_PCT ? parseInt(process.env.BURN_PCT) : 5;

  await deployer.deploy(Deployer);
  const instance = await Deployer.deployed();

  const {
    config: { registry, nameWrapper, roots = {} },
  } = loadEnsConfig({ network });

  const zeroHash = '0x' + '0'.repeat(64);
  const agentRoot = roots.agent || {};
  const clubRoot = roots.club || {};

  const ids = {
    ens: registry,
    nameWrapper: nameWrapper || '0x0000000000000000000000000000000000000000',
    clubRootNode: clubRoot.node,
    agentRootNode: agentRoot.node,
    validatorMerkleRoot: clubRoot.merkleRoot || zeroHash,
    agentMerkleRoot: agentRoot.merkleRoot || zeroHash,
  };

  if (!ids.ens) {
    throw new Error('ENS registry address missing from configuration');
  }
  if (!ids.clubRootNode || !ids.agentRootNode) {
    throw new Error('ENS root nodes missing from configuration');
  }

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

  let receipt;
  if (withTax) {
    if (feePct !== 5 || burnPct !== 5) {
      receipt = await instance.deploy(econ, ids, governance);
    } else {
      receipt = await instance.deployDefaults(ids, governance);
    }
  } else {
    if (feePct !== 5 || burnPct !== 5) {
      receipt = await instance.deployWithoutTaxPolicy(econ, ids, governance);
    } else {
      receipt = await instance.deployDefaultsWithoutTaxPolicy(ids, governance);
    }
  }

  const log = receipt.logs.find((l) => l.event === 'Deployed');
  const args = log.args;
  console.log('Deployer:', instance.address);
  console.log('StakeManager:', args.stakeManager);
  console.log('JobRegistry:', args.jobRegistry);
  console.log('ValidationModule:', args.validationModule);
  console.log('ReputationEngine:', args.reputationEngine);
  console.log('DisputeModule:', args.disputeModule);
  console.log('CertificateNFT:', args.certificateNFT);
  console.log('PlatformRegistry:', args.platformRegistry);
  console.log('JobRouter:', args.jobRouter);
  console.log('PlatformIncentives:', args.platformIncentives);
  console.log('FeePool:', args.feePool);
  if (withTax) {
    console.log('TaxPolicy:', args.taxPolicy);
  }
  console.log('IdentityRegistry:', args.identityRegistryAddr);
  console.log('SystemPause:', args.systemPause);

  if (process.env.ETHERSCAN_API_KEY) {
    const contracts = [
      'Deployer',
      'StakeManager',
      'JobRegistry',
      'ValidationModule',
      'ReputationEngine',
      'DisputeModule',
      'CertificateNFT',
      'PlatformRegistry',
      'JobRouter',
      'PlatformIncentives',
      'FeePool',
      'IdentityRegistry',
      'SystemPause',
    ];
    if (withTax) {
      contracts.push('TaxPolicy');
    }
    try {
      const { execSync } = require('child_process');
      const cmd = `npx truffle run verify ${contracts.join(
        ' '
      )} --network ${network}`;
      console.log('Running:', cmd);
      execSync(cmd, { stdio: 'inherit' });
    } catch (err) {
      console.error('Verification failed:', err.message);
    }
  } else {
    console.log('ETHERSCAN_API_KEY not set; skipping auto-verify.');
  }
};
