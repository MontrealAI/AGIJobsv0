'use strict';

const { createHash } = require('node:crypto');
const { ethers } = require('ethers');
const { validateOneclickConfig } = require('./oneclick-config.cjs');
const parseDuration = require('../../utils/parseDuration.js');
const implementations = require('../../../config/implementation-modules.json');
const CHAIN_IDS = { mainnet: 1, sepolia: 11155111 };
class ChainInspectionError extends Error {}
const CORE = [
  'Deployer',
  'StakeManager',
  'JobRegistry',
  'ValidationModule',
  'ReputationEngine',
  'ArbitratorCommittee',
  'DisputeModule',
  'CertificateNFT',
  'TaxPolicy',
  'FeePool',
  'IdentityRegistry',
  'PlatformRegistry',
  'JobRouter',
  'PlatformIncentives',
  'SystemPause',
];
const sourceFor = (name) =>
  `contracts/v2/${
    ['DisputeModule', 'JobRouter'].includes(name) ? 'modules/' : ''
  }${name}.sol`;
const inventory = () => [
  ...CORE.map((name) => ({ name, source: sourceFor(name) })),
  ...[...new Set(Object.values(implementations).flat())].map((name) => ({
    name,
    source: `contracts/v2/implementation/${name}.sol`,
  })),
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function address(value, label, allowZero = false) {
  if (typeof value !== 'string' || !ethers.isAddress(value))
    throw new Error(`${label} must be an Ethereum address`);
  const result = ethers.getAddress(value);
  if (!allowZero && result === ethers.ZeroAddress)
    throw new Error(`${label} must be explicitly configured (nonzero)`);
  return result;
}
function bytes32(value, label, allowZero = false) {
  if (
    !ethers.isHexString(value, 32) ||
    (!allowZero && value === ethers.ZeroHash)
  )
    throw new Error(
      `${label} must be ${allowZero ? 'a' : 'a nonzero'} bytes32 value`
    );
  return value;
}
function identityRoot(identity, key, label) {
  const nested = identity.roots?.[key];
  const direct = identity[label];
  const value = bytes32(direct ?? nested?.hash, `identity.${label}`);
  if (
    nested?.name &&
    ethers.namehash(nested.name).toLowerCase() !== value.toLowerCase()
  )
    throw new Error(`identity.${key} name and hash disagree`);
  if (
    direct &&
    nested?.hash &&
    direct.toLowerCase() !== nested.hash.toLowerCase()
  )
    throw new Error(`identity.${key} has conflicting direct and nested hashes`);
  return value;
}
function validateConfig(config, network, token) {
  if (!Object.hasOwn(CHAIN_IDS, network))
    throw new Error('Network must be mainnet or sepolia');
  if (config.network !== network || config.chainId !== CHAIN_IDS[network])
    throw new Error(
      'Configuration network/chainId must match the selected target'
    );
  validateOneclickConfig(config, token.decimals);
  if (token.decimals !== 18)
    throw new Error('Current protocol requires 18 token decimals');
  const governance = address(config.governance, 'governance');
  const agialpha = address(config.agialpha, 'agialpha');
  if (agialpha !== address(token.address, 'configured token'))
    throw new Error(
      'Deployment token differs from the network token configuration used to compile'
    );
  const econKeys = [
    'feePct',
    'burnPct',
    'employerSlashPct',
    'treasurySlashPct',
    'validatorSlashRewardPct',
    'commitWindow',
    'revealWindow',
    'minStake',
    'jobStake',
  ];
  for (const key of Object.keys(config.econ || {})) {
    if (!econKeys.includes(key))
      throw new Error(`Staged deployDefaults does not consume econ.${key}`);
  }
  for (const key of econKeys) {
    if (config.econ?.[key] === undefined)
      throw new Error(`Explicit econ.${key} is required for review`);
  }
  const slashTotal =
    config.econ.employerSlashPct +
    config.econ.treasurySlashPct +
    config.econ.validatorSlashRewardPct;
  if (slashTotal !== 100)
    throw new Error('Explicit slashing shares must sum to 100 percent');
  if (config.secureDefaults?.pauseOnLaunch !== true)
    throw new Error(
      'secureDefaults.pauseOnLaunch must remain true until commissioning'
    );
  const identity = config.identity || {};
  const resolvedIdentity = {
    ens: address(identity.ens, 'identity.ens'),
    nameWrapper: address(identity.nameWrapper, 'identity.nameWrapper', true),
    agentRootNode: identityRoot(identity, 'agentRoot', 'agentRootNode'),
    clubRootNode: identityRoot(identity, 'clubRoot', 'clubRootNode'),
    validatorMerkleRoot: bytes32(
      identity.validatorMerkleRoot,
      'validatorMerkleRoot',
      true
    ),
    agentMerkleRoot: bytes32(identity.agentMerkleRoot, 'agentMerkleRoot', true),
  };
  if (typeof config.tax?.enabled !== 'boolean')
    throw new Error('tax.enabled must be explicit');
  if (
    config.tax.enabled &&
    (typeof config.tax.uri !== 'string' ||
      !/^(ipfs|https):\/\//.test(config.tax.uri) ||
      /example|^ipfs:\/\/policy$/i.test(config.tax.uri) ||
      typeof config.tax.description !== 'string' ||
      !config.tax.description.trim())
  )
    throw new Error(
      'Tax policy requires a reviewed URI and description, not sample metadata'
    );
  // The shared validator accepts compound durations; the staged deployment
  // parser consumes integer seconds or one unit. Emit exact seconds so the
  // reviewed configuration is directly consumable by deployDefaults.ts.
  const econ = { ...config.econ };
  for (const key of ['commitWindow', 'revealWindow']) {
    const value = econ[key];
    econ[key] =
      typeof value === 'number'
        ? value
        : /^[0-9]+$/.test(value)
        ? Number(value)
        : parseDuration(value, 's');
  }
  return { ...config, governance, agialpha, econ, identity: resolvedIdentity };
}

async function buildDeploymentCandidate(options) {
  const { network, config, configBytes, token, readArtifact, provider } =
    options;
  if (!Object.hasOwn(CHAIN_IDS, network))
    throw new Error('Network must be mainnet or sepolia');
  const blockers = [];
  let normalizedConfig;
  try {
    normalizedConfig = validateConfig(config, network, token);
  } catch (error) {
    blockers.push({ gate: 'configuration', detail: error.message });
  }
  const artifacts = [];
  for (const item of inventory()) {
    if (item.name === 'TaxPolicy' && config.tax?.enabled === false) continue;
    try {
      const artifact = await readArtifact(item);
      if (
        artifact.contractName !== item.name ||
        artifact.sourceName !== item.source
      )
        throw new Error('Artifact identity differs from the expected source');
      if (
        !ethers.isHexString(artifact.bytecode) ||
        artifact.bytecode === '0x' ||
        !ethers.isHexString(artifact.deployedBytecode) ||
        artifact.deployedBytecode === '0x'
      )
        throw new Error(
          'Missing compiled bytecode or unresolved library links'
        );
      const creationBytes = ethers.getBytes(artifact.bytecode).length;
      const runtimeBytes = ethers.getBytes(artifact.deployedBytecode).length;
      if (creationBytes > 49152 || runtimeBytes > 24576)
        throw new Error('Compiled artifact exceeds production EVM size limits');
      artifacts.push({
        ...item,
        creationBytes,
        runtimeBytes,
        creationCodeHash: ethers.keccak256(artifact.bytecode),
        runtimeCodeHash: ethers.keccak256(artifact.deployedBytecode),
        abiSha256: sha256(JSON.stringify(artifact.abi)),
      });
    } catch (error) {
      blockers.push({ gate: `artifact:${item.name}`, detail: error.message });
    }
  }
  let chain = { status: 'not-checked' };
  if (!provider)
    blockers.push({
      gate: 'chain',
      detail:
        'RPC unavailable or offline mode. Chain and dependency contracts are unverified.',
    });
  else {
    try {
      const detected = await provider.getNetwork();
      if (BigInt(detected.chainId) !== BigInt(CHAIN_IDS[network]))
        throw new ChainInspectionError(
          'RPC chain ID does not match the selected target'
        );
      const block = await provider.getBlock('latest');
      if (!block?.hash || !Number.isSafeInteger(block.number))
        throw new ChainInspectionError('RPC did not return a canonical block');
      chain = {
        status: 'observed',
        chainId: CHAIN_IDS[network],
        blockNumber: block.number,
        blockHash: block.hash,
        observedContracts: [],
      };
      if (normalizedConfig) {
        const dependencies = {
          token: normalizedConfig.agialpha,
          ens: normalizedConfig.identity.ens,
        };
        if (normalizedConfig.identity.nameWrapper !== ethers.ZeroAddress)
          dependencies.nameWrapper = normalizedConfig.identity.nameWrapper;
        for (const [name, target] of Object.entries(dependencies)) {
          const code = await provider.getCode(target, block.number);
          if (!ethers.isHexString(code) || code === '0x')
            throw new ChainInspectionError(
              `No deployed ${name} contract at the configured address`
            );
          chain.observedContracts.push({
            name,
            address: target,
            codeHash: ethers.keccak256(code),
          });
        }
        const iface = new ethers.Interface([
          'function decimals() view returns (uint8)',
        ]);
        const result = await provider.call({
          to: normalizedConfig.agialpha,
          data: iface.encodeFunctionData('decimals'),
          blockTag: block.number,
        });
        if (
          Number(iface.decodeFunctionResult('decimals', result)[0]) !==
          token.decimals
        )
          throw new ChainInspectionError(
            'On-chain token decimals differ from compiled configuration'
          );
        // Pin evidence to a block and reject a reorg during the read-only snapshot.
        if ((await provider.getBlock(block.number))?.hash !== block.hash)
          throw new ChainInspectionError(
            'Reference block changed during dependency inspection; retry'
          );
      }
    } catch (error) {
      // RPC errors can embed provider URLs/API keys; never serialize them.
      chain = { status: 'failed' };
      const known = error instanceof ChainInspectionError;
      blockers.push({
        gate: 'chain',
        detail: known
          ? error.message
          : 'RPC inspection failed. Verify the configured endpoint privately and retry.',
      });
    }
  }
  return {
    schema: 'agi-jobs/deployment-candidate/v1',
    network,
    chainId: CHAIN_IDS[network],
    generatedAt: options.generatedAt || new Date().toISOString(),
    revision: options.revision || null,
    status: blockers.length ? 'blocked' : 'candidate-for-review',
    executable: false,
    productionApproved: false,
    source: {
      configSha256: sha256(configBytes),
      tokenConfigSha256: sha256(JSON.stringify(token)),
    },
    config: normalizedConfig || null,
    artifacts,
    chain,
    blockers,
    stages: [
      {
        id: 'release-evidence',
        action:
          'Verify the signed release, exact-commit CI, dependency audit and independent security review.',
        reference: 'docs/production/readiness-2026-10-03.md',
      },
      {
        id: 'coordinator',
        action:
          'Deploy the Deployer coordinator using the separately approved signer; retain its address for recovery.',
        reference: 'scripts/v2/deployDefaults.ts',
      },
      {
        id: 'components',
        action:
          'Deploy fixed implementation modules and stage each component separately. Controllers are paused during staging; verify emitted component addresses and code hashes.',
        reference: 'scripts/deploy/stage-protocol.cjs',
      },
      {
        id: 'wiring',
        action:
          'Register the complete module set, finalize economic/identity wiring, and inspect confirmed on-chain values.',
        reference: 'contracts/v2/Deployer.sol',
      },
      {
        id: 'ownership',
        action:
          'Have the designated governance accept pending two-step ownership, verify every owner, and apply the reviewed tax policy.',
        reference: 'scripts/v2/deployDefaults.ts',
      },
      {
        id: 'secure-defaults',
        action:
          'Review and apply launch limits and pause controls using the confirmed addressbook and the actual governance authority.',
        reference: 'scripts/v2/apply-secure-defaults.ts',
      },
      {
        id: 'commissioning',
        action:
          'Verify source, runtime code, ownership, pause/resume, real workers, independent review and settlement before unpausing.',
        reference: 'docs/production-deployment-handbook.md',
      },
    ],
    remainingApprovals: [
      'This is a read-only deployment candidate, not a Safe Transaction Builder bundle or authorization to broadcast.',
      'Artifact bytecode hashes exclude constructor arguments and immutable substitutions; no deployed addresses, gas estimate or executable calldata is asserted.',
      'The deployment coordinator signer, governance authority, nonce, gas funding, target addresses and chain-state simulation must be reviewed separately before execution.',
      'The signed-release, vulnerability, independent-security and live commissioning gates remain mandatory even when candidate preflight passes.',
    ],
  };
}
module.exports = {
  CHAIN_IDS,
  inventory,
  validateConfig,
  buildDeploymentCandidate,
};
