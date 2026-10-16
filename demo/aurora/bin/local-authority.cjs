'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { ethers } = require('ethers');
const { localEndpoint } = require('./local-rpc.cjs');
const {
  validateAuthorityRoles,
} = require('../../../scripts/deploy/authority-handover.cjs');
const {
  auditAuthority,
} = require('../../../scripts/deploy/authority-audit.cjs');

function validateLocalContext(networkName, chainId, env) {
  const endpoint = localEndpoint(env);
  if (networkName !== 'localhost' || BigInt(chainId) !== 31337n)
    throw new Error(
      'Local commissioning requires localhost chain 31337; public demo execution is unsupported.'
    );
  if (
    !env.LOCAL_NODE_STATE ||
    !path.isAbsolute(env.LOCAL_NODE_STATE) ||
    !env.AGI_LOCAL_LOCK_OWNER
  )
    throw new Error(
      'Local commissioning requires the owned-node state and inherited exclusive demo lock.'
    );
  return endpoint;
}

async function requireOwnedLocal(provider, networkName = 'localhost') {
  const endpoint = validateLocalContext(
    networkName,
    (await provider.getNetwork()).chainId,
    process.env
  );
  if (provider._getConnection().url !== endpoint.url)
    throw new Error(
      'Local commissioning provider differs from the owned loopback endpoint.'
    );
  execFileSync(
    'python3',
    [path.join(__dirname, 'local-demo-lock.py'), '--verify', 'true'],
    { stdio: 'pipe' }
  );
  execFileSync(
    'python3',
    [
      path.join(__dirname, 'local-node-guard.py'),
      'check',
      process.env.LOCAL_NODE_STATE,
      String(endpoint.port),
    ],
    { stdio: 'pipe' }
  );
}

function boundConfig(report, bytes) {
  const config = JSON.parse(bytes);
  if (
    report.provenance !== 'new-staged-creation' ||
    report.chainId !== 31337 ||
    report.configSha256 !== createHash('sha256').update(bytes).digest('hex') ||
    config.network !== 'localhost' ||
    config.chainId !== 31337 ||
    config.governance !== report.governance ||
    !isDeepStrictEqual(config.authority, report.authority) ||
    !isDeepStrictEqual(config.campaign, report.creationScope?.campaign)
  )
    throw new Error(
      'Local commissioning requires the exact fresh campaign configuration and new-creation journal.'
    );
  if (config.tax?.enabled !== true || report.withTax !== true)
    throw new Error(
      'This disposable commissioning fixture requires the explicit tax-enabled template.'
    );
  validateAuthorityRoles(config, report.creator);
  const names = [
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
    'ArbitratorCommittee',
    'TaxPolicy',
  ];
  if (
    Object.keys(report.contracts || {})
      .sort()
      .join() !== names.sort().join() ||
    names.some(
      (name) =>
        report.contracts[name] !== report.creationRecords?.[name]?.address
    ) ||
    report.coordinator !== report.creationRecords?.Deployer?.address
  )
    throw new Error(
      'Local writer contract map differs from canonical creation evidence.'
    );
  return config;
}

const LOCAL_ENS = new Set([
  'ENS.agentRootNode: no readable registry',
  'ENS.clubRootNode: no readable registry',
]);
function requireControlledAuthority(certificate) {
  if (
    certificate.chainId !== 31337 ||
    certificate.boundedBlockers.length !== 2 ||
    certificate.boundedBlockers.some((item) => !LOCAL_ENS.has(item)) ||
    new Set(certificate.boundedBlockers).size !== 2
  )
    throw new Error(
      `Local controlled-contract authority is incomplete: ${certificate.boundedBlockers.join(
        '; '
      )}`
    );
  return {
    ...certificate,
    authorityComplete: false,
    sourceVerificationComplete: false,
    activationReady: false,
    productionApproved: false,
    localFixtureReadbackPassed: true,
    evidenceClass: 'disposable-local-fixture',
    scope:
      'Bounded controlled-contract source, creation receipts and named authority checks passed on the owned disposable chain. ENS is absent and explorer verification is unavailable. This permits only the local fixture drill, never public activation.',
  };
}

async function readLocalAuthority(report, provider, configFile) {
  await requireOwnedLocal(provider);
  boundConfig(report, fs.readFileSync(configFile, 'utf8'));
  return requireControlledAuthority(
    await auditAuthority(report, { provider, blockTag: 'latest' })
  );
}

async function commissionLocalAuthority(report, provider, configFile) {
  await requireOwnedLocal(provider);
  const config = boundConfig(report, fs.readFileSync(configFile, 'utf8'));
  // Reconcile every actual creation/intent and its source before any governor write.
  const before = await auditAuthority(report, { provider, blockTag: 'latest' });
  const pending = new Set([
    'IdentityRegistry.owner',
    'IdentityRegistry.pendingOwner',
    'TaxPolicy.owner',
    'TaxPolicy.pendingOwner',
    'StakeManager.treasury',
    'FeePool.treasury',
    'FeePool.governance',
    `StakeManager.treasuryAllowlist(${config.authority.stakeManagerTreasury})`,
    `FeePool.treasuryAllowlist(${config.authority.feePoolTreasury})`,
  ]);
  if (
    before.boundedBlockers.some(
      (item) => !LOCAL_ENS.has(item) && !pending.has(item)
    )
  )
    throw new Error(
      'Unexpected source, ownership or topology before local commissioning.'
    );
  const unlocked = await provider.getSigner(config.governance);
  const governor = Object.assign(new ethers.NonceManager(unlocked), {
    address: await unlocked.getAddress(),
  });
  if (
    governor.address !== config.governance ||
    governor.address === report.creator
  )
    throw new Error(
      'Local governor signer differs from the committed handover.'
    );
  const actions = [];
  const record = async (target, method, action) => {
    const tx = await action();
    const receipt = await tx.wait();
    if (receipt?.status !== 1)
      throw new Error('Local commissioning transaction failed.');
    actions.push({
      target,
      method,
      txHash: receipt.hash,
      type: 'direct',
      notes: 'Explicit disposable-fixture commissioning',
      chainId: '31337',
      sender: governor.address,
      nonce: tx.nonce,
      to: tx.to,
      value: tx.value.toString(),
      dataHash: ethers.keccak256(tx.data),
      configurationHash: report.configurationHash,
    });
  };
  for (const name of ['IdentityRegistry', 'TaxPolicy']) {
    const contract = new ethers.Contract(
      report.contracts[name],
      [
        'function owner() view returns(address)',
        'function pendingOwner() view returns(address)',
        'function acceptOwnership()',
      ],
      governor
    );
    const owner = await contract.owner();
    if (owner !== governor.address) {
      if (
        owner !== report.coordinator ||
        (await contract.pendingOwner()) !== governor.address
      )
        throw new Error(`Unexpected pending local ownership: ${name}`);
      await record(name, 'acceptOwnership', () => contract.acceptOwnership());
    }
  }
  const pause = new ethers.Contract(
    report.contracts.SystemPause,
    ['function executeGovernanceCall(address,bytes) returns(bytes)'],
    governor
  );
  const forward = async (name, method, types, args) => {
    const iface = new ethers.Interface([`function ${method}(${types})`]);
    await record(name, method, () =>
      pause.executeGovernanceCall(
        report.contracts[name],
        iface.encodeFunctionData(method, args)
      )
    );
  };
  for (const [name, treasury] of [
    ['StakeManager', config.authority.stakeManagerTreasury],
    ['FeePool', config.authority.feePoolTreasury],
  ]) {
    await forward(name, 'setTreasuryAllowlist', 'address,bool', [
      treasury,
      true,
    ]);
    await forward(name, 'setTreasury', 'address', [treasury]);
  }
  await forward('FeePool', 'setGovernance', 'address', [
    config.authority.feePoolGovernance,
  ]);
  const certificate = await readLocalAuthority(report, provider, configFile);
  return { governor, actions, certificate };
}

async function prepareConfig(source, output, provider) {
  await requireOwnedLocal(provider);
  const config = JSON.parse(fs.readFileSync(source, 'utf8'));
  const creator = await (await provider.getSigner(0)).getAddress();
  validateAuthorityRoles(config, creator);
  if (
    config.network !== 'localhost' ||
    config.chainId !== 31337 ||
    config.secureDefaults?.pauseOnLaunch !== true
  )
    throw new Error(
      'Expected the explicit paused disposable localhost template.'
    );
  const block = await provider.getBlock('latest');
  config.campaign = {
    chainId: 31337,
    blockNumber: block.number,
    blockHash: block.hash,
  };
  fs.writeFileSync(output, JSON.stringify(config, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
}

module.exports = {
  validateLocalContext,
  boundConfig,
  requireControlledAuthority,
  requireOwnedLocal,
  readLocalAuthority,
  commissionLocalAuthority,
  prepareConfig,
};
if (require.main === module)
  (async () => {
    const [command, source, output, ...extra] = process.argv.slice(2);
    if (command !== 'prepare' || !source || !output || extra.length)
      throw new Error('Expected prepare <local-template> <new-config>.');
    const { url } = localEndpoint();
    const provider = new ethers.JsonRpcProvider(url, undefined, {
      cacheTimeout: -1,
    });
    try {
      await prepareConfig(source, output, provider);
    } finally {
      provider.destroy();
    }
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
