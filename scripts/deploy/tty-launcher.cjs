'use strict';
// Additive operator entry point. The ordinary deployDefaults writer and v1
// authority journal remain authoritative. No external-manual profile is used.
const path = require('node:path');
const fs = require('node:fs');
const {
  assertEnvironment,
  captureSource,
  captureArtifacts,
  pinFile,
  pinDirectory,
  hash,
} = require('./tty-source.cjs');
const fail = () => {
  throw new Error(
    'Conventional deployment stopped. Reconcile retained evidence before retrying.'
  );
};
const need = (condition) => {
  if (!condition) fail();
};
function exact(value, keys) {
  need(
    value &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
  );
}
function parseArguments(argv) {
  need(Array.isArray(argv) && argv.length === 5);
  const mode = argv[4];
  need(mode === '--review' || mode === '--execute');
  need(
    argv[0] === '--plan' &&
      argv[2] === '--plan-sha256' &&
      /^[0-9a-f]{64}$/.test(argv[3])
  );
  return { file: argv[1], digest: argv[3], execute: mode === '--execute' };
}
function validatePlan(plan, ethers) {
  exact(plan, [
    'schema',
    'sourceCommit',
    'sourceTree',
    'network',
    'creator',
    'governor',
    'config',
    'configSha256',
    'output',
    'lockDirectory',
    'firstNonce',
    'rpcUrl',
    'fees',
    'resume',
  ]);
  need(
    plan.schema === 'jobs-conventional-tty-v1' &&
      /^[0-9a-f]{40}$/.test(plan.sourceCommit) &&
      /^[0-9a-f]{40}$/.test(plan.sourceTree)
  );
  need(
    ['mainnet', 'sepolia'].includes(plan.network) &&
      Number.isSafeInteger(plan.firstNonce) &&
      plan.firstNonce >= 0
  );
  need(
    ethers.getAddress(plan.creator) === plan.creator &&
      ethers.getAddress(plan.governor) === plan.governor &&
      plan.creator !== plan.governor &&
      plan.creator !== ethers.ZeroAddress &&
      plan.governor !== ethers.ZeroAddress
  );
  need(/^[0-9a-f]{64}$/.test(plan.configSha256));
  for (const key of ['config', 'output', 'lockDirectory'])
    need(
      typeof plan[key] === 'string' &&
        path.isAbsolute(plan[key]) &&
        path.resolve(plan[key]) === plan[key] &&
        !/[\x00-\x1f\x7f]/.test(plan[key])
    );
  const rpc = new URL(plan.rpcUrl);
  need(rpc.protocol === 'https:' && !rpc.hash);
  exact(plan.fees, [
    'gasLimit',
    'maxFeePerGas',
    'maxPriorityFeePerGas',
    'maxTotalCost',
  ]);
  for (const value of Object.values(plan.fees))
    need(typeof value === 'string' && /^[1-9][0-9]*$/.test(value));
  need(
    BigInt(plan.fees.maxPriorityFeePerGas) <= BigInt(plan.fees.maxFeePerGas)
  );
  need(
    BigInt(plan.fees.gasLimit) * BigInt(plan.fees.maxFeePerGas) * 39n <=
      BigInt(plan.fees.maxTotalCost)
  );
  if (plan.resume !== null) {
    exact(plan.resume, ['coordinator', 'evidence', 'evidenceSha256']);
    need(
      ethers.getAddress(plan.resume.coordinator) === plan.resume.coordinator &&
        /^[0-9a-f]{64}$/.test(plan.resume.evidenceSha256)
    );
  }
  return { ...plan, chainId: plan.network === 'mainnet' ? 1 : 11155111 };
}
function publicReview(plan, config, candidate, digest) {
  // Provider URLs may contain credentials. They are never copied to the review,
  // exception output, journal metadata or subprocess arguments/environment.
  return {
    schema: plan.schema,
    reviewedPlanSha256: digest,
    sourceCommit: plan.sourceCommit,
    sourceTree: plan.sourceTree,
    network: plan.network,
    chainId: plan.chainId,
    creator: plan.creator,
    governor: plan.governor,
    firstNonce: plan.firstNonce,
    coordinator: plan.resume?.coordinator || candidate.predictedCoordinator,
    configSha256: plan.configSha256,
    configuration: config,
    transactionPolicy: {
      type: 2,
      value: '0',
      maxTransactions: 39,
      firstNonce: plan.firstNonce,
      ...plan.fees,
    },
    artifactIdentities: candidate.artifacts,
    dependencyObservation: candidate.chain,
    stages: [
      'coordinator CREATE',
      'ten fixed implementation CREATEs and ownership handovers',
      'fourteen component CREATEs',
      'commit/register/finalize paused modules',
      'coordinator ownership handover',
      'independent bounded authority readback',
    ],
    finalState:
      'Eight managed modules stay paused under SystemPause. Governor owns SystemPause, ten fixed implementations and coordinator. Pending two-step acceptances and separate treasury/governance commissioning remain.',
    resume: plan.resume ? { evidenceSha256: plan.resume.evidenceSha256 } : null,
    rpc: 'Configured endpoint (redacted)',
    confirmation: `DEPLOY ${digest}`,
  };
}
let invoked = false;
async function main(argv = process.argv.slice(2)) {
  need(!invoked);
  invoked = true;
  const root = path.resolve(__dirname, '../..');
  assertEnvironment(root);
  need(
    process.cwd() === root &&
      process.stdin.isTTY === true &&
      process.stdout.isTTY === true
  );
  const args = parseArguments(argv),
    planPin = pinFile(args.file);
  need(planPin.digest === args.digest);
  // Only builtins are loaded before rejecting ambient secret/config loaders.
  const { ethers } = require('ethers');
  const plan = validatePlan(JSON.parse(planPin.bytes.toString('utf8')), ethers);
  const sourceGuard = captureSource(root, plan.sourceCommit, plan.sourceTree);
  const configPin = pinFile(plan.config);
  need(configPin.digest === plan.configSha256);
  const config = JSON.parse(configPin.bytes.toString('utf8'));
  need(
    config.governance === plan.governor &&
      config.tax?.enabled === true &&
      config.secureDefaults?.pauseOnLaunch === true
  );
  const lockGuard = pinDirectory(plan.lockDirectory),
    outputGuard = pinDirectory(path.dirname(plan.output));
  need(
    !fs.existsSync(plan.output) &&
      !fs.existsSync(`${plan.output}.journal.jsonl`) &&
      !fs.existsSync(`${plan.output}.launch.json`)
  );
  let resumePin;
  if (plan.resume) {
    resumePin = pinFile(plan.resume.evidence);
    need(resumePin.digest === plan.resume.evidenceSha256);
  }
  let launchRecord, artifactGuard;
  function guard() {
    sourceGuard();
    artifactGuard?.();
    planPin.verify();
    configPin.verify();
    resumePin?.verify();
    lockGuard();
    outputGuard();
    launchRecord?.verify();
    return true;
  }
  const {
    createFeeBoundedSigner,
    validateFeePolicy,
  } = require('./tty-fee-signer.cjs');
  const feePolicy = validateFeePolicy({
    creator: plan.creator,
    chainId: plan.chainId,
    maxTransactions: 39,
    firstNonce: plan.firstNonce,
    ...plan.fees,
  });
  guard();
  // No key is placed in HRE config or process.env. Override only the public RPC
  // setting before the lazy provider is first accessed.
  const oldNetwork = process.env.HARDHAT_NETWORK;
  process.env.HARDHAT_NETWORK = plan.network;
  const hre = require('hardhat');
  need(
    hre.network.name === plan.network &&
      Array.isArray(hre.network.config.accounts) &&
      hre.network.config.accounts.length === 0
  );
  hre.network.config.url = plan.rpcUrl;
  const provider = hre.ethers.provider;
  const { loadTokenConfig } = require('../config');
  const {
    buildDeploymentCandidate,
    inventory,
  } = require('../v2/lib/deployment-candidate.cjs');
  const { createVerifiedArtifactReader } = require('./verified-artifact.cjs');
  const { validateAuthorityRoles } = require('./authority-handover.cjs');
  validateAuthorityRoles(config, plan.creator);
  artifactGuard = captureArtifacts(root, inventory());
  guard();
  const candidate = await buildDeploymentCandidate({
    network: plan.network,
    config,
    configBytes: configPin.bytes.toString('utf8'),
    token: loadTokenConfig({ network: plan.network }).config,
    provider,
    readArtifact: createVerifiedArtifactReader(root),
  });
  guard();
  need(candidate.blockers.length === 0);
  const chain = await provider.getNetwork();
  guard();
  need(Number(chain.chainId) === plan.chainId);
  const latest = await provider.getTransactionCount(plan.creator, 'latest');
  guard();
  const pending = await provider.getTransactionCount(plan.creator, 'pending');
  guard();
  need(latest === pending && latest === plan.firstNonce);
  candidate.predictedCoordinator = ethers.getCreateAddress({
    from: plan.creator,
    nonce: plan.firstNonce,
  });
  const review = publicReview(plan, candidate.config, candidate, args.digest);
  process.stdout.write(`${JSON.stringify(review, null, 2)}\n`);
  if (!args.execute) {
    if (oldNetwork === undefined) delete process.env.HARDHAT_NETWORK;
    else process.env.HARDHAT_NETWORK = oldNetwork;
    process.stdout.write(
      'Read-only review complete. No key requested and no transaction submitted.\n'
    );
    return;
  }
  const { confirmPublicPlan, readSecret } = require('./tty-secret.cjs');
  await confirmPublicPlan(`DEPLOY ${args.digest}`);
  guard();
  let secret;
  const originalGetSigners = hre.ethers.getSigners;
  const envNames = [
    'DEPLOY_DEFAULTS_CONFIG',
    'DEPLOY_DEFAULTS_OUTPUT',
    'DEPLOYMENT_LOCK_DIRECTORY',
    'DEPLOYER_ADDRESS',
    'DEPLOY_DEFAULTS_RESUME_EVIDENCE',
  ];
  const originalEnv = Object.fromEntries(
    envNames.map((k) => [k, process.env[k]])
  );
  try {
    launchRecord =
      require('../v2/lib/reserved-output.cjs').reserveDeploymentOutput(
        `${plan.output}.launch.json`
      );
    launchRecord.write(JSON.stringify(review, null, 2) + '\n');
    secret = await readSecret();
    guard();
    const wallet = new ethers.Wallet(new ethers.SigningKey(secret), provider);
    secret.fill(0);
    secret = undefined;
    need((await wallet.getAddress()) === plan.creator);
    guard();
    const signer = createFeeBoundedSigner({
      wallet,
      sourceGuard: guard,
      policy: feePolicy,
    });
    hre.ethers.getSigners = async () => [signer];
    process.env.DEPLOY_DEFAULTS_CONFIG = plan.config;
    process.env.DEPLOY_DEFAULTS_OUTPUT = plan.output;
    process.env.DEPLOYMENT_LOCK_DIRECTORY = plan.lockDirectory;
    if (plan.resume) {
      process.env.DEPLOYER_ADDRESS = plan.resume.coordinator;
      process.env.DEPLOY_DEFAULTS_RESUME_EVIDENCE = plan.resume.evidence;
    }
    guard();
    await require('../v2/deployDefaults.ts').main([]);
    guard();
  } finally {
    secret?.fill(0);
    launchRecord?.close();
    hre.ethers.getSigners = originalGetSigners;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (oldNetwork === undefined) delete process.env.HARDHAT_NETWORK;
    else process.env.HARDHAT_NETWORK = oldNetwork;
  }
}
if (require.main === module)
  main().catch(() => {
    process.stderr.write(
      'Conventional deployment stopped. Reconcile retained evidence before retrying.\n'
    );
    process.exitCode = 1;
  });
module.exports = { main, parseArguments, validatePlan, publicReview };
