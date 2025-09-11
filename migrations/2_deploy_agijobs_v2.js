const Deployer = artifacts.require('Deployer');

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

  // Mainnet ENS registry, NameWrapper and AGIJobs subdomain roots
  const ids = {
    ens: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
    nameWrapper: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401',
    clubRootNode:
      '0x39eb848f88bdfb0a6371096249dd451f56859dfe2cd3ddeab1e26d5bb68ede16',
    agentRootNode:
      '0x2c9c6189b2e92da4d0407e9deb38ff6870729ad063af7e8576cb7b7898c88e2d',
    validatorMerkleRoot: '0x' + '0'.repeat(64),
    agentMerkleRoot: '0x' + '0'.repeat(64),
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
