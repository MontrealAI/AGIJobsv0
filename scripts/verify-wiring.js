'use strict';

const { loadTokenConfig, loadEnsConfig } = require('./config');
const { ethers } = require('ethers');

const ZERO_ADDRESS = ethers.ZeroAddress;
const ZERO_HASH = ethers.ZeroHash;

function parseNetworkArg() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--network' || arg === '-n') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        return next;
      }
    } else if (arg.startsWith('--network=')) {
      return arg.split('=')[1];
    } else if (arg.startsWith('-n') && arg.length > 2) {
      return arg.slice(2);
    }
  }
  return (
    process.env.TRUFFLE_NETWORK ||
    process.env.HARDHAT_NETWORK ||
    process.env.NETWORK ||
    undefined
  );
}

function normaliseAddress(value, { allowZero = true } = {}) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  const address = ethers.getAddress(prefixed);
  if (!allowZero && address === ZERO_ADDRESS) {
    return null;
  }
  return address;
}

function normaliseBytes32(value, label) {
  if (value === undefined || value === null) {
    return null;
  }
  let hex = value;
  if (typeof hex === 'object') {
    if (typeof hex.toHexString === 'function') {
      hex = hex.toHexString();
    } else if (typeof hex.toString === 'function') {
      const str = hex.toString();
      if (str.startsWith('0x') || str.startsWith('0X')) {
        hex = str;
      } else {
        try {
          hex = `0x${BigInt(str).toString(16)}`;
        } catch {
          throw new Error(`Unable to normalise ${label || 'value'} to bytes32`);
        }
      }
    }
  }
  if (typeof hex === 'number' || typeof hex === 'bigint') {
    hex = ethers.hexlify(hex);
  }
  if (typeof hex !== 'string') {
    throw new Error(
      `Unsupported ${label || 'value'} type for bytes32 normalisation`
    );
  }
  const trimmed = hex.trim();
  if (!trimmed) {
    return null;
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!ethers.isHexString(prefixed)) {
    throw new Error(`Value ${prefixed} is not valid hex data`);
  }
  const bytes = ethers.getBytes(prefixed);
  if (bytes.length !== 32) {
    throw new Error(
      `${label || 'value'} must be 32 bytes, received ${bytes.length} bytes`
    );
  }
  return ethers.hexlify(bytes).toLowerCase();
}

function logSkip(message) {
  console.log(`- ${message}`);
}

function logOk(message) {
  console.log(`\u2713 ${message}`);
}

let failureCount = 0;
function logFail(message) {
  failureCount += 1;
  console.error(`\u2717 ${message}`);
}

function resolveModuleAddress(modules, key) {
  try {
    return normaliseAddress(modules?.[key], { allowZero: false });
  } catch (err) {
    throw new Error(`Invalid address for modules.${key}: ${err.message}`);
  }
}

function resolveExpected(check) {
  if (check.expected === undefined) {
    return undefined;
  }
  return typeof check.expected === 'function'
    ? check.expected()
    : check.expected;
}

function normaliseExpectedValue(value, type, label) {
  if (value === undefined || value === null) {
    return null;
  }
  if (type === 'address') {
    try {
      return (
        normaliseAddress(value)?.toLowerCase() ?? ZERO_ADDRESS.toLowerCase()
      );
    } catch (err) {
      throw new Error(
        `Invalid address for ${label || 'expected value'}: ${err.message}`
      );
    }
  }
  if (type === 'bytes32') {
    return normaliseBytes32(value, label);
  }
  return value;
}

function normaliseActualValue(value, type) {
  if (type === 'address') {
    return normaliseAddress(value)?.toLowerCase() ?? ZERO_ADDRESS.toLowerCase();
  }
  if (type === 'bytes32') {
    return normaliseBytes32(value);
  }
  return value;
}

async function verifyOwnership(name, instance, allowedOwners, web3Instance) {
  if (!instance || typeof instance.owner !== 'function') {
    logSkip(`${name}: owner() not available`);
    return;
  }
  let ownerAddress;
  try {
    ownerAddress = await instance.owner();
  } catch (err) {
    logFail(`${name}: failed to read owner() (${err.message})`);
    return;
  }
  const normalisedOwner = normaliseAddress(ownerAddress);
  if (!normalisedOwner || normalisedOwner === ZERO_ADDRESS) {
    logFail(`${name}: owner() returned zero address`);
    return;
  }
  const ownerLower = normalisedOwner.toLowerCase();
  if (allowedOwners.size > 0 && !allowedOwners.has(ownerLower)) {
    logFail(
      `${name}: owner ${normalisedOwner} not in allowed set ${Array.from(
        allowedOwners
      )
        .map((addr) => ethers.getAddress(addr))
        .join(', ')}`
    );
    return;
  }
  if (web3Instance && typeof web3Instance.eth?.getCode === 'function') {
    try {
      const code = await web3Instance.eth.getCode(normalisedOwner);
      if (!code || code === '0x' || code === '0x0') {
        logFail(`${name}: owner ${normalisedOwner} has no bytecode (EOA?)`);
        return;
      }
    } catch (err) {
      logFail(
        `${name}: failed to fetch bytecode for owner ${normalisedOwner} (${err.message})`
      );
      return;
    }
  }
  logOk(`${name}: owner ${normalisedOwner}`);
}

async function verifyModule({
  key,
  displayName,
  artifact,
  address,
  checks = [],
  allowedOwners,
  web3Instance,
}) {
  if (!address) {
    logSkip(`${displayName} (${key}) not configured; skipping`);
    return;
  }
  let instance;
  try {
    instance = await artifact.at(address);
  } catch (err) {
    logFail(
      `${displayName}: unable to create contract at ${address} (${err.message})`
    );
    return;
  }
  for (const check of checks) {
    const expectedRaw = resolveExpected(check);
    if (expectedRaw === undefined) {
      logSkip(
        `${displayName}.${check.getter}: expected value missing; skipping`
      );
      continue;
    }
    const expected = normaliseExpectedValue(
      expectedRaw,
      check.type || 'address',
      `${displayName}.${check.label || check.getter}`
    );
    if (expected === null) {
      logSkip(
        `${displayName}.${check.getter}: expected value not provided; skipping`
      );
      continue;
    }
    let actualRaw;
    try {
      actualRaw = await instance[check.getter]();
    } catch (err) {
      logFail(
        `${displayName}.${check.getter}: call failed (${
          err.message || err.toString()
        })`
      );
      continue;
    }
    const actual = normaliseActualValue(actualRaw, check.type || 'address');
    if (actual !== expected) {
      logFail(
        `${displayName}.${check.getter} => ${actual} (expected ${expected})`
      );
    } else {
      logOk(`${displayName}.${check.getter} = ${actual}`);
    }
  }

  if (allowedOwners) {
    await verifyOwnership(displayName, instance, allowedOwners, web3Instance);
  }
}

module.exports = async function main(callback) {
  try {
    const network = parseNetworkArg();
    const { config: tokenConfig, path: tokenConfigPath } = loadTokenConfig({
      network,
    });
    const { config: ensConfig, path: ensConfigPath } = loadEnsConfig({
      network,
      persist: false,
    });

    console.log(
      `Loaded token config from ${tokenConfigPath}${
        network ? ` for ${network}` : ''
      }`
    );
    console.log(`Loaded ENS config from ${ensConfigPath}`);

    const modules = tokenConfig.modules || tokenConfig.contracts || {};
    const governance = tokenConfig.governance || tokenConfig.owners || {};
    const allowedOwners = new Set();

    const govSafe = normaliseAddress(governance.govSafe, { allowZero: false });
    if (govSafe) {
      allowedOwners.add(govSafe.toLowerCase());
    }
    const timelock = normaliseAddress(governance.timelock, {
      allowZero: false,
    });
    if (timelock) {
      allowedOwners.add(timelock.toLowerCase());
    }

    const systemPauseAddress = resolveModuleAddress(modules, 'systemPause');
    if (systemPauseAddress) {
      allowedOwners.add(systemPauseAddress.toLowerCase());
    }

    const moduleArtifacts = {
      stakeManager: artifacts.require('StakeManager'),
      jobRegistry: artifacts.require('JobRegistry'),
      validationModule: artifacts.require('ValidationModule'),
      reputationEngine: artifacts.require('ReputationEngine'),
      disputeModule: artifacts.require('DisputeModule'),
      arbitratorCommittee: artifacts.require('ArbitratorCommittee'),
      certificateNFT: artifacts.require('CertificateNFT'),
      taxPolicy: artifacts.require('TaxPolicy'),
      feePool: artifacts.require('FeePool'),
      platformRegistry: artifacts.require('PlatformRegistry'),
      jobRouter: artifacts.require('JobRouter'),
      platformIncentives: artifacts.require('PlatformIncentives'),
      identityRegistry: artifacts.require('IdentityRegistry'),
      attestationRegistry: artifacts.require('AttestationRegistry'),
      systemPause: artifacts.require('SystemPause'),
    };

    const moduleList = [
      {
        key: 'systemPause',
        displayName: 'SystemPause',
        artifact: moduleArtifacts.systemPause,
        address: systemPauseAddress,
        allowedOwners,
        checks: [
          {
            getter: 'jobRegistry',
            expected: () => resolveModuleAddress(modules, 'jobRegistry'),
          },
          {
            getter: 'stakeManager',
            expected: () => resolveModuleAddress(modules, 'stakeManager'),
          },
          {
            getter: 'validationModule',
            expected: () => resolveModuleAddress(modules, 'validationModule'),
          },
          {
            getter: 'disputeModule',
            expected: () => resolveModuleAddress(modules, 'disputeModule'),
          },
          {
            getter: 'platformRegistry',
            expected: () => resolveModuleAddress(modules, 'platformRegistry'),
          },
          {
            getter: 'feePool',
            expected: () => resolveModuleAddress(modules, 'feePool'),
          },
          {
            getter: 'reputationEngine',
            expected: () => resolveModuleAddress(modules, 'reputationEngine'),
          },
          {
            getter: 'arbitratorCommittee',
            expected: () =>
              resolveModuleAddress(modules, 'arbitratorCommittee'),
          },
        ],
      },
      {
        key: 'stakeManager',
        displayName: 'StakeManager',
        artifact: moduleArtifacts.stakeManager,
        address: resolveModuleAddress(modules, 'stakeManager'),
        allowedOwners,
        checks: [
          {
            getter: 'jobRegistry',
            expected: () => resolveModuleAddress(modules, 'jobRegistry'),
          },
          {
            getter: 'disputeModule',
            expected: () => resolveModuleAddress(modules, 'disputeModule'),
          },
          {
            getter: 'validationModule',
            expected: () => resolveModuleAddress(modules, 'validationModule'),
          },
          {
            getter: 'feePool',
            expected: () => resolveModuleAddress(modules, 'feePool'),
          },
        ],
      },
      {
        key: 'jobRegistry',
        displayName: 'JobRegistry',
        artifact: moduleArtifacts.jobRegistry,
        address: resolveModuleAddress(modules, 'jobRegistry'),
        allowedOwners,
        checks: [
          {
            getter: 'stakeManager',
            expected: () => resolveModuleAddress(modules, 'stakeManager'),
          },
          {
            getter: 'validationModule',
            expected: () => resolveModuleAddress(modules, 'validationModule'),
          },
          {
            getter: 'reputationEngine',
            expected: () => resolveModuleAddress(modules, 'reputationEngine'),
          },
          {
            getter: 'disputeModule',
            expected: () => resolveModuleAddress(modules, 'disputeModule'),
          },
          {
            getter: 'certificateNFT',
            expected: () => resolveModuleAddress(modules, 'certificateNFT'),
          },
          {
            getter: 'taxPolicy',
            expected: () => resolveModuleAddress(modules, 'taxPolicy'),
          },
          {
            getter: 'feePool',
            expected: () => resolveModuleAddress(modules, 'feePool'),
          },
          {
            getter: 'identityRegistry',
            expected: () => resolveModuleAddress(modules, 'identityRegistry'),
          },
        ],
      },
      {
        key: 'validationModule',
        displayName: 'ValidationModule',
        artifact: moduleArtifacts.validationModule,
        address: resolveModuleAddress(modules, 'validationModule'),
        allowedOwners,
        checks: [
          {
            getter: 'jobRegistry',
            expected: () => resolveModuleAddress(modules, 'jobRegistry'),
          },
          {
            getter: 'stakeManager',
            expected: () => resolveModuleAddress(modules, 'stakeManager'),
          },
          {
            getter: 'identityRegistry',
            expected: () => resolveModuleAddress(modules, 'identityRegistry'),
          },
          {
            getter: 'reputationEngine',
            expected: () => resolveModuleAddress(modules, 'reputationEngine'),
          },
        ],
      },
      {
        key: 'reputationEngine',
        displayName: 'ReputationEngine',
        artifact: moduleArtifacts.reputationEngine,
        address: resolveModuleAddress(modules, 'reputationEngine'),
        allowedOwners,
        checks: [
          {
            getter: 'stakeManager',
            expected: () => resolveModuleAddress(modules, 'stakeManager'),
          },
        ],
      },
      {
        key: 'disputeModule',
        displayName: 'DisputeModule',
        artifact: moduleArtifacts.disputeModule,
        address: resolveModuleAddress(modules, 'disputeModule'),
        allowedOwners,
        checks: [
          {
            getter: 'jobRegistry',
            expected: () => resolveModuleAddress(modules, 'jobRegistry'),
          },
          {
            getter: 'stakeManager',
            expected: () => resolveModuleAddress(modules, 'stakeManager'),
          },
          {
            getter: 'committee',
            expected: () =>
              resolveModuleAddress(modules, 'arbitratorCommittee'),
          },
        ],
      },
      {
        key: 'arbitratorCommittee',
        displayName: 'ArbitratorCommittee',
        artifact: moduleArtifacts.arbitratorCommittee,
        address: resolveModuleAddress(modules, 'arbitratorCommittee'),
        allowedOwners,
        checks: [
          {
            getter: 'jobRegistry',
            expected: () => resolveModuleAddress(modules, 'jobRegistry'),
          },
          {
            getter: 'disputeModule',
            expected: () => resolveModuleAddress(modules, 'disputeModule'),
          },
        ],
      },
      {
        key: 'certificateNFT',
        displayName: 'CertificateNFT',
        artifact: moduleArtifacts.certificateNFT,
        address: resolveModuleAddress(modules, 'certificateNFT'),
        allowedOwners,
        checks: [
          {
            getter: 'jobRegistry',
            expected: () => resolveModuleAddress(modules, 'jobRegistry'),
          },
          {
            getter: 'stakeManager',
            expected: () => resolveModuleAddress(modules, 'stakeManager'),
          },
        ],
      },
      {
        key: 'taxPolicy',
        displayName: 'TaxPolicy',
        artifact: moduleArtifacts.taxPolicy,
        address: resolveModuleAddress(modules, 'taxPolicy'),
        allowedOwners,
      },
      {
        key: 'feePool',
        displayName: 'FeePool',
        artifact: moduleArtifacts.feePool,
        address: resolveModuleAddress(modules, 'feePool'),
        allowedOwners,
        checks: [
          {
            getter: 'stakeManager',
            expected: () => resolveModuleAddress(modules, 'stakeManager'),
          },
          {
            getter: 'taxPolicy',
            expected: () => resolveModuleAddress(modules, 'taxPolicy'),
          },
        ],
      },
      {
        key: 'platformRegistry',
        displayName: 'PlatformRegistry',
        artifact: moduleArtifacts.platformRegistry,
        address: resolveModuleAddress(modules, 'platformRegistry'),
        allowedOwners,
        checks: [
          {
            getter: 'stakeManager',
            expected: () => resolveModuleAddress(modules, 'stakeManager'),
          },
          {
            getter: 'reputationEngine',
            expected: () => resolveModuleAddress(modules, 'reputationEngine'),
          },
        ],
      },
      {
        key: 'jobRouter',
        displayName: 'JobRouter',
        artifact: moduleArtifacts.jobRouter,
        address: resolveModuleAddress(modules, 'jobRouter'),
        allowedOwners,
        checks: [
          {
            getter: 'platformRegistry',
            expected: () => resolveModuleAddress(modules, 'platformRegistry'),
          },
        ],
      },
      {
        key: 'platformIncentives',
        displayName: 'PlatformIncentives',
        artifact: moduleArtifacts.platformIncentives,
        address: resolveModuleAddress(modules, 'platformIncentives'),
        allowedOwners,
        checks: [
          {
            getter: 'stakeManager',
            expected: () => resolveModuleAddress(modules, 'stakeManager'),
          },
          {
            getter: 'platformRegistry',
            expected: () => resolveModuleAddress(modules, 'platformRegistry'),
          },
          {
            getter: 'jobRouter',
            expected: () => resolveModuleAddress(modules, 'jobRouter'),
          },
        ],
      },
      {
        key: 'identityRegistry',
        displayName: 'IdentityRegistry',
        artifact: moduleArtifacts.identityRegistry,
        address: resolveModuleAddress(modules, 'identityRegistry'),
        allowedOwners,
        checks: [
          {
            getter: 'reputationEngine',
            expected: () => resolveModuleAddress(modules, 'reputationEngine'),
          },
          {
            getter: 'attestationRegistry',
            expected: () =>
              resolveModuleAddress(modules, 'attestationRegistry'),
          },
          {
            getter: 'ens',
            expected: () => normaliseAddress(ensConfig.registry),
          },
          {
            getter: 'nameWrapper',
            expected: () => normaliseAddress(ensConfig.nameWrapper),
          },
          {
            getter: 'agentRootNode',
            type: 'bytes32',
            expected: () => ensConfig.roots?.agent?.node ?? ZERO_HASH,
          },
          {
            getter: 'clubRootNode',
            type: 'bytes32',
            expected: () => ensConfig.roots?.club?.node ?? ZERO_HASH,
          },
          {
            getter: 'agentMerkleRoot',
            type: 'bytes32',
            expected: () => ensConfig.roots?.agent?.merkleRoot ?? ZERO_HASH,
          },
          {
            getter: 'validatorMerkleRoot',
            type: 'bytes32',
            expected: () => ensConfig.roots?.club?.merkleRoot ?? ZERO_HASH,
          },
        ],
      },
      {
        key: 'attestationRegistry',
        displayName: 'AttestationRegistry',
        artifact: moduleArtifacts.attestationRegistry,
        address: resolveModuleAddress(modules, 'attestationRegistry'),
        allowedOwners,
        checks: [
          {
            getter: 'ens',
            expected: () => normaliseAddress(ensConfig.registry),
          },
          {
            getter: 'nameWrapper',
            expected: () => normaliseAddress(ensConfig.nameWrapper),
          },
        ],
      },
    ];

    const web3Instance = global.web3;
    for (const moduleEntry of moduleList) {
      // Create a fresh Set for each module to avoid modifying the shared allowedOwners set.
      const ownerSet = moduleEntry.allowedOwners
        ? new Set(moduleEntry.allowedOwners)
        : new Set(allowedOwners);
      await verifyModule({
        ...moduleEntry,
        allowedOwners: ownerSet,
        web3Instance,
      });
    }

    if (failureCount > 0) {
      throw new Error(`${failureCount} wiring checks failed`);
    }
    console.log('All module wiring checks passed.');
    callback();
  } catch (err) {
    callback(err);
  }
};
