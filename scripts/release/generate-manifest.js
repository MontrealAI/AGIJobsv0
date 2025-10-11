#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawnSync } = require('child_process');

const KNOWN_NETWORKS = {
  mainnet: {
    chainId: 1,
    explorerUrl: 'https://etherscan.io',
  },
  sepolia: {
    chainId: 11155111,
    explorerUrl: 'https://sepolia.etherscan.io',
  },
  holesky: {
    chainId: 17000,
    explorerUrl: 'https://holesky.etherscan.io',
  },
};

const CONTRACT_TARGETS = [
  {
    name: 'StakeManager',
    artifact: path.join('contracts/v2/StakeManager.sol', 'StakeManager.json'),
    addressKey: 'stakeManager',
  },
  {
    name: 'ReputationEngine',
    artifact: path.join('contracts/v2/ReputationEngine.sol', 'ReputationEngine.json'),
    addressKey: 'reputationEngine',
  },
  {
    name: 'IdentityRegistry',
    artifact: path.join('contracts/v2/IdentityRegistry.sol', 'IdentityRegistry.json'),
    addressKey: 'identityRegistry',
  },
  {
    name: 'ValidationModule',
    artifact: path.join('contracts/v2/ValidationModule.sol', 'ValidationModule.json'),
    addressKey: 'validationModule',
  },
  {
    name: 'DisputeModule',
    artifact: path.join('contracts/v2/modules/DisputeModule.sol', 'DisputeModule.json'),
    addressKey: 'disputeModule',
  },
  {
    name: 'CertificateNFT',
    artifact: path.join('contracts/v2/CertificateNFT.sol', 'CertificateNFT.json'),
    addressKey: 'certificateNFT',
  },
  {
    name: 'JobRegistry',
    artifact: path.join('contracts/v2/JobRegistry.sol', 'JobRegistry.json'),
    addressKey: 'jobRegistry',
    abiExport: path.join('routes', 'job_registry.abi.json'),
  },
  {
    name: 'TaxPolicy',
    artifact: path.join('contracts/v2/TaxPolicy.sol', 'TaxPolicy.json'),
    addressKey: 'taxPolicy',
  },
  {
    name: 'FeePool',
    artifact: path.join('contracts/v2/FeePool.sol', 'FeePool.json'),
    addressKey: 'feePool',
  },
  {
    name: 'PlatformRegistry',
    artifact: path.join('contracts/v2/PlatformRegistry.sol', 'PlatformRegistry.json'),
    addressKey: 'platformRegistry',
  },
  {
    name: 'JobRouter',
    artifact: path.join('contracts/v2/modules/JobRouter.sol', 'JobRouter.json'),
    addressKey: 'jobRouter',
  },
  {
    name: 'PlatformIncentives',
    artifact: path.join('contracts/v2/PlatformIncentives.sol', 'PlatformIncentives.json'),
    addressKey: 'platformIncentives',
  },
  {
    name: 'SystemPause',
    artifact: path.join('contracts/v2/SystemPause.sol', 'SystemPause.json'),
    addressKey: 'systemPause',
  },
  {
    name: 'RewardEngine',
    artifact: path.join('contracts/v2/RewardEngineMB.sol', 'RewardEngineMB.json'),
    addressKey: 'rewardEngine',
  },
  {
    name: 'Thermostat',
    artifact: path.join('contracts/v2/Thermostat.sol', 'Thermostat.json'),
    addressKey: 'thermostat',
  },
];

function resolveArtifactPath(relativePath) {
  return path.resolve(process.cwd(), 'artifacts', relativePath);
}

function ensureArtifacts() {
  const artifactsDir = path.resolve(process.cwd(), 'artifacts');
  if (fs.existsSync(artifactsDir) && fs.readdirSync(artifactsDir).length > 0) {
    return;
  }

  const result = spawnSync('npx', ['hardhat', 'compile'], { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function readJsonIfExists(relativePath) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function readJsonAbsolute(filePath, { optional = false } = {}) {
  if (!filePath) {
    return null;
  }
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    if (optional) {
      return null;
    }
    throw new Error(`File not found: ${path.relative(process.cwd(), absolute)}`);
  }
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function parseFoundryToolchain() {
  const filePath = path.resolve(process.cwd(), 'foundry.toml');
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const toolchain = {};
  const solcMatch = content.match(/solc_version\s*=\s*"([^"]+)"/);
  if (solcMatch) {
    toolchain.solc = solcMatch[1];
  }
  const forgeMatch = content.match(/forge_version\s*=\s*"([^"]+)"/);
  if (forgeMatch) {
    toolchain.forge = forgeMatch[1];
  }
  return toolchain;
}

function parseNvmrc() {
  const filePath = path.resolve(process.cwd(), '.nvmrc');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

function getGitInfo() {
  const info = {};
  try {
    info.commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    info.commit = null;
  }

  try {
    info.tag = execSync('git describe --tags --exact-match', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim();
  } catch (error) {
    info.tag = null;
  }

  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    info.dirty = status.length > 0;
  } catch (error) {
    info.dirty = undefined;
  }

  return info;
}

function normaliseHex(value) {
  if (typeof value !== 'string') return '';
  return value.startsWith('0x') ? value.slice(2) : value;
}

function hashHex(value) {
  const normalised = normaliseHex(value);
  if (!normalised) {
    return null;
  }
  return crypto.createHash('sha256').update(Buffer.from(normalised, 'hex')).digest('hex');
}

function hashBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return null;
  }
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function collectContractMetadata(target, addressesSnapshot, deploymentSummary) {
  const artifactPath = resolveArtifactPath(target.artifact);
  const contractEntry = {
    artifact: path.relative(process.cwd(), artifactPath),
  };
  const warnings = [];

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    contractEntry.abiHash = hashBuffer(
      Buffer.from(JSON.stringify(artifact.abi || []), 'utf8')
    );
    const deployedBytecode = artifact.deployedBytecode || artifact.bytecode;
    contractEntry.bytecodeHash = hashHex(deployedBytecode);
    contractEntry.deployedBytecodeLength = deployedBytecode
      ? normaliseHex(deployedBytecode).length / 2
      : 0;
  } else {
    warnings.push(`Missing artifact for ${target.name}: ${contractEntry.artifact}`);
  }

  if (target.abiExport) {
    const abiPath = path.resolve(process.cwd(), target.abiExport);
    if (fs.existsSync(abiPath)) {
      contractEntry.abiExport = path.relative(process.cwd(), abiPath);
    } else {
      warnings.push(`ABI export missing for ${target.name}: ${target.abiExport}`);
    }
  }

  const addressRecord = {};
  if (addressesSnapshot && Object.prototype.hasOwnProperty.call(addressesSnapshot, target.addressKey)) {
    addressRecord.config = addressesSnapshot[target.addressKey];
    if (addressRecord.config === '0x0000000000000000000000000000000000000000') {
      warnings.push(`Configured address for ${target.name} is zero.`);
    }
  }

  if (deploymentSummary && Object.prototype.hasOwnProperty.call(deploymentSummary, target.addressKey)) {
    addressRecord.summary = deploymentSummary[target.addressKey];
  }

  if (Object.keys(addressRecord).length > 0) {
    contractEntry.addresses = addressRecord;
  }

  return { contractEntry, warnings };
}

function buildManifest({
  outputPath,
  network,
  chainId,
  explorerUrl,
  deploymentConfigPath,
}) {
  ensureArtifacts();

  const packageJson = readJsonIfExists('package.json') || {};
  const addressesSnapshot = readJsonIfExists(path.join('docs', 'deployment-addresses.json')) || {};
  const deploymentSummary = readJsonIfExists(path.join('docs', 'deployment-summary.json')) || {};
  const deploymentConfigAbsolute = deploymentConfigPath
    ? path.resolve(process.cwd(), deploymentConfigPath)
    : null;
  const deploymentConfig = deploymentConfigAbsolute
    ? readJsonAbsolute(deploymentConfigAbsolute, { optional: true })
    : null;
  const knownNetwork = network ? KNOWN_NETWORKS[network] || null : null;

  const manifest = {
    generatedAt: new Date().toISOString(),
    packageVersion: packageJson.version || null,
    git: getGitInfo(),
    toolchain: {
      node: parseNvmrc(),
      hardhat: packageJson.devDependencies ? packageJson.devDependencies.hardhat : undefined,
      hardhatToolbox:
        packageJson.devDependencies &&
        packageJson.devDependencies['@nomicfoundation/hardhat-toolbox'],
      ...(parseFoundryToolchain()),
    },
    contracts: {},
    sources: {
      deploymentAddresses: 'docs/deployment-addresses.json',
      deploymentSummary: 'docs/deployment-summary.json',
    },
    warnings: [],
  };

  if (deploymentConfigAbsolute) {
    manifest.sources.deploymentConfig = path.relative(process.cwd(), deploymentConfigAbsolute);
  }

  if (network || deploymentConfig || knownNetwork || chainId || explorerUrl) {
    const networkInfo = {};
    if (network) {
      networkInfo.name = network;
    } else if (deploymentConfig && typeof deploymentConfig.network === 'string') {
      networkInfo.name = deploymentConfig.network;
    }

    const resolvedChainId = (() => {
      if (typeof chainId === 'number' && Number.isFinite(chainId)) {
        return chainId;
      }
      if (deploymentConfig && typeof deploymentConfig.chainId === 'number') {
        return deploymentConfig.chainId;
      }
      if (knownNetwork && typeof knownNetwork.chainId === 'number') {
        return knownNetwork.chainId;
      }
      return null;
    })();

    if (typeof resolvedChainId === 'number' && Number.isFinite(resolvedChainId)) {
      networkInfo.chainId = resolvedChainId;
    }

    const resolvedExplorer = (() => {
      if (explorerUrl && typeof explorerUrl === 'string' && explorerUrl.trim().length > 0) {
        return explorerUrl.trim();
      }
      if (deploymentConfig && typeof deploymentConfig.explorerUrl === 'string') {
        return deploymentConfig.explorerUrl.trim();
      }
      if (knownNetwork && typeof knownNetwork.explorerUrl === 'string') {
        return knownNetwork.explorerUrl;
      }
      return null;
    })();

    if (resolvedExplorer) {
      networkInfo.explorerUrl = resolvedExplorer;
    }

    if (deploymentConfigAbsolute) {
      networkInfo.deploymentConfig = path.relative(process.cwd(), deploymentConfigAbsolute);
    }

    if (Object.keys(networkInfo).length > 0) {
      manifest.network = networkInfo;
    }
  }

  for (const target of CONTRACT_TARGETS) {
    const { contractEntry, warnings } = collectContractMetadata(
      target,
      addressesSnapshot,
      deploymentSummary
    );
    manifest.contracts[target.name] = contractEntry;
    manifest.warnings.push(...warnings);
  }

  manifest.warnings = Array.from(new Set(manifest.warnings)).sort();

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Release manifest written to ${path.relative(process.cwd(), outputPath)}`);
  if (manifest.warnings.length > 0) {
    console.warn('\nWarnings:');
    for (const warning of manifest.warnings) {
      console.warn(`- ${warning}`);
    }
  }
}

function parseChainId(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

function parseArgs(argv) {
  const args = {
    out: path.resolve(process.cwd(), 'reports/release/manifest.json'),
    network: process.env.RELEASE_NETWORK || null,
    chainId: parseChainId(process.env.RELEASE_CHAIN_ID),
    explorerUrl: process.env.RELEASE_EXPLORER_URL || null,
    deploymentConfig: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--out' && typeof argv[i + 1] === 'string') {
      args.out = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (current === '--dir' && typeof argv[i + 1] === 'string') {
      args.out = path.resolve(process.cwd(), argv[i + 1], 'manifest.json');
      i += 1;
    } else if ((current === '--network' || current === '-n') && typeof argv[i + 1] === 'string') {
      args.network = argv[i + 1];
      i += 1;
    } else if ((current === '--chain-id' || current === '-c') && typeof argv[i + 1] === 'string') {
      args.chainId = parseChainId(argv[i + 1]);
      i += 1;
    } else if (current === '--explorer-url' && typeof argv[i + 1] === 'string') {
      args.explorerUrl = argv[i + 1];
      i += 1;
    } else if (current === '--deployment-config' && typeof argv[i + 1] === 'string') {
      args.deploymentConfig = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function main() {
  try {
    const { out, network, chainId, explorerUrl, deploymentConfig } = parseArgs(process.argv.slice(2));
    buildManifest({
      outputPath: out,
      network,
      chainId,
      explorerUrl,
      deploymentConfigPath: deploymentConfig,
    });
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

main();
