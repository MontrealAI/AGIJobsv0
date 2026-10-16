#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { ethers } = require('ethers');
const {
  createAuthoritySourceReader,
  pinnedReader,
} = require('./authority-runtime.cjs');
const {
  validateAuthorityRoles,
  moduleId,
  assertCreationScope,
  assertNewAddress,
} = require('./authority-handover.cjs');
const { inventory } = require('../v2/lib/deployment-candidate.cjs');
const modules = require('../../config/implementation-modules.json');
const MANAGED = [
  'StakeManager',
  'JobRegistry',
  'ValidationModule',
  'ReputationEngine',
  'DisputeModule',
  'PlatformRegistry',
  'FeePool',
  'ArbitratorCommittee',
];
const STAGED = [
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
  'TaxPolicy',
  'IdentityRegistry',
  'SystemPause',
  'ArbitratorCommittee',
];

// Signer-free, bounded authority certificate. Saved completion flags are ignored:
// all source, address, owner, wiring and permission observations are read again.
async function auditAuthority(
  report,
  {
    provider,
    readSource = createAuthoritySourceReader(),
    blockTag = 'finalized',
  } = {}
) {
  if (
    !provider ||
    report.schema !== 'agi-jobs/staged-deployment/v1' ||
    report.authorityJournalVersion !== 1 ||
    report.provenance !== 'new-staged-creation' ||
    !report.deploymentId ||
    !report.creator ||
    !report.chainId ||
    !report.configurationHash
  )
    throw new Error('Incomplete staged authority evidence');
  const creator = ethers.getAddress(report.creator);
  const governance = ethers.getAddress(report.governance);
  await assertCreationScope(provider, report.chainId, report.creationScope);
  if (
    report.creationScope.creator !== creator ||
    report.creationScope.governance !== governance
  )
    throw new Error('Authority creation scope differs from selected roles');
  const roles = validateAuthorityRoles(
    { governance, authority: report.authority },
    creator
  );
  const configuration = report.configuration;
  if (
    !configuration ||
    ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(configuration))) !==
      report.configurationHash ||
    configuration.chainId !== report.chainId ||
    configuration.governance !== governance ||
    configuration.token !== report.token ||
    JSON.stringify(configuration.authority) !== JSON.stringify(roles) ||
    JSON.stringify(configuration.creationScope) !==
      JSON.stringify(report.creationScope) ||
    JSON.stringify(configuration.identity) !==
      JSON.stringify(report.identity) ||
    configuration.pauseOnLaunch !== true ||
    Boolean(configuration.tax) !== (report.withTax !== false)
  )
    throw new Error(
      'Authority plan commitment differs from selected configuration'
    );

  const pin = await pinnedReader(provider, report.chainId, blockTag);
  const targets = inventory().filter(
    ({ name }) => report.withTax !== false || name !== 'TaxPolicy'
  );
  const records = report.creationRecords;
  if (
    !records ||
    Object.keys(records).sort().join() !==
      targets
        .map(({ name }) => name)
        .sort()
        .join()
  )
    throw new Error(
      'Authority creation evidence must cover every contract exactly once'
    );
  const addresses = Object.fromEntries(
    targets.map(({ name }) => [name, ethers.getAddress(records[name].address)])
  );
  Object.values(addresses).forEach(assertNewAddress);
  if (
    new Set(Object.values(addresses)).size !== targets.length ||
    Object.values(addresses).includes(ethers.ZeroAddress)
  )
    throw new Error('Duplicate or zero authority address');
  if (addresses.Deployer !== ethers.getAddress(report.coordinator))
    throw new Error('Authority coordinator differs from creation evidence');
  const implementations = Object.fromEntries(
    Object.values(modules)
      .flat()
      .map((name) => [name, addresses[name]])
  );
  if (
    Object.keys(report.implementations || {})
      .sort()
      .join() !== Object.keys(implementations).sort().join() ||
    Object.entries(implementations).some(
      ([name, address]) =>
        ethers.getAddress(report.implementations[name]) !== address
    )
  )
    throw new Error('Fixed implementation address evidence mismatch');
  const usedNonces = new Set();
  for (const [key, op] of Object.entries(report.authorityOperations || {})) {
    const source = readSource(op.name, op.to || op.address, {
      token: report.token,
      implementations,
    });
    if (
      op.source !== source.source ||
      op.compilerInputSha256 !== source.compilerInputSha256 ||
      op.creationCodeHash !== ethers.keccak256(source.bytecode)
    )
      throw new Error(`Authority transaction source mismatch: ${key}`);
    const tx = op.hash ? await provider.getTransaction(op.hash) : null;
    const receipt = op.hash
      ? await provider.getTransactionReceipt(op.hash)
      : null;
    if (
      op.role !== key ||
      op.creator !== creator ||
      op.chainId !== report.chainId ||
      op.value !== '0' ||
      !tx ||
      ethers.getAddress(tx.from) !== creator ||
      tx.nonce !== op.nonce ||
      BigInt(tx.chainId) !== BigInt(report.chainId) ||
      (tx.to || null)?.toLowerCase() !== op.to?.toLowerCase() ||
      tx.value !== 0n ||
      ethers.keccak256(tx.data) !== op.dataHash ||
      usedNonces.has(op.nonce) ||
      receipt?.status !== 1 ||
      receipt.blockNumber <= report.creationScope.initialBlock.number ||
      !Number.isSafeInteger(op.startBlock) ||
      op.startBlock < report.creationScope.initialBlock.number ||
      op.startBlock > receipt.blockNumber ||
      receipt.blockNumber > pin.block.number ||
      (await provider.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash
    )
      throw new Error(`Incomplete or mismatched authority transaction: ${key}`);
    usedNonces.add(op.nonce);
  }
  const checks = [];
  const sourceRecords = [];
  const blockers = [];
  const check = async (name, signature, expected, args = []) => {
    const actual = await pin.call(addresses[name], signature, args);
    const normalize = (value) =>
      typeof value === 'string' ? value.toLowerCase() : String(value);
    const choices = Array.isArray(expected) ? expected : [expected];
    const passed = choices.some(
      (value) => normalize(actual) === normalize(value)
    );
    const role = `${name}.${signature.slice(0, signature.indexOf('('))}${
      args.length ? `(${args.join(',')})` : ''
    }`;
    checks.push({
      role,
      address: addresses[name],
      actual: typeof actual === 'bigint' ? actual.toString() : actual,
      expected,
      passed,
    });
    if (!passed) blockers.push(role);
    return actual;
  };
  for (const { name, source } of targets) {
    const record = records[name];
    const compiled = readSource(name, addresses[name], {
      token: report.token,
      implementations,
    });
    if (
      record.source !== `${source}:${name}` ||
      compiled.source !== record.source ||
      !Array.isArray(record.args) ||
      new ethers.Interface(compiled.abi).encodeDeploy(record.args) !==
        record.constructorArguments
    )
      throw new Error(
        `Authority constructor/source evidence mismatch: ${name}`
      );
    if (
      (await pin.code(addresses[name])).toLowerCase() !==
      compiled.runtime.toLowerCase()
    )
      throw new Error(`Authority runtime/source mismatch: ${name}`);
    sourceRecords.push({
      name,
      address: addresses[name],
      source: record.source,
      compiler: compiled.compiler,
      compilerInputSha256: compiled.compilerInputSha256,
      creationCodeHash: ethers.keccak256(compiled.bytecode),
      runtimeCodeHash: ethers.keccak256(compiled.runtime),
      constructorArguments: record.constructorArguments,
    });
    if (name === 'Deployer' || implementations[name]) {
      const op = report.authorityOperations?.[`create:${name}`];
      if (
        !op?.hash ||
        op.address !== addresses[name] ||
        op.creator !== creator ||
        op.chainId !== report.chainId ||
        op.dataHash !== ethers.keccak256(compiled.bytecode)
      )
        throw new Error(
          `Missing authority creation transaction evidence: ${name}`
        );
      const tx = await provider.getTransaction(op.hash);
      const receipt = await provider.getTransactionReceipt(op.hash);
      if (
        !tx ||
        tx.to !== null ||
        ethers.getAddress(tx.from) !== creator ||
        tx.nonce !== op.nonce ||
        tx.value !== 0n ||
        tx.data !== compiled.bytecode ||
        receipt?.status !== 1 ||
        receipt.blockNumber > pin.block.number ||
        ethers.getAddress(receipt.contractAddress) !== addresses[name] ||
        ethers.getCreateAddress({ from: creator, nonce: op.nonce }) !==
          addresses[name] ||
        (await provider.getBlock(receipt.blockNumber))?.hash !==
          receipt.blockHash
      )
        throw new Error(
          `Noncanonical or mismatched creation transaction: ${name}`
        );
    } else {
      await check(
        'Deployer',
        'components(bytes32) view returns(address)',
        addresses[name],
        [ethers.id(name)]
      );
      await check(
        'Deployer',
        'componentCodeHashes(bytes32) view returns(bytes32)',
        ethers.keccak256(
          ethers.concat([compiled.bytecode, record.constructorArguments])
        ),
        [ethers.id(name)]
      );
    }
    const expectedOwner = MANAGED.includes(name)
      ? addresses.SystemPause
      : governance;
    await check(name, 'owner() view returns(address)', expectedOwner);
    if (
      ['SystemPause', 'StakeManager', 'JobRegistry', 'DisputeModule'].includes(
        name
      ) ||
      (implementations[name] && !name.startsWith('ValidationModule'))
    )
      await check(name, 'governance() view returns(address)', expectedOwner);
    if (implementations[name])
      await check(name, 'moduleId() view returns(bytes32)', moduleId(name));
  }
  await check('Deployer', 'deployed() view returns(bool)', true);
  await check('Deployer', 'registered() view returns(bool)', true);
  await check(
    'Deployer',
    'configurationHash() view returns(bytes32)',
    report.configurationHash
  );
  const staged = Array.from(
    await pin.call(
      addresses.Deployer,
      'stagedModules() view returns(address[14])'
    )
  );
  for (let i = 0; i < STAGED.length; i += 1)
    if (
      ethers.getAddress(staged[i]) !==
      (addresses[STAGED[i]] || ethers.ZeroAddress)
    )
      throw new Error(`Staged authority address mismatch: ${STAGED[i]}`);
  for (const [controller, names] of Object.entries(modules)) {
    const fixed = Array.from(
      await pin.call(
        addresses[controller],
        `implementationModules() view returns(address[${names.length}])`
      )
    );
    if (
      fixed.length !== names.length ||
      fixed.some(
        (value, index) =>
          ethers.getAddress(value) !== implementations[names[index]]
      )
    )
      throw new Error(`Fixed delegate address mismatch: ${controller}`);
  }
  for (const name of MANAGED) {
    await check(name, 'paused() view returns(bool)', true);
    // The coordinator leaves these zero; an explicit SystemPause pauseAll may
    // bind them to SystemPause. Neither branch grants a wallet a pause role.
    for (const method of ['pauser', 'pauserManager'])
      await check(name, `${method}() view returns(address)`, [
        ethers.ZeroAddress,
        addresses.SystemPause,
      ]);
    const getter = name[0].toLowerCase() + name.slice(1);
    await check(
      'SystemPause',
      `${getter}() view returns(address)`,
      addresses[name]
    );
  }
  await check('SystemPause', 'activePauser() view returns(address)', [
    ethers.ZeroAddress,
    addresses.SystemPause,
  ]);
  for (const name of [
    'IdentityRegistry',
    ...(report.withTax === false ? [] : ['TaxPolicy']),
  ])
    await check(
      name,
      'pendingOwner() view returns(address)',
      ethers.ZeroAddress
    );
  await check(
    'StakeManager',
    'treasury() view returns(address)',
    roles.stakeManagerTreasury
  );
  await check(
    'FeePool',
    'treasury() view returns(address)',
    roles.feePoolTreasury
  );
  await check(
    'FeePool',
    'governance() view returns(address)',
    roles.feePoolGovernance
  );
  await check(
    'JobRegistry',
    'treasury() view returns(address)',
    ethers.ZeroAddress
  );
  for (const [name, methods] of Object.entries({
    StakeManager: ['treasuryAllowlist', 'validatorLockManagers'],
    FeePool: ['treasuryAllowlist', 'rewarders'],
    JobRegistry: ['acknowledgers'],
    ReputationEngine: ['callers'],
    PlatformRegistry: ['registrars'],
    JobRouter: ['registrars'],
  }))
    for (const method of methods)
      await check(name, `${method}(address) view returns(bool)`, false, [
        creator,
      ]);
  if (report.withTax !== false)
    await check(
      'TaxPolicy',
      'acknowledgerAllowed(address) view returns(bool)',
      false,
      [creator]
    );
  for (const [name, method, target] of [
    ['StakeManager', 'treasuryAllowlist', roles.stakeManagerTreasury],
    ['FeePool', 'treasuryAllowlist', roles.feePoolTreasury],
    ['JobRegistry', 'acknowledgers', addresses.StakeManager],
    ['ReputationEngine', 'callers', addresses.JobRegistry],
    ['ReputationEngine', 'callers', addresses.ValidationModule],
    ['PlatformRegistry', 'registrars', addresses.PlatformIncentives],
    ['JobRouter', 'registrars', addresses.PlatformIncentives],
  ])
    await check(name, `${method}(address) view returns(bool)`, true, [target]);
  const wiring = {
    StakeManager: {
      jobRegistry: 'JobRegistry',
      disputeModule: 'DisputeModule',
      validationModule: 'ValidationModule',
      feePool: 'FeePool',
    },
    JobRegistry: {
      stakeManager: 'StakeManager',
      validationModule: 'ValidationModule',
      reputationEngine: 'ReputationEngine',
      disputeModule: 'DisputeModule',
      certificateNFT: 'CertificateNFT',
      feePool: 'FeePool',
      identityRegistry: 'IdentityRegistry',
    },
    ValidationModule: {
      jobRegistry: 'JobRegistry',
      stakeManager: 'StakeManager',
      reputationEngine: 'ReputationEngine',
      identityRegistry: 'IdentityRegistry',
    },
    CertificateNFT: {
      jobRegistry: 'JobRegistry',
      stakeManager: 'StakeManager',
    },
    ArbitratorCommittee: { disputeModule: 'DisputeModule' },
    DisputeModule: {
      jobRegistry: 'JobRegistry',
      stakeManager: 'StakeManager',
      committee: 'ArbitratorCommittee',
    },
  };
  for (const [name, fields] of Object.entries(wiring))
    for (const [method, target] of Object.entries(fields))
      await check(name, `${method}() view returns(address)`, addresses[target]);
  // Newly staged identity has no extra roots/aliases or attestation controller.
  // A later expansion needs a separately reviewed authority manifest.
  await check(
    'IdentityRegistry',
    'nodeRootNode() view returns(bytes32)',
    ethers.ZeroHash
  );
  await check(
    'IdentityRegistry',
    'attestationRegistry() view returns(address)',
    ethers.ZeroAddress
  );
  for (const method of [
    'getAgentRootNodeAliases',
    'getClubRootNodeAliases',
    'getNodeRootNodeAliases',
  ]) {
    const aliases = await pin.call(
      addresses.IdentityRegistry,
      `${method}() view returns(bytes32[])`
    );
    if (aliases.length)
      blockers.push(`IdentityRegistry.${method}: unreviewed alias authority`);
  }
  // Known ENS roots and their current owners/operators are bounded checks, not
  // a claim to enumerate all ancestors, aliases, token approvals or mappings.
  const external = [];
  const ens = await check(
    'IdentityRegistry',
    'ens() view returns(address)',
    report.identity.ens
  );
  const wrapper = await check(
    'IdentityRegistry',
    'nameWrapper() view returns(address)',
    report.identity.nameWrapper
  );
  for (const method of ['agentRootNode', 'clubRootNode']) {
    try {
      const root = await check(
        'IdentityRegistry',
        `${method}() view returns(bytes32)`,
        report.identity[method]
      );
      if (ens === ethers.ZeroAddress || (await pin.code(ens)) === '0x') {
        blockers.push(`ENS.${method}: no readable registry`);
        continue;
      }
      const owner = ethers.getAddress(
        await pin.call(ens, 'owner(bytes32) view returns(address)', [root])
      );
      const approved = await pin.call(
        ens,
        'isApprovedForAll(address,address) view returns(bool)',
        [owner, creator]
      );
      external.push({ root, owner, creatorApproved: approved });
      if (owner === creator || owner === ethers.ZeroAddress || approved)
        blockers.push(`ENS.${method}: creator or missing root authority`);
      if (owner === ethers.getAddress(wrapper)) {
        const wrappedOwner = ethers.getAddress(
          await pin.call(wrapper, 'ownerOf(uint256) view returns(address)', [
            BigInt(root),
          ])
        );
        const approved = await pin.call(
          wrapper,
          'isApprovedForAll(address,address) view returns(bool)',
          [wrappedOwner, creator]
        );
        external.push({
          root,
          wrapper,
          owner: wrappedOwner,
          creatorApproved: approved,
        });
        if (
          wrappedOwner === creator ||
          wrappedOwner === ethers.ZeroAddress ||
          approved
        )
          blockers.push(
            `NameWrapper.${method}: creator or missing root authority`
          );
      }
    } catch {
      blockers.push(`ENS.${method}: external authority read incomplete`);
    }
  }
  const verification = report.explorerVerification || [];
  const sourceVerificationComplete =
    verification.length === targets.length &&
    new Set(verification.map((item) => item.address.toLowerCase())).size ===
      targets.length &&
    targets.every(({ name }) =>
      verification.some(
        (item) =>
          item.address.toLowerCase() === addresses[name].toLowerCase() &&
          item.status === 'verified'
      )
    );
  await pin.finish();
  return {
    schema: 'agi-jobs/authority-certificate/v1',
    chainId: report.chainId,
    creator,
    governance,
    coordinator: addresses.Deployer,
    block: pin.block,
    deploymentId: report.deploymentId,
    creationScope: report.creationScope,
    configurationHash: report.configurationHash,
    authorityComplete: blockers.length === 0,
    sourceVerificationComplete,
    activationReady: blockers.length === 0 && sourceVerificationComplete,
    productionApproved: false,
    sourceRecords,
    checks,
    external,
    blockers,
    scope:
      'All staged creation owners, fixed delegates, named wiring and listed creator-specific permissions; only configured ENS roots/current-owner operator approvals. Unenumerated mappings, aliases, ancestor controls, NFT approvals and unrelated external authority are not globally certified.',
  };
}

async function requireActivationReady(report, options) {
  const certificate = await auditAuthority(report, options);
  if (!certificate.activationReady)
    throw new Error(
      `Activation blocked: ${
        certificate.blockers.join('; ') || 'source verification incomplete'
      }`
    );
  return certificate;
}

module.exports = { auditAuthority, requireActivationReady, MANAGED };

if (require.main === module)
  (async () => {
    const [input, output, ...extra] = process.argv.slice(2);
    if (!input || !output || extra.length || !process.env.AUTHORITY_RPC_URL)
      throw new Error(
        'Usage: AUTHORITY_RPC_URL=<read-only RPC> node scripts/deploy/authority-audit.cjs <deployment.json> <NEW-certificate.json>'
      );
    const report = JSON.parse(fs.readFileSync(input, 'utf8'));
    const provider = new ethers.JsonRpcProvider(
      process.env.AUTHORITY_RPC_URL,
      undefined,
      { cacheTimeout: -1 }
    );
    try {
      const certificate = await auditAuthority(report, { provider });
      fs.writeFileSync(output, JSON.stringify(certificate, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      console.log(
        `Authority complete: ${certificate.authorityComplete}; source verification complete: ${certificate.sourceVerificationComplete}; production approval: false.`
      );
      if (!certificate.activationReady) process.exitCode = 1;
    } finally {
      provider.destroy();
    }
  })().catch(() => {
    console.error(
      'Authority audit failed. No transaction was sent; inspect the source, evidence and read-only provider privately.'
    );
    process.exitCode = 1;
  });
